-- =====================================================================
--  COMMANDE À TABLE — 5 : APPEL DU SERVEUR, POURBOIRE, PAUSE DES COMMANDES
--
--  À exécuter une fois, APRÈS les scripts 1 à 4 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Nouvelles colonnes et table
-- ---------------------------------------------------------------------

-- « Commandes en pause » (rush, cuisine fermée…)
alter table public.venues add column if not exists orders_paused boolean not null default false;

-- Pourboire (paiement en ligne), en plus du total des produits
alter table public.orders add column if not exists tip_cents int not null default 0;
do $$
begin
  alter table public.orders add constraint orders_tip_cents_check check (tip_cents between 0 and 10000);
exception when duplicate_object then null;
end;
$$;

-- Appels depuis les tables : « Appeler un serveur » / « L'addition »
do $$
begin
  create type public.call_kind as enum ('waiter', 'bill');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.table_calls (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  table_id    uuid,
  table_label text not null,
  kind        public.call_kind not null,
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  foreign key (table_id, venue_id) references public.venue_tables(id, venue_id) on delete set null (table_id)
);
create index if not exists table_calls_venue_idx on public.table_calls (venue_id, handled_at, created_at);
create index if not exists table_calls_table_idx on public.table_calls (table_id, created_at);

alter table public.table_calls enable row level security;
revoke all on public.table_calls from anon, authenticated;
grant select on public.table_calls to authenticated;
grant all on public.table_calls to service_role;
drop policy if exists "Personnel : voit les appels de son bar" on public.table_calls;
create policy "Personnel : voit les appels de son bar" on public.table_calls
  for select to authenticated using (private.is_member(venue_id));

-- Temps réel : l'écran du bar est prévenu instantanément des appels
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_calls') then
    alter publication supabase_realtime add table public.table_calls;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Fonctions mises à jour
-- ---------------------------------------------------------------------

-- Une commande au format de l'écran du bar (+ pourboire)
create or replace function private.order_json(o public.orders)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'table_label', o.table_label,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'total_cents', o.total_cents,
    'tip_cents', o.tip_cents,
    'comment', o.comment,
    'created_at', o.created_at,
    'received_at', o.received_at,
    'preparing_at', o.preparing_at,
    'served_at', o.served_at,
    'cancelled_at', o.cancelled_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', i.product_name,
        'quantity', i.quantity,
        'unit_price_cents', i.unit_price_cents
      ) order by i.position)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  );
$$;

-- Carte du bar (+ « commandes en pause »)
create or replace function public.get_menu(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_table public.venue_tables;
  v_venue public.venues;
begin
  select * into v_table from public.venue_tables where token = p_token;
  if not found or not v_table.is_active then
    return null;
  end if;
  select * into v_venue from public.venues where id = v_table.venue_id;

  return jsonb_build_object(
    'table', jsonb_build_object('id', v_table.id, 'label', v_table.label),
    'venue', jsonb_build_object(
      'id', v_venue.id,
      'name', v_venue.name,
      'logo_url', v_venue.logo_url,
      'currency', v_venue.currency,
      'pay_to_staff_enabled', v_venue.pay_to_staff_enabled,
      'online_payment_enabled', v_venue.online_payment_enabled,
      'orders_paused', v_venue.orders_paused
    ),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'products', (
            select jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'description', p.description,
                'price_cents', p.price_cents,
                'image_url', p.image_url,
                'is_available', p.is_available
              ) order by p.sort_order, p.name
            )
            from public.products p
            where p.category_id = c.id
          )
        ) order by c.sort_order, c.name
      )
      from public.categories c
      where c.venue_id = v_venue.id
        and exists (select 1 from public.products p where p.category_id = c.id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Création d'une commande (+ pourboire, + pause des commandes).
-- L'ancienne version (sans pourboire) est remplacée.
drop function if exists public.create_order(text, jsonb, text, public.payment_method);

create or replace function public.create_order(
  p_token          text,
  p_items          jsonb,
  p_comment        text,
  p_payment_method public.payment_method,
  p_tip_cents      int default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  max_orders_per_window constant int      := 5;
  order_window          constant interval := interval '2 minutes';
  v_table       public.venue_tables;
  v_venue       public.venues;
  v_comment     text := nullif(btrim(coalesce(p_comment, '')), '');
  v_tip         int  := coalesce(p_tip_cents, 0);
  v_elem        jsonb;
  v_unknown     int;
  v_unavailable int;
  v_total_qty   int;
  v_max_qty     int;
  v_total       int;
  v_date        date;
  v_number      int;
  v_order_id    uuid;
begin
  -- 1. La table (verrouillée pour que l'anti-abus soit fiable même en rafale)
  select * into v_table from public.venue_tables where token = p_token for update;
  if not found or not v_table.is_active then
    raise exception 'CARTE_INVALIDE';
  end if;
  select * into v_venue from public.venues where id = v_table.venue_id;

  -- 2. Le bar accepte-t-il les commandes en ce moment ?
  if v_venue.orders_paused then
    raise exception 'COMMANDES_EN_PAUSE';
  end if;

  -- 3. Mode de paiement autorisé par le bar ?
  if (p_payment_method = 'staff' and not v_venue.pay_to_staff_enabled)
     or (p_payment_method = 'online' and not v_venue.online_payment_enabled) then
    raise exception 'PAIEMENT_INDISPONIBLE';
  end if;

  -- 4. Anti-abus
  if (select count(*) from public.orders
      where table_id = v_table.id and created_at > now() - order_window) >= max_orders_per_window then
    raise exception 'TROP_DE_COMMANDES';
  end if;

  -- 5. Commentaire
  if v_comment is not null and char_length(v_comment) > 300 then
    raise exception 'COMMENTAIRE_TROP_LONG';
  end if;

  -- 6. Panier : format
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'PANIER_VIDE';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'PANIER_TROP_GROS';
  end if;
  for v_elem in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_elem) <> 'object'
       or private.try_uuid(v_elem->>'product_id') is null
       or coalesce(v_elem->>'quantity', '') !~ '^[0-9]{1,2}$'
       or (v_elem->>'quantity')::int not between 1 and 20 then
      raise exception 'PANIER_INVALIDE';
    end if;
  end loop;

  -- 7. Panier : produits et prix (lus dans la base)
  with lines as (
    select (e.value->>'product_id')::uuid as product_id,
           sum((e.value->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e
    group by 1
  )
  select count(*) filter (where p.id is null),
         count(*) filter (where p.id is not null and not p.is_available),
         coalesce(sum(l.quantity), 0),
         coalesce(max(l.quantity), 0),
         coalesce(sum(l.quantity * p.price_cents), 0)
    into v_unknown, v_unavailable, v_total_qty, v_max_qty, v_total
  from lines l
  left join public.products p on p.id = l.product_id and p.venue_id = v_venue.id;

  if v_unknown > 0 then
    raise exception 'PRODUIT_INCONNU';
  end if;
  if v_unavailable > 0 then
    raise exception 'PRODUIT_INDISPONIBLE';
  end if;
  if v_total_qty > 50 or v_max_qty > 20 then
    raise exception 'PANIER_TROP_GROS';
  end if;

  -- 8. Pourboire : uniquement en ligne, au plus le montant de la commande (et 100 €)
  if p_payment_method <> 'online' then
    v_tip := 0;
  end if;
  if v_tip < 0 or v_tip > least(v_total, 10000) then
    raise exception 'POURBOIRE_INVALIDE';
  end if;
  if p_payment_method = 'online' and v_total + v_tip < 50 then
    raise exception 'MONTANT_TROP_FAIBLE';  -- Stripe refuse les paiements de moins de 0,50 €
  end if;

  -- 9. Numéro de commande du jour
  v_date := private.business_date(v_venue);
  insert into private.order_counters as oc (venue_id, business_date, last_number)
  values (v_venue.id, v_date, 1)
  on conflict (venue_id, business_date) do update set last_number = oc.last_number + 1
  returning last_number into v_number;

  -- 10. Enregistrement
  insert into public.orders (
    venue_id, table_id, table_label, order_number, business_date,
    status, payment_method, payment_status, total_cents, tip_cents, comment, received_at
  ) values (
    v_venue.id, v_table.id, v_table.label, v_number, v_date,
    case when p_payment_method = 'online' then 'pending_payment' else 'received' end::public.order_status,
    p_payment_method, 'unpaid', v_total, v_tip, v_comment,
    case when p_payment_method = 'online' then null else now() end
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, venue_id, product_id, product_name, unit_price_cents, quantity, position)
  select v_order_id, v_venue.id, p.id, p.name, p.price_cents, l.quantity, l.position
  from (
    select (e.value->>'product_id')::uuid as product_id,
           sum((e.value->>'quantity')::int)::int as quantity,
           min(e.ordinality)::smallint as position
    from jsonb_array_elements(p_items) with ordinality e
    group by 1
  ) l
  join public.products p on p.id = l.product_id and p.venue_id = v_venue.id;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_number,
    'total_cents', v_total,
    'tip_cents', v_tip,
    'status', case when p_payment_method = 'online' then 'pending_payment' else 'received' end,
    'payment_method', p_payment_method
  );
end;
$$;

-- Paiement en ligne confirmé par Stripe : le montant payé = produits + pourboire
create or replace function public.confirm_online_payment(
  p_order_id          uuid,
  p_session_id        text,
  p_payment_intent_id text,
  p_amount_cents      int
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.orders
     set payment_status = 'paid',
         paid_at = now(),
         status = 'received',
         received_at = now(),
         stripe_payment_intent_id = p_payment_intent_id
   where id = p_order_id
     and stripe_checkout_session_id = p_session_id
     and status = 'pending_payment'
     and payment_method = 'online'
     and total_cents + tip_cents = p_amount_cents;
  return found;
end;
$$;

-- Suivi d'une commande par le client (+ pourboire)
create or replace function public.get_customer_order(p_order_id uuid, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'total_cents', o.total_cents,
    'tip_cents', o.tip_cents,
    'comment', o.comment,
    'table_label', o.table_label,
    'created_at', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', i.product_name,
        'quantity', i.quantity,
        'unit_price_cents', i.unit_price_cents,
        'line_total_cents', i.line_total_cents
      ) order by i.position)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.venue_tables t on t.id = o.table_id
  where o.id = p_order_id and t.token = p_token;
$$;

-- Bars du compte connecté (+ « commandes en pause »)
create or replace function public.get_my_venues()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'name', v.name,
    'logo_url', v.logo_url,
    'timezone', v.timezone,
    'orders_paused', v.orders_paused,
    'role', m.role
  ) order by v.name), '[]'::jsonb)
  from public.venue_members m
  join public.venues v on v.id = m.venue_id
  where m.user_id = (select auth.uid());
$$;

-- Écran du bar (+ appels des tables, + « commandes en pause »)
create or replace function public.get_bar_orders(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
  v_date  date;
begin
  if not private.is_member(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into v_venue from public.venues where id = p_venue_id;
  v_date := private.business_date(v_venue);

  return jsonb_build_object(
    'business_date', v_date,
    'server_time', now(),
    'orders_paused', v_venue.orders_paused,
    'active', coalesce((
      select jsonb_agg(private.order_json(o) order by o.received_at, o.order_number)
      from public.orders o
      where o.venue_id = p_venue_id and o.status in ('received', 'preparing')
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(private.order_json(h) order by coalesce(h.served_at, h.cancelled_at) desc)
      from (
        select * from public.orders o
        where o.venue_id = p_venue_id
          and o.business_date = v_date
          and o.status in ('served', 'cancelled')
        order by coalesce(o.served_at, o.cancelled_at) desc
        limit 100
      ) h
    ), '[]'::jsonb),
    -- Appels en attente (ceux de plus d'une heure sont ignorés)
    'calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'table_label', c.table_label,
        'kind', c.kind,
        'created_at', c.created_at
      ) order by c.created_at)
      from public.table_calls c
      where c.venue_id = p_venue_id
        and c.handled_at is null
        and c.created_at > now() - interval '1 hour'
    ), '[]'::jsonb)
  );
end;
$$;

-- Commandes du jour (+ total des pourboires)
create or replace function public.admin_get_day(p_venue_id uuid, p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
  v_today date;
  v_date  date;
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into v_venue from public.venues where id = p_venue_id;
  v_today := private.business_date(v_venue);
  v_date := coalesce(p_date, v_today);

  return (
    with day as (
      select * from public.orders o
      where o.venue_id = p_venue_id
        and o.business_date = v_date
        and o.status <> 'pending_payment'
        and not (o.status = 'cancelled' and o.payment_method = 'online' and o.payment_status = 'unpaid')
    )
    select jsonb_build_object(
      'business_date', v_date,
      'today', v_today,
      'orders', coalesce((select jsonb_agg(private.order_json(d) order by d.created_at desc) from day d), '[]'::jsonb),
      'totals', jsonb_build_object(
        'count',            (select count(*) from day where status <> 'cancelled'),
        'cancelled_count',  (select count(*) from day where status = 'cancelled'),
        'revenue_cents',    (select coalesce(sum(total_cents), 0) from day where status <> 'cancelled'),
        'online_cents',     (select coalesce(sum(total_cents), 0) from day where status <> 'cancelled' and payment_method = 'online' and payment_status = 'paid'),
        'staff_paid_cents', (select coalesce(sum(total_cents), 0) from day where status <> 'cancelled' and payment_method = 'staff' and payment_status = 'paid'),
        'to_collect_cents', (select coalesce(sum(total_cents), 0) from day where status <> 'cancelled' and payment_method = 'staff' and payment_status = 'unpaid'),
        'tips_cents',       (select coalesce(sum(tip_cents), 0) from day where status <> 'cancelled' and payment_status = 'paid')
      )
    )
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Nouvelles fonctions
-- ---------------------------------------------------------------------

-- Mettre en pause / reprendre les commandes (personnel et gérant)
create or replace function public.set_orders_paused(p_venue_id uuid, p_paused boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  update public.venues set orders_paused = coalesce(p_paused, false) where id = p_venue_id;
end;
$$;

-- Appel depuis une table (appelé uniquement par le serveur de l'application).
-- Un appel du même type déjà en attente n'est pas dupliqué ; au plus 10 appels
-- par table toutes les 10 minutes.
create or replace function public.create_table_call(p_token text, p_kind public.call_kind)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_table public.venue_tables;
  v_id    uuid;
begin
  select * into v_table from public.venue_tables where token = p_token for update;
  if not found or not v_table.is_active then
    raise exception 'CARTE_INVALIDE';
  end if;

  select id into v_id from public.table_calls
   where table_id = v_table.id and kind = p_kind and handled_at is null
     and created_at > now() - interval '1 hour'
   limit 1;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'already_pending', true);
  end if;

  if (select count(*) from public.table_calls
      where table_id = v_table.id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'TROP_D_APPELS';
  end if;

  insert into public.table_calls (venue_id, table_id, table_label, kind)
  values (v_table.venue_id, v_table.id, v_table.label, p_kind)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'already_pending', false);
end;
$$;

-- « Fait » : le serveur s'est occupé de l'appel
create or replace function public.handle_table_call(p_call_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.table_calls where id = p_call_id;
  if v_venue is null or not private.is_member(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  update public.table_calls set handled_at = coalesce(handled_at, now()) where id = p_call_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function public.create_order(text, jsonb, text, public.payment_method, int) from public, anon, authenticated;
grant  execute on function public.create_order(text, jsonb, text, public.payment_method, int) to service_role;
revoke execute on function public.create_table_call(text, public.call_kind) from public, anon, authenticated;
grant  execute on function public.create_table_call(text, public.call_kind) to service_role;

revoke execute on function public.set_orders_paused(uuid, boolean) from public, anon;
revoke execute on function public.handle_table_call(uuid)          from public, anon;
grant  execute on function public.set_orders_paused(uuid, boolean) to authenticated, service_role;
grant  execute on function public.handle_table_call(uuid)          to authenticated, service_role;

commit;
