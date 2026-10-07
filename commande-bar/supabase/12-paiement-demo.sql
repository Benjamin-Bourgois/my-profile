-- =====================================================================
--  COMMANDE À TABLE — 12 : PAIEMENT EN LIGNE DE DÉMONSTRATION
--
--  À exécuter une fois, APRÈS les scripts 1 à 11 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
--
--  Pour montrer l'application à un bar avant que Stripe soit connecté :
--  - l'agence marque un bar « Démo » ;
--  - dans ce bar, « Payer en ligne » est proposé aux clients même sans
--    Stripe : une page de paiement simulée (aucun argent débité), puis la
--    commande arrive au bar « Payé en ligne · démo » ;
--  - dès que Stripe est connecté, les paiements en ligne sont réels.
--  Un bar qui n'est pas marqué « Démo » ne peut JAMAIS être payé ainsi.
-- =====================================================================

begin;

-- Bar de démonstration (choisi par l'agence). Le bar de démo fourni est marqué
-- à la création de la colonne seulement : ensuite, c'est le choix de l'agence.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'venues' and column_name = 'demo_payment_enabled') then
    alter table public.venues add column demo_payment_enabled boolean not null default false;
    update public.venues set demo_payment_enabled = true where slug = 'comptoir-demo';
  end if;
end;
$$;

-- Commande payée en ligne par simulation (jamais par Stripe)
alter table public.orders add column if not exists demo_payment boolean not null default false;
do $$
begin
  alter table public.orders add constraint orders_demo_payment_check
    check (not demo_payment or (payment_method = 'online' and stripe_checkout_session_id is null));
exception when duplicate_object then null;
end;
$$;


-- ---------------------------------------------------------------------
-- Commandes vues par le bar, le gérant et le client : + « démo »
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
    'demo_payment', o.demo_payment,
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
    'demo_payment', o.demo_payment,
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
      'demo_payment', o.demo_payment,
      'status', o.status,
      'comment', o.comment
    ) order by o.business_date, coalesce(o.received_at, o.created_at)), '[]'::jsonb)
    from private.stats_orders(p_venue_id, v_from, v_to) o
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Client (appelé par le serveur du site seulement)
-- ---------------------------------------------------------------------

-- Ce bar est-il marqué « Démo » ? (false : lien inconnu)
create or replace function public.get_demo_payment(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select v.demo_payment_enabled
    from public.venue_tables t join public.venues v on v.id = t.venue_id
    where t.token = p_token
  ), false);
$$;

-- Commande « payer en ligne » qui vient d'être créée : paiement simulé.
-- Annule au passage les paiements simulés abandonnés depuis plus de 30 minutes
-- (le stock réservé est rendu).
create or replace function public.start_demo_payment(p_token text, p_order_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
begin
  select o.venue_id into v_venue_id
  from public.orders o
  join public.venue_tables t on t.id = o.table_id
  join public.venues v on v.id = o.venue_id
  where o.id = p_order_id and t.token = p_token
    and v.demo_payment_enabled
    and o.payment_method = 'online' and o.status = 'pending_payment'
    and o.stripe_checkout_session_id is null and not o.demo_payment
    and o.created_at > now() - interval '5 minutes';
  if not found then
    return false;
  end if;

  update public.orders
     set status = 'cancelled', cancelled_at = now()
   where venue_id = v_venue_id and demo_payment and status = 'pending_payment'
     and created_at < now() - interval '30 minutes';

  update public.orders set demo_payment = true where id = p_order_id;
  return true;
end;
$$;

-- Le client valide (p_paid = true) ou annule le paiement simulé
create or replace function public.finish_demo_payment(p_token text, p_order_id uuid, p_paid boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select o.* into v_order
  from public.orders o
  join public.venue_tables t on t.id = o.table_id
  join public.venues v on v.id = o.venue_id
  where o.id = p_order_id and t.token = p_token
    and v.demo_payment_enabled
    and o.demo_payment and o.status = 'pending_payment'
  for update of o;
  if not found then
    return false;
  end if;

  if p_paid and v_order.created_at > now() - interval '30 minutes' then
    update public.orders
       set payment_status = 'paid', paid_at = now(), status = 'received', received_at = now()
     where id = p_order_id;
    return true;
  end if;

  -- Annulé, ou trop tard (comme une page de paiement expirée)
  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order_id;
  return not p_paid;
end;
$$;


-- ---------------------------------------------------------------------
-- Gérant : son bar est-il en démonstration ?
-- ---------------------------------------------------------------------
create or replace function public.admin_get_demo_payment(p_venue_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  return (select demo_payment_enabled from public.venues where id = p_venue_id);
end;
$$;


-- ---------------------------------------------------------------------
-- Agence : marquer un bar « Démo »
-- ---------------------------------------------------------------------
create or replace function public.agency_get_demo_venues()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  return (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.venues where demo_payment_enabled);
end;
$$;

create or replace function public.agency_set_demo_payment(p_venue_id uuid, p_enabled boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  update public.venues set demo_payment_enabled = coalesce(p_enabled, false) where id = p_venue_id;
  if not found then
    raise exception 'INTROUVABLE';
  end if;
  -- Démo arrêtée : les paiements simulés en cours sont annulés (stock rendu)
  if not coalesce(p_enabled, false) then
    update public.orders set status = 'cancelled', cancelled_at = now()
     where venue_id = p_venue_id and demo_payment and status = 'pending_payment';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function public.get_demo_payment(text)                     from public, anon, authenticated;
revoke execute on function public.start_demo_payment(text, uuid)             from public, anon, authenticated;
revoke execute on function public.finish_demo_payment(text, uuid, boolean)   from public, anon, authenticated;
grant  execute on function public.get_demo_payment(text)                     to service_role;
grant  execute on function public.start_demo_payment(text, uuid)             to service_role;
grant  execute on function public.finish_demo_payment(text, uuid, boolean)   to service_role;
revoke execute on function public.admin_get_demo_payment(uuid)               from public, anon;
revoke execute on function public.agency_get_demo_venues()                   from public, anon;
revoke execute on function public.agency_set_demo_payment(uuid, boolean)     from public, anon;
grant  execute on function public.admin_get_demo_payment(uuid)               to authenticated, service_role;
grant  execute on function public.agency_get_demo_venues()                   to authenticated, service_role;
grant  execute on function public.agency_set_demo_payment(uuid, boolean)     to authenticated, service_role;

commit;
