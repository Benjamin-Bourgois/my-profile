-- =====================================================================
--  COMMANDE À TABLE — 11 : RÈGLEMENT AU SERVEUR (ESPÈCES, CARTE, LES DEUX)
--
--  À exécuter une fois, APRÈS les scripts 1 à 10 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
--
--  - Le gérant choisit ce qu'il accepte au serveur : espèces, carte, ou les deux ;
--  - le client qui « paie au serveur » indique comment : espèces, carte ou
--    les deux (une partie de chaque) ; le serveur sait quoi apporter ;
--  - le serveur le note aussi pour les commandes qu'il prend ;
--  - affiché sur l'écran du bar, le suivi du client, les commandes du jour
--    (avec la répartition) et l'export pour la comptabilité.
-- =====================================================================

begin;

-- Moyens acceptés au serveur (réglages du bar)
alter table public.venues add column if not exists staff_cash_enabled boolean not null default true;
alter table public.venues add column if not exists staff_card_enabled boolean not null default true;

-- Règlement au serveur : 'cash' espèces, 'card' carte, 'mixed' les deux (null : non précisé)
alter table public.orders add column if not exists staff_payment text;
do $$
begin
  alter table public.orders add constraint orders_staff_payment_check
    check (staff_payment is null or (staff_payment in ('cash', 'card', 'mixed') and payment_method = 'staff'));
exception when duplicate_object then null;
end;
$$;


-- ---------------------------------------------------------------------
-- Commandes vues par le bar, le gérant et le client : + le règlement
-- ---------------------------------------------------------------------
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
    'staff_payment', o.staff_payment,
    'total_cents', o.total_cents,
    'tip_cents', o.tip_cents,
    'comment', o.comment,
    'source', o.source,
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
    'staff_payment', o.staff_payment,
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

create or replace function public.admin_export_orders(
  p_venue_id uuid,
  p_from     date default null,
  p_to       date default null,
  p_days     int  default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
  v_to    date;
  v_from  date;
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into v_venue from public.venues where id = p_venue_id;
  v_to := least(coalesce(p_to, private.business_date(v_venue)), private.business_date(v_venue));
  v_from := least(coalesce(p_from, v_to - (greatest(coalesce(p_days, 30), 1) - 1)), v_to);
  if v_to - v_from > 365 then
    v_from := v_to - 365;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'business_date', o.business_date,
      'time', to_char(coalesce(o.received_at, o.created_at) at time zone v_venue.timezone, 'HH24:MI'),
      'order_number', o.order_number,
      'table_label', o.table_label,
      'items', (
        select string_agg(i.quantity || ' × ' || i.product_name, ', ' order by i.position)
        from public.order_items i where i.order_id = o.id
      ),
      'total_cents', o.total_cents,
      'tip_cents', o.tip_cents,
      'payment_method', o.payment_method,
      'payment_status', o.payment_status,
      'staff_payment', o.staff_payment,
      'status', o.status,
      'comment', o.comment
    ) order by o.business_date, coalesce(o.received_at, o.created_at)), '[]'::jsonb)
    from private.stats_orders(p_venue_id, v_from, v_to) o
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Client
-- ---------------------------------------------------------------------

-- Moyens acceptés au serveur pour cette table ({ cash, card } ; null : lien inconnu)
create or replace function public.get_staff_payment_options(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('cash', v.staff_cash_enabled, 'card', v.staff_card_enabled)
  from public.venue_tables t join public.venues v on v.id = t.venue_id
  where t.token = p_token;
$$;

-- Choix du client, juste après sa commande « au serveur » (une seule fois)
create or replace function public.set_order_staff_payment(p_token text, p_order_id uuid, p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
begin
  select v.* into v_venue
  from public.orders o
  join public.venue_tables t on t.id = o.table_id
  join public.venues v on v.id = o.venue_id
  where o.id = p_order_id and t.token = p_token and o.payment_method = 'staff'
    and o.staff_payment is null and o.created_at > now() - interval '10 minutes';
  if not found then
    return false;
  end if;
  -- Seulement ce que le bar accepte
  if not ((p_kind = 'cash' and v_venue.staff_cash_enabled)
       or (p_kind = 'card' and v_venue.staff_card_enabled)
       or (p_kind = 'mixed' and v_venue.staff_cash_enabled and v_venue.staff_card_enabled)) then
    return false;
  end if;
  update public.orders set staff_payment = p_kind where id = p_order_id;
  return true;
end;
$$;


-- ---------------------------------------------------------------------
-- Personnel : noter ou corriger le règlement d'une commande au serveur
-- ---------------------------------------------------------------------
create or replace function public.staff_set_order_payment(p_order_id uuid, p_kind text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not private.is_member(v_order.venue_id) then
    raise exception 'INTROUVABLE';
  end if;
  if v_order.payment_method <> 'staff' or (p_kind is not null and p_kind not in ('cash', 'card', 'mixed')) then
    raise exception 'REGLEMENT_INVALIDE';
  end if;
  update public.orders set staff_payment = p_kind where id = p_order_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Gérant : moyens acceptés au serveur
-- ---------------------------------------------------------------------
create or replace function public.admin_get_payment_options(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  return (select jsonb_build_object('cash', staff_cash_enabled, 'card', staff_card_enabled) from public.venues where id = p_venue_id);
end;
$$;

create or replace function public.admin_set_payment_options(p_venue_id uuid, p_cash boolean, p_card boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  if not (coalesce(p_cash, false) or coalesce(p_card, false)) then
    raise exception 'REGLEMENT_INVALIDE';   -- au moins un moyen
  end if;
  update public.venues set staff_cash_enabled = p_cash, staff_card_enabled = p_card where id = p_venue_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function public.get_staff_payment_options(text)                    from public, anon, authenticated;
revoke execute on function public.set_order_staff_payment(text, uuid, text)          from public, anon, authenticated;
grant  execute on function public.get_staff_payment_options(text)                    to service_role;
grant  execute on function public.set_order_staff_payment(text, uuid, text)          to service_role;
revoke execute on function public.staff_set_order_payment(uuid, text)                from public, anon;
revoke execute on function public.admin_get_payment_options(uuid)                    from public, anon;
revoke execute on function public.admin_set_payment_options(uuid, boolean, boolean)  from public, anon;
grant  execute on function public.staff_set_order_payment(uuid, text)                to authenticated, service_role;
grant  execute on function public.admin_get_payment_options(uuid)                    to authenticated, service_role;
grant  execute on function public.admin_set_payment_options(uuid, boolean, boolean)  to authenticated, service_role;

commit;
