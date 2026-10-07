-- =====================================================================
--  COMMANDE À TABLE — 7 : STOCKS ET COMMANDES PRISES PAR LES SERVEURS
--
--  À exécuter une fois, APRÈS les scripts 1 à 6 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
--
--  - Articles en stock (fût de bière, bouteilles, citrons, portions…) ;
--  - chaque produit de la carte peut consommer un ou plusieurs articles
--    (ex. Mojito = 5 cl de rhum + 1 citron vert) ;
--  - le stock baisse automatiquement à chaque commande, remonte si elle est
--    annulée ; un produit sans stock suffisant passe « Épuisé » tout seul ;
--  - livraisons, pertes et inventaires saisis par l'équipe, historique ;
--  - les serveurs peuvent prendre une commande pour un client.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.stock_items (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references public.venues(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  unit            text not null default 'unité'
                  check (unit in ('unité', 'bouteille', 'canette', 'portion', 'L', 'cl', 'kg', 'g')),
  quantity        numeric(12, 3) not null default 0,
  alert_threshold numeric(12, 3) check (alert_threshold is null or alert_threshold >= 0),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, venue_id)
);
create unique index if not exists stock_items_name_idx on public.stock_items (venue_id, lower(name));
drop trigger if exists stock_items_updated_at on public.stock_items;
create trigger stock_items_updated_at before update on public.stock_items
  for each row execute function private.set_updated_at();

-- « Recette » : ce que consomme une unité vendue d'un produit
create table if not exists public.product_stock (
  product_id    uuid not null,
  stock_item_id uuid not null,
  venue_id      uuid not null,
  quantity      numeric(10, 3) not null check (quantity > 0 and quantity <= 10000),
  primary key (product_id, stock_item_id),
  foreign key (product_id, venue_id) references public.products(id, venue_id) on delete cascade,
  foreign key (stock_item_id, venue_id) references public.stock_items(id, venue_id) on delete cascade
);
create index if not exists product_stock_item_idx on public.product_stock (stock_item_id);

do $$
begin
  create type public.stock_movement_kind as enum ('sale', 'sale_cancel', 'delivery', 'loss', 'count', 'adjust');
exception when duplicate_object then null;
end;
$$;

-- Historique de chaque mouvement de stock
create table if not exists public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  stock_item_id  uuid not null,
  kind           public.stock_movement_kind not null,
  delta          numeric(12, 3) not null,
  quantity_after numeric(12, 3) not null,
  order_id       uuid references public.orders(id) on delete set null,
  note           text check (note is null or char_length(note) <= 200),
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (stock_item_id, venue_id) references public.stock_items(id, venue_id) on delete cascade
);
create index if not exists stock_movements_item_idx on public.stock_movements (stock_item_id, created_at desc);
create index if not exists stock_movements_order_idx on public.stock_movements (order_id) where order_id is not null;

-- Commandes prises par un serveur (et par qui)
alter table public.orders add column if not exists source text not null default 'client';
alter table public.orders add column if not exists created_by uuid references auth.users(id) on delete set null;
do $$
begin
  alter table public.orders add constraint orders_source_check check (source in ('client', 'staff'));
exception when duplicate_object then null;
end;
$$;

-- Sécurité : lecture pour le personnel du bar ; toute modification passe
-- par les fonctions ci-dessous (qui vérifient le rôle).
alter table public.stock_items enable row level security;
alter table public.product_stock enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.stock_items, public.product_stock, public.stock_movements from anon, authenticated;
grant select on public.stock_items, public.product_stock, public.stock_movements to authenticated;
grant all on public.stock_items, public.product_stock, public.stock_movements to service_role;

drop policy if exists "Personnel : voit le stock" on public.stock_items;
create policy "Personnel : voit le stock" on public.stock_items
  for select to authenticated using (private.is_member(venue_id));
drop policy if exists "Personnel : voit les recettes" on public.product_stock;
create policy "Personnel : voit les recettes" on public.product_stock
  for select to authenticated using (private.is_member(venue_id));
drop policy if exists "Personnel : voit les mouvements de stock" on public.stock_movements;
create policy "Personnel : voit les mouvements de stock" on public.stock_movements
  for select to authenticated using (private.is_member(venue_id));


-- ---------------------------------------------------------------------
-- Stock : calculs et mouvements automatiques
-- ---------------------------------------------------------------------

-- Nombre d'unités encore vendables d'un produit (null = stock non suivi)
create or replace function private.product_remaining(p_product_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select min(greatest(0, floor(si.quantity / ps.quantity)))::int
  from public.product_stock ps
  join public.stock_items si on si.id = ps.stock_item_id
  where ps.product_id = p_product_id;
$$;

-- Décompte du stock d'une commande (ses articles viennent d'être enregistrés).
-- Refuse la commande s'il n'y a pas assez de stock.
create or replace function private.consume_stock(p_order_id uuid, p_user uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  r       record;
  v_after numeric;
begin
  for r in
    select ps.stock_item_id, sum(i.quantity * ps.quantity) as needed, string_agg(distinct i.product_name, ', ') as products
    from public.order_items i
    join public.product_stock ps on ps.product_id = i.product_id
    where i.order_id = p_order_id
    group by ps.stock_item_id
    order by ps.stock_item_id      -- toujours le même ordre : pas de blocage entre deux commandes
  loop
    update public.stock_items
       set quantity = quantity - r.needed
     where id = r.stock_item_id and quantity >= r.needed
    returning quantity into v_after;
    if not found then
      raise exception 'STOCK_INSUFFISANT' using detail = r.products;
    end if;
    insert into public.stock_movements (venue_id, stock_item_id, kind, delta, quantity_after, order_id, created_by)
    select si.venue_id, si.id, 'sale', -r.needed, v_after, p_order_id, p_user
    from public.stock_items si where si.id = r.stock_item_id;
  end loop;
end;
$$;

-- Commande annulée (par le bar, paiement en ligne abandonné…) : le stock remonte.
create or replace function private.restock_cancelled_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_after numeric;
begin
  for r in
    select stock_item_id, -sum(delta) as back
    from public.stock_movements
    where order_id = new.id
    group by stock_item_id
    having sum(delta) <> 0
    order by stock_item_id
  loop
    update public.stock_items set quantity = quantity + r.back where id = r.stock_item_id
    returning quantity into v_after;
    if found then
      insert into public.stock_movements (venue_id, stock_item_id, kind, delta, quantity_after, order_id, created_by)
      values (new.venue_id, r.stock_item_id, 'sale_cancel', r.back, v_after, new.id, (select auth.uid()));
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists orders_restock_on_cancel on public.orders;
create trigger orders_restock_on_cancel
  after update of status on public.orders
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function private.restock_cancelled_order();


-- ---------------------------------------------------------------------
-- Enregistrement d'une commande (commun au client et au serveur)
-- ---------------------------------------------------------------------
create or replace function private.place_order(
  p_venue       public.venues,
  p_table_id    uuid,
  p_table_label text,
  p_items       jsonb,
  p_comment     text,
  p_method      public.payment_method,
  p_paid        boolean,
  p_tip_cents   int,
  p_source      text,
  p_user        uuid
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_comment     text := nullif(btrim(coalesce(p_comment, '')), '');
  v_tip         int  := case when p_method = 'online' then coalesce(p_tip_cents, 0) else 0 end;
  v_status      public.order_status := case when p_method = 'online' then 'pending_payment' else 'received' end;
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
  -- Commentaire
  if v_comment is not null and char_length(v_comment) > 300 then
    raise exception 'COMMENTAIRE_TROP_LONG';
  end if;

  -- Panier : format
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

  -- Panier : produits et prix (lus dans la base, jamais ceux du téléphone)
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
  left join public.products p on p.id = l.product_id and p.venue_id = p_venue.id;

  if v_unknown > 0 then
    raise exception 'PRODUIT_INCONNU';
  end if;
  if v_unavailable > 0 then
    raise exception 'PRODUIT_INDISPONIBLE';
  end if;
  if v_total_qty > 50 or v_max_qty > 20 then
    raise exception 'PANIER_TROP_GROS';
  end if;

  -- Pourboire : uniquement en ligne, au plus le montant de la commande (et 100 €)
  if v_tip < 0 or v_tip > least(v_total, 10000) then
    raise exception 'POURBOIRE_INVALIDE';
  end if;
  if p_method = 'online' and v_total + v_tip < 50 then
    raise exception 'MONTANT_TROP_FAIBLE';  -- Stripe refuse les paiements de moins de 0,50 €
  end if;

  -- Numéro de commande du jour
  v_date := private.business_date(p_venue);
  insert into private.order_counters as oc (venue_id, business_date, last_number)
  values (p_venue.id, v_date, 1)
  on conflict (venue_id, business_date) do update set last_number = oc.last_number + 1
  returning last_number into v_number;

  insert into public.orders (
    venue_id, table_id, table_label, order_number, business_date, status,
    payment_method, payment_status, paid_at, total_cents, tip_cents, comment, received_at, source, created_by
  ) values (
    p_venue.id, p_table_id, p_table_label, v_number, v_date, v_status,
    p_method, case when p_paid then 'paid' else 'unpaid' end::public.payment_status,
    case when p_paid then now() end,
    v_total, v_tip, v_comment, case when v_status = 'received' then now() end, p_source, p_user
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, venue_id, product_id, product_name, unit_price_cents, quantity, position)
  select v_order_id, p_venue.id, p.id, p.name, p.price_cents, l.quantity, l.position
  from (
    select (e.value->>'product_id')::uuid as product_id,
           sum((e.value->>'quantity')::int)::int as quantity,
           min(e.ordinality)::smallint as position
    from jsonb_array_elements(p_items) with ordinality e
    group by 1
  ) l
  join public.products p on p.id = l.product_id and p.venue_id = p_venue.id;

  -- Stock : décompte automatique (refuse la commande si un article manque)
  perform private.consume_stock(v_order_id, p_user);

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_number,
    'total_cents', v_total,
    'tip_cents', v_tip,
    'status', v_status,
    'payment_method', p_method
  );
end;
$$;

-- Commande d'un client (appelée uniquement par le serveur de l'application)
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
  v_table public.venue_tables;
  v_venue public.venues;
begin
  -- La table (verrouillée pour que l'anti-abus soit fiable même en rafale)
  select * into v_table from public.venue_tables where token = p_token for update;
  if not found or not v_table.is_active then
    raise exception 'CARTE_INVALIDE';
  end if;
  select * into v_venue from public.venues where id = v_table.venue_id;

  if v_venue.orders_paused then
    raise exception 'COMMANDES_EN_PAUSE';
  end if;
  if (p_payment_method = 'staff' and not v_venue.pay_to_staff_enabled)
     or (p_payment_method = 'online' and not v_venue.online_payment_enabled) then
    raise exception 'PAIEMENT_INDISPONIBLE';
  end if;
  if (select count(*) from public.orders
      where table_id = v_table.id and created_at > now() - order_window) >= max_orders_per_window then
    raise exception 'TROP_DE_COMMANDES';
  end if;

  return private.place_order(v_venue, v_table.id, v_table.label, p_items, p_comment, p_payment_method,
                             false, p_tip_cents, 'client', null);
end;
$$;

-- Commande prise par un serveur pour un client (table, ou « Comptoir »).
-- Possible même quand les commandes des clients sont en pause.
create or replace function public.staff_create_order(
  p_venue_id uuid,
  p_table_id uuid,
  p_items    jsonb,
  p_comment  text,
  p_paid     boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
  v_label text := 'Comptoir';
begin
  if not private.is_member(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into v_venue from public.venues where id = p_venue_id;
  if p_table_id is not null then
    select label into v_label from public.venue_tables
     where id = p_table_id and venue_id = p_venue_id and is_active;
    if not found then
      raise exception 'TABLE_INTROUVABLE';
    end if;
  end if;
  return private.place_order(v_venue, p_table_id, v_label, p_items, p_comment, 'staff',
                             coalesce(p_paid, false), 0, 'staff', (select auth.uid()));
end;
$$;


-- ---------------------------------------------------------------------
-- Cartes : disponibilité selon le stock
-- ---------------------------------------------------------------------

-- Carte du client : un produit sans stock suffisant est « épuisé » ;
-- « remaining » n'est donné que s'il en reste 5 ou moins (« Plus que 3 »).
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
                'is_available', p.is_available and coalesce(s.remaining, 1) > 0,
                'remaining', case when p.is_available and s.remaining between 1 and 5 then s.remaining end
              ) order by p.sort_order, p.name
            )
            from public.products p
            cross join lateral (select private.product_remaining(p.id) as remaining) s
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

-- Carte et tables pour la prise de commande par un serveur
create or replace function public.get_staff_menu(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  return jsonb_build_object(
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.sort_order, t.label)
      from public.venue_tables t where t.venue_id = p_venue_id and t.is_active
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'products', (
          select jsonb_agg(jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'price_cents', p.price_cents,
            'is_available', p.is_available,
            'remaining', private.product_remaining(p.id)
          ) order by p.sort_order, p.name)
          from public.products p where p.category_id = c.id
        )
      ) order by c.sort_order, c.name)
      from public.categories c
      where c.venue_id = p_venue_id
        and exists (select 1 from public.products p where p.category_id = c.id)
    ), '[]'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Écran du bar : commandes prises par un serveur, alertes de stock
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
    ), '[]'::jsonb),
    -- Articles sous le seuil d'alerte (ou épuisés)
    'stock_alerts', (
      select count(*) from public.stock_items s
      where s.venue_id = p_venue_id
        and (s.quantity <= 0 or (s.alert_threshold is not null and s.quantity <= s.alert_threshold))
    )
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Page « Stocks » : personnel (lecture, livraisons, pertes, inventaires)
-- ---------------------------------------------------------------------
create or replace function public.get_stock(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  return jsonb_build_object(
    'is_owner', private.is_owner(p_venue_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'unit', s.unit,
        'quantity', s.quantity,
        'alert_threshold', s.alert_threshold,
        'status', case when s.quantity <= 0 then 'out'
                       when s.alert_threshold is not null and s.quantity <= s.alert_threshold then 'low'
                       else 'ok' end,
        'used_by', coalesce((
          select jsonb_agg(jsonb_build_object('name', p.name, 'quantity', ps.quantity) order by p.name)
          from public.product_stock ps join public.products p on p.id = ps.product_id
          where ps.stock_item_id = s.id
        ), '[]'::jsonb),
        -- Ventes nettes des 7 derniers jours (pour estimer quand commander)
        'sold_7d', coalesce((
          select -sum(m.delta) from public.stock_movements m
          where m.stock_item_id = s.id and m.kind in ('sale', 'sale_cancel')
            and m.created_at > now() - interval '7 days'
        ), 0),
        'last_delivery_at', (
          select max(m.created_at) from public.stock_movements m
          where m.stock_item_id = s.id and m.kind = 'delivery'
        ),
        'updated_at', s.updated_at
      ) order by s.sort_order, lower(s.name))
      from public.stock_items s where s.venue_id = p_venue_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Livraison reçue (+), perte / casse (−), inventaire (quantité comptée)
create or replace function public.stock_record(p_item_id uuid, p_kind text, p_quantity numeric, p_note text default null)
returns numeric
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item  public.stock_items;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_delta numeric;
begin
  select * into v_item from public.stock_items where id = p_item_id for update;
  if not found or not private.is_member(v_item.venue_id) then
    raise exception 'INTROUVABLE';
  end if;
  if p_kind not in ('delivery', 'loss', 'count') then
    raise exception 'MOUVEMENT_INVALIDE';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000
     or (p_kind in ('delivery', 'loss') and p_quantity = 0) then
    raise exception 'QUANTITE_INVALIDE';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'NOTE_TROP_LONGUE';
  end if;

  v_delta := case p_kind when 'delivery' then p_quantity
                         when 'loss' then -p_quantity
                         else p_quantity - v_item.quantity end;
  if v_delta = 0 and p_kind = 'count' then
    -- Inventaire identique : on note juste la vérification
    insert into public.stock_movements (venue_id, stock_item_id, kind, delta, quantity_after, note, created_by)
    values (v_item.venue_id, v_item.id, 'count', 0, v_item.quantity, v_note, (select auth.uid()));
    return v_item.quantity;
  end if;

  update public.stock_items set quantity = quantity + v_delta where id = v_item.id
  returning quantity into v_item.quantity;
  insert into public.stock_movements (venue_id, stock_item_id, kind, delta, quantity_after, note, created_by)
  values (v_item.venue_id, v_item.id, p_kind::public.stock_movement_kind, v_delta, v_item.quantity, v_note, (select auth.uid()));
  return v_item.quantity;
end;
$$;

-- Historique d'un article (50 derniers mouvements)
create or replace function public.get_stock_history(p_item_id uuid, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.stock_items where id = p_item_id;
  if v_venue is null or not private.is_member(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'kind', m.kind,
      'delta', m.delta,
      'quantity_after', m.quantity_after,
      'note', m.note,
      'created_at', m.created_at,
      'author', split_part(u.email, '@', 1),
      'order_number', o.order_number,
      'table_label', o.table_label
    ) order by m.created_at desc)
    from (
      select * from public.stock_movements
      where stock_item_id = p_item_id
      order by created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) m
    left join auth.users u on u.id = m.created_by
    left join public.orders o on o.id = m.order_id
  ), '[]'::jsonb);
end;
$$;


-- ---------------------------------------------------------------------
-- Gérant : articles de stock et recettes des produits
-- ---------------------------------------------------------------------

-- Créer ou modifier un article { id?, name, unit, alert_threshold, quantity (création seulement) }
create or replace function public.admin_save_stock_item(p_venue_id uuid, p_item jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id        uuid := private.try_uuid(p_item->>'id');
  v_name      text := btrim(coalesce(p_item->>'name', ''));
  v_unit      text := coalesce(p_item->>'unit', 'unité');
  v_threshold numeric;
  v_quantity  numeric;
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'NOM_INVALIDE';
  end if;
  if v_unit not in ('unité', 'bouteille', 'canette', 'portion', 'L', 'cl', 'kg', 'g') then
    raise exception 'UNITE_INVALIDE';
  end if;
  begin
    v_threshold := nullif(p_item->>'alert_threshold', '')::numeric;
    v_quantity := coalesce(nullif(p_item->>'quantity', '')::numeric, 0);
  exception when others then
    raise exception 'QUANTITE_INVALIDE';
  end;
  if (v_threshold is not null and (v_threshold < 0 or v_threshold > 1000000))
     or v_quantity < 0 or v_quantity > 1000000 then
    raise exception 'QUANTITE_INVALIDE';
  end if;
  if exists (select 1 from public.stock_items
             where venue_id = p_venue_id and lower(name) = lower(v_name) and id is distinct from v_id) then
    raise exception 'NOM_DEJA_UTILISE';
  end if;

  if v_id is null then
    insert into public.stock_items (venue_id, name, unit, quantity, alert_threshold, sort_order)
    values (p_venue_id, v_name, v_unit, v_quantity, v_threshold,
            coalesce((select max(sort_order) + 1 from public.stock_items where venue_id = p_venue_id), 1))
    returning id into v_id;
    if v_quantity > 0 then
      insert into public.stock_movements (venue_id, stock_item_id, kind, delta, quantity_after, note, created_by)
      values (p_venue_id, v_id, 'adjust', v_quantity, v_quantity, 'Stock de départ', (select auth.uid()));
    end if;
  else
    update public.stock_items set name = v_name, unit = v_unit, alert_threshold = v_threshold
     where id = v_id and venue_id = p_venue_id;
    if not found then
      raise exception 'INTROUVABLE';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_stock_item(p_item_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.stock_items where id = p_item_id;
  if v_venue is null or not private.is_owner(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  delete from public.stock_items where id = p_item_id;  -- recettes et historique supprimés avec
end;
$$;

-- Fiche produit : la recette (« recipe ») est enregistrée en même temps que le
-- produit, si elle est fournie : [{ stock_item_id, quantity }, …]
create or replace function public.admin_save_product(p_venue_id uuid, p_product jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id          uuid := private.try_uuid(p_product->>'id');
  v_category    uuid := private.try_uuid(p_product->>'category_id');
  v_name        text := btrim(coalesce(p_product->>'name', ''));
  v_description text := nullif(btrim(coalesce(p_product->>'description', '')), '');
  v_price       text := coalesce(p_product->>'price_cents', '');
  v_image       text := nullif(btrim(coalesce(p_product->>'image_url', '')), '');
  v_available   boolean := coalesce((p_product->>'is_available')::boolean, true);
  v_recipe      jsonb := p_product->'recipe';
  v_old_category uuid;
  v_line        jsonb;
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  if not exists (select 1 from public.categories where id = v_category and venue_id = p_venue_id) then
    raise exception 'CATEGORIE_INVALIDE';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'NOM_INVALIDE';
  end if;
  if v_description is not null and char_length(v_description) > 300 then
    raise exception 'DESCRIPTION_TROP_LONGUE';
  end if;
  if v_price !~ '^[0-9]{1,6}$' or v_price::int > 100000 then
    raise exception 'PRIX_INVALIDE';
  end if;
  if v_image is not null and (v_image !~ '^https?://' or char_length(v_image) > 500) then
    raise exception 'IMAGE_INVALIDE';
  end if;
  if v_recipe is not null and jsonb_typeof(v_recipe) <> 'null' then
    if jsonb_typeof(v_recipe) <> 'array' or jsonb_array_length(v_recipe) > 10 then
      raise exception 'RECETTE_INVALIDE';
    end if;
    for v_line in select value from jsonb_array_elements(v_recipe) loop
      if jsonb_typeof(v_line) <> 'object'
         or not exists (select 1 from public.stock_items
                        where id = private.try_uuid(v_line->>'stock_item_id') and venue_id = p_venue_id)
         or coalesce(v_line->>'quantity', '') !~ '^[0-9]{1,5}(\.[0-9]{1,3})?$'
         or (v_line->>'quantity')::numeric <= 0 or (v_line->>'quantity')::numeric > 10000 then
        raise exception 'RECETTE_INVALIDE';
      end if;
    end loop;
  end if;

  if v_id is null then
    insert into public.products (venue_id, category_id, name, description, price_cents, image_url, is_available, sort_order)
    values (
      p_venue_id, v_category, v_name, v_description, v_price::int, v_image, v_available,
      coalesce((select max(sort_order) + 1 from public.products where category_id = v_category), 1)
    )
    returning id into v_id;
  else
    select category_id into v_old_category from public.products where id = v_id and venue_id = p_venue_id;
    if not found then
      raise exception 'INTROUVABLE';
    end if;
    update public.products
       set category_id  = v_category,
           name         = v_name,
           description  = v_description,
           price_cents  = v_price::int,
           image_url    = v_image,
           is_available = v_available,
           sort_order   = case when v_old_category = v_category then sort_order
                               else coalesce((select max(sort_order) + 1 from public.products where category_id = v_category), 1) end
     where id = v_id;
  end if;

  if v_recipe is not null and jsonb_typeof(v_recipe) = 'array' then
    delete from public.product_stock where product_id = v_id;
    insert into public.product_stock (product_id, stock_item_id, venue_id, quantity)
    select v_id, (l->>'stock_item_id')::uuid, p_venue_id, max((l->>'quantity')::numeric)
    from jsonb_array_elements(v_recipe) l
    group by (l->>'stock_item_id')::uuid;
  end if;
  return v_id;
end;
$$;

-- Données de l'espace gérant (+ recettes, stock restant, articles de stock)
create or replace function public.admin_get_data(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  select * into v_venue from public.venues where id = p_venue_id;

  return jsonb_build_object(
    'venue', jsonb_build_object(
      'id', v_venue.id,
      'name', v_venue.name,
      'logo_url', v_venue.logo_url,
      'timezone', v_venue.timezone,
      'pay_to_staff_enabled', v_venue.pay_to_staff_enabled,
      'online_payment_enabled', v_venue.online_payment_enabled
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'products', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id,
            'category_id', p.category_id,
            'name', p.name,
            'description', p.description,
            'price_cents', p.price_cents,
            'image_url', p.image_url,
            'is_available', p.is_available,
            'remaining', private.product_remaining(p.id),
            'recipe', coalesce((
              select jsonb_agg(jsonb_build_object('stock_item_id', ps.stock_item_id, 'quantity', ps.quantity))
              from public.product_stock ps where ps.product_id = p.id
            ), '[]'::jsonb)
          ) order by p.sort_order, p.name)
          from public.products p where p.category_id = c.id
        ), '[]'::jsonb)
      ) order by c.sort_order, c.name)
      from public.categories c where c.venue_id = p_venue_id
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'label', t.label,
        'token', t.token,
        'is_active', t.is_active
      ) order by t.sort_order, t.label)
      from public.venue_tables t where t.venue_id = p_venue_id
    ), '[]'::jsonb),
    'stock_items', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'unit', s.unit, 'quantity', s.quantity)
                       order by s.sort_order, lower(s.name))
      from public.stock_items s where s.venue_id = p_venue_id
    ), '[]'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Stock de démonstration (« Le Comptoir de Démo », s'il n'en a pas encore)
-- ---------------------------------------------------------------------
do $$
declare
  v_venue uuid;
begin
  select id into v_venue from public.venues where slug = 'comptoir-demo';
  if v_venue is null or exists (select 1 from public.stock_items where venue_id = v_venue) then
    return;
  end if;

  insert into public.stock_items (venue_id, name, unit, quantity, alert_threshold, sort_order)
  values
    (v_venue, 'Bière blonde (fût)',      'L',         27.5, 10, 1),
    (v_venue, 'Bière blanche (fût)',     'L',         14,    6, 2),
    (v_venue, 'IPA artisanale 33 cl',    'bouteille', 18,    6, 3),
    (v_venue, 'Rhum blanc',              'cl',       210,   70, 4),
    (v_venue, 'Gin',                     'cl',       120,   70, 5),
    (v_venue, 'Apérol',                  'cl',       280,  100, 6),
    (v_venue, 'Prosecco',                'cl',       450,  150, 7),
    (v_venue, 'Tonic premium 20 cl',     'bouteille', 16,    6, 8),
    (v_venue, 'Citron vert',             'unité',     22,   10, 9),
    (v_venue, 'Menthe fraîche',          'portion',    9,   10, 10),
    (v_venue, 'Cola 33 cl',              'canette',   30,   12, 11),
    (v_venue, 'Limonade artisanale',     'bouteille', 12,    6, 12),
    (v_venue, 'Jus de pomme bio',        'bouteille',  4,    6, 13),
    (v_venue, 'Charcuterie',             'portion',   10,    4, 14),
    (v_venue, 'Fromages',                'portion',    8,    4, 15),
    (v_venue, 'Olives marinées',         'portion',    0,    5, 16);

  insert into public.product_stock (product_id, stock_item_id, venue_id, quantity)
  select p.id, s.id, v_venue, r.qty
  from (values
    ('Demi blonde (25 cl)',    'Bière blonde (fût)',  0.25),
    ('Pinte blonde (50 cl)',   'Bière blonde (fût)',  0.5),
    ('Blanche (25 cl)',        'Bière blanche (fût)', 0.25),
    ('IPA artisanale (33 cl)', 'IPA artisanale 33 cl', 1),
    ('Mojito',                 'Rhum blanc',           5),
    ('Mojito',                 'Citron vert',          1),
    ('Mojito',                 'Menthe fraîche',       1),
    ('Virgin mojito',          'Citron vert',          1),
    ('Virgin mojito',          'Menthe fraîche',       1),
    ('Spritz',                 'Apérol',               6),
    ('Spritz',                 'Prosecco',             9),
    ('Gin tonic',              'Gin',                  5),
    ('Gin tonic',              'Tonic premium 20 cl',  1),
    ('Cola (33 cl)',           'Cola 33 cl',           1),
    ('Limonade artisanale',    'Limonade artisanale',  1),
    ('Jus de pomme bio',       'Jus de pomme bio',     1),
    ('Planche de charcuterie', 'Charcuterie',          1),
    ('Planche de fromages',    'Fromages',             1),
    ('Planche mixte',          'Charcuterie',          0.5),
    ('Planche mixte',          'Fromages',             0.5),
    ('Olives marinées',        'Olives marinées',      1)
  ) as r(product, item, qty)
  join public.products p on p.venue_id = v_venue and p.name = r.product
  join public.stock_items s on s.venue_id = v_venue and s.name = r.item
  on conflict do nothing;

  insert into public.stock_movements (venue_id, stock_item_id, kind, delta, quantity_after, note)
  select v_venue, s.id, 'adjust', s.quantity, s.quantity, 'Stock de départ'
  from public.stock_items s where s.venue_id = v_venue and s.quantity > 0;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function private.product_remaining(uuid)                from public, anon;
grant  execute on function private.product_remaining(uuid)                to authenticated, service_role;
revoke execute on function private.consume_stock(uuid, uuid)              from public, anon, authenticated;
revoke execute on function private.restock_cancelled_order()             from public, anon, authenticated;
revoke execute on function private.place_order(public.venues, uuid, text, jsonb, text, public.payment_method, boolean, int, text, uuid)
  from public, anon, authenticated;

revoke execute on function public.create_order(text, jsonb, text, public.payment_method, int) from public, anon, authenticated;
grant  execute on function public.create_order(text, jsonb, text, public.payment_method, int) to service_role;
revoke execute on function public.get_menu(text) from public, anon, authenticated;
grant  execute on function public.get_menu(text) to service_role;

revoke execute on function public.staff_create_order(uuid, uuid, jsonb, text, boolean) from public, anon;
revoke execute on function public.get_staff_menu(uuid)                              from public, anon;
revoke execute on function public.get_stock(uuid)                                   from public, anon;
revoke execute on function public.stock_record(uuid, text, numeric, text)           from public, anon;
revoke execute on function public.get_stock_history(uuid, int)                      from public, anon;
revoke execute on function public.admin_save_stock_item(uuid, jsonb)                from public, anon;
revoke execute on function public.admin_delete_stock_item(uuid)                     from public, anon;
grant  execute on function public.staff_create_order(uuid, uuid, jsonb, text, boolean) to authenticated, service_role;
grant  execute on function public.get_staff_menu(uuid)                              to authenticated, service_role;
grant  execute on function public.get_stock(uuid)                                   to authenticated, service_role;
grant  execute on function public.stock_record(uuid, text, numeric, text)           to authenticated, service_role;
grant  execute on function public.get_stock_history(uuid, int)                      to authenticated, service_role;
grant  execute on function public.admin_save_stock_item(uuid, jsonb)                to authenticated, service_role;
grant  execute on function public.admin_delete_stock_item(uuid)                     to authenticated, service_role;

commit;
