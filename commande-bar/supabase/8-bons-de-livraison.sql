-- =====================================================================
--  COMMANDE À TABLE — 8 : LECTURE DES BONS DE LIVRAISON PAR L'IA
--
--  À exécuter une fois, APRÈS les scripts 1 à 7 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
--
--  Le personnel prend en photo un bon de livraison ou une facture ;
--  l'IA propose les quantités reçues ; la personne vérifie, corrige,
--  puis enregistre toute la livraison en une fois.
--  Les photos ne sont pas conservées : seul le résultat est noté ici.
-- =====================================================================

begin;

-- Chaque lecture de bon (limite d'usage, coût, une seule validation)
create table if not exists public.stock_scans (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'read', 'failed', 'applied')),
  pages         int not null check (pages between 1 and 10),
  supplier      text check (supplier is null or char_length(supplier) <= 80),
  reference     text check (reference is null or char_length(reference) <= 60),
  lines_read    int check (lines_read is null or lines_read >= 0),
  lines_applied int check (lines_applied is null or lines_applied >= 0),
  input_tokens  int check (input_tokens is null or input_tokens >= 0),
  output_tokens int check (output_tokens is null or output_tokens >= 0),
  created_at    timestamptz not null default now(),
  applied_at    timestamptz
);
create index if not exists stock_scans_venue_idx on public.stock_scans (venue_id, created_at desc);
create index if not exists stock_scans_user_idx on public.stock_scans (created_by, created_at desc);

alter table public.stock_scans enable row level security;
revoke all on public.stock_scans from anon, authenticated;
grant select on public.stock_scans to authenticated;
grant all on public.stock_scans to service_role;
drop policy if exists "Personnel : voit les lectures de bons" on public.stock_scans;
create policy "Personnel : voit les lectures de bons" on public.stock_scans
  for select to authenticated using (private.is_member(venue_id));


-- ---------------------------------------------------------------------
-- Début d'une lecture : droits et limites d'usage (chaque lecture coûte
-- quelques centimes d'IA, on évite les abus et les boucles)
-- ---------------------------------------------------------------------
create or replace function public.stock_scan_begin(p_venue_id uuid, p_pages int)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  max_per_user_10_min constant int := 8;
  max_per_venue_day   constant int := 40;
  v_user uuid := (select auth.uid());
  v_id   uuid;
begin
  if v_user is null or not private.is_member(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  if p_pages is null or p_pages < 1 or p_pages > 10 then
    raise exception 'PAGES_INVALIDES';
  end if;
  if not exists (select 1 from public.stock_items where venue_id = p_venue_id) then
    raise exception 'AUCUN_ARTICLE';
  end if;

  -- Un seul calcul à la fois par bar pour les limites
  perform pg_advisory_xact_lock(hashtextextended('stock_scan:' || p_venue_id::text, 0));
  if (select count(*) from public.stock_scans
      where created_by = v_user and created_at > now() - interval '10 minutes') >= max_per_user_10_min
     or (select count(*) from public.stock_scans
         where venue_id = p_venue_id and created_at > now() - interval '24 hours') >= max_per_venue_day then
    raise exception 'TROP_DE_LECTURES';
  end if;

  insert into public.stock_scans (venue_id, created_by, pages)
  values (p_venue_id, v_user, p_pages)
  returning id into v_id;
  return v_id;
end;
$$;

-- Fin d'une lecture : résultat (ou échec) et consommation de l'IA
create or replace function public.stock_scan_finish(
  p_scan_id uuid, p_ok boolean, p_supplier text, p_reference text,
  p_lines int, p_input_tokens int, p_output_tokens int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.stock_scans
     set status        = case when p_ok then 'read' else 'failed' end,
         supplier      = left(nullif(btrim(coalesce(p_supplier, '')), ''), 80),
         reference     = left(nullif(btrim(coalesce(p_reference, '')), ''), 60),
         lines_read    = greatest(coalesce(p_lines, 0), 0),
         input_tokens  = greatest(p_input_tokens, 0),
         output_tokens = greatest(p_output_tokens, 0)
   where id = p_scan_id and created_by = (select auth.uid()) and status = 'pending';
  if not found then
    raise exception 'INTROUVABLE';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Validation : toute la livraison en une fois, une seule fois par bon.
-- p_lines : [{ "stock_item_id": "…", "quantity": 420 }, …] (unité de l'article)
-- ---------------------------------------------------------------------
create or replace function public.stock_apply_delivery(p_scan_id uuid, p_lines jsonb, p_note text default null)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_scan  public.stock_scans;
  v_note  text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
  v_count int := 0;
  v_line  record;
  v_after numeric;
begin
  select * into v_scan from public.stock_scans where id = p_scan_id for update;
  if not found or not private.is_member(v_scan.venue_id) then
    raise exception 'INTROUVABLE';
  end if;
  if v_scan.status = 'applied' then
    raise exception 'DEJA_ENREGISTRE';
  end if;
  if v_scan.status <> 'read' then
    raise exception 'LECTURE_INVALIDE';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 80 then
    raise exception 'LIVRAISON_VIDE';
  end if;

  -- Chaque ligne : un article de CE bar, une quantité positive raisonnable
  if exists (
    select 1
    from jsonb_array_elements(p_lines) l
    cross join lateral (
      select case when jsonb_typeof(l->'quantity') = 'number' then (l->>'quantity')::numeric end as quantity
    ) q
    where jsonb_typeof(l) <> 'object'
       or private.try_uuid(l->>'stock_item_id') is null
       or q.quantity is null
       or q.quantity < 0.001
       or q.quantity > 1000000
       or not exists (select 1 from public.stock_items s
                      where s.id = private.try_uuid(l->>'stock_item_id') and s.venue_id = v_scan.venue_id)
  ) then
    raise exception 'LIVRAISON_INVALIDE';
  end if;

  -- Un même article sur plusieurs lignes du bon : quantités additionnées
  for v_line in
    select private.try_uuid(l->>'stock_item_id') as item_id,
           round(sum((l->>'quantity')::numeric), 3) as quantity
    from jsonb_array_elements(p_lines) l
    group by 1
    order by 1                                   -- ordre fixe : pas de blocage croisé
  loop
    update public.stock_items set quantity = quantity + v_line.quantity
     where id = v_line.item_id
    returning quantity into v_after;
    insert into public.stock_movements (venue_id, stock_item_id, kind, delta, quantity_after, note, created_by)
    values (v_scan.venue_id, v_line.item_id, 'delivery', v_line.quantity, v_after, v_note, (select auth.uid()));
    v_count := v_count + 1;
  end loop;

  update public.stock_scans
     set status = 'applied', applied_at = now(), lines_applied = v_count
   where id = v_scan.id;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function public.stock_scan_begin(uuid, int)                              from public, anon;
revoke execute on function public.stock_scan_finish(uuid, boolean, text, text, int, int, int) from public, anon;
revoke execute on function public.stock_apply_delivery(uuid, jsonb, text)                  from public, anon;
grant  execute on function public.stock_scan_begin(uuid, int)                              to authenticated, service_role;
grant  execute on function public.stock_scan_finish(uuid, boolean, text, text, int, int, int) to authenticated, service_role;
grant  execute on function public.stock_apply_delivery(uuid, jsonb, text)                  to authenticated, service_role;

commit;
