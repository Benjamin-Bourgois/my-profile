-- =====================================================================
--  COMMANDE À TABLE — 10 : SUGGESTIONS ET VENTES GÉNÉRÉES PAR L'APPLI
--
--  À exécuter une fois, APRÈS les scripts 1 à 9 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
--
--  - « Souvent pris avec » dans le panier du client : calculé d'après les
--    vraies ventes du bar (ce qui se commande ensemble), et/ou choisi par
--    le gérant pour chaque produit ;
--  - « Une autre tournée ? » sur la page de suivi, après le service ;
--  - chaque article ajouté grâce à une suggestion est noté : le gérant voit
--    ce que l'application lui a rapporté (et l'agence, bar par bar).
-- =====================================================================

begin;

-- Interrupteur du bar (réglages du gérant)
alter table public.venues add column if not exists suggestions_enabled boolean not null default true;

-- Suggestions choisies par le gérant : « avec ce produit, proposer… » (3 au plus)
create table if not exists public.product_pairings (
  product_id           uuid not null,
  suggested_product_id uuid not null,
  venue_id             uuid not null,
  position             smallint not null default 0,
  primary key (product_id, suggested_product_id),
  check (product_id <> suggested_product_id),
  foreign key (product_id, venue_id) references public.products(id, venue_id) on delete cascade,
  foreign key (suggested_product_id, venue_id) references public.products(id, venue_id) on delete cascade
);

-- Articles commandés grâce à une suggestion
create table if not exists public.suggestion_conversions (
  order_id     uuid not null,
  venue_id     uuid not null,
  product_id   uuid not null,
  kind         text not null check (kind in ('pairing', 'reorder')),  -- « Souvent pris avec » / « Une autre tournée ? »
  quantity     int not null check (quantity between 1 and 50),
  amount_cents int not null check (amount_cents >= 0),
  created_at   timestamptz not null default now(),
  primary key (order_id, product_id),
  foreign key (order_id, venue_id) references public.orders(id, venue_id) on delete cascade
);
create index if not exists suggestion_conversions_venue_idx on public.suggestion_conversions (venue_id, created_at);
-- Meilleures ventes récentes d'un produit (suggestions)
create index if not exists order_items_product_idx on public.order_items (product_id, created_at);

alter table public.product_pairings enable row level security;
alter table public.suggestion_conversions enable row level security;
revoke all on public.product_pairings, public.suggestion_conversions from anon, authenticated;
grant select on public.product_pairings, public.suggestion_conversions to authenticated;
grant all on public.product_pairings, public.suggestion_conversions to service_role;
drop policy if exists "Personnel : voit les suggestions" on public.product_pairings;
create policy "Personnel : voit les suggestions" on public.product_pairings
  for select to authenticated using (private.is_member(venue_id));
drop policy if exists "Personnel : voit les ventes des suggestions" on public.suggestion_conversions;
create policy "Personnel : voit les ventes des suggestions" on public.suggestion_conversions
  for select to authenticated using (private.is_member(venue_id));


-- ---------------------------------------------------------------------
-- Client : suggestions pour la carte d'une table
-- { enabled, pairs: { produit: [3 produits au plus] }, popular: [meilleures ventes] }
-- ---------------------------------------------------------------------
create or replace function public.get_suggestions(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
begin
  select v.* into v_venue
  from public.venue_tables t join public.venues v on v.id = t.venue_id
  where t.token = p_token and t.is_active;
  if not found then
    return null;
  end if;
  if not v_venue.suggestions_enabled then
    return jsonb_build_object('enabled', false, 'pairs', '{}'::jsonb, 'popular', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'enabled', true,
    'pairs', coalesce((
      with recent as (
        select o.id from public.orders o
        where o.venue_id = v_venue.id
          and o.status not in ('cancelled', 'pending_payment')
          and o.created_at > now() - interval '90 days'
      ),
      lines as (
        select distinct i.order_id, i.product_id
        from public.order_items i join recent r on r.id = i.order_id
        where i.product_id is not null
      ),
      orders_with as (
        select product_id, count(*) as n from lines group by product_id
      ),
      -- Produits commandés ensemble. Un produit très vendu n'est pas favorisé pour autant
      -- (il serait proposé avec tout) ; un autre type de produit compte double
      -- (boisson → à grignoter).
      together as (
        select a.product_id as p, b.product_id as q,
               count(*) * sqrt((select count(distinct order_id) from lines)::numeric / max(w.n))
                        * (case when pa.category_id <> pb.category_id then 2 else 1 end) as score
        from lines a
        join lines b on b.order_id = a.order_id and b.product_id <> a.product_id
        join orders_with w on w.product_id = b.product_id
        join public.products pa on pa.id = a.product_id
        join public.products pb on pb.id = b.product_id
        where pb.is_available
        group by a.product_id, b.product_id, pa.category_id, pb.category_id
        having count(*) >= 2
      ),
      -- Le choix du gérant passe avant les ventes
      candidates as (
        select pp.product_id as p, pp.suggested_product_id as q, 1000000 - pp.position as score
        from public.product_pairings pp
        join public.products s on s.id = pp.suggested_product_id
        where pp.venue_id = v_venue.id and s.is_available
        union all
        select p, q, score from together
      ),
      best as (
        select p, q, max(score) as score from candidates group by p, q
      ),
      ranked as (
        select p, q, row_number() over (partition by p order by score desc, q) as rk from best
      )
      select jsonb_object_agg(p, qs)
      from (select p, jsonb_agg(q order by rk) as qs from ranked where rk <= 3 group by p) x
    ), '{}'::jsonb),
    'popular', coalesce((
      select jsonb_agg(id order by sold desc, sort_order)
      from (
        select p.id, p.sort_order, coalesce(sum(i.quantity), 0) as sold
        from public.products p
        left join public.order_items i on i.product_id = p.id
          and i.created_at > now() - interval '60 days'
        where p.venue_id = v_venue.id and p.is_available and p.price_cents > 0
        group by p.id, p.sort_order
        order by sold desc, p.sort_order
        limit 12
      ) top
    ), '[]'::jsonb)
  );
end;
$$;

-- Client : articles de la commande ajoutés grâce à une suggestion
-- p_items : [{ "product_id": "…", "kind": "pairing" | "reorder" }, …]
create or replace function public.record_suggestions(p_token text, p_order_id uuid, p_items jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_count int;
begin
  select o.* into v_order
  from public.orders o join public.venue_tables t on t.id = o.table_id
  where o.id = p_order_id and t.token = p_token
    and o.created_at > now() - interval '10 minutes';   -- seulement juste après la commande
  if not found or p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;

  insert into public.suggestion_conversions (order_id, venue_id, product_id, kind, quantity, amount_cents)
  select v_order.id, v_order.venue_id, i.product_id, x.kind, i.quantity, i.line_total_cents
  from (
    select distinct on (private.try_uuid(e->>'product_id')) private.try_uuid(e->>'product_id') as product_id, e->>'kind' as kind
    from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) = 'object' and e->>'kind' in ('pairing', 'reorder')
  ) x
  join public.order_items i on i.order_id = v_order.id and i.product_id = x.product_id
  where x.product_id is not null
  on conflict (order_id, product_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- Client, page de suivi : « Une autre tournée ? » (produits encore à la carte, prix actuels)
create or replace function public.get_reorder_items(p_order_id uuid, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when v.suggestions_enabled then jsonb_build_object(
    'served_at', o.served_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', p.id, 'name', p.name, 'price_cents', p.price_cents, 'quantity', i.quantity
      ) order by i.position)
      from public.order_items i join public.products p on p.id = i.product_id
      where i.order_id = o.id and p.is_available
    ), '[]'::jsonb)
  ) end
  from public.orders o
  join public.venue_tables t on t.id = o.table_id
  join public.venues v on v.id = o.venue_id
  where o.id = p_order_id and t.token = p_token;
$$;


-- ---------------------------------------------------------------------
-- Gérant : réglage, suggestions choisies, ventes générées
-- ---------------------------------------------------------------------
create or replace function public.admin_get_suggestions(p_venue_id uuid)
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
  return jsonb_build_object(
    'enabled', (select suggestions_enabled from public.venues where id = p_venue_id),
    'pairings', coalesce((
      select jsonb_object_agg(product_id, ids)
      from (
        select product_id, jsonb_agg(suggested_product_id order by position) as ids
        from public.product_pairings where venue_id = p_venue_id group by product_id
      ) x
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_suggestions_enabled(p_venue_id uuid, p_enabled boolean)
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
  update public.venues set suggestions_enabled = coalesce(p_enabled, true) where id = p_venue_id;
end;
$$;

-- Remplace les suggestions choisies pour un produit (3 au plus, dans l'ordre)
-- p_suggested : ["id produit", …]
drop function if exists public.admin_set_product_pairings(uuid, uuid[]);
create or replace function public.admin_set_product_pairings(p_product_id uuid, p_suggested jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
  v_ids   uuid[];
begin
  select venue_id into v_venue from public.products where id = p_product_id;
  if v_venue is null or not private.is_owner(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  if p_suggested is not null and jsonb_typeof(p_suggested) <> 'array' then
    raise exception 'SUGGESTION_INVALIDE';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_suggested, '[]')) e where private.try_uuid(e) is null) then
    raise exception 'SUGGESTION_INVALIDE';
  end if;
  select coalesce(array_agg(id order by ord), '{}') into v_ids
  from (
    select distinct on (u.id) u.id, u.ord
    from jsonb_array_elements_text(coalesce(p_suggested, '[]')) with ordinality as e(txt, ord)
    cross join lateral (select private.try_uuid(e.txt) as id, e.ord) u
    where u.id <> p_product_id
    order by u.id, u.ord
  ) d;
  if cardinality(v_ids) > 3
     or exists (select 1 from unnest(v_ids) s(id)
                where not exists (select 1 from public.products p where p.id = s.id and p.venue_id = v_venue)) then
    raise exception 'SUGGESTION_INVALIDE';
  end if;
  delete from public.product_pairings where product_id = p_product_id;
  insert into public.product_pairings (product_id, suggested_product_id, venue_id, position)
  select p_product_id, s.id, v_venue, s.ord - 1
  from unnest(v_ids) with ordinality as s(id, ord);
end;
$$;

-- Ventes générées par l'appli sur une période (jours du bar) et depuis le 1er du mois
create or replace function public.admin_get_app_sales(p_venue_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
  v_today date;
  v_month date;
begin
  if not private.is_member(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into v_venue from public.venues where id = p_venue_id;
  v_today := private.business_date(v_venue);
  v_month := date_trunc('month', v_today)::date;
  return jsonb_build_object(
    'enabled', v_venue.suggestions_enabled,
    'period', (
      select jsonb_build_object(
        'pairing_cents', coalesce(sum(c.amount_cents) filter (where c.kind = 'pairing'), 0),
        'pairing_items', coalesce(sum(c.quantity) filter (where c.kind = 'pairing'), 0),
        'reorder_cents', coalesce(sum(c.amount_cents) filter (where c.kind = 'reorder'), 0),
        'reorder_items', coalesce(sum(c.quantity) filter (where c.kind = 'reorder'), 0),
        'orders', count(distinct c.order_id)
      )
      from public.suggestion_conversions c
      join public.orders o on o.id = c.order_id
      where c.venue_id = p_venue_id and o.status not in ('cancelled', 'pending_payment')
        and o.business_date between coalesce(p_from, v_month) and coalesce(p_to, v_today)
    ),
    'revenue_cents', (
      select coalesce(sum(o.total_cents), 0) from public.orders o
      where o.venue_id = p_venue_id and o.status not in ('cancelled', 'pending_payment')
        and o.business_date between coalesce(p_from, v_month) and coalesce(p_to, v_today)
    ),
    'month_cents', (
      select coalesce(sum(c.amount_cents), 0)
      from public.suggestion_conversions c
      join public.orders o on o.id = c.order_id
      where c.venue_id = p_venue_id and o.status not in ('cancelled', 'pending_payment')
        and o.business_date between v_month and v_today
    )
  );
end;
$$;

-- Agence : ventes générées par l'appli, bar par bar, sur 30 jours
create or replace function public.agency_get_app_sales()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  return coalesce((
    select jsonb_object_agg(c.venue_id, c.amount)
    from (
      select c.venue_id, sum(c.amount_cents) as amount
      from public.suggestion_conversions c
      join public.orders o on o.id = c.order_id
      where o.status not in ('cancelled', 'pending_payment') and o.created_at > now() - interval '30 days'
      group by c.venue_id
    ) c
  ), '{}'::jsonb);
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function public.get_suggestions(text)                          from public, anon, authenticated;
revoke execute on function public.record_suggestions(text, uuid, jsonb)          from public, anon, authenticated;
grant  execute on function public.get_suggestions(text)                          to service_role;
grant  execute on function public.record_suggestions(text, uuid, jsonb)          to service_role;
revoke execute on function public.get_reorder_items(uuid, text)                  from public, anon, authenticated;
grant  execute on function public.get_reorder_items(uuid, text)                  to service_role;

revoke execute on function public.admin_get_suggestions(uuid)                    from public, anon;
revoke execute on function public.admin_set_suggestions_enabled(uuid, boolean)   from public, anon;
revoke execute on function public.admin_set_product_pairings(uuid, jsonb)        from public, anon;
revoke execute on function public.admin_get_app_sales(uuid, date, date)          from public, anon;
revoke execute on function public.agency_get_app_sales()                         from public, anon;
grant  execute on function public.admin_get_suggestions(uuid)                    to authenticated, service_role;
grant  execute on function public.admin_set_suggestions_enabled(uuid, boolean)   to authenticated, service_role;
grant  execute on function public.admin_set_product_pairings(uuid, jsonb)        to authenticated, service_role;
grant  execute on function public.admin_get_app_sales(uuid, date, date)          to authenticated, service_role;
grant  execute on function public.agency_get_app_sales()                         to authenticated, service_role;

commit;
