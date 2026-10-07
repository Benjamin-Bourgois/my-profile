-- =====================================================================
--  COMMANDE À TABLE — HISTORIQUE DE DÉMONSTRATION (facultatif)
--
--  Remplit « Le Comptoir de Démo » avec 6 mois d'activité réaliste
--  (commandes, pourboires, appels des tables) pour montrer la page
--  Statistiques à un prospect. Ne touche à AUCUN autre bar.
--
--  À exécuter APRÈS les scripts 1 à 6 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Un tableau récapitulatif s'affiche à la fin.
--
--  On peut le relancer : l'ancien historique de démonstration est remplacé.
--  Pour l'effacer : supabase/demo-historique-effacer.sql
-- =====================================================================

begin;

do $$
declare
  c_marker   constant text := 'demo-historique';   -- repère des commandes fictives
  c_days     constant int  := 182;                  -- 6 mois (et la période précédente des vues 7 / 30 / 90 jours)
  c_comments constant text[] := array[
    'Sans glace svp', 'Bien frais', 'Avec des pailles', 'Pas trop sucré', 'Une carafe d''eau aussi',
    'C''est pour un anniversaire', 'Le plus vite possible', 'Avec du citron'
  ];
  v_venue    public.venues;
  v_today    date;
  v_day      date;
  v_dow      int;
  v_progress numeric;
  v_count    int;
  v_times    timestamptz[];
  v_at       timestamptz;
  v_call     timestamptz;
  v_hour     numeric;
  v_number   int;
  v_order    uuid;
  v_total    int;
  v_tip      int;
  v_method   public.payment_method;
  v_cancel   boolean;
  v_service  numeric;
  v_lines    int;
  v_items    int;
  v_qty      int;
  v_rush     boolean;
  v_pick     numeric;
  v_i        int;
  v_k        int;
  -- produits disponibles et tables actives, avec un poids de popularité
  p_ids      uuid[];
  p_names    text[];
  p_prices   int[];
  p_weights  numeric[];
  p_total    numeric;
  t_ids      uuid[];
  t_labels   text[];
  t_weights  numeric[];
  t_total    numeric;
  v_table    int;
  v_product  int;
  v_used     int[];
  -- ce qui se commande ensemble (bière → planche…) et suggestions de l'appli (script 10)
  b_idx      int[];
  c_idx      int[];
  s_idx      int[];
  v_snack    int;
  v_conv     boolean := to_regclass('public.suggestion_conversions') is not null;
begin
  -- Vérifications
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'orders' and column_name = 'tip_cents') then
    raise exception 'Exécutez d''abord le script supabase/5-ajouts.sql';
  end if;
  if to_regprocedure('public.admin_get_stats(uuid, date, date, integer)') is null then
    raise exception 'Exécutez d''abord le script supabase/6-statistiques.sql';
  end if;
  select * into v_venue from public.venues where slug = 'comptoir-demo';
  if not found then
    raise exception 'Bar de démonstration introuvable (slug « comptoir-demo ») : exécutez d''abord supabase/2-donnees-demo.sql';
  end if;

  select array_agg(p.id order by p.id), array_agg(p.name order by p.id), array_agg(p.price_cents order by p.id),
         array_agg(case
           when p.name ~* 'mojito|spritz|pinte|demi' then 3
           when p.name ~* 'planche' then 1.6
           when p.name ~* 'gin|ipa|blanche|limonade' then 1.4
           when p.name ~* 'cola|jus|olive' then 0.9
           else 1 end order by p.id)
    into p_ids, p_names, p_prices, p_weights
  from public.products p
  where p.venue_id = v_venue.id and p.is_available and p.price_cents > 0;

  select array_agg(t.id order by t.sort_order, t.label), array_agg(t.label order by t.sort_order, t.label),
         array_agg((0.6 + random() * 1.2)::numeric order by t.sort_order, t.label)
    into t_ids, t_labels, t_weights
  from public.venue_tables t
  where t.venue_id = v_venue.id and t.is_active;

  if p_ids is null or t_ids is null then
    raise exception 'Le bar de démonstration doit avoir au moins un produit disponible et une table active.';
  end if;
  select sum(w) into p_total from unnest(p_weights) w;
  select coalesce(array_agg(i) filter (where p_names[i] ~* 'pinte|demi|blanche|ipa|bi[eè]re'), '{}'),
         coalesce(array_agg(i) filter (where p_names[i] ~* 'mojito|spritz|gin|cocktail'), '{}'),
         coalesce(array_agg(i) filter (where p_names[i] ~* 'planche|olive|chips|frites'), '{}')
    into b_idx, c_idx, s_idx
  from generate_subscripts(p_ids, 1) i;
  select sum(w) into t_total from unnest(t_weights) w;

  -- L'ancien historique de démonstration est remplacé
  delete from public.orders where venue_id = v_venue.id and stripe_payment_intent_id = c_marker;
  v_today := private.business_date(v_venue);
  delete from public.table_calls
   where venue_id = v_venue.id and handled_at is not null
     and created_at < ((v_today::timestamp + make_interval(hours => v_venue.day_starts_at)) at time zone v_venue.timezone);

  for v_day in select d::date from generate_series(v_today - c_days, v_today - 1, interval '1 day') d loop
    v_dow := extract(isodow from v_day)::int;
    continue when v_dow = 1;                                 -- fermé le lundi
    v_progress := (v_day - (v_today - c_days))::numeric / c_days;   -- 0 → 1 : la clientèle adopte l'application

    v_count := round((case v_dow when 2 then 13 when 3 then 15 when 4 then 21 when 5 then 32 when 6 then 37 else 17 end)
                     * (0.75 + random() * 0.5) * (0.7 + v_progress * 0.55)
                     * (case when extract(month from v_day) in (6, 7, 8) then 1.15 else 1 end));   -- terrasse l'été

    -- Heures de la soirée, triées pour numéroter les commandes dans l'ordre
    select array_agg(t order by t) into v_times
    from (
      select (v_day::timestamp + make_interval(secs => (h * 3600)::int)) at time zone v_venue.timezone as t
      from (
        select greatest(case v_dow when 7 then 15 else 17 end,
                        least(case when v_dow in (5, 6) then 26.9 else 24.9 end,
                              (case v_dow when 7 then 18.5 when 5 then 22 when 6 then 22.3 else 20.5 end)
                              + (random() + random() + random() - 1.5) * 2.6)) as h
        from generate_series(1, v_count)
      ) hours
    ) times;

    select coalesce(max(order_number), 0) into v_number
    from public.orders where venue_id = v_venue.id and business_date = v_day;

    for v_i in 1 .. coalesce(array_length(v_times, 1), 0) loop
      v_at := v_times[v_i];
      v_number := v_number + 1;
      v_hour := extract(hour from v_at at time zone v_venue.timezone);
      v_rush := v_dow in (5, 6) and v_hour between 21 and 23;

      -- Table (au hasard, certaines plus demandées que d'autres)
      v_pick := random() * t_total;
      v_table := 1;
      while v_pick > t_weights[v_table] and v_table < array_length(t_ids, 1) loop
        v_pick := v_pick - t_weights[v_table];
        v_table := v_table + 1;
      end loop;

      v_method := case when random() < 0.42 + v_progress * 0.2 then 'online' else 'staff' end;
      v_cancel := random() < 0.03;

      insert into public.orders (venue_id, table_id, table_label, order_number, business_date, status,
                                 payment_method, payment_status, total_cents, tip_cents, comment,
                                 stripe_payment_intent_id, created_at, received_at, cancelled_at)
      values (v_venue.id, t_ids[v_table], t_labels[v_table], v_number, v_day,
              case when v_cancel then 'cancelled' else 'served' end::public.order_status,
              v_method, case when v_method = 'online' or not v_cancel then 'paid' else 'unpaid' end::public.payment_status,
              0, 0, case when random() < 0.1 then c_comments[1 + floor(random() * array_length(c_comments, 1))::int] end,
              c_marker, v_at, v_at, case when v_cancel then v_at + interval '4 minutes' end)
      returning id into v_order;

      -- Articles : 1 à 4 produits différents
      v_total := 0;
      v_items := 0;
      v_used := '{}';
      v_lines := 1 + floor(random() * random() * 4)::int;
      for v_k in 1 .. v_lines loop
        v_pick := random() * p_total;
        v_product := 1;
        while v_pick > p_weights[v_product] and v_product < array_length(p_ids, 1) loop
          v_pick := v_pick - p_weights[v_product];
          v_product := v_product + 1;
        end loop;
        continue when v_product = any (v_used);
        v_used := v_used || v_product;
        v_qty := 1 + floor(random() * random() * 4)::int;
        insert into public.order_items (order_id, venue_id, product_id, product_name, unit_price_cents, quantity, position)
        values (v_order, v_venue.id, p_ids[v_product], p_names[v_product], p_prices[v_product], v_qty, v_k);
        v_total := v_total + v_qty * p_prices[v_product];
        v_items := v_items + v_qty;
      end loop;

      -- À grignoter avec la bière ou les cocktails ; depuis 3 mois, souvent grâce à
      -- « Souvent pris avec », et quelques tournées recommandées en un geste.
      if cardinality(s_idx) > 0 and (
           (v_used && b_idx and random() < 0.35) or (v_used && c_idx and random() < 0.25)) then
        v_snack := s_idx[1 + floor(random() * cardinality(s_idx))::int];
        if not v_snack = any (v_used) then
          v_used := v_used || v_snack;
          insert into public.order_items (order_id, venue_id, product_id, product_name, unit_price_cents, quantity, position)
          values (v_order, v_venue.id, p_ids[v_snack], p_names[v_snack], p_prices[v_snack], 1, v_lines + 1);
          v_total := v_total + p_prices[v_snack];
          v_items := v_items + 1;
          if v_conv and v_progress > 0.5 and random() < 0.6 then
            execute 'insert into public.suggestion_conversions (order_id, venue_id, product_id, kind, quantity, amount_cents, created_at)
                     values ($1, $2, $3, ''pairing'', 1, $4, $5) on conflict do nothing'
              using v_order, v_venue.id, p_ids[v_snack], p_prices[v_snack], v_at;
          end if;
        end if;
      end if;
      if v_conv and v_progress > 0.5 and not v_cancel and random() < 0.06 then
        execute 'insert into public.suggestion_conversions (order_id, venue_id, product_id, kind, quantity, amount_cents, created_at)
                 select order_id, venue_id, product_id, ''reorder'', quantity, line_total_cents, $2
                 from public.order_items where order_id = $1 and product_id is not null
                 on conflict do nothing'
          using v_order, v_at;
      end if;

      -- Pourboire (paiement en ligne seulement)
      v_tip := 0;
      if v_method = 'online' and random() < 0.33 then
        v_tip := case when random() < 0.55 then round(v_total * 0.05 / 10) * 10
                      when random() < 0.7 then round(v_total * 0.10 / 10) * 10
                      else 100 * (1 + floor(random() * 3)) end;
        v_tip := least(v_tip, v_total);
      end if;

      -- Service : plus long quand il y a beaucoup d'articles ou en plein rush
      v_service := 150 + v_items * 55 + (case when v_rush then 330 else 0 end) + random() * 300 + random() * random() * 600;

      update public.orders
         set total_cents = v_total,
             tip_cents = v_tip,
             preparing_at = case when not v_cancel then v_at + make_interval(secs => (40 + random() * 150)::int) end,
             served_at = case when not v_cancel then v_at + make_interval(secs => v_service::int) end,
             paid_at = case when v_method = 'online' then v_at
                            when not v_cancel then v_at + make_interval(secs => (v_service + 900 + random() * 2400)::int) end
       where id = v_order;

      -- Appels des tables (l'addition plutôt en fin de soirée)
      if not v_cancel and random() < 0.22 then
        v_call := v_at + make_interval(secs => (v_service + 600 + random() * 1800)::int);
        insert into public.table_calls (venue_id, table_id, table_label, kind, created_at, handled_at)
        values (v_venue.id, t_ids[v_table], t_labels[v_table],
                case when random() < 0.25 + least(0.6, greatest(0, v_hour - 20) * 0.12) then 'bill' else 'waiter' end::public.call_kind,
                v_call, v_call + make_interval(secs => 45 + (random() * 200)::int));
      end if;
    end loop;

    -- Les prochains numéros de commande de ce jour suivront
    insert into private.order_counters (venue_id, business_date, last_number)
    values (v_venue.id, v_day, v_number)
    on conflict (venue_id, business_date) do update
      set last_number = greatest(private.order_counters.last_number, excluded.last_number);
  end loop;
end;
$$;

commit;

-- Récapitulatif
select count(*)                                        as "commandes fictives",
       count(distinct o.business_date)                 as "jours d'ouverture",
       replace(to_char(sum(o.total_cents) / 100.0, 'FM9999990.00'), '.', ',') || ' €' as "chiffre d'affaires",
       min(o.business_date)                            as "du",
       max(o.business_date)                            as "au"
from public.orders o
join public.venues v on v.id = o.venue_id
where v.slug = 'comptoir-demo' and o.stripe_payment_intent_id = 'demo-historique' and o.status <> 'cancelled';
