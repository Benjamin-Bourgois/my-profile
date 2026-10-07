-- =====================================================================
--  COMMANDE À TABLE — 6 : STATISTIQUES DU GÉRANT
--
--  À exécuter une fois, APRÈS les scripts 1 à 5 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
--
--  Ne crée aucune table : ces fonctions lisent les commandes existantes,
--  et seul le gérant du bar peut les appeler.
-- =====================================================================

begin;

-- Les commandes « réelles » d'une période : sans les paiements en ligne en
-- cours ou abandonnés (jamais arrivés au bar). Les annulées sont incluses ;
-- chaque calcul les écarte s'il le faut.
create or replace function private.stats_orders(p_venue_id uuid, p_from date, p_to date)
returns setof public.orders
language sql
stable
set search_path = ''
as $$
  select o.*
  from public.orders o
  where o.venue_id = p_venue_id
    and o.business_date between p_from and p_to
    and o.status <> 'pending_payment'
    and not (o.status = 'cancelled' and o.payment_method = 'online' and o.payment_status = 'unpaid');
$$;

-- Statistiques d'une période : du p_from au p_to, ou les p_days derniers jours
-- (30 par défaut). Les chiffres de la période précédente, de même durée,
-- servent aux évolutions.
create or replace function public.admin_get_stats(
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
  v_venue     public.venues;
  v_today     date;
  v_from      date;
  v_to        date;
  v_days      int;
  v_prev_from date;
  v_prev_to   date;
  v_start     timestamptz;
  v_end       timestamptz;
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into v_venue from public.venues where id = p_venue_id;

  v_today := private.business_date(v_venue);
  v_to := least(coalesce(p_to, v_today), v_today);
  v_from := least(coalesce(p_from, v_to - (greatest(coalesce(p_days, 30), 1) - 1)), v_to);
  if v_to - v_from > 365 then
    v_from := v_to - 365;   -- au plus un an
  end if;
  v_days := v_to - v_from + 1;
  v_prev_to := v_from - 1;
  v_prev_from := v_from - v_days;
  -- Bornes horaires de la période (une journée commence à 5 h par défaut)
  v_start := (v_from::timestamp + make_interval(hours => v_venue.day_starts_at)) at time zone v_venue.timezone;
  v_end := ((v_to + 1)::timestamp + make_interval(hours => v_venue.day_starts_at)) at time zone v_venue.timezone;

  return (
    with
    all_orders as (select * from private.stats_orders(p_venue_id, v_from, v_to)),
    -- Commandes comptées (non annulées), avec l'heure locale de réception
    ok as (
      select o.*, (coalesce(o.received_at, o.created_at) at time zone v_venue.timezone) as local_at
      from all_orders o
      where o.status <> 'cancelled'
    ),
    prev as (select * from private.stats_orders(p_venue_id, v_prev_from, v_prev_to) where status <> 'cancelled'),
    items as (
      select i.*, p.category_id
      from public.order_items i
      join ok on ok.id = i.order_id
      left join public.products p on p.id = i.product_id
    ),
    -- Temps de service (réception → servie). Au-delà de 3 h : oubli de clic, ignoré.
    service as (
      select extract(epoch from served_at - received_at) as seconds
      from ok
      where served_at is not null and received_at is not null
        and served_at >= received_at and served_at - received_at <= interval '3 hours'
    ),
    pickup as (
      select extract(epoch from preparing_at - received_at) as seconds
      from ok
      where preparing_at is not null and received_at is not null
        and preparing_at >= received_at and preparing_at - received_at <= interval '3 hours'
    ),
    daily as (
      select business_date, sum(total_cents)::bigint as revenue_cents, count(*)::int as orders
      from ok group by business_date
    ),
    days as (
      select d::date as day from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') d
    ),
    calls as (
      select * from public.table_calls c
      where c.venue_id = p_venue_id and c.created_at >= v_start and c.created_at < v_end
    )
    select jsonb_build_object(
      'range', jsonb_build_object(
        'from', v_from, 'to', v_to, 'days', v_days,
        'previous_from', v_prev_from, 'previous_to', v_prev_to,
        'today', v_today, 'timezone', v_venue.timezone
      ),

      'totals', (
        select jsonb_build_object(
          'revenue_cents', coalesce(sum(total_cents), 0),
          'orders', count(*),
          'avg_basket_cents', coalesce(round(avg(total_cents)), 0),
          'items', (select coalesce(sum(quantity), 0) from items),
          'tips_cents', coalesce(sum(tip_cents) filter (where payment_status = 'paid'), 0),
          'tip_orders', count(*) filter (where tip_cents > 0 and payment_status = 'paid'),
          'online_cents', coalesce(sum(total_cents) filter (where payment_method = 'online'), 0),
          'online_orders', count(*) filter (where payment_method = 'online'),
          'staff_cents', coalesce(sum(total_cents) filter (where payment_method = 'staff'), 0),
          'staff_orders', count(*) filter (where payment_method = 'staff'),
          'to_collect_cents', coalesce(sum(total_cents) filter (where payment_method = 'staff' and payment_status = 'unpaid'), 0),
          'cancelled', (select count(*) from all_orders where status = 'cancelled'),
          'tables', count(distinct table_id),
          'active_days', count(distinct business_date),
          'comments', count(*) filter (where comment is not null)
        )
        from ok
      ),

      'previous', (
        select jsonb_build_object(
          'revenue_cents', coalesce(sum(total_cents), 0),
          'orders', count(*),
          'avg_basket_cents', coalesce(round(avg(total_cents)), 0),
          'items', (select coalesce(sum(i.quantity), 0) from public.order_items i join prev p2 on p2.id = i.order_id),
          'tips_cents', coalesce(sum(tip_cents) filter (where payment_status = 'paid'), 0),
          'avg_service_seconds', (
            select round(avg(extract(epoch from served_at - received_at)))
            from prev p3
            where served_at is not null and received_at is not null
              and served_at >= received_at and served_at - received_at <= interval '3 hours'
          )
        )
        from prev
      ),

      'by_day', (
        select jsonb_agg(jsonb_build_object(
          'date', d.day, 'revenue_cents', coalesce(x.revenue_cents, 0), 'orders', coalesce(x.orders, 0)
        ) order by d.day)
        from days d left join daily x on x.business_date = d.day
      ),

      'by_hour', (
        select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'orders', n, 'revenue_cents', r) order by h), '[]'::jsonb)
        from (
          select extract(hour from local_at)::int as h, count(*)::int as n, sum(total_cents)::bigint as r
          from ok group by 1
        ) t
      ),

      -- Jour de la semaine (1 = lundi) de la journée d'activité, et nombre de
      -- ces jours dans la période (pour les moyennes).
      'by_weekday', (
        select jsonb_agg(jsonb_build_object(
          'weekday', w, 'days', n_days, 'revenue_cents', r, 'orders', n
        ) order by w)
        from (
          select extract(isodow from d.day)::int as w, count(*)::int as n_days,
                 coalesce(sum(x.revenue_cents), 0)::bigint as r, coalesce(sum(x.orders), 0)::int as n
          from days d left join daily x on x.business_date = d.day
          group by 1
        ) t
      ),

      'heatmap', (
        select coalesce(jsonb_agg(jsonb_build_object('weekday', w, 'hour', h, 'orders', n)), '[]'::jsonb)
        from (
          select extract(isodow from business_date)::int as w, extract(hour from local_at)::int as h, count(*)::int as n
          from ok group by 1, 2
        ) t
      ),

      'products', (
        select coalesce(jsonb_agg(t order by t.quantity desc, t.revenue_cents desc), '[]'::jsonb)
        from (
          select coalesce(max(p.name), max(i.product_name)) as name,
                 sum(i.quantity)::int as quantity,
                 sum(i.line_total_cents)::bigint as revenue_cents,
                 count(distinct i.order_id)::int as orders
          from items i
          left join public.products p on p.id = i.product_id
          group by coalesce(i.product_id::text, i.product_name)
          order by 2 desc, 3 desc
          limit 100
        ) t
      ),

      'categories', (
        select coalesce(jsonb_agg(t order by t.revenue_cents desc), '[]'::jsonb)
        from (
          select coalesce(c.name, 'Produits retirés de la carte') as name,
                 sum(i.quantity)::int as quantity,
                 sum(i.line_total_cents)::bigint as revenue_cents
          from items i
          left join public.categories c on c.id = i.category_id
          group by c.id, c.name
        ) t
      ),

      -- Produits de la carte actuelle jamais commandés sur la période
      'unsold', (
        select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'available', p.is_available)
                                  order by c.sort_order, p.sort_order, p.name), '[]'::jsonb)
        from public.products p
        join public.categories c on c.id = p.category_id
        where p.venue_id = p_venue_id
          and not exists (select 1 from items i where i.product_id = p.id)
      ),

      'tables', (
        select coalesce(jsonb_agg(t order by t.revenue_cents desc, t.label), '[]'::jsonb)
        from (
          select coalesce(max(vt.label), max(o.table_label)) as label,
                 count(*)::int as orders,
                 sum(o.total_cents)::bigint as revenue_cents,
                 round(avg(o.total_cents))::int as avg_basket_cents,
                 coalesce(sum(o.tip_cents) filter (where o.payment_status = 'paid'), 0)::bigint as tips_cents
          from ok o
          left join public.venue_tables vt on vt.id = o.table_id
          group by coalesce(o.table_id::text, o.table_label)
        ) t
      ),

      'service', (
        select jsonb_build_object(
          'measured', count(*),
          'avg_seconds', round(avg(seconds)),
          'median_seconds', round((percentile_cont(0.5) within group (order by seconds))::numeric),
          'within_10_min', count(*) filter (where seconds <= 600),
          'buckets', jsonb_build_array(
            count(*) filter (where seconds < 300),
            count(*) filter (where seconds >= 300 and seconds < 600),
            count(*) filter (where seconds >= 600 and seconds < 900),
            count(*) filter (where seconds >= 900 and seconds < 1200),
            count(*) filter (where seconds >= 1200)
          ),
          'avg_pickup_seconds', (select round(avg(seconds)) from pickup)
        )
        from service
      ),

      'calls', (
        select jsonb_build_object(
          'waiter', count(*) filter (where kind = 'waiter'),
          'bill', count(*) filter (where kind = 'bill'),
          'unanswered', count(*) filter (where handled_at is null),
          'avg_response_seconds', round(avg(extract(epoch from handled_at - created_at))
            filter (where handled_at is not null and handled_at - created_at <= interval '1 hour'))
        )
        from calls
      )
    )
  );
end;
$$;

-- Commandes d'une période, pour l'export CSV (comptabilité, tableur).
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
      'status', o.status,
      'comment', o.comment
    ) order by o.business_date, coalesce(o.received_at, o.created_at)), '[]'::jsonb)
    from private.stats_orders(p_venue_id, v_from, v_to) o
  );
end;
$$;

revoke execute on function private.stats_orders(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.admin_get_stats(uuid, date, date, int)     from public, anon;
revoke execute on function public.admin_export_orders(uuid, date, date, int) from public, anon;
grant  execute on function public.admin_get_stats(uuid, date, date, int)     to authenticated, service_role;
grant  execute on function public.admin_export_orders(uuid, date, date, int) to authenticated, service_role;

commit;
