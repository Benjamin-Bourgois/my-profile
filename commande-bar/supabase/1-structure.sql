-- =====================================================================
--  COMMANDE À TABLE — 1/2 : STRUCTURE DE LA BASE DE DONNÉES
--
--  À exécuter UNE SEULE FOIS, dans Supabase :
--  SQL Editor → New query → coller TOUT ce fichier → bouton « Run ».
--  Résultat attendu : « Success. No rows returned ».
--
--  (Si tu le relances par erreur, tu auras une erreur « already exists » :
--   ce n'est pas grave, rien n'a été modifié.)
-- =====================================================================

begin;

-- Schéma « privé » : fonctions et données internes, invisibles depuis
-- l'extérieur (l'API publique de Supabase n'expose que le schéma public).
create schema if not exists private;
grant usage on schema private to authenticated, service_role;


-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.member_role    as enum ('owner', 'staff');                 -- gérant / personnel
create type public.order_status   as enum ('pending_payment', 'received', 'preparing', 'served', 'cancelled');
create type public.payment_method as enum ('online', 'staff');                -- en ligne / au serveur
create type public.payment_status as enum ('unpaid', 'paid');


-- ---------------------------------------------------------------------
-- Lien secret des cartes NFC : 12 caractères tirés au hasard
-- (sans 0/O, 1/l/I pour éviter les confusions), avec un générateur
-- aléatoire cryptographique.
-- ---------------------------------------------------------------------
create function private.generate_table_token()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet   constant text := '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  alen       constant int  := length(alphabet);
  max_byte   constant int  := 256 - (256 % alen);  -- rejet des octets « en trop » : tirage parfaitement uniforme
  result     text := '';
  random_bytes bytea;
  b int;
begin
  while length(result) < 12 loop
    random_bytes := uuid_send(gen_random_uuid());
    for i in 0..15 loop
      continue when i in (6, 8);  -- octets de version/variante de l'UUID : pas entièrement aléatoires
      b := get_byte(random_bytes, i);
      if b < max_byte then
        result := result || substr(alphabet, (b % alen) + 1, 1);
        exit when length(result) = 12;
      end if;
    end loop;
  end loop;
  return result;
end;
$$;

create function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- Établissements (bars)
-- ---------------------------------------------------------------------
create table public.venues (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name                   text not null check (char_length(name) between 1 and 80),
  logo_url               text,
  pay_to_staff_enabled   boolean not null default true,   -- option « Payer au serveur »
  online_payment_enabled boolean not null default true,   -- paiement en ligne (Stripe)
  currency               text not null default 'eur',
  timezone               text not null default 'Europe/Paris',
  day_starts_at          smallint not null default 5 check (day_starts_at between 0 and 12),  -- une « journée » de bar commence à 5 h du matin
  stripe_account_id      text,                            -- pour plus tard (Stripe Connect)
  created_at             timestamptz not null default now()
);

-- Personnel : qui travaille dans quel bar, et avec quel rôle
create table public.venue_members (
  venue_id   uuid not null references public.venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);
create index venue_members_user_idx on public.venue_members (user_id);

-- Tables du bar (une carte NFC = un lien secret = une table)
create table public.venue_tables (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 40),
  token      text not null unique default private.generate_table_token() check (token ~ '^[A-Za-z0-9]{12,32}$'),
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, venue_id)
);
create index venue_tables_venue_idx on public.venue_tables (venue_id, sort_order);
create trigger venue_tables_updated_at before update on public.venue_tables
  for each row execute function private.set_updated_at();

-- Catégories de la carte (Bières, Cocktails…)
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, venue_id)
);
create index categories_venue_idx on public.categories (venue_id, sort_order);

-- Produits (prix en centimes : 650 = 6,50 €)
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  category_id  uuid not null,
  name         text not null check (char_length(name) between 1 and 80),
  description  text check (description is null or char_length(description) <= 300),
  price_cents  int not null check (price_cents between 0 and 100000),
  image_url    text,
  is_available boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, venue_id),
  -- un produit est forcément rangé dans une catégorie du MÊME bar
  foreign key (category_id, venue_id) references public.categories(id, venue_id)
);
create index products_venue_idx on public.products (venue_id, category_id, sort_order);
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

-- Commandes
create table public.orders (
  id                         uuid primary key default gen_random_uuid(),
  venue_id                   uuid not null references public.venues(id) on delete cascade,
  table_id                   uuid,
  table_label                text not null,             -- nom de la table AU MOMENT de la commande
  order_number               int not null,              -- numéro du jour : 1, 2, 3…
  business_date              date not null,             -- « journée » du bar (de 5 h à 5 h)
  status                     public.order_status not null,
  payment_method             public.payment_method not null,
  payment_status             public.payment_status not null default 'unpaid',
  total_cents                int not null check (total_cents >= 0),
  comment                    text check (comment is null or char_length(comment) <= 300),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  created_at                 timestamptz not null default now(),
  received_at                timestamptz,               -- arrivée à l'écran du bar
  preparing_at               timestamptz,
  served_at                  timestamptz,
  paid_at                    timestamptz,
  cancelled_at               timestamptz,
  updated_at                 timestamptz not null default now(),
  unique (id, venue_id),
  unique (venue_id, business_date, order_number),
  foreign key (table_id, venue_id) references public.venue_tables(id, venue_id) on delete set null (table_id)
);
create index orders_venue_status_idx on public.orders (venue_id, status);
create index orders_venue_date_idx   on public.orders (venue_id, business_date);
create index orders_table_created_idx on public.orders (table_id, created_at);
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

-- Lignes de commande (nom et prix recopiés au moment de la commande)
create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null,
  venue_id         uuid not null,
  product_id       uuid references public.products(id) on delete set null,
  product_name     text not null,
  unit_price_cents int not null check (unit_price_cents >= 0),
  quantity         int not null check (quantity between 1 and 50),
  line_total_cents int generated always as (unit_price_cents * quantity) stored,
  position         smallint not null default 0,
  created_at       timestamptz not null default now(),
  foreign key (order_id, venue_id) references public.orders(id, venue_id) on delete cascade
);
create index order_items_order_idx on public.order_items (order_id, position);

-- Compteur interne des numéros de commande (un compteur par bar et par jour)
create table private.order_counters (
  venue_id      uuid not null references public.venues(id) on delete cascade,
  business_date date not null,
  last_number   int not null default 0,
  primary key (venue_id, business_date)
);


-- ---------------------------------------------------------------------
-- Fonctions utilisées par les règles de sécurité
-- ---------------------------------------------------------------------
create function private.is_member(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venue_members m
    where m.venue_id = p_venue_id and m.user_id = (select auth.uid())
  );
$$;

create function private.is_owner(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venue_members m
    where m.venue_id = p_venue_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create function private.business_date(p_venue public.venues, p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_at at time zone p_venue.timezone) - make_interval(hours => p_venue.day_starts_at))::date;
$$;


-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY : chaque bar ne voit QUE ses propres données.
-- Les clients (téléphones) n'ont AUCUN accès direct : ils passent par
-- le serveur de l'application, qui vérifie tout.
-- ---------------------------------------------------------------------
alter table public.venues        enable row level security;
alter table public.venue_members enable row level security;
alter table public.venue_tables  enable row level security;
alter table public.categories    enable row level security;
alter table public.products      enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table private.order_counters enable row level security;

-- Droits de base : rien pour les visiteurs anonymes, lecture pour le personnel connecté
revoke all on public.venues, public.venue_members, public.venue_tables, public.categories,
              public.products, public.orders, public.order_items
  from anon, authenticated;
revoke all on private.order_counters from anon, authenticated;

grant select on public.venues, public.venue_members, public.venue_tables, public.categories,
                public.products, public.orders, public.order_items
  to authenticated;
grant all on public.venues, public.venue_members, public.venue_tables, public.categories,
             public.products, public.orders, public.order_items
  to service_role;

-- Le gérant peut modifier ces réglages de son bar (et rien d'autre)
grant update (name, logo_url, pay_to_staff_enabled, online_payment_enabled) on public.venues to authenticated;
-- Le gérant gère ses tables (le lien secret, lui, ne se change que via « régénérer »)
grant insert (venue_id, label, is_active, sort_order), update (label, is_active, sort_order), delete
  on public.venue_tables to authenticated;
-- Le gérant gère sa carte
grant insert, update, delete on public.categories, public.products to authenticated;

-- Bars
create policy "Personnel : voit son bar" on public.venues
  for select to authenticated using (private.is_member(id));
create policy "Gérant : modifie son bar" on public.venues
  for update to authenticated using (private.is_owner(id)) with check (private.is_owner(id));

-- Personnel
create policy "Personnel : voit sa propre fiche, le gérant voit son équipe" on public.venue_members
  for select to authenticated using (user_id = (select auth.uid()) or private.is_owner(venue_id));

-- Tables
create policy "Personnel : voit les tables" on public.venue_tables
  for select to authenticated using (private.is_member(venue_id));
create policy "Gérant : crée des tables" on public.venue_tables
  for insert to authenticated with check (private.is_owner(venue_id));
create policy "Gérant : modifie les tables" on public.venue_tables
  for update to authenticated using (private.is_owner(venue_id)) with check (private.is_owner(venue_id));
create policy "Gérant : supprime des tables" on public.venue_tables
  for delete to authenticated using (private.is_owner(venue_id));

-- Catégories
create policy "Personnel : voit les catégories" on public.categories
  for select to authenticated using (private.is_member(venue_id));
create policy "Gérant : crée des catégories" on public.categories
  for insert to authenticated with check (private.is_owner(venue_id));
create policy "Gérant : modifie les catégories" on public.categories
  for update to authenticated using (private.is_owner(venue_id)) with check (private.is_owner(venue_id));
create policy "Gérant : supprime des catégories" on public.categories
  for delete to authenticated using (private.is_owner(venue_id));

-- Produits
create policy "Personnel : voit les produits" on public.products
  for select to authenticated using (private.is_member(venue_id));
create policy "Gérant : crée des produits" on public.products
  for insert to authenticated with check (private.is_owner(venue_id));
create policy "Gérant : modifie les produits" on public.products
  for update to authenticated using (private.is_owner(venue_id)) with check (private.is_owner(venue_id));
create policy "Gérant : supprime des produits" on public.products
  for delete to authenticated using (private.is_owner(venue_id));

-- Commandes : lecture seule pour le personnel ; les changements de statut
-- passent par des fonctions contrôlées (plus bas).
create policy "Personnel : voit les commandes de son bar" on public.orders
  for select to authenticated using (private.is_member(venue_id));
create policy "Personnel : voit le détail des commandes" on public.order_items
  for select to authenticated using (private.is_member(venue_id));


-- ---------------------------------------------------------------------
-- CÔTÉ CLIENT (appelé uniquement par le serveur de l'application)
-- ---------------------------------------------------------------------

-- Carte du bar à partir du lien secret d'une table.
-- Renvoie NULL si le lien est inconnu ou désactivé.
create function public.get_menu(p_token text)
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
      'online_payment_enabled', v_venue.online_payment_enabled
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

-- Création d'une commande. TOUT est revérifié ici :
--  - lien de table valide et actif ;
--  - produits existants, du même bar et disponibles ;
--  - prix recalculés depuis la base (le prix envoyé par le téléphone est ignoré) ;
--  - anti-abus : au plus 5 commandes par table toutes les 2 minutes.
-- p_items = [{"product_id": "...", "quantity": 2}, ...]
create function public.create_order(
  p_token          text,
  p_items          jsonb,
  p_comment        text,
  p_payment_method public.payment_method
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

  -- 2. Mode de paiement autorisé par le bar ?
  if (p_payment_method = 'staff' and not v_venue.pay_to_staff_enabled)
     or (p_payment_method = 'online' and not v_venue.online_payment_enabled) then
    raise exception 'PAIEMENT_INDISPONIBLE';
  end if;

  -- 3. Anti-abus
  if (select count(*) from public.orders
      where table_id = v_table.id and created_at > now() - order_window) >= max_orders_per_window then
    raise exception 'TROP_DE_COMMANDES';
  end if;

  -- 4. Commentaire
  if v_comment is not null and char_length(v_comment) > 300 then
    raise exception 'COMMENTAIRE_TROP_LONG';
  end if;

  -- 5. Panier : format
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

  -- 6. Panier : produits et prix (lus dans la base)
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
  if p_payment_method = 'online' and v_total < 50 then
    raise exception 'MONTANT_TROP_FAIBLE';  -- Stripe refuse les paiements de moins de 0,50 €
  end if;

  -- 7. Numéro de commande du jour
  v_date := private.business_date(v_venue);
  insert into private.order_counters as oc (venue_id, business_date, last_number)
  values (v_venue.id, v_date, 1)
  on conflict (venue_id, business_date) do update set last_number = oc.last_number + 1
  returning last_number into v_number;

  -- 8. Enregistrement
  insert into public.orders (
    venue_id, table_id, table_label, order_number, business_date,
    status, payment_method, payment_status, total_cents, comment, received_at
  ) values (
    v_venue.id, v_table.id, v_table.label, v_number, v_date,
    case when p_payment_method = 'online' then 'pending_payment' else 'received' end::public.order_status,
    p_payment_method, 'unpaid', v_total, v_comment,
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
    'status', case when p_payment_method = 'online' then 'pending_payment' else 'received' end,
    'payment_method', p_payment_method
  );
end;
$$;

-- Suivi d'une commande par le client. Il faut connaître À LA FOIS
-- l'identifiant (aléatoire) de la commande ET le lien secret de la table.
create function public.get_customer_order(p_order_id uuid, p_token text)
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

-- Paiement en ligne confirmé par Stripe (webhook). Ne fait rien si la
-- commande est déjà payée (Stripe peut envoyer deux fois le même message)
-- ou si le montant ne correspond pas.
create function public.confirm_online_payment(
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
     and total_cents = p_amount_cents;
  return found;
end;
$$;

-- Paiement en ligne abandonné (session Stripe expirée)
create function public.cancel_pending_online_order(p_session_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.orders
     set status = 'cancelled', cancelled_at = now()
   where stripe_checkout_session_id = p_session_id
     and status = 'pending_payment';
  return found;
end;
$$;


-- ---------------------------------------------------------------------
-- CÔTÉ BAR / GÉRANT (personnel connecté)
-- ---------------------------------------------------------------------

-- Changer le statut d'une commande (Reçue → En préparation → Servie)
create function public.set_order_status(p_order_id uuid, p_status public.order_status)
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
    raise exception 'COMMANDE_INTROUVABLE';
  end if;

  if v_order.status = p_status then
    return;
  end if;

  if not (
       (v_order.status = 'received'  and p_status in ('preparing', 'served'))
    or (v_order.status = 'preparing' and p_status in ('served', 'received'))
    or (v_order.status = 'served'    and p_status = 'preparing')  -- « servie » par erreur
    or (v_order.status in ('received', 'preparing') and p_status = 'cancelled'
        and v_order.payment_method = 'staff' and v_order.payment_status = 'unpaid')
  ) then
    raise exception 'CHANGEMENT_IMPOSSIBLE';
  end if;

  update public.orders
     set status       = p_status,
         preparing_at = case when p_status = 'preparing' then coalesce(preparing_at, now()) else preparing_at end,
         served_at    = case when p_status = 'served' then now() when p_status = 'preparing' then null else served_at end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = p_order_id;
end;
$$;

-- « Encaissé » : une commande « Payer au serveur » a été réglée
create function public.mark_order_paid_by_staff(p_order_id uuid)
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
    raise exception 'COMMANDE_INTROUVABLE';
  end if;
  if v_order.payment_method <> 'staff' then
    raise exception 'CHANGEMENT_IMPOSSIBLE';
  end if;
  update public.orders set payment_status = 'paid', paid_at = coalesce(paid_at, now())
   where id = p_order_id;
end;
$$;

-- Régénérer le lien d'une table (carte perdue ou volée) : l'ancien lien
-- cesse immédiatement de fonctionner.
create function public.regenerate_table_token(p_table_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_table public.venue_tables;
  v_token text;
begin
  select * into v_table from public.venue_tables where id = p_table_id for update;
  if not found or not private.is_owner(v_table.venue_id) then
    raise exception 'TABLE_INTROUVABLE';
  end if;
  update public.venue_tables set token = private.generate_table_token()
   where id = p_table_id
  returning token into v_token;
  return v_token;
end;
$$;

-- « Journée » en cours du bar (pour l'historique et le total du jour)
create function public.current_business_date(p_venue_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.business_date(v) from public.venues v
  where v.id = p_venue_id and private.is_member(v.id);
$$;


-- ---------------------------------------------------------------------
-- Qui a le droit d'appeler quelles fonctions
-- ---------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon;
grant  execute on all functions in schema private to authenticated, service_role;

-- Fonctions « client » : uniquement le serveur de l'application
revoke execute on function public.get_menu(text)                                          from public, anon, authenticated;
revoke execute on function public.create_order(text, jsonb, text, public.payment_method)   from public, anon, authenticated;
revoke execute on function public.get_customer_order(uuid, text)                           from public, anon, authenticated;
revoke execute on function public.confirm_online_payment(uuid, text, text, int)            from public, anon, authenticated;
revoke execute on function public.cancel_pending_online_order(text)                        from public, anon, authenticated;
grant  execute on function public.get_menu(text)                                          to service_role;
grant  execute on function public.create_order(text, jsonb, text, public.payment_method)   to service_role;
grant  execute on function public.get_customer_order(uuid, text)                           to service_role;
grant  execute on function public.confirm_online_payment(uuid, text, text, int)            to service_role;
grant  execute on function public.cancel_pending_online_order(text)                        to service_role;

-- Fonctions « personnel » : uniquement les personnes connectées
-- (chaque fonction vérifie en plus l'appartenance au bar)
revoke execute on function public.set_order_status(uuid, public.order_status) from public, anon;
revoke execute on function public.mark_order_paid_by_staff(uuid)             from public, anon;
revoke execute on function public.regenerate_table_token(uuid)               from public, anon;
revoke execute on function public.current_business_date(uuid)                from public, anon;
grant  execute on function public.set_order_status(uuid, public.order_status) to authenticated, service_role;
grant  execute on function public.mark_order_paid_by_staff(uuid)             to authenticated, service_role;
grant  execute on function public.regenerate_table_token(uuid)               to authenticated, service_role;
grant  execute on function public.current_business_date(uuid)                to authenticated, service_role;


-- ---------------------------------------------------------------------
-- Temps réel : l'écran du bar est prévenu instantanément des commandes
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Photos des produits et logos (stockage Supabase)
-- Dossier = identifiant du bar ; seul le gérant de ce bar peut y écrire.
-- ---------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('images', 'images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  create policy "Gérant : voit les images de son bar" on storage.objects
    for select to authenticated
    using (bucket_id = 'images' and private.is_owner(private.try_uuid((storage.foldername(name))[1])));
  create policy "Gérant : ajoute des images de son bar" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'images' and private.is_owner(private.try_uuid((storage.foldername(name))[1])));
  create policy "Gérant : remplace des images de son bar" on storage.objects
    for update to authenticated
    using (bucket_id = 'images' and private.is_owner(private.try_uuid((storage.foldername(name))[1])))
    with check (bucket_id = 'images' and private.is_owner(private.try_uuid((storage.foldername(name))[1])));
  create policy "Gérant : supprime des images de son bar" on storage.objects
    for delete to authenticated
    using (bucket_id = 'images' and private.is_owner(private.try_uuid((storage.foldername(name))[1])));
exception when others then
  -- Ne bloque pas l'installation : seules les photos seraient indisponibles.
  raise warning 'Stockage des images non configuré : %', sqlerrm;
end;
$$;

commit;
