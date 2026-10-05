-- =====================================================================
--  COMMANDE À TABLE — 3 : ÉCRAN DU BAR (étape 2)
--
--  À exécuter une fois, APRÈS 1-structure.sql et 2-donnees-demo.sql :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
-- =====================================================================

begin;

-- Une commande et ses articles, au format utilisé par l'écran du bar
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

-- Les bars auxquels le compte connecté a accès (et son rôle dans chacun)
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
    'role', m.role
  ) order by v.name), '[]'::jsonb)
  from public.venue_members m
  join public.venues v on v.id = m.venue_id
  where m.user_id = (select auth.uid());
$$;

-- Écran du bar : commandes à préparer (toutes, même d'un jour précédent)
-- et historique de la journée en cours.
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
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function private.order_json(public.orders) from public, anon;
grant  execute on function private.order_json(public.orders) to authenticated, service_role;
revoke execute on function public.get_my_venues()        from public, anon;
revoke execute on function public.get_bar_orders(uuid)   from public, anon;
grant  execute on function public.get_my_venues()        to authenticated, service_role;
grant  execute on function public.get_bar_orders(uuid)   to authenticated, service_role;

commit;
