-- =====================================================================
--  COMMANDE À TABLE — 8 : BONS DE LIVRAISON LUS PAR L'IA, ESPACE AGENCE
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
--
--  Espace agence (/agence) : les comptes de l'agence voient, pour chaque
--  bar, le nombre de lectures et leur coût estimé. Rien d'autre.
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
-- Espace agence : comptes de l'agence et usage de l'IA par bar
-- ---------------------------------------------------------------------

-- Ajouter un compte agence (après l'avoir créé dans Authentication → Users) :
--   insert into private.platform_admins (user_id)
--   select id from auth.users where email = 'email-du-compte-agence' on conflict do nothing;
create table if not exists private.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.platform_admins enable row level security;   -- aucune règle : lisible seulement par les fonctions ci-dessous
revoke all on private.platform_admins from public, anon, authenticated;

create or replace function private.is_agency()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_admins where user_id = (select auth.uid()));
$$;

-- La personne connectée est-elle un compte agence ?
create or replace function public.is_agency()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_agency();
$$;

-- Lectures de bons par bar pour un mois (heure de Paris), et mois disponibles
create or replace function public.agency_get_usage(p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current date := date_trunc('month', now() at time zone 'Europe/Paris')::date;
  v_month   date := coalesce(date_trunc('month', p_month)::date, v_current);
  v_from    timestamptz := v_month::timestamp at time zone 'Europe/Paris';
  v_to      timestamptz := (v_month + interval '1 month')::timestamp at time zone 'Europe/Paris';
begin
  if not private.is_agency() then
    raise exception 'ACCES_REFUSE';
  end if;
  return jsonb_build_object(
    'month', v_month,
    'current_month', v_current,
    -- Mois avec des lectures, plus le mois en cours (12 au maximum, le plus récent d'abord)
    'months', (
      select jsonb_agg(m order by m desc)
      from (
        select m from (
          select v_current as m
          union
          select date_trunc('month', created_at at time zone 'Europe/Paris')::date from public.stock_scans
        ) x
        order by m desc
        limit 12
      ) y
    ),
    'venues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'name', v.name,
        'scans', coalesce(u.scans, 0),
        'read', coalesce(u.read, 0),
        'applied', coalesce(u.applied, 0),
        'failed', coalesce(u.failed, 0),
        'pages', coalesce(u.pages, 0),
        'input_tokens', coalesce(u.input_tokens, 0),
        'output_tokens', coalesce(u.output_tokens, 0),
        'last_scan_at', u.last_scan_at
      ) order by coalesce(u.output_tokens, 0) * 5 + coalesce(u.input_tokens, 0) desc, lower(v.name))
      from public.venues v
      left join (
        select s.venue_id,
               count(*)                                              as scans,
               count(*) filter (where s.status in ('read', 'applied')) as read,
               count(*) filter (where s.status = 'applied')          as applied,
               count(*) filter (where s.status = 'failed')           as failed,
               sum(s.pages)                                          as pages,
               sum(coalesce(s.input_tokens, 0))                      as input_tokens,
               sum(coalesce(s.output_tokens, 0))                     as output_tokens,
               max(s.created_at)                                     as last_scan_at
        from public.stock_scans s
        where s.created_at >= v_from and s.created_at < v_to
        group by s.venue_id
      ) u on u.venue_id = v.id
    ), '[]'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function private.is_agency()                                            from public, anon;
revoke execute on function public.is_agency()                                             from public, anon;
revoke execute on function public.agency_get_usage(date)                                  from public, anon;
grant  execute on function private.is_agency()                                            to authenticated, service_role;
grant  execute on function public.is_agency()                                             to authenticated, service_role;
grant  execute on function public.agency_get_usage(date)                                  to authenticated, service_role;
revoke execute on function public.stock_scan_begin(uuid, int)                              from public, anon;
revoke execute on function public.stock_scan_finish(uuid, boolean, text, text, int, int, int) from public, anon;
revoke execute on function public.stock_apply_delivery(uuid, jsonb, text)                  from public, anon;
grant  execute on function public.stock_scan_begin(uuid, int)                              to authenticated, service_role;
grant  execute on function public.stock_scan_finish(uuid, boolean, text, text, int, int, int) to authenticated, service_role;
grant  execute on function public.stock_apply_delivery(uuid, jsonb, text)                  to authenticated, service_role;

commit;
