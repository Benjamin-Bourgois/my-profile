-- ==========================================================================
-- Tapigo — Base de données Supabase (multi-restaurants)
--
-- À coller tel quel dans Supabase → SQL Editor → New query → Run.
-- Le script peut être relancé sans risque. S'il trouve l'ancienne version
-- « un seul restaurant », il la convertit automatiquement : la carte, les
-- commandes et les comptes sont conservés, et les comptes existants
-- deviennent administrateurs Tapigo + gérants de ce restaurant.
-- ==========================================================================

-- ---------- Tables ----------

create table if not exists public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),
  info        jsonb not null default '{}'::jsonb,
  menu        jsonb,
  active      boolean not null default true,
  next_number int not null default 1001,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Équipe Tapigo : crée les restaurants et gère les accès.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Accès d'un compte à un restaurant. owner = gérant (commandes + carte),
-- equipe = commandes uniquement.
create table if not exists public.restaurant_members (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'owner' check (role in ('owner', 'equipe')),
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
-- Poste d'un compte équipe : 'cuisine', 'bar' ou 'all' (les deux). Le gérant voit tout.
alter table public.restaurant_members add column if not exists station text not null default 'all';
do $$
begin
  alter table public.restaurant_members add constraint restaurant_members_station_check check (station in ('all', 'cuisine', 'bar'));
exception when duplicate_object then null;
end $$;

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants (id) on delete cascade,
  number        bigint not null,
  table_label   text not null,
  lines         jsonb not null,
  note          text not null default '',
  payment       jsonb not null default '{"method": "onsite", "status": "pending"}'::jsonb,
  total         numeric(10, 2) not null,
  status        text not null default 'nouvelle'
                check (status in ('nouvelle', 'preparation', 'prete', 'servie', 'terminee')),
  history       jsonb not null default jsonb_build_array(jsonb_build_object('status', 'nouvelle', 'at', now())),
  seen          boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Ancienne version : la colonne restaurant_id n'existait pas, et le numéro
-- était un compteur global.
alter table public.orders add column if not exists restaurant_id uuid references public.restaurants (id) on delete cascade;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'orders'
               and column_name = 'number' and is_identity = 'YES') then
    alter table public.orders alter column number drop identity;
  end if;
end $$;

-- ---------- Conversion de l'ancienne version (un seul restaurant) ----------
do $$
declare
  v_old  record;
  v_id   uuid;
  v_slug text;
begin
  if to_regclass('public.restaurant') is not null then
    select * into v_old from public.restaurant where id = 1;
    if found then
      v_slug := regexp_replace(
        lower(translate(coalesce(v_old.info ->> 'name', ''),
          'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
          'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy')),
        '[^a-z0-9]+', '-', 'g');
      v_slug := trim(both '-' from left(trim(both '-' from v_slug), 40));
      if length(v_slug) < 2 then v_slug := 'mon-restaurant'; end if;
      if exists (select 1 from public.restaurants where slug = v_slug) then
        v_slug := left(v_slug, 33) || '-' || substr(md5(random()::text), 1, 6);
      end if;

      insert into public.restaurants (slug, info, menu, next_number)
      values (v_slug, v_old.info, v_old.menu,
              coalesce((select max(number) + 1 from public.orders), 1001))
      returning id into v_id;

      update public.orders set restaurant_id = v_id where restaurant_id is null;

      if to_regclass('public.staff') is not null then
        execute format('insert into public.restaurant_members (restaurant_id, user_id, role)
                        select %L, user_id, %L from public.staff on conflict do nothing', v_id, 'owner');
        execute 'insert into public.admins (user_id) select user_id from public.staff on conflict do nothing';
      end if;
    end if;
    drop table public.restaurant cascade;
  end if;

  if to_regclass('public.staff') is not null then
    drop table public.staff cascade;
  end if;
end $$;

drop policy if exists "Commandes réservées à l'équipe" on public.orders;
drop function if exists public.place_order(text, jsonb, text);
drop function if exists public.is_staff();

delete from public.orders where restaurant_id is null;
alter table public.orders alter column restaurant_id set not null;
create index if not exists orders_restaurant_created_idx on public.orders (restaurant_id, created_at desc);

-- Origine de la commande : le client (plaque NFC) ou un serveur (dashboard).
alter table public.orders add column if not exists source text not null default 'client';
-- Pourboire (paiement en ligne), en plus du total de la commande.
alter table public.orders add column if not exists tip numeric(10, 2) not null default 0;
alter table public.orders add column if not exists taken_by uuid references auth.users (id) on delete set null;
do $$
begin
  alter table public.orders add constraint orders_source_check check (source in ('client', 'serveur'));
exception when duplicate_object then null;
end $$;
create index if not exists orders_restaurant_number_idx on public.orders (restaurant_id, number desc);
drop index if exists public.orders_created_at_idx;

-- ---------- Droits ----------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 'admin', 'owner', 'equipe' ou null (aucun accès).
create or replace function public.member_role(p_restaurant uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.admins where user_id = auth.uid()) then 'admin'
    -- Restaurant suspendu (désactivé) : l'équipe n'a plus accès, seuls les admins Tapigo gardent la main.
    else (select m.role from public.restaurant_members m
          join public.restaurants r on r.id = m.restaurant_id and r.active
          where m.restaurant_id = p_restaurant and m.user_id = auth.uid())
  end;
$$;

alter table public.restaurants        enable row level security;
alter table public.admins             enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.orders             enable row level security;

drop policy if exists "Restaurants visibles par tous" on public.restaurants;
create policy "Restaurants visibles par tous" on public.restaurants
  for select using (true);

drop policy if exists "Carte modifiable par le gérant" on public.restaurants;
create policy "Carte modifiable par le gérant" on public.restaurants
  for update using (public.member_role(id) in ('admin', 'owner'))
  with check (public.member_role(id) in ('admin', 'owner'));

drop policy if exists "Chacun voit son statut admin" on public.admins;
create policy "Chacun voit son statut admin" on public.admins
  for select using (user_id = auth.uid());

drop policy if exists "Chacun voit ses accès" on public.restaurant_members;
create policy "Chacun voit ses accès" on public.restaurant_members
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Commandes visibles par l'équipe du restaurant" on public.orders;
create policy "Commandes visibles par l'équipe du restaurant" on public.orders
  for select using (public.member_role(restaurant_id) is not null);

drop policy if exists "Commandes modifiables par l'équipe du restaurant" on public.orders;
create policy "Commandes modifiables par l'équipe du restaurant" on public.orders
  for update using (public.member_role(restaurant_id) is not null)
  with check (public.member_role(restaurant_id) is not null);

-- Tout passe par les policies ci-dessus ou par les fonctions ci-dessous.
revoke insert, update, delete on public.restaurants, public.admins, public.restaurant_members, public.orders from anon, authenticated;
-- Le gérant ne peut modifier que la carte et les infos (pas l'identifiant ni le compteur).
grant update (info, menu, updated_at) on public.restaurants to authenticated;
grant update (seen) on public.orders to authenticated;
grant select on public.restaurants, public.admins, public.restaurant_members, public.orders to anon, authenticated;

-- ---------- Paiement en ligne (Stripe Connect, sans commission) ----------
-- Chaque restaurant encaisse sur SON compte Stripe : Tapigo ne prélève rien.
-- online_payment n'est modifiable que via set_online_payment().
alter table public.restaurants add column if not exists online_payment boolean not null default false;

create table if not exists public.restaurant_payments (
  restaurant_id     uuid primary key references public.restaurants (id) on delete cascade,
  stripe_account_id text,
  charges_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  updated_at        timestamptz not null default now()
);
alter table public.restaurant_payments enable row level security;
drop policy if exists "Paiement visible par le gérant" on public.restaurant_payments;
create policy "Paiement visible par le gérant" on public.restaurant_payments
  for select using (public.member_role(restaurant_id) in ('admin', 'owner'));
revoke all on public.restaurant_payments from anon;
revoke insert, update, delete on public.restaurant_payments from authenticated;
grant select on public.restaurant_payments to authenticated;

-- Commande payée en ligne non aboutie : on rend le stock puis on la supprime.
create or replace function public.release_awaiting_order(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_line  jsonb;
begin
  delete from public.orders where id = p_id and payment ->> 'status' = 'awaiting'
  returning * into v_order;
  if not found then return false; end if;
  for v_line in select value from jsonb_array_elements(v_order.lines) loop
    update public.item_stock
    set quantity = quantity + coalesce((v_line ->> 'qty')::int, 0), updated_at = now()
    where restaurant_id = v_order.restaurant_id and item_id = v_line ->> 'itemId';
  end loop;
  return true;
end;
$$;

-- ---------- Prise de commande (client) ----------
-- Les prix sont recalculés ici, à partir de la carte en base :
-- un client ne peut pas modifier le montant de sa commande.
drop function if exists public.place_order(text, text, jsonb, text);
drop function if exists public.place_order(text, text, jsonb, text, text);
create or replace function public.place_order(p_restaurant text, p_table text, p_items jsonb, p_note text default '', p_pay text default 'onsite', p_tip numeric default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_rid     uuid;
  v_menu    jsonb;
  v_info    jsonb;
  v_req     jsonb;
  v_item    jsonb;
  v_group   jsonb;
  v_choice  jsonb;
  v_label   text;
  v_picked  jsonb;
  v_values  jsonb;
  v_options jsonb;
  v_lines   jsonb := '[]'::jsonb;
  v_unit    numeric;
  v_promo   int;
  v_qty     int;
  v_total   numeric := 0;
  v_number  int;
  v_order   public.orders;
  v_need    jsonb := '{}'::jsonb;
  v_staff   boolean := false;
  v_key     text;
  v_val     int;
  v_stock   int;
  v_name    text;
  v_online  boolean;
  v_payment jsonb := '{"method": "onsite", "status": "pending"}'::jsonb;
  v_tip     numeric := 0;
begin
  select id, menu, info, online_payment into v_rid, v_menu, v_info, v_online
  from public.restaurants where slug = p_restaurant and active;
  if v_rid is null then
    raise exception 'Restaurant introuvable';
  end if;
  if v_menu is null then
    raise exception 'La carte n''est pas encore disponible';
  end if;
  -- Commande saisie par un membre de l'équipe (serveur) depuis le dashboard.
  v_staff := public.member_role(v_rid) is not null;
  if not v_staff and coalesce((v_info ->> 'ordersPaused')::boolean, false) then
    raise exception 'Les commandes sont momentanément en pause. Adressez-vous au serveur.';
  end if;

  -- Paiement en ligne (Stripe) : la commande reste invisible en cuisine tant
  -- que le paiement n'est pas confirmé par Stripe (voir payment_confirmed).
  if coalesce(p_pay, 'onsite') = 'online' then
    if not v_online
       or not exists (select 1 from public.restaurant_payments where restaurant_id = v_rid and charges_enabled) then
      raise exception 'Le paiement en ligne n''est pas disponible dans ce restaurant. Choisissez « Payer à table ».';
    end if;
    v_payment := '{"method": "online", "status": "awaiting"}'::jsonb;
  elsif p_pay in ('cash', 'card', 'mixed') then
    -- Payer à table : le client annonce comment il va régler (espèces, carte ou
    -- les deux), pour que le serveur vienne avec le terminal ou la monnaie.
    if p_pay <> 'mixed' and jsonb_typeof(v_info -> 'onsiteWith') = 'array'
       and not (v_info -> 'onsiteWith') ? p_pay then
      raise exception '%', case p_pay when 'cash' then 'Ce restaurant n''accepte pas les espèces.'
                                      else 'Ce restaurant n''accepte pas la carte bancaire.' end;
    end if;
    if p_pay = 'mixed' and jsonb_typeof(v_info -> 'onsiteWith') = 'array'
       and not ((v_info -> 'onsiteWith') ? 'cash' and (v_info -> 'onsiteWith') ? 'card') then
      raise exception 'Ce restaurant n''accepte pas le paiement en espèces et carte.';
    end if;
    v_payment := jsonb_build_object('method', 'onsite', 'status', 'pending', 'with', p_pay);
  elsif p_pay <> 'onsite' then
    raise exception 'Moyen de paiement invalide';
  end if;

  -- Paiements en ligne abandonnés : stock libéré. Une page de paiement Stripe
  -- a pu être payée sans que la notification n'arrive : on lui laisse 24 h
  -- (l'équipe peut vérifier depuis le dashboard).
  perform public.release_awaiting_order(o.id) from public.orders o
  where o.restaurant_id = v_rid and o.payment ->> 'status' = 'awaiting'
    and (o.created_at < now() - interval '24 hours'
         or (o.payment ->> 'session' is null and o.created_at < now() - interval '1 hour'));

  p_table := left(regexp_replace(coalesce(p_table, ''), '[^0-9A-Za-z-]', '', 'g'), 6);
  if p_table = '' then
    raise exception 'Numéro de table manquant';
  end if;
  if p_table ~ '^[0-9]+$'
     and (p_table::int < 1 or p_table::int > coalesce(nullif(v_info ->> 'tables', '')::int, 200)) then
    raise exception 'La table % n''existe pas dans ce restaurant', p_table;
  end if;

  -- Anti-abus (clients uniquement) : une table ne peut pas envoyer des dizaines de commandes.
  if not v_staff and (select count(*) from public.orders
      where restaurant_id = v_rid and table_label = p_table
        and created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Trop de commandes pour cette table. Patientez quelques minutes ou appelez le serveur.';
  end if;
  if not v_staff and (select count(*) from public.orders
      where restaurant_id = v_rid and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'Le service est très chargé, réessayez dans un instant.';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 40 then
    raise exception 'Panier invalide';
  end if;

  for v_req in select value from jsonb_array_elements(p_items) loop
    select x.value into v_item
    from jsonb_array_elements(coalesce(v_menu -> 'items', '[]'::jsonb)) as x
    where x.value ->> 'id' = v_req ->> 'itemId'
      and coalesce((x.value ->> 'available')::boolean, true)
    limit 1;

    if v_item is null then
      select x.value ->> 'name' into v_name
      from jsonb_array_elements(coalesce(v_menu -> 'items', '[]'::jsonb)) x
      where x.value ->> 'id' = v_req ->> 'itemId' limit 1;
      raise exception '« % » n''est plus disponible', coalesce(v_name, v_req ->> 'itemId', '?');
    end if;

    v_qty := least(greatest(coalesce((v_req ->> 'qty')::int, 1), 1), 20);
    v_need := jsonb_set(v_need, array[v_item ->> 'id'], to_jsonb(coalesce((v_need ->> (v_item ->> 'id'))::int, 0) + v_qty));
    v_unit := coalesce((v_item ->> 'price')::numeric, 0);
    -- Anti-gaspillage : remise du gérant sur le prix du plat (pas sur les options), jusqu'à l'heure prévue.
    v_promo := case when jsonb_typeof(v_item -> 'promo') = 'object'
                     and coalesce(v_item -> 'promo' ->> 'until', '') ~ '^\d{4}-\d{2}-\d{2}T'
                     and (v_item -> 'promo' ->> 'until')::timestamptz > now()
                     and coalesce(v_item -> 'promo' ->> 'pct', '0') ~ '^[0-9]{1,2}$'
                    then least((v_item -> 'promo' ->> 'pct')::int, 70) end;
    if v_promo > 0 then v_unit := round(v_unit * (100 - v_promo) / 100.0, 2); end if;
    v_options := '[]'::jsonb;

    for v_group in select value from jsonb_array_elements(coalesce(v_item -> 'options', '[]'::jsonb)) loop
      v_picked := v_req -> 'selections' -> (v_group ->> 'id');
      if jsonb_typeof(v_picked) is distinct from 'array' then
        v_picked := '[]'::jsonb;
      end if;
      if coalesce(v_group ->> 'type', 'single') <> 'multi' and jsonb_array_length(v_picked) > 1 then
        v_picked := jsonb_build_array(v_picked -> 0);
      end if;

      v_values := '[]'::jsonb;
      for v_label in select value from jsonb_array_elements_text(v_picked) loop
        select c.value into v_choice
        from jsonb_array_elements(coalesce(v_group -> 'choices', '[]'::jsonb)) as c
        where c.value ->> 'label' = v_label
        limit 1;
        if v_choice is not null and not (v_values ? v_label) then
          v_unit := v_unit + coalesce((v_choice ->> 'price')::numeric, 0);
          v_values := v_values || to_jsonb(v_label);
        end if;
      end loop;

      if coalesce((v_group ->> 'required')::boolean, false) and jsonb_array_length(v_values) = 0 then
        raise exception 'Choix obligatoire manquant : % (%)', v_group ->> 'name', v_item ->> 'name';
      end if;
      if jsonb_array_length(v_values) > 0 then
        v_options := v_options || jsonb_build_array(jsonb_build_object('group', v_group ->> 'name', 'values', v_values));
      end if;
    end loop;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'itemId', v_item ->> 'id',
      'name', v_item ->> 'name',
      'station', coalesce(v_item ->> 'station', 'cuisine'),
      'qty', v_qty,
      'unitPrice', round(v_unit, 2),
      'options', v_options,
      'note', left(coalesce(v_req ->> 'note', ''), 140),
      -- Plat mis en avant contre le gaspillage (remise en %, 0 = simple mise en avant).
      'antigaspi', v_promo is not null,
      'promo', coalesce(v_promo, 0),
      -- Quantité ajoutée depuis « Parfait avec » (bilan mensuel du gérant).
      'suggested', least(greatest(coalesce(case when v_req ->> 'suggested' ~ '^[0-9]{1,3}$' then (v_req ->> 'suggested')::int end, 0), 0), v_qty)
    ));
    v_total := v_total + v_unit * v_qty;
  end loop;

  -- Stocks : vérifiés puis décrémentés sous verrou (deux clients ne peuvent
  -- pas commander le dernier plat en même temps).
  for v_key, v_val in select key, value::int from jsonb_each_text(v_need) loop
    select quantity into v_stock from public.item_stock
    where restaurant_id = v_rid and item_id = v_key
    for update;
    if found then
      if v_stock < v_val then
        select x.value ->> 'name' into v_name
        from jsonb_array_elements(v_menu -> 'items') x where x.value ->> 'id' = v_key limit 1;
        if v_stock = 0 then
          raise exception '« % » est épuisé', v_name;
        end if;
        raise exception 'Il ne reste que % « % »', v_stock, v_name;
      end if;
      update public.item_stock set quantity = quantity - v_val, updated_at = now()
      where restaurant_id = v_rid and item_id = v_key;
    end if;
  end loop;

  -- Numéro de commande propre à chaque restaurant. On ne modifie PAS la fiche
  -- du restaurant (sinon chaque commande serait diffusée à tous les clients
  -- connectés) : un verrou par restaurant évite les doublons.
  perform pg_advisory_xact_lock(hashtext('tapigo-order-' || v_rid::text));
  select greatest(coalesce(max(o.number) + 1, 0), r.next_number) into v_number
  from public.restaurants r
  left join public.orders o on o.restaurant_id = r.id
  where r.id = v_rid
  group by r.next_number;

  -- Pourboire : uniquement avec le paiement en ligne (à table, il se laisse
  -- sur le terminal). Plafonné au montant de la commande.
  if coalesce(p_tip, 0) <> 0 then
    if coalesce(p_pay, 'onsite') <> 'online' then
      raise exception 'Le pourboire se règle avec le paiement en ligne';
    end if;
    v_tip := round(p_tip, 2);
    if v_tip < 0 or v_tip > greatest(round(v_total, 2), 1) then
      raise exception 'Montant du pourboire invalide';
    end if;
  end if;

  insert into public.orders (restaurant_id, number, table_label, lines, note, payment, total, tip, source, taken_by)
  values (v_rid, v_number, p_table, v_lines, left(coalesce(p_note, ''), 200), v_payment, round(v_total, 2), v_tip,
          case when v_staff then 'serveur' else 'client' end,
          case when v_staff then auth.uid() end)
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

-- Suivi d'une commande par le client (l'identifiant est impossible à deviner).
create or replace function public.get_order(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select to_jsonb(o) from public.orders o where o.id = p_id;
$$;

-- ---------- Équipe du restaurant ----------
create or replace function public.set_order_status(p_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders;
begin
  if p_status not in ('nouvelle', 'preparation', 'prete', 'servie', 'terminee') then
    raise exception 'Statut invalide';
  end if;
  if public.member_role((select restaurant_id from public.orders where id = p_id)) is null then
    raise exception 'Accès refusé';
  end if;

  update public.orders
  set status  = p_status,
      seen    = true,
      history = history || jsonb_build_array(jsonb_build_object('status', p_status, 'at', now())),
      payment = case when p_status = 'terminee' then jsonb_set(payment, '{status}', '"paid"') else payment end
  where id = p_id and status <> p_status
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

-- Restaurants accessibles au compte connecté (tous pour un admin).
create or replace function public.my_restaurants()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  -- plpgsql : la table restaurant_billing (créée plus bas) n'est lue qu'à l'appel.
  return (select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'slug', r.slug,
           'name', coalesce(nullif(r.info ->> 'name', ''), r.slug),
           'active', r.active,
           'suspendedReason', case when not r.active then nullif(b.suspended_reason, '') end,
           'suspendedAt', case when not r.active then b.suspended_at end,
           'role', case when public.is_admin() then 'admin' else m.role end,
           'station', case when public.is_admin() or m.role = 'owner' then 'all' else coalesce(m.station, 'all') end
         ) order by coalesce(nullif(r.info ->> 'name', ''), r.slug)), '[]'::jsonb)
  from public.restaurants r
  left join public.restaurant_members m on m.restaurant_id = r.id and m.user_id = auth.uid()
  left join public.restaurant_billing b on b.restaurant_id = r.id
  where auth.uid() is not null and (m.user_id is not null or public.is_admin()));
end;
$$;

-- ---------- Administration Tapigo ----------
create or replace function public.admin_create_restaurant(p_name text, p_slug text, p_tables int default 12, p_menu jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.restaurants;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom est obligatoire'; end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 2 and 40 then
    raise exception 'Identifiant invalide : lettres minuscules, chiffres et tirets uniquement';
  end if;
  if exists (select 1 from public.restaurants where slug = p_slug) then
    raise exception 'Cet identifiant est déjà utilisé';
  end if;

  insert into public.restaurants (slug, info, menu)
  values (p_slug,
          jsonb_build_object('name', trim(p_name), 'tagline', '', 'tables', greatest(1, least(coalesce(p_tables, 12), 200))),
          p_menu)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_set_active(p_restaurant uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  update public.restaurants set active = p_active, updated_at = now() where id = p_restaurant;
  if p_active and to_regclass('public.restaurant_billing') is not null then
    update public.restaurant_billing set suspended_reason = null, suspended_at = null, updated_at = now()
    where restaurant_id = p_restaurant;
  end if;
end;
$$;

create or replace function public.admin_list_members(p_restaurant uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'station', m.station)
                              order by u.email), '[]'::jsonb)
    from public.restaurant_members m
    join auth.users u on u.id = m.user_id
    where m.restaurant_id = p_restaurant
  );
end;
$$;

create or replace function public.admin_add_member(p_restaurant uuid, p_email text, p_role text default 'owner')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  if p_role not in ('owner', 'equipe') then raise exception 'Rôle invalide'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'Aucun compte avec cet e-mail. Créez-le d''abord dans Supabase → Authentication → Users.';
  end if;
  insert into public.restaurant_members (restaurant_id, user_id, role)
  values (p_restaurant, v_user, p_role)
  on conflict (restaurant_id, user_id) do update set role = excluded.role;
end;
$$;

-- Poste d'un compte équipe (cuisine, bar ou les deux) : ce qu'il voit dans les dates (DLC / DDM).
-- Réglé par le gérant du restaurant ou par l'équipe Tapigo.
create or replace function public.team_members(p_restaurant uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'station', m.station)
                              order by m.role, u.email), '[]'::jsonb)
    from public.restaurant_members m
    join auth.users u on u.id = m.user_id
    where m.restaurant_id = p_restaurant
  );
end;
$$;

create or replace function public.set_member_station(p_restaurant uuid, p_user uuid, p_station text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if p_station not in ('all', 'cuisine', 'bar') then raise exception 'Poste invalide'; end if;
  update public.restaurant_members set station = p_station
  where restaurant_id = p_restaurant and user_id = p_user and role = 'equipe';
  if not found then raise exception 'Seuls les comptes « Équipe » ont un poste : le gérant voit tout.'; end if;
end;
$$;

create or replace function public.admin_remove_member(p_restaurant uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  delete from public.restaurant_members where restaurant_id = p_restaurant and user_id = p_user;
end;
$$;


-- ---------- Appels du personnel (serveur, addition) ----------
create table if not exists public.service_requests (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_label   text not null,
  kind          text not null check (kind in ('serveur', 'addition')),
  created_at    timestamptz not null default now(),
  done_at       timestamptz
);
create index if not exists service_requests_restaurant_idx on public.service_requests (restaurant_id, created_at desc);
alter table public.service_requests enable row level security;

drop policy if exists "Appels visibles par l'équipe du restaurant" on public.service_requests;
create policy "Appels visibles par l'équipe du restaurant" on public.service_requests
  for select using (public.member_role(restaurant_id) is not null);
drop policy if exists "Appels traités par l'équipe du restaurant" on public.service_requests;
create policy "Appels traités par l'équipe du restaurant" on public.service_requests
  for update using (public.member_role(restaurant_id) is not null)
  with check (public.member_role(restaurant_id) is not null);
revoke insert, update, delete on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
grant update (done_at) on public.service_requests to authenticated;

create or replace function public.request_service(p_restaurant text, p_table text, p_kind text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_rid  uuid;
  v_info jsonb;
  v_row  public.service_requests;
begin
  select id, info into v_rid, v_info from public.restaurants where slug = p_restaurant and active;
  if v_rid is null then raise exception 'Restaurant introuvable'; end if;
  if p_kind not in ('serveur', 'addition') then raise exception 'Demande invalide'; end if;
  p_table := left(regexp_replace(coalesce(p_table, ''), '[^0-9A-Za-z-]', '', 'g'), 6);
  if p_table = '' then raise exception 'Indiquez votre numéro de table'; end if;
  if p_table ~ '^[0-9]+$'
     and (p_table::int < 1 or p_table::int > coalesce(nullif(v_info ->> 'tables', '')::int, 200)) then
    raise exception 'La table % n''existe pas dans ce restaurant', p_table;
  end if;

  -- Même demande déjà en attente : on ne la duplique pas.
  select * into v_row from public.service_requests
  where restaurant_id = v_rid and table_label = p_table and kind = p_kind and done_at is null
    and created_at > now() - interval '30 minutes'
  order by created_at desc limit 1;
  if found then return to_jsonb(v_row); end if;

  if (select count(*) from public.service_requests
      where restaurant_id = v_rid and table_label = p_table
        and created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Le personnel a bien été prévenu, il arrive.';
  end if;

  insert into public.service_requests (restaurant_id, table_label, kind)
  values (v_rid, p_table, p_kind)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- ---------- Clôture d'une table (tout est encaissé) ----------
create or replace function public.close_table(p_restaurant uuid, p_table text)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  update public.orders
  set status  = 'terminee',
      seen    = true,
      history = history || jsonb_build_array(jsonb_build_object('status', 'terminee', 'at', now())),
      payment = jsonb_set(payment, '{status}', '"paid"')
  where restaurant_id = p_restaurant and table_label = p_table and status <> 'terminee'
    and payment ->> 'status' is distinct from 'awaiting';
  get diagnostics v_count = row_count;
  update public.service_requests set done_at = now()
  where restaurant_id = p_restaurant and table_label = p_table and done_at is null;
  return v_count;
end;
$$;

-- ---------- Photos des plats (Supabase Storage) ----------
-- Chemin des fichiers : <restaurant_id>/<nom>.jpg — seul le gérant du
-- restaurant (ou un admin) peut envoyer / supprimer ses photos.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('menu-photos', 'menu-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute 'drop policy if exists "Photos : envoi par le gérant" on storage.objects';
    execute $p$create policy "Photos : envoi par le gérant" on storage.objects for insert to authenticated
      with check (bucket_id = 'menu-photos' and public.member_role(((storage.foldername(name))[1])::uuid) in ('admin', 'owner'))$p$;
    execute 'drop policy if exists "Photos : modification par le gérant" on storage.objects';
    execute $p$create policy "Photos : modification par le gérant" on storage.objects for update to authenticated
      using (bucket_id = 'menu-photos' and public.member_role(((storage.foldername(name))[1])::uuid) in ('admin', 'owner'))$p$;
    execute 'drop policy if exists "Photos : suppression par le gérant" on storage.objects';
    execute $p$create policy "Photos : suppression par le gérant" on storage.objects for delete to authenticated
      using (bucket_id = 'menu-photos' and public.member_role(((storage.foldername(name))[1])::uuid) in ('admin', 'owner'))$p$;
  end if;
end $$;

-- ---------- Abonnements (visible uniquement par l'équipe Tapigo) ----------
create table if not exists public.restaurant_billing (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  plan          text not null default 'Standard',
  monthly_price numeric(10, 2) not null default 49,
  status        text not null default 'essai' check (status in ('essai', 'a_jour', 'en_retard', 'resilie')),
  next_billing  date,
  notes         text not null default '',
  updated_at    timestamptz not null default now()
);
alter table public.restaurant_billing enable row level security;
drop policy if exists "Abonnements réservés aux admins" on public.restaurant_billing;
create policy "Abonnements réservés aux admins" on public.restaurant_billing
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.restaurant_billing from anon;
grant select, insert, update on public.restaurant_billing to authenticated;
alter table public.restaurant_billing add column if not exists suspended_reason text;
alter table public.restaurant_billing add column if not exists suspended_at timestamptz;

-- Suspension d'un restaurant (impayé…) : plus de commandes client, et l'équipe du
-- restaurant n'a plus accès au dashboard (voir member_role). Réactivation : admin_set_active.
create or replace function public.admin_suspend(p_restaurant uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  update public.restaurants set active = false, updated_at = now() where id = p_restaurant;
  if not found then raise exception 'Restaurant introuvable'; end if;
  insert into public.restaurant_billing (restaurant_id, suspended_reason, suspended_at)
  values (p_restaurant, left(btrim(coalesce(p_reason, '')), 200), now())
  on conflict (restaurant_id) do update
    set suspended_reason = excluded.suspended_reason, suspended_at = now(), updated_at = now();
end;
$$;
revoke all on function public.admin_suspend(uuid, text) from public;
grant execute on function public.admin_suspend(uuid, text) to authenticated;

-- ---------- Données de démonstration pour les statistiques ----------
-- Génère des commandes passées (marquées "demo") sur les p_days derniers jours.
create or replace function public.admin_seed_demo_orders(p_restaurant uuid, p_days int default 30)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_menu    jsonb;
  v_tables  int;
  v_items   jsonb;
  v_day     int;
  v_n       int;
  v_k       int;
  v_j       int;
  v_at      timestamptz;
  v_local   timestamp;
  v_item    jsonb;
  v_group   jsonb;
  v_choice  jsonb;
  v_unit    numeric;
  v_qty     int;
  v_opts    jsonb;
  v_lines   jsonb;
  v_total   numeric;
  v_number  bigint;
  v_count   int := 0;
  v_prep    int;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  select menu, coalesce(nullif(info ->> 'tables', '')::int, 12) into v_menu, v_tables
  from public.restaurants where id = p_restaurant;
  select coalesce(jsonb_agg(x.value), '[]'::jsonb) into v_items
  from jsonb_array_elements(coalesce(v_menu -> 'items', '[]'::jsonb)) x
  where coalesce((x.value ->> 'available')::boolean, true);
  if jsonb_array_length(v_items) = 0 then raise exception 'La carte est vide'; end if;

  perform pg_advisory_xact_lock(hashtext('tapigo-order-' || p_restaurant::text));
  select coalesce(max(number), 1000) into v_number from public.orders where restaurant_id = p_restaurant;

  for v_day in reverse greatest(1, least(coalesce(p_days, 30), 90))..1 loop
    -- Plus de monde le week-end.
    v_n := 6 + floor(random() * 10)::int
           + case when extract(isodow from (now() - make_interval(days => v_day)) at time zone 'Europe/Paris') in (5, 6, 7) then 8 else 0 end;
    for v_k in 1..v_n loop
      -- Heure locale de Paris (service du midi ou du soir), convertie en instant.
      v_local := date_trunc('day', (now() - make_interval(days => v_day)) at time zone 'Europe/Paris')
                 + case when random() < 0.45 then interval '12 hours' + random() * interval '2 hours 30 minutes'
                        else interval '19 hours' + random() * interval '3 hours' end;
      v_at := v_local at time zone 'Europe/Paris';
      v_lines := '[]'::jsonb; v_total := 0;
      for v_j in 1..(1 + floor(random() * 4)::int) loop
        v_item := v_items -> floor(random() * jsonb_array_length(v_items))::int;
        v_qty := case when random() < 0.25 then 2 else 1 end;
        v_unit := coalesce((v_item ->> 'price')::numeric, 0);
        v_opts := '[]'::jsonb;
        for v_group in select value from jsonb_array_elements(coalesce(v_item -> 'options', '[]'::jsonb)) loop
          if coalesce((v_group ->> 'required')::boolean, false) and jsonb_array_length(coalesce(v_group -> 'choices', '[]'::jsonb)) > 0 then
            v_choice := v_group -> 'choices' -> floor(random() * jsonb_array_length(v_group -> 'choices'))::int;
            v_unit := v_unit + coalesce((v_choice ->> 'price')::numeric, 0);
            v_opts := v_opts || jsonb_build_array(jsonb_build_object('group', v_group ->> 'name', 'values', jsonb_build_array(v_choice ->> 'label')));
          end if;
        end loop;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'itemId', v_item ->> 'id', 'name', v_item ->> 'name', 'station', coalesce(v_item ->> 'station', 'cuisine'),
          'qty', v_qty, 'unitPrice', round(v_unit, 2), 'options', v_opts, 'note', '',
          'suggested', case when v_j > 1 and random() < 0.12 then v_qty else 0 end));
        v_total := v_total + v_unit * v_qty;
      end loop;
      v_prep := 8 + floor(random() * 14)::int;
      v_number := v_number + 1;
      insert into public.orders (restaurant_id, number, table_label, lines, note, payment, total, status, history, seen, created_at)
      values (p_restaurant, v_number, (1 + floor(random() * v_tables)::int)::text, v_lines, '',
              jsonb_build_object('method', 'onsite', 'status', 'paid', 'demo', true), round(v_total, 2), 'terminee',
              jsonb_build_array(
                jsonb_build_object('status', 'nouvelle', 'at', v_at),
                jsonb_build_object('status', 'preparation', 'at', v_at + make_interval(mins => 2)),
                jsonb_build_object('status', 'prete', 'at', v_at + make_interval(mins => v_prep)),
                jsonb_build_object('status', 'servie', 'at', v_at + make_interval(mins => v_prep + 3)),
                jsonb_build_object('status', 'terminee', 'at', v_at + make_interval(mins => v_prep + 45))),
              true, v_at);
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_clear_demo_orders(p_restaurant uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  delete from public.orders where restaurant_id = p_restaurant and coalesce((payment ->> 'demo')::boolean, false);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ---------- Stocks (gérés par toute l'équipe, gérant ou non) ----------
-- Pas de ligne = stock illimité. À 0, le plat n'est plus commandable.
create table if not exists public.item_stock (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_id       text not null,
  quantity      int not null check (quantity >= 0),
  updated_at    timestamptz not null default now(),
  primary key (restaurant_id, item_id)
);
alter table public.item_stock enable row level security;
drop policy if exists "Stocks visibles par tous" on public.item_stock;
create policy "Stocks visibles par tous" on public.item_stock for select using (true);
revoke insert, update, delete on public.item_stock from anon, authenticated;
grant select on public.item_stock to anon, authenticated;

create or replace function public.set_stock(p_restaurant uuid, p_item text, p_quantity int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if p_quantity is null then
    delete from public.item_stock where restaurant_id = p_restaurant and item_id = p_item;
    return;
  end if;
  if p_quantity < 0 or p_quantity > 100000 then raise exception 'Quantité invalide'; end if;
  insert into public.item_stock (restaurant_id, item_id, quantity)
  values (p_restaurant, p_item, p_quantity)
  on conflict (restaurant_id, item_id) do update set quantity = excluded.quantity, updated_at = now();
end;
$$;

-- Rupture / remise en vente d'un plat par n'importe quel membre de l'équipe
-- (sans pouvoir toucher aux prix ni au reste de la carte).
create or replace function public.set_item_available(p_restaurant uuid, p_item text, p_available boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_idx int;
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  perform 1 from public.restaurants where id = p_restaurant for update;
  select (x.ord - 1)::int into v_idx
  from public.restaurants r, jsonb_array_elements(r.menu -> 'items') with ordinality as x(value, ord)
  where r.id = p_restaurant and x.value ->> 'id' = p_item;
  if v_idx is null then raise exception 'Produit introuvable'; end if;
  update public.restaurants
  set menu = jsonb_set(menu, array['items', v_idx::text, 'available'], to_jsonb(p_available)),
      updated_at = now()
  where id = p_restaurant;
end;
$$;

-- ---------- Paiement en ligne : confirmation (appelée par le webhook Stripe) ----------
-- La commande apparaît en cuisine au moment du paiement, comme une nouvelle commande.
create or replace function public.payment_confirmed(p_id uuid, p_ref text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders;
begin
  update public.orders
  set payment    = jsonb_build_object('method', 'online', 'status', 'paid', 'ref', p_ref, 'paidAt', now()),
      created_at = now(),
      history    = jsonb_build_array(jsonb_build_object('status', 'nouvelle', 'at', now())),
      seen       = false
  where id = p_id and payment ->> 'status' = 'awaiting'
  returning * into v_order;
  if not found then return null; end if;
  return to_jsonb(v_order);
end;
$$;

-- L'équipe encaisse à table une commande restée en attente de paiement en ligne
-- (appelée par la fonction stripe-checkout, après fermeture de la page Stripe).
create or replace function public.payment_onsite(p_id uuid, p_with text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.orders
  set payment    = jsonb_strip_nulls(jsonb_build_object('method', 'onsite', 'status', 'paid', 'with', p_with, 'paidAt', now())),
      tip        = 0,
      created_at = now(),
      history    = jsonb_build_array(jsonb_build_object('status', 'nouvelle', 'at', now())),
      seen       = false
  where id = p_id and payment ->> 'status' = 'awaiting';
  return found;
end;
$$;

-- Le gérant active / coupe le paiement en ligne (compte Stripe validé requis).
create or replace function public.set_online_payment(p_restaurant uuid, p_enabled boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.member_role(p_restaurant) not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if p_enabled and not exists (select 1 from public.restaurant_payments
                               where restaurant_id = p_restaurant and charges_enabled) then
    raise exception 'Terminez d''abord la configuration de votre compte Stripe.';
  end if;
  update public.restaurants set online_payment = p_enabled, updated_at = now() where id = p_restaurant;
end;
$$;

-- ---------- Prévisions de stock par IA (une ligne par restaurant et par jour) ----------
-- Remplies par la fonction stock-forecast (chaque matin + à la demande).
create table if not exists public.stock_forecasts (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  for_date      date not null,
  items         jsonb not null default '[]'::jsonb, -- [{ itemId, quantity, reason }]
  summary       text not null default '',
  alerts        jsonb not null default '[]'::jsonb,
  context       text not null default '',
  source        text not null default 'ia' check (source in ('ia', 'statistique')),
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, for_date)
);
alter table public.stock_forecasts enable row level security;
drop policy if exists "Prévisions visibles par l'équipe" on public.stock_forecasts;
create policy "Prévisions visibles par l'équipe" on public.stock_forecasts
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.stock_forecasts from anon;
revoke insert, update, delete on public.stock_forecasts from authenticated;
grant select on public.stock_forecasts to authenticated;

-- ---------- Serveur attitré de chaque table ----------
-- Affiché au client (« Votre serveur : Marco »). Modifiable par toute l'équipe.
create table if not exists public.table_servers (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_label   text not null,
  server_name   text not null default '' check (length(server_name) <= 40), -- '' = aucun
  updated_at    timestamptz not null default now(),
  primary key (restaurant_id, table_label)
);
alter table public.table_servers enable row level security;
drop policy if exists "Serveurs visibles par tous" on public.table_servers;
create policy "Serveurs visibles par tous" on public.table_servers for select using (true);
revoke insert, update, delete on public.table_servers from anon, authenticated;
grant select on public.table_servers to anon, authenticated;

-- p_tables : liste de tables ; p_name vide = plus de serveur attitré
-- (ligne conservée avec un nom vide : le temps réel ne diffuse pas les suppressions filtrées).
create or replace function public.set_table_servers(p_restaurant uuid, p_tables text[], p_name text)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_count int;
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if coalesce(array_length(p_tables, 1), 0) > 300 then raise exception 'Trop de tables'; end if;
  insert into public.table_servers (restaurant_id, table_label, server_name)
  select p_restaurant, left(t, 6), left(coalesce(v_name, ''), 40) from unnest(p_tables) t where btrim(t) <> ''
  on conflict (restaurant_id, table_label) do update set server_name = excluded.server_name, updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------- Droits d'exécution ----------
revoke all on function public.place_order(text, text, jsonb, text, text, numeric) from public;
revoke all on function public.get_order(uuid) from public;
revoke all on function public.set_order_status(uuid, text) from public;
revoke all on function public.my_restaurants() from public;
revoke all on function public.admin_create_restaurant(text, text, int, jsonb) from public;
revoke all on function public.admin_set_active(uuid, boolean) from public;
revoke all on function public.admin_list_members(uuid) from public;
revoke all on function public.admin_add_member(uuid, text, text) from public;
revoke all on function public.admin_remove_member(uuid, uuid) from public;
revoke all on function public.team_members(uuid) from public;
revoke all on function public.set_member_station(uuid, uuid, text) from public;
grant execute on function public.team_members(uuid) to authenticated;
grant execute on function public.set_member_station(uuid, uuid, text) to authenticated;

grant execute on function public.place_order(text, text, jsonb, text, text, numeric) to anon, authenticated;
grant execute on function public.get_order(uuid) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.member_role(uuid) to anon, authenticated;
grant execute on function public.set_order_status(uuid, text) to authenticated;
grant execute on function public.my_restaurants() to authenticated;
grant execute on function public.admin_create_restaurant(text, text, int, jsonb) to authenticated;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;
grant execute on function public.admin_list_members(uuid) to authenticated;
grant execute on function public.admin_add_member(uuid, text, text) to authenticated;
grant execute on function public.admin_remove_member(uuid, uuid) to authenticated;

revoke all on function public.request_service(text, text, text) from public;
revoke all on function public.close_table(uuid, text) from public;
revoke all on function public.admin_seed_demo_orders(uuid, int) from public;
revoke all on function public.admin_clear_demo_orders(uuid) from public;
grant execute on function public.request_service(text, text, text) to anon, authenticated;
grant execute on function public.close_table(uuid, text) to authenticated;
revoke all on function public.set_stock(uuid, text, int) from public;
revoke all on function public.set_item_available(uuid, text, boolean) from public;
grant execute on function public.set_stock(uuid, text, int) to authenticated;
grant execute on function public.set_item_available(uuid, text, boolean) to authenticated;
grant execute on function public.admin_seed_demo_orders(uuid, int) to authenticated;
grant execute on function public.admin_clear_demo_orders(uuid) to authenticated;
-- Paiement en ligne : seules les fonctions serveur (clé service_role) confirment ou annulent.
revoke all on function public.release_awaiting_order(uuid) from public, anon, authenticated;
revoke all on function public.payment_confirmed(uuid, text) from public, anon, authenticated;
revoke all on function public.set_online_payment(uuid, boolean) from public;
grant execute on function public.release_awaiting_order(uuid) to service_role;
grant execute on function public.payment_confirmed(uuid, text) to service_role;
revoke all on function public.payment_onsite(uuid, text) from public, anon, authenticated;
grant execute on function public.payment_onsite(uuid, text) to service_role;
grant execute on function public.set_online_payment(uuid, boolean) to authenticated;
revoke all on function public.set_table_servers(uuid, text[], text) from public;
grant execute on function public.set_table_servers(uuid, text[], text) to authenticated;

-- ---------- Bons de livraison lus par l'IA ----------
-- La fonction stock-scan lit la photo du bon et enregistre ici sa proposition
-- (journal + limite d'usage). Rien n'entre en stock tant que l'équipe n'a pas
-- validé les lignes avec add_delivery_stock.
create table if not exists public.stock_scans (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  created_by    uuid references auth.users (id) on delete set null,
  supplier      text,
  reference     text,
  lines         jsonb not null default '[]'::jsonb, -- proposition de l'IA
  applied       jsonb,                              -- [{ itemId, quantity }] ajoutés au stock
  applied_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists stock_scans_restaurant_idx on public.stock_scans (restaurant_id, created_at desc);
-- 'bon' : bon de livraison ; 'etiquette' : étiquette d'un produit lue pour sa date limite.
alter table public.stock_scans add column if not exists kind text not null default 'bon';
alter table public.stock_scans enable row level security;
drop policy if exists "Bons visibles par l'équipe" on public.stock_scans;
create policy "Bons visibles par l'équipe" on public.stock_scans
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.stock_scans from anon;
revoke insert, update, delete on public.stock_scans from authenticated;
grant select on public.stock_scans to authenticated;

-- Coût d'achat HT d'une portion de chaque produit de la carte, relevé sur le dernier bon
-- de livraison (total HT de la ligne ÷ portions). Sert au coût matière des pertes.
create table if not exists public.item_costs (
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  item_id          text not null,
  cost_per_portion numeric(10, 4) not null check (cost_per_portion >= 0),
  updated_at       timestamptz not null default now(),
  primary key (restaurant_id, item_id)
);
alter table public.item_costs enable row level security;
drop policy if exists "Coûts visibles par la direction" on public.item_costs;
create policy "Coûts visibles par la direction" on public.item_costs
  for select using (public.member_role(restaurant_id) in ('admin', 'owner'));
revoke all on public.item_costs from anon;
revoke insert, update, delete on public.item_costs from authenticated;
grant select on public.item_costs to authenticated;

-- Ajoute les quantités validées au stock (une seule fois par bon).
-- Un produit encore « illimité » commence à être suivi avec la quantité livrée.
create or replace function public.add_delivery_stock(p_restaurant uuid, p_scan uuid, p_lines jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_line  jsonb;
  v_item  text;
  v_qty   int;
  v_count int := 0;
  v_done  jsonb := '[]'::jsonb;
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Aucune ligne à ajouter'; end if;
  if jsonb_array_length(p_lines) > 80 then raise exception 'Trop de lignes'; end if;

  perform 1 from public.stock_scans
  where id = p_scan and restaurant_id = p_restaurant and applied_at is null
  for update;
  if not found then raise exception 'Ce bon a déjà été ajouté au stock.'; end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_item := v_line ->> 'itemId';
    v_qty  := (v_line ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 100000 then raise exception 'Quantité invalide'; end if;
    if not exists (select 1 from public.restaurants r, jsonb_array_elements(r.menu -> 'items') x
                   where r.id = p_restaurant and x ->> 'id' = v_item) then
      raise exception 'Produit introuvable';
    end if;
    insert into public.item_stock (restaurant_id, item_id, quantity)
    values (p_restaurant, v_item, least(v_qty, 100000))
    on conflict (restaurant_id, item_id)
    do update set quantity = least(public.item_stock.quantity + excluded.quantity, 100000), updated_at = now();
    -- Coût d'achat d'une portion (facultatif) : relevé sur le bon.
    if v_line ->> 'unitCost' ~ '^[0-9]+(\.[0-9]+)?$' and (v_line ->> 'unitCost')::numeric between 0 and 10000 then
      insert into public.item_costs (restaurant_id, item_id, cost_per_portion)
      values (p_restaurant, v_item, (v_line ->> 'unitCost')::numeric)
      on conflict (restaurant_id, item_id) do update set cost_per_portion = excluded.cost_per_portion, updated_at = now();
    end if;
    v_done := v_done || jsonb_build_object('itemId', v_item, 'quantity', v_qty);
    v_count := v_count + 1;
  end loop;

  update public.stock_scans set applied = v_done, applied_at = now() where id = p_scan;
  return v_count;
end;
$$;
revoke all on function public.add_delivery_stock(uuid, uuid, jsonb) from public;
grant execute on function public.add_delivery_stock(uuid, uuid, jsonb) to authenticated;

-- ---------- Dates limites (DLC / DDM-DLUO) ----------
-- Produits datés de la cuisine et du bar. Un compte équipe ne voit et ne gère
-- que son poste ; le gérant (et l'équipe Tapigo) voit tout.
create or replace function public.member_station(p_restaurant uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.member_role(p_restaurant) is null then null
    when public.member_role(p_restaurant) in ('admin', 'owner') then 'all'
    else (select station from public.restaurant_members where restaurant_id = p_restaurant and user_id = auth.uid())
  end;
$$;

create table if not exists public.expiry_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  station       text not null check (station in ('cuisine', 'bar')),
  label         text not null check (length(label) between 1 and 80),
  item_id       text,
  kind          text not null default 'dlc' check (kind in ('dlc', 'ddm')),
  expires_on    date not null,
  quantity      text not null default '' check (length(quantity) <= 30),
  note          text not null default '' check (length(note) <= 140),
  status        text not null default 'actif' check (status in ('actif', 'utilise', 'jete')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,
  closed_by     uuid references auth.users (id) on delete set null
);
create index if not exists expiry_items_open_idx on public.expiry_items (restaurant_id, status, expires_on);
-- Portions restantes d'un lot rattaché à un produit de la carte : décomptées toutes
-- seules par les commandes (le lot qui périme le premier part en premier).
-- null = lot non suivi en portions (ingrédient, produit hors carte).
alter table public.expiry_items add column if not exists portions int;
-- Quantité restante d'un lot hors carte (ingrédient), avec son unité.
alter table public.expiry_items add column if not exists amount numeric(12, 3);
alter table public.expiry_items add column if not exists unit text;
-- Coût d'achat HT d'une unité du lot (une portion, ou un kg / L / pièce de l'ingrédient).
alter table public.expiry_items add column if not exists unit_cost numeric(12, 4);
do $$
begin
  alter table public.expiry_items add constraint expiry_items_unit_check check (unit is null or unit in ('portion', 'piece', 'g', 'kg', 'cl', 'l'));
exception when duplicate_object then null;
end $$;

-- Sorties de lots datés saisies par l'équipe : utilisé ou jeté, avec la quantité et,
-- pour une perte, le motif. Sert au bilan des pertes matières.
create table if not exists public.expiry_moves (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  expiry_id     uuid references public.expiry_items (id) on delete set null,
  station       text not null check (station in ('cuisine', 'bar')),
  label         text not null,
  item_id       text,
  kind          text not null check (kind in ('utilise', 'jete')),
  amount        numeric(12, 3) not null check (amount > 0),
  unit          text not null check (unit in ('portion', 'piece', 'g', 'kg', 'cl', 'l')),
  value         numeric(10, 2), -- produit de la carte : portions × prix de vente
  cost          numeric(10, 2), -- coût d'achat HT de la quantité sortie (relevé sur le bon)
  reason        text not null default '' check (length(reason) <= 60),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists expiry_moves_idx on public.expiry_moves (restaurant_id, created_at desc);
alter table public.expiry_moves add column if not exists cost numeric(10, 2);
alter table public.expiry_moves enable row level security;
drop policy if exists "Sorties visibles par le poste concerné" on public.expiry_moves;
create policy "Sorties visibles par le poste concerné" on public.expiry_moves
  for select using (public.member_station(restaurant_id) in ('all', station));
revoke all on public.expiry_moves from anon;
revoke insert, update, delete on public.expiry_moves from authenticated;
grant select on public.expiry_moves to authenticated;
do $$
begin
  alter table public.expiry_items add constraint expiry_items_portions_check check (portions is null or portions >= 0);
exception when duplicate_object then null;
end $$;
alter table public.expiry_items enable row level security;
drop policy if exists "Dates visibles par le poste concerné" on public.expiry_items;
create policy "Dates visibles par le poste concerné" on public.expiry_items
  for select using (public.member_station(restaurant_id) in ('all', station));
revoke all on public.expiry_items from anon;
revoke insert, update, delete on public.expiry_items from authenticated;
grant select on public.expiry_items to authenticated;

drop function if exists public.add_expiry(uuid, text, text, text, text, date, text, text);
drop function if exists public.add_expiry(uuid, text, text, text, text, date, text, text, int);
drop function if exists public.add_expiry(uuid, text, text, text, text, date, text, text, int, numeric, text);
create or replace function public.add_expiry(p_restaurant uuid, p_station text, p_label text, p_item text,
                                             p_kind text, p_date date, p_quantity text default '', p_note text default '',
                                             p_portions int default null, p_amount numeric default null, p_unit text default null,
                                             p_unit_cost numeric default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.expiry_items;
begin
  if public.member_station(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if p_station not in ('cuisine', 'bar') then raise exception 'Choisissez cuisine ou bar'; end if;
  if public.member_station(p_restaurant) not in ('all', p_station) then
    raise exception 'Votre compte ne gère que le poste %', public.member_station(p_restaurant);
  end if;
  if btrim(coalesce(p_label, '')) = '' then raise exception 'Indiquez le produit'; end if;
  if p_kind not in ('dlc', 'ddm') then raise exception 'Type de date invalide'; end if;
  if p_date is null or p_date < current_date - 365 or p_date > current_date + 3650 then raise exception 'Date invalide'; end if;
  if p_portions is not null and (p_portions < 1 or p_portions > 100000) then raise exception 'Nombre de portions invalide'; end if;
  if p_amount is not null and (p_amount <= 0 or p_amount > 1000000 or p_unit is null
                               or p_unit not in ('portion', 'piece', 'g', 'kg', 'cl', 'l')) then
    raise exception 'Quantité invalide';
  end if;
  if p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost > 100000) then raise exception 'Prix d''achat invalide'; end if;
  insert into public.expiry_items (restaurant_id, station, label, item_id, kind, expires_on, quantity, note, created_by, portions, amount, unit, unit_cost)
  values (p_restaurant, p_station, left(btrim(p_label), 80), nullif(left(coalesce(p_item, ''), 60), ''), p_kind, p_date,
          left(btrim(coalesce(p_quantity, '')), 30), left(btrim(coalesce(p_note, '')), 140), auth.uid(),
          case when nullif(btrim(coalesce(p_item, '')), '') is not null then p_portions end,
          case when p_portions is null or nullif(btrim(coalesce(p_item, '')), '') is null then p_amount end,
          case when p_portions is not null and nullif(btrim(coalesce(p_item, '')), '') is not null then 'portion'
               when p_amount is not null then p_unit end,
          -- Produit de la carte sans prix saisi : dernier coût relevé sur un bon.
          coalesce(p_unit_cost, case when p_portions is not null then
            (select c.cost_per_portion from public.item_costs c where c.restaurant_id = p_restaurant and c.item_id = p_item) end))
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- p_status : 'utilise' (consommé / vendu), 'jete' (perdu), 'supprime' (saisie par erreur).
create or replace function public.close_expiry(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.expiry_items;
begin
  select * into v_row from public.expiry_items where id = p_id;
  if not found or public.member_station(v_row.restaurant_id) not in ('all', v_row.station)
     or public.member_station(v_row.restaurant_id) is null then
    raise exception 'Accès refusé';
  end if;
  if p_status = 'supprime' then
    delete from public.expiry_items where id = p_id;
  elsif p_status in ('utilise', 'jete') then
    update public.expiry_items set status = p_status, closed_at = now(), closed_by = auth.uid() where id = p_id;
    -- Lot jeté : ses portions restantes sortent aussi du stock du produit.
    if p_status = 'jete' and v_row.item_id is not null and coalesce(v_row.portions, 0) > 0 then
      update public.item_stock set quantity = greatest(quantity - v_row.portions, 0), updated_at = now()
      where restaurant_id = v_row.restaurant_id and item_id = v_row.item_id;
    end if;
  else
    raise exception 'Statut invalide';
  end if;
end;
$$;
revoke all on function public.member_station(uuid) from public;
revoke all on function public.add_expiry(uuid, text, text, text, text, date, text, text, int, numeric, text, numeric) from public;
revoke all on function public.close_expiry(uuid, text) from public;
grant execute on function public.member_station(uuid) to authenticated;
grant execute on function public.add_expiry(uuid, text, text, text, text, date, text, text, int, numeric, text, numeric) to authenticated;

-- Conversion vers l'unité de base d'une famille : g, cl, portion ou pièce.
create or replace function public.unit_base(p_amount numeric, p_unit text)
returns numeric
language sql immutable set search_path = public
as $$
  select case p_unit when 'kg' then p_amount * 1000 when 'l' then p_amount * 100 else p_amount end;
$$;
create or replace function public.unit_family(p_unit text)
returns text
language sql immutable set search_path = public
as $$
  select case when p_unit in ('g', 'kg') then 'masse' when p_unit in ('cl', 'l') then 'volume' else p_unit end;
$$;

-- L'équipe sort une quantité d'un lot : 'utilise' ou 'jete' (avec un motif).
-- Lot d'un produit de la carte : en portions ; une perte retire aussi les portions du stock.
-- Ingrédient : dans son unité (g / kg, cl / L, pièces). p_all : sortir tout ce qui reste.
-- Le lot se ferme quand il est vide.
create or replace function public.move_expiry(p_id uuid, p_kind text, p_amount numeric, p_unit text,
                                              p_reason text default '', p_all boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row    public.expiry_items;
  v_amount numeric := p_amount;
  v_unit   text := p_unit;
  v_left   numeric;
  v_price  numeric;
  v_value  numeric;
  v_cost   numeric;
begin
  select * into v_row from public.expiry_items where id = p_id for update;
  if not found or public.member_station(v_row.restaurant_id) is null
     or public.member_station(v_row.restaurant_id) not in ('all', v_row.station) then
    raise exception 'Accès refusé';
  end if;
  if v_row.status <> 'actif' then raise exception 'Ce lot est déjà clos.'; end if;
  if p_kind not in ('utilise', 'jete') then raise exception 'Choix invalide'; end if;

  if v_row.portions is not null then
    -- Produit de la carte, suivi en portions.
    v_unit := 'portion';
    if coalesce(p_all, false) then v_amount := v_row.portions; end if;
    v_amount := round(coalesce(v_amount, 0));
    if v_amount < 1 then raise exception 'Indiquez le nombre de portions'; end if;
    if v_amount > v_row.portions then raise exception 'Il ne reste que % portion(s) dans ce lot', v_row.portions; end if;
    update public.expiry_items
    set portions = portions - v_amount,
        status = case when portions - v_amount = 0 then p_kind else status end,
        closed_at = case when portions - v_amount = 0 then now() else closed_at end,
        closed_by = case when portions - v_amount = 0 then auth.uid() else closed_by end
    where id = p_id;
    if p_kind = 'jete' then
      update public.item_stock set quantity = greatest(quantity - v_amount::int, 0), updated_at = now()
      where restaurant_id = v_row.restaurant_id and item_id = v_row.item_id;
    end if;
    select (x ->> 'price')::numeric into v_price
    from public.restaurants r, jsonb_array_elements(r.menu -> 'items') x
    where r.id = v_row.restaurant_id and x ->> 'id' = v_row.item_id;
    v_value := case when v_price is not null then round(v_price * v_amount, 2) end;
    v_cost := coalesce(v_row.unit_cost,
      (select c.cost_per_portion from public.item_costs c where c.restaurant_id = v_row.restaurant_id and c.item_id = v_row.item_id));
    v_cost := case when v_cost is not null then round(v_cost * v_amount, 2) end;
  else
    -- Ingrédient : quantité dans son unité.
    if coalesce(p_all, false) and v_row.amount is not null then v_amount := v_row.amount; v_unit := v_row.unit; end if;
    if v_amount is null or v_amount <= 0 or v_amount > 1000000 then raise exception 'Indiquez la quantité'; end if;
    if v_unit is null or v_unit not in ('portion', 'piece', 'g', 'kg', 'cl', 'l') then raise exception 'Unité invalide'; end if;
    if v_row.amount is not null then
      if public.unit_family(v_unit) <> public.unit_family(v_row.unit) then
        raise exception 'Ce lot se compte en %', v_row.unit;
      end if;
      v_left := public.unit_base(v_row.amount, v_row.unit) - public.unit_base(v_amount, v_unit);
      if v_left < -0.0005 then raise exception 'Il ne reste que % % dans ce lot', v_row.amount, v_row.unit; end if;
      v_left := greatest(v_left, 0) / public.unit_base(1, v_row.unit);
      -- Coût : quantité sortie ramenée à l'unité du lot × coût d'une unité.
      v_cost := case when v_row.unit_cost is not null
        then round(public.unit_base(v_amount, v_unit) / public.unit_base(1, v_row.unit) * v_row.unit_cost, 2) end;
      update public.expiry_items
      set amount = v_left,
          status = case when v_left = 0 or coalesce(p_all, false) then p_kind else status end,
          closed_at = case when v_left = 0 or coalesce(p_all, false) then now() else closed_at end,
          closed_by = case when v_left = 0 or coalesce(p_all, false) then auth.uid() else closed_by end
      where id = p_id;
    elsif coalesce(p_all, false) then
      update public.expiry_items set status = p_kind, closed_at = now(), closed_by = auth.uid() where id = p_id;
    end if;
  end if;

  insert into public.expiry_moves (restaurant_id, expiry_id, station, label, item_id, kind, amount, unit, value, cost, reason, created_by)
  values (v_row.restaurant_id, p_id, v_row.station, v_row.label, v_row.item_id, p_kind, v_amount, v_unit, v_value, v_cost,
          case when p_kind = 'jete' then left(btrim(coalesce(p_reason, '')), 60) else '' end, auth.uid());
  return (select to_jsonb(e) from public.expiry_items e where id = p_id);
end;
$$;
revoke all on function public.move_expiry(uuid, text, numeric, text, text, boolean) from public;
grant execute on function public.move_expiry(uuid, text, numeric, text, text, boolean) to authenticated;

-- Le stock d'un produit baisse (commande, saisie, « Épuisé », lot jeté) : les lots datés
-- de ce produit sont décomptés d'autant, le plus proche de sa date d'abord. Un lot à 0
-- passe en « utilisé ». Les lots ne dépassent ainsi jamais le stock réel.
create or replace function public.expiry_follow_stock()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_excess int;
  v_lot    record;
  v_take   int;
begin
  select coalesce(sum(portions), 0) - new.quantity into v_excess
  from public.expiry_items
  where restaurant_id = new.restaurant_id and item_id = new.item_id and status = 'actif' and portions is not null;
  if v_excess <= 0 then return new; end if;
  for v_lot in
    select id, portions from public.expiry_items
    where restaurant_id = new.restaurant_id and item_id = new.item_id and status = 'actif' and portions > 0
    order by expires_on, created_at
    for update
  loop
    exit when v_excess <= 0;
    v_take := least(v_lot.portions, v_excess);
    update public.expiry_items
    set portions  = portions - v_take,
        status    = case when portions - v_take = 0 then 'utilise' else status end,
        closed_at = case when portions - v_take = 0 then now() else closed_at end
    where id = v_lot.id;
    v_excess := v_excess - v_take;
  end loop;
  return new;
end;
$$;
drop trigger if exists expiry_follow_stock on public.item_stock;
create trigger expiry_follow_stock after insert or update of quantity on public.item_stock
  for each row execute function public.expiry_follow_stock();
revoke all on function public.expiry_follow_stock() from public, anon, authenticated;
grant execute on function public.close_expiry(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.expiry_items;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.expiry_moves;
exception when duplicate_object then null;
end $$;

-- ---------- Fiches techniques et marges (gérant) ----------
-- Ingrédients achetés, avec leur prix d'achat HT par kg, par litre ou par pièce.
-- Mis à jour tout seuls par les bons de livraison scannés, ou à la main.
create table if not exists public.ingredients (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants (id) on delete cascade,
  name            text not null check (length(name) between 1 and 80),
  unit            text not null check (unit in ('kg', 'l', 'piece')),
  cost            numeric(12, 4) check (cost is null or cost >= 0), -- € HT par unité
  prev_cost       numeric(12, 4),                                   -- prix précédent (alerte de hausse)
  cost_updated_at timestamptz,
  source          text not null default 'manuel' check (source in ('manuel', 'bon')),
  created_at      timestamptz not null default now()
);
create unique index if not exists ingredients_name_idx on public.ingredients (restaurant_id, lower(name));
alter table public.ingredients enable row level security;
drop policy if exists "Ingrédients visibles par la direction" on public.ingredients;
create policy "Ingrédients visibles par la direction" on public.ingredients
  for select using (public.member_role(restaurant_id) in ('admin', 'owner'));
revoke all on public.ingredients from anon;
revoke insert, update, delete on public.ingredients from authenticated;
grant select on public.ingredients to authenticated;

-- Fiche technique d'un produit de la carte : une recette (ingrédients + quantités),
-- ou un produit acheté tel quel (coût d'une portion). TVA du produit pour la marge HT.
create table if not exists public.recipes (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_id       text not null,
  mode          text not null default 'recette' check (mode in ('recette', 'achat')),
  vat           numeric(4, 2) not null default 10 check (vat in (0, 5.5, 10, 20)),
  lines         jsonb not null default '[]'::jsonb, -- [{ ingredientId, qty, unit }]
  purchase_cost numeric(10, 4) check (purchase_cost is null or purchase_cost >= 0),
  updated_at    timestamptz not null default now(),
  primary key (restaurant_id, item_id)
);
-- Coût des options et suppléments : [{ group, choice, lines: [{ ingredientId, qty, unit }] }]
-- (nom du groupe et libellé du choix, tels qu'ils sont enregistrés dans les lignes de commande).
alter table public.recipes add column if not exists options jsonb not null default '[]'::jsonb;
alter table public.recipes enable row level security;
drop policy if exists "Fiches visibles par la direction" on public.recipes;
create policy "Fiches visibles par la direction" on public.recipes
  for select using (public.member_role(restaurant_id) in ('admin', 'owner'));
revoke all on public.recipes from anon;
revoke insert, update, delete on public.recipes from authenticated;
grant select on public.recipes to authenticated;

create or replace function public.save_ingredient(p_restaurant uuid, p_id uuid, p_name text, p_unit text, p_cost numeric)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.ingredients;
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Indiquez le nom de l''ingrédient'; end if;
  if p_unit not in ('kg', 'l', 'piece') then raise exception 'Unité invalide'; end if;
  if p_cost is not null and (p_cost < 0 or p_cost > 100000) then raise exception 'Prix invalide'; end if;
  if p_id is null then
    insert into public.ingredients (restaurant_id, name, unit, cost, cost_updated_at)
    values (p_restaurant, left(btrim(p_name), 80), p_unit, p_cost, case when p_cost is not null then now() end)
    returning * into v_row;
  else
    update public.ingredients
    set name = left(btrim(p_name), 80), unit = p_unit,
        prev_cost = case when p_cost is distinct from cost then cost else prev_cost end,
        cost_updated_at = case when p_cost is distinct from cost then now() else cost_updated_at end,
        source = case when p_cost is distinct from cost then 'manuel' else source end,
        cost = p_cost
    where id = p_id and restaurant_id = p_restaurant
    returning * into v_row;
    if not found then raise exception 'Ingrédient introuvable'; end if;
  end if;
  return to_jsonb(v_row);
exception when unique_violation then
  raise exception 'Un ingrédient porte déjà ce nom.';
end;
$$;

create or replace function public.delete_ingredient(p_restaurant uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if exists (select 1 from public.recipes r, jsonb_array_elements(r.lines) l
             where r.restaurant_id = p_restaurant and l ->> 'ingredientId' = p_id::text)
     or exists (select 1 from public.recipes r, jsonb_array_elements(r.options) o, jsonb_array_elements(o -> 'lines') l
                where r.restaurant_id = p_restaurant and l ->> 'ingredientId' = p_id::text) then
    raise exception 'Cet ingrédient est utilisé dans une fiche technique : retirez-le d''abord de la fiche.';
  end if;
  delete from public.ingredients where id = p_id and restaurant_id = p_restaurant;
end;
$$;

-- Une ligne de recette contrôlée (ingrédient du restaurant, quantité, unité compatible).
create or replace function public.recipe_line_check(p_restaurant uuid, p_line jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_ing  public.ingredients;
  v_unit text := p_line ->> 'unit';
  v_qty  numeric;
begin
  select * into v_ing from public.ingredients where restaurant_id = p_restaurant and id::text = p_line ->> 'ingredientId';
  if not found then raise exception 'Ingrédient introuvable'; end if;
  v_qty := case when p_line ->> 'qty' ~ '^[0-9]+(\.[0-9]+)?$' then (p_line ->> 'qty')::numeric end;
  if v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Quantité invalide pour %', v_ing.name; end if;
  if not ((v_ing.unit = 'kg' and v_unit in ('g', 'kg')) or (v_ing.unit = 'l' and v_unit in ('cl', 'l'))
          or (v_ing.unit = 'piece' and v_unit = 'piece')) then
    raise exception '% se compte en %', v_ing.name, case v_ing.unit when 'kg' then 'g ou kg' when 'l' then 'cl ou L' else 'pièces' end;
  end if;
  return jsonb_build_object('ingredientId', v_ing.id, 'qty', v_qty, 'unit', v_unit);
end;
$$;
revoke all on function public.recipe_line_check(uuid, jsonb) from public;

drop function if exists public.save_recipe(uuid, text, text, numeric, jsonb, numeric);
create or replace function public.save_recipe(p_restaurant uuid, p_item text, p_mode text, p_vat numeric,
                                              p_lines jsonb, p_purchase_cost numeric, p_options jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_line jsonb;
  v_opt  jsonb;
  v_sub  jsonb;
  v_out  jsonb := '[]'::jsonb;
  v_opts jsonb := '[]'::jsonb;
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from public.restaurants r, jsonb_array_elements(r.menu -> 'items') x
                 where r.id = p_restaurant and x ->> 'id' = p_item) then
    raise exception 'Produit introuvable';
  end if;
  if p_mode not in ('recette', 'achat') then raise exception 'Type de fiche invalide'; end if;
  if p_vat not in (0, 5.5, 10, 20) then raise exception 'Taux de TVA invalide'; end if;
  if p_purchase_cost is not null and (p_purchase_cost < 0 or p_purchase_cost > 10000) then raise exception 'Coût invalide'; end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 40 then
    raise exception 'Recette invalide';
  end if;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_out := v_out || public.recipe_line_check(p_restaurant, v_line);
  end loop;
  if jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_options, '[]'::jsonb)) > 80 then
    raise exception 'Options invalides';
  end if;
  for v_opt in select value from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    if btrim(coalesce(v_opt ->> 'group', '')) = '' or btrim(coalesce(v_opt ->> 'choice', '')) = ''
       or jsonb_typeof(coalesce(v_opt -> 'lines', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v_opt -> 'lines', '[]'::jsonb)) > 10 then
      raise exception 'Options invalides';
    end if;
    v_sub := '[]'::jsonb;
    for v_line in select value from jsonb_array_elements(coalesce(v_opt -> 'lines', '[]'::jsonb)) loop
      v_sub := v_sub || public.recipe_line_check(p_restaurant, v_line);
    end loop;
    if jsonb_array_length(v_sub) > 0 then
      v_opts := v_opts || jsonb_build_object('group', left(v_opt ->> 'group', 80), 'choice', left(v_opt ->> 'choice', 80), 'lines', v_sub);
    end if;
  end loop;
  insert into public.recipes (restaurant_id, item_id, mode, vat, lines, purchase_cost, options)
  values (p_restaurant, p_item, p_mode, p_vat, v_out, p_purchase_cost, v_opts)
  on conflict (restaurant_id, item_id) do update
    set mode = excluded.mode, vat = excluded.vat, lines = excluded.lines, purchase_cost = excluded.purchase_cost,
        options = excluded.options, updated_at = now();
end;
$$;

-- Prix relevés sur un bon de livraison : chaque ligne chiffrée devient (ou met à jour)
-- un ingrédient, au prix par kg, par litre ou par pièce. Appelé après l'ajout au stock.
-- p_lines : [{ name, total, amount, unit }] avec unit 'piece' | 'g' | 'kg' | 'cl' | 'l'.
create or replace function public.record_ingredient_prices(p_restaurant uuid, p_lines jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_line  jsonb;
  v_name  text;
  v_total numeric;
  v_amt   numeric;
  v_unit  text;
  v_base  text;
  v_cost  numeric;
  v_count int := 0;
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 80 then raise exception 'Lignes invalides'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_name := left(btrim(coalesce(v_line ->> 'name', '')), 80);
    v_unit := v_line ->> 'unit';
    v_total := case when v_line ->> 'total' ~ '^[0-9]+(\.[0-9]+)?$' then (v_line ->> 'total')::numeric end;
    v_amt := case when v_line ->> 'amount' ~ '^[0-9]+(\.[0-9]+)?$' then (v_line ->> 'amount')::numeric end;
    continue when v_name = '' or v_total is null or v_total <= 0 or v_total > 100000 or v_amt is null or v_amt <= 0
               or v_unit not in ('piece', 'g', 'kg', 'cl', 'l');
    v_base := case when v_unit in ('g', 'kg') then 'kg' when v_unit in ('cl', 'l') then 'l' else 'piece' end;
    v_cost := v_total / case v_unit when 'g' then v_amt / 1000 when 'cl' then v_amt / 100 else v_amt end;
    insert into public.ingredients (restaurant_id, name, unit, cost, cost_updated_at, source)
    values (p_restaurant, v_name, v_base, round(v_cost, 4), now(), 'bon')
    on conflict (restaurant_id, lower(name)) do update
      set prev_cost = case when public.ingredients.unit = excluded.unit and public.ingredients.cost is distinct from excluded.cost
                           then public.ingredients.cost else public.ingredients.prev_cost end,
          cost = case when public.ingredients.unit = excluded.unit then excluded.cost else public.ingredients.cost end,
          cost_updated_at = case when public.ingredients.unit = excluded.unit then now() else public.ingredients.cost_updated_at end,
          source = case when public.ingredients.unit = excluded.unit then 'bon' else public.ingredients.source end;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.save_ingredient(uuid, uuid, text, text, numeric) from public;
revoke all on function public.delete_ingredient(uuid, uuid) from public;
revoke all on function public.save_recipe(uuid, text, text, numeric, jsonb, numeric, jsonb) from public;
revoke all on function public.record_ingredient_prices(uuid, jsonb) from public;
grant execute on function public.save_ingredient(uuid, uuid, text, text, numeric) to authenticated;
grant execute on function public.delete_ingredient(uuid, uuid) to authenticated;
grant execute on function public.save_recipe(uuid, text, text, numeric, jsonb, numeric, jsonb) to authenticated;
grant execute on function public.record_ingredient_prices(uuid, jsonb) to authenticated;

-- ---------- Pack HACCP ----------
-- Relevés de température des enceintes froides, plan de nettoyage, contrôles à
-- réception. Saisis par l'équipe de chaque poste (avec ses initiales : la tablette est
-- souvent partagée), réglés par le gérant, imprimés en registre pour un contrôle.
create table if not exists public.haccp_equipment (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  station       text not null check (station in ('cuisine', 'bar')),
  name          text not null check (length(name) between 1 and 60),
  kind          text not null default 'positif' check (kind in ('positif', 'negatif', 'autre')),
  min_temp      numeric(5, 1),
  max_temp      numeric(5, 1),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists haccp_equipment_idx on public.haccp_equipment (restaurant_id, active);

create table if not exists public.haccp_readings (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  equipment_id  uuid not null references public.haccp_equipment (id) on delete cascade,
  station       text not null check (station in ('cuisine', 'bar')),
  temp          numeric(5, 1) not null,
  ok            boolean not null,
  action        text not null default '' check (length(action) <= 200),
  by_name       text not null check (length(by_name) between 1 and 40),
  by_user       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists haccp_readings_idx on public.haccp_readings (restaurant_id, created_at desc);

create table if not exists public.haccp_tasks (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  station       text not null check (station in ('cuisine', 'bar')),
  label         text not null check (length(label) between 1 and 80),
  frequency     text not null default 'jour' check (frequency in ('jour', 'semaine', 'mois')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists haccp_tasks_idx on public.haccp_tasks (restaurant_id, active);

create table if not exists public.haccp_cleanings (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  task_id       uuid not null references public.haccp_tasks (id) on delete cascade,
  station       text not null check (station in ('cuisine', 'bar')),
  note          text not null default '' check (length(note) <= 200),
  by_name       text not null check (length(by_name) between 1 and 40),
  by_user       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists haccp_cleanings_idx on public.haccp_cleanings (restaurant_id, created_at desc);

create table if not exists public.haccp_receptions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  station       text not null check (station in ('cuisine', 'bar')),
  supplier      text not null default '' check (length(supplier) <= 80),
  product       text not null check (length(product) between 1 and 120),
  temp          numeric(5, 1),
  ok            boolean not null,
  action        text not null default '' check (length(action) <= 200),
  by_name       text not null check (length(by_name) between 1 and 40),
  by_user       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists haccp_receptions_idx on public.haccp_receptions (restaurant_id, created_at desc);

alter table public.haccp_equipment enable row level security;
drop policy if exists "HACCP visible par le poste concerné" on public.haccp_equipment;
create policy "HACCP visible par le poste concerné" on public.haccp_equipment
  for select using (public.member_station(restaurant_id) in ('all', station));
revoke all on public.haccp_equipment from anon;
revoke insert, update, delete on public.haccp_equipment from authenticated;
grant select on public.haccp_equipment to authenticated;

alter table public.haccp_readings enable row level security;
drop policy if exists "HACCP visible par le poste concerné" on public.haccp_readings;
create policy "HACCP visible par le poste concerné" on public.haccp_readings
  for select using (public.member_station(restaurant_id) in ('all', station));
revoke all on public.haccp_readings from anon;
revoke insert, update, delete on public.haccp_readings from authenticated;
grant select on public.haccp_readings to authenticated;

alter table public.haccp_tasks enable row level security;
drop policy if exists "HACCP visible par le poste concerné" on public.haccp_tasks;
create policy "HACCP visible par le poste concerné" on public.haccp_tasks
  for select using (public.member_station(restaurant_id) in ('all', station));
revoke all on public.haccp_tasks from anon;
revoke insert, update, delete on public.haccp_tasks from authenticated;
grant select on public.haccp_tasks to authenticated;

alter table public.haccp_cleanings enable row level security;
drop policy if exists "HACCP visible par le poste concerné" on public.haccp_cleanings;
create policy "HACCP visible par le poste concerné" on public.haccp_cleanings
  for select using (public.member_station(restaurant_id) in ('all', station));
revoke all on public.haccp_cleanings from anon;
revoke insert, update, delete on public.haccp_cleanings from authenticated;
grant select on public.haccp_cleanings to authenticated;

alter table public.haccp_receptions enable row level security;
drop policy if exists "HACCP visible par le poste concerné" on public.haccp_receptions;
create policy "HACCP visible par le poste concerné" on public.haccp_receptions
  for select using (public.member_station(restaurant_id) in ('all', station));
revoke all on public.haccp_receptions from anon;
revoke insert, update, delete on public.haccp_receptions from authenticated;
grant select on public.haccp_receptions to authenticated;

-- Contrôle commun : membre du restaurant, autorisé sur ce poste.
create or replace function public.haccp_check_station(p_restaurant uuid, p_station text)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.member_station(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if p_station not in ('cuisine', 'bar') then raise exception 'Choisissez cuisine ou bar'; end if;
  if public.member_station(p_restaurant) not in ('all', p_station) then
    raise exception 'Votre compte ne gère que le poste %', public.member_station(p_restaurant);
  end if;
end;
$$;

-- Gérant : ajouter ou modifier une enceinte froide (frigo, congélateur, chambre froide…).
create or replace function public.haccp_save_equipment(p_restaurant uuid, p_id uuid, p_station text, p_name text,
                                                       p_kind text, p_min numeric, p_max numeric)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.haccp_equipment;
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if p_station not in ('cuisine', 'bar') then raise exception 'Choisissez cuisine ou bar'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Indiquez le nom de l''appareil'; end if;
  if p_kind not in ('positif', 'negatif', 'autre') then raise exception 'Type invalide'; end if;
  if p_min is null and p_max is null then raise exception 'Indiquez au moins une température limite'; end if;
  if (p_min is not null and (p_min < -60 or p_min > 100)) or (p_max is not null and (p_max < -60 or p_max > 100))
     or (p_min is not null and p_max is not null and p_min > p_max) then
    raise exception 'Températures limites invalides';
  end if;
  if p_id is null then
    insert into public.haccp_equipment (restaurant_id, station, name, kind, min_temp, max_temp)
    values (p_restaurant, p_station, left(btrim(p_name), 60), p_kind, p_min, p_max) returning * into v_row;
  else
    update public.haccp_equipment set station = p_station, name = left(btrim(p_name), 60), kind = p_kind, min_temp = p_min, max_temp = p_max
    where id = p_id and restaurant_id = p_restaurant returning * into v_row;
    if not found then raise exception 'Appareil introuvable'; end if;
  end if;
  return to_jsonb(v_row);
end;
$$;

-- Gérant : ajouter ou modifier une tâche du plan de nettoyage.
create or replace function public.haccp_save_task(p_restaurant uuid, p_id uuid, p_station text, p_label text, p_frequency text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.haccp_tasks;
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if p_station not in ('cuisine', 'bar') then raise exception 'Choisissez cuisine ou bar'; end if;
  if btrim(coalesce(p_label, '')) = '' then raise exception 'Indiquez la tâche'; end if;
  if p_frequency not in ('jour', 'semaine', 'mois') then raise exception 'Fréquence invalide'; end if;
  if p_id is null then
    insert into public.haccp_tasks (restaurant_id, station, label, frequency)
    values (p_restaurant, p_station, left(btrim(p_label), 80), p_frequency) returning * into v_row;
  else
    update public.haccp_tasks set station = p_station, label = left(btrim(p_label), 80), frequency = p_frequency
    where id = p_id and restaurant_id = p_restaurant returning * into v_row;
    if not found then raise exception 'Tâche introuvable'; end if;
  end if;
  return to_jsonb(v_row);
end;
$$;

-- Gérant : retirer un appareil ou une tâche. L'historique reste dans le registre.
create or replace function public.haccp_archive(p_restaurant uuid, p_kind text, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if p_kind = 'equipment' then
    update public.haccp_equipment set active = false where id = p_id and restaurant_id = p_restaurant;
  elsif p_kind = 'task' then
    update public.haccp_tasks set active = false where id = p_id and restaurant_id = p_restaurant;
  else
    raise exception 'Type invalide';
  end if;
end;
$$;

-- Gérant : plan type pour démarrer (seulement si rien n'est encore réglé).
create or replace function public.haccp_seed(p_restaurant uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from public.haccp_equipment where restaurant_id = p_restaurant) then
    insert into public.haccp_equipment (restaurant_id, station, name, kind, min_temp, max_temp) values
      (p_restaurant, 'cuisine', 'Réfrigérateur cuisine', 'positif', 0, 4),
      (p_restaurant, 'cuisine', 'Congélateur cuisine', 'negatif', null, -18),
      (p_restaurant, 'bar', 'Réfrigérateur bar', 'positif', 0, 4);
  end if;
  if not exists (select 1 from public.haccp_tasks where restaurant_id = p_restaurant) then
    insert into public.haccp_tasks (restaurant_id, station, label, frequency) values
      (p_restaurant, 'cuisine', 'Plans de travail et planches désinfectés', 'jour'),
      (p_restaurant, 'cuisine', 'Sols de la cuisine lavés', 'jour'),
      (p_restaurant, 'cuisine', 'Poignées, interrupteurs et lave-mains', 'jour'),
      (p_restaurant, 'cuisine', 'Trancheuse et petit matériel démontés et lavés', 'jour'),
      (p_restaurant, 'cuisine', 'Poubelles vidées et lavées', 'jour'),
      (p_restaurant, 'cuisine', 'Réfrigérateurs vidés et nettoyés à l''intérieur', 'semaine'),
      (p_restaurant, 'cuisine', 'Filtres de la hotte dégraissés', 'semaine'),
      (p_restaurant, 'cuisine', 'Four et plaques décapés', 'semaine'),
      (p_restaurant, 'cuisine', 'Congélateur dégivré et nettoyé', 'mois'),
      (p_restaurant, 'cuisine', 'Murs, plafonds et réserves', 'mois'),
      (p_restaurant, 'bar', 'Comptoir, tireuse et becs verseurs', 'jour'),
      (p_restaurant, 'bar', 'Machine à café purgée et nettoyée', 'jour'),
      (p_restaurant, 'bar', 'Machine à glaçons et bac nettoyés', 'semaine'),
      (p_restaurant, 'bar', 'Lignes de bière nettoyées', 'semaine'),
      (p_restaurant, 'bar', 'Réfrigérateurs du bar nettoyés', 'semaine');
  end if;
end;
$$;

-- Équipe : relevé de température. Hors limites, l'action corrective est obligatoire.
create or replace function public.haccp_record_temp(p_restaurant uuid, p_equipment uuid, p_temp numeric, p_action text, p_by text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_eq  public.haccp_equipment;
  v_ok  boolean;
  v_row public.haccp_readings;
begin
  select * into v_eq from public.haccp_equipment where id = p_equipment and restaurant_id = p_restaurant and active;
  if not found then raise exception 'Appareil introuvable'; end if;
  perform public.haccp_check_station(p_restaurant, v_eq.station);
  if p_temp is null or p_temp < -60 or p_temp > 100 then raise exception 'Température invalide'; end if;
  if btrim(coalesce(p_by, '')) = '' then raise exception 'Indiquez vos initiales'; end if;
  v_ok := (v_eq.min_temp is null or p_temp >= v_eq.min_temp) and (v_eq.max_temp is null or p_temp <= v_eq.max_temp);
  if not v_ok and btrim(coalesce(p_action, '')) = '' then raise exception 'Température hors limites : indiquez l''action corrective'; end if;
  insert into public.haccp_readings (restaurant_id, equipment_id, station, temp, ok, action, by_name, by_user)
  values (p_restaurant, p_equipment, v_eq.station, round(p_temp, 1), v_ok, left(btrim(coalesce(p_action, '')), 200), left(btrim(p_by), 40), auth.uid())
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- Équipe : tâche de nettoyage faite.
create or replace function public.haccp_mark_clean(p_restaurant uuid, p_task uuid, p_note text, p_by text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_task public.haccp_tasks;
  v_row  public.haccp_cleanings;
begin
  select * into v_task from public.haccp_tasks where id = p_task and restaurant_id = p_restaurant and active;
  if not found then raise exception 'Tâche introuvable'; end if;
  perform public.haccp_check_station(p_restaurant, v_task.station);
  if btrim(coalesce(p_by, '')) = '' then raise exception 'Indiquez vos initiales'; end if;
  insert into public.haccp_cleanings (restaurant_id, task_id, station, note, by_name, by_user)
  values (p_restaurant, p_task, v_task.station, left(btrim(coalesce(p_note, '')), 200), left(btrim(p_by), 40), auth.uid())
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- Équipe : contrôle d'une livraison à réception. Non conforme : action obligatoire.
create or replace function public.haccp_record_reception(p_restaurant uuid, p_station text, p_supplier text, p_product text,
                                                         p_temp numeric, p_ok boolean, p_action text, p_by text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.haccp_receptions;
begin
  perform public.haccp_check_station(p_restaurant, p_station);
  if btrim(coalesce(p_product, '')) = '' then raise exception 'Indiquez les produits contrôlés'; end if;
  if p_temp is not null and (p_temp < -60 or p_temp > 100) then raise exception 'Température invalide'; end if;
  if p_ok is null then raise exception 'Indiquez si la livraison est conforme'; end if;
  if not p_ok and btrim(coalesce(p_action, '')) = '' then raise exception 'Livraison non conforme : indiquez l''action (refus, avoir…)'; end if;
  if btrim(coalesce(p_by, '')) = '' then raise exception 'Indiquez vos initiales'; end if;
  insert into public.haccp_receptions (restaurant_id, station, supplier, product, temp, ok, action, by_name, by_user)
  values (p_restaurant, p_station, left(btrim(coalesce(p_supplier, '')), 80), left(btrim(p_product), 120),
          round(p_temp, 1), p_ok, left(btrim(coalesce(p_action, '')), 200), left(btrim(p_by), 40), auth.uid())
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.haccp_check_station(uuid, text) from public;
revoke all on function public.haccp_save_equipment(uuid, uuid, text, text, text, numeric, numeric) from public;
revoke all on function public.haccp_save_task(uuid, uuid, text, text, text) from public;
revoke all on function public.haccp_archive(uuid, text, uuid) from public;
revoke all on function public.haccp_seed(uuid) from public;
revoke all on function public.haccp_record_temp(uuid, uuid, numeric, text, text) from public;
revoke all on function public.haccp_mark_clean(uuid, uuid, text, text) from public;
revoke all on function public.haccp_record_reception(uuid, text, text, text, numeric, boolean, text, text) from public;
grant execute on function public.haccp_save_equipment(uuid, uuid, text, text, text, numeric, numeric) to authenticated;
grant execute on function public.haccp_save_task(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.haccp_archive(uuid, text, uuid) to authenticated;
grant execute on function public.haccp_seed(uuid) to authenticated;
grant execute on function public.haccp_record_temp(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.haccp_mark_clean(uuid, uuid, text, text) to authenticated;
grant execute on function public.haccp_record_reception(uuid, text, text, text, numeric, boolean, text, text) to authenticated;

-- ---------- Commandes fournisseurs ----------
-- Fournisseurs du restaurant (appris tout seuls à chaque bon scanné, complétés par le
-- gérant), produit de la carte → fournisseur et conditionnement, et bons de commande
-- préparés à partir du stock conseillé puis envoyés par e-mail, WhatsApp ou imprimés.
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(name) between 1 and 80),
  email         text not null default '' check (length(email) <= 120),
  phone         text not null default '' check (length(phone) <= 30),
  cover_days    int not null default 2 check (cover_days between 1 and 30),
  note          text not null default '' check (length(note) <= 200),
  created_at    timestamptz not null default now()
);
create unique index if not exists suppliers_name_idx on public.suppliers (restaurant_id, lower(name));
alter table public.suppliers enable row level security;
drop policy if exists "Fournisseurs visibles par l'équipe" on public.suppliers;
create policy "Fournisseurs visibles par l'équipe" on public.suppliers
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.suppliers from anon;
revoke insert, update, delete on public.suppliers from authenticated;
grant select on public.suppliers to authenticated;

create table if not exists public.supplier_products (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_id       text not null,
  supplier_id   uuid not null references public.suppliers (id) on delete cascade,
  pack_size     int not null default 1 check (pack_size between 1 and 10000), -- portions par unité commandée
  pack_label    text not null default '' check (length(pack_label) <= 40),     -- ex. « carton de 24 »
  ref           text not null default '' check (length(ref) <= 40),            -- référence chez le fournisseur
  primary key (restaurant_id, item_id)
);
alter table public.supplier_products enable row level security;
drop policy if exists "Conditionnements visibles par l'équipe" on public.supplier_products;
create policy "Conditionnements visibles par l'équipe" on public.supplier_products
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.supplier_products from anon;
revoke insert, update, delete on public.supplier_products from authenticated;
grant select on public.supplier_products to authenticated;

create table if not exists public.supplier_orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  supplier_id   uuid references public.suppliers (id) on delete set null,
  supplier_name text not null,
  lines         jsonb not null default '[]'::jsonb, -- [{ itemId, name, qty, packLabel, packSize, ref }]
  note          text not null default '' check (length(note) <= 300),
  sent_via      text not null default 'autre' check (sent_via in ('email', 'whatsapp', 'copie', 'impression', 'autre')),
  status        text not null default 'envoyee' check (status in ('envoyee', 'recue', 'annulee')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create index if not exists supplier_orders_idx on public.supplier_orders (restaurant_id, created_at desc);
alter table public.supplier_orders enable row level security;
drop policy if exists "Commandes fournisseurs visibles par l'équipe" on public.supplier_orders;
create policy "Commandes fournisseurs visibles par l'équipe" on public.supplier_orders
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.supplier_orders from anon;
revoke insert, update, delete on public.supplier_orders from authenticated;
grant select on public.supplier_orders to authenticated;

-- Gérant : fiche d'un fournisseur.
create or replace function public.save_supplier(p_restaurant uuid, p_id uuid, p_name text, p_email text, p_phone text,
                                                p_cover_days int, p_note text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.suppliers;
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Indiquez le nom du fournisseur'; end if;
  if btrim(coalesce(p_email, '')) <> '' and btrim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide'; end if;
  if p_cover_days is null or p_cover_days < 1 or p_cover_days > 30 then raise exception 'Nombre de jours invalide (1 à 30)'; end if;
  if p_id is null then
    insert into public.suppliers (restaurant_id, name, email, phone, cover_days, note)
    values (p_restaurant, left(btrim(p_name), 80), left(btrim(coalesce(p_email, '')), 120), left(btrim(coalesce(p_phone, '')), 30),
            p_cover_days, left(btrim(coalesce(p_note, '')), 200))
    returning * into v_row;
  else
    update public.suppliers set name = left(btrim(p_name), 80), email = left(btrim(coalesce(p_email, '')), 120),
      phone = left(btrim(coalesce(p_phone, '')), 30), cover_days = p_cover_days, note = left(btrim(coalesce(p_note, '')), 200)
    where id = p_id and restaurant_id = p_restaurant returning * into v_row;
    if not found then raise exception 'Fournisseur introuvable'; end if;
  end if;
  return to_jsonb(v_row);
exception when unique_violation then
  raise exception 'Un fournisseur porte déjà ce nom.';
end;
$$;

create or replace function public.delete_supplier(p_restaurant uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  delete from public.suppliers where id = p_id and restaurant_id = p_restaurant;
end;
$$;

-- Gérant : fournisseur et conditionnement d'un produit (p_supplier null = aucun).
create or replace function public.set_supplier_product(p_restaurant uuid, p_item text, p_supplier uuid, p_pack_size int,
                                                       p_pack_label text, p_ref text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(public.member_role(p_restaurant), '') not in ('admin', 'owner') then raise exception 'Accès refusé'; end if;
  if p_supplier is null then
    delete from public.supplier_products where restaurant_id = p_restaurant and item_id = p_item;
    return;
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier and restaurant_id = p_restaurant) then raise exception 'Fournisseur introuvable'; end if;
  if not exists (select 1 from public.restaurants r, jsonb_array_elements(r.menu -> 'items') x
                 where r.id = p_restaurant and x ->> 'id' = p_item) then
    raise exception 'Produit introuvable';
  end if;
  if p_pack_size is null or p_pack_size < 1 or p_pack_size > 10000 then raise exception 'Conditionnement invalide'; end if;
  insert into public.supplier_products (restaurant_id, item_id, supplier_id, pack_size, pack_label, ref)
  values (p_restaurant, p_item, p_supplier, p_pack_size, left(btrim(coalesce(p_pack_label, '')), 40), left(btrim(coalesce(p_ref, '')), 40))
  on conflict (restaurant_id, item_id) do update
    set supplier_id = excluded.supplier_id, pack_size = excluded.pack_size, pack_label = excluded.pack_label, ref = excluded.ref;
end;
$$;

-- Toute l'équipe, après un bon scanné : le fournisseur est créé s'il est nouveau, et les
-- produits livrés qui n'ont pas encore de fournisseur lui sont rattachés.
create or replace function public.learn_supplier(p_restaurant uuid, p_name text, p_items text[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if btrim(coalesce(p_name, '')) = '' then return null; end if;
  select id into v_id from public.suppliers where restaurant_id = p_restaurant and lower(name) = lower(left(btrim(p_name), 80));
  if v_id is null then
    insert into public.suppliers (restaurant_id, name) values (p_restaurant, left(btrim(p_name), 80))
    on conflict do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.suppliers where restaurant_id = p_restaurant and lower(name) = lower(left(btrim(p_name), 80));
    end if;
  end if;
  insert into public.supplier_products (restaurant_id, item_id, supplier_id)
  select p_restaurant, i, v_id
  from unnest(coalesce(p_items, '{}'::text[])) i
  where exists (select 1 from public.restaurants r, jsonb_array_elements(r.menu -> 'items') x where r.id = p_restaurant and x ->> 'id' = i)
  on conflict (restaurant_id, item_id) do nothing;
  return v_id;
end;
$$;

-- Toute l'équipe : bon de commande envoyé (le texte part depuis l'appareil : e-mail, WhatsApp…).
create or replace function public.record_supplier_order(p_restaurant uuid, p_supplier uuid, p_lines jsonb, p_note text, p_via text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sup public.suppliers;
  v_row public.supplier_orders;
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  select * into v_sup from public.suppliers where id = p_supplier and restaurant_id = p_restaurant;
  if not found then raise exception 'Fournisseur introuvable'; end if;
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'La commande est vide';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l
             where coalesce(l ->> 'qty', '') !~ '^[0-9]{1,5}$' or (l ->> 'qty')::int < 1 or btrim(coalesce(l ->> 'name', '')) = '') then
    raise exception 'Quantités invalides';
  end if;
  if p_via not in ('email', 'whatsapp', 'copie', 'impression', 'autre') then raise exception 'Envoi invalide'; end if;
  insert into public.supplier_orders (restaurant_id, supplier_id, supplier_name, lines, note, sent_via, created_by)
  values (p_restaurant, v_sup.id, v_sup.name,
          (select jsonb_agg(jsonb_build_object('itemId', l ->> 'itemId', 'name', left(l ->> 'name', 80), 'qty', (l ->> 'qty')::int,
                                               'packLabel', left(coalesce(l ->> 'packLabel', ''), 40), 'packSize', coalesce((l ->> 'packSize')::int, 1),
                                               'ref', left(coalesce(l ->> 'ref', ''), 40)))
           from jsonb_array_elements(p_lines) l),
          left(btrim(coalesce(p_note, '')), 300), p_via, auth.uid())
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.close_supplier_order(p_restaurant uuid, p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if p_status not in ('recue', 'annulee') then raise exception 'Statut invalide'; end if;
  update public.supplier_orders set status = p_status, closed_at = now()
  where id = p_id and restaurant_id = p_restaurant and status = 'envoyee';
end;
$$;

revoke all on function public.save_supplier(uuid, uuid, text, text, text, int, text) from public;
revoke all on function public.delete_supplier(uuid, uuid) from public;
revoke all on function public.set_supplier_product(uuid, text, uuid, int, text, text) from public;
revoke all on function public.learn_supplier(uuid, text, text[]) from public;
revoke all on function public.record_supplier_order(uuid, uuid, jsonb, text, text) from public;
revoke all on function public.close_supplier_order(uuid, uuid, text) from public;
grant execute on function public.save_supplier(uuid, uuid, text, text, text, int, text) to authenticated;
grant execute on function public.delete_supplier(uuid, uuid) to authenticated;
grant execute on function public.set_supplier_product(uuid, text, uuid, int, text, text) to authenticated;
grant execute on function public.learn_supplier(uuid, text, text[]) to authenticated;
grant execute on function public.record_supplier_order(uuid, uuid, jsonb, text, text) to authenticated;
grant execute on function public.close_supplier_order(uuid, uuid, text) to authenticated;

-- ---------- Planning de l'équipe ----------
-- Les personnes de l'équipe (pas forcément des comptes : la tablette est souvent partagée),
-- leurs créneaux par jour, la publication de chaque semaine (l'équipe ne voit que les
-- semaines publiées), les indisponibilités, les remplacements et le pointage (code PIN).
create table if not exists public.staff (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(name) between 1 and 40),
  poste         text not null default 'salle' check (poste in ('bar', 'salle', 'cuisine', 'plonge', 'direction')),
  weekly_hours  numeric(4, 1) check (weekly_hours is null or (weekly_hours >= 0 and weekly_hours <= 60)),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists staff_restaurant_idx on public.staff (restaurant_id, active);

-- Données réservées au gérant : coût horaire et code PIN (empreinte).
create table if not exists public.staff_private (
  staff_id      uuid primary key references public.staff (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  hourly_cost   numeric(6, 2) check (hourly_cost is null or (hourly_cost >= 0 and hourly_cost <= 500)),
  pin_hash      text
);

create table if not exists public.shifts (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  staff_id      uuid not null references public.staff (id) on delete cascade,
  day           date not null,
  start_min     int not null check (start_min between 0 and 1439),
  end_min       int not null check (end_min between 0 and 1440),  -- fin ≤ début : le créneau finit le lendemain
  break_min     int not null default 0 check (break_min between 0 and 240),
  poste         text not null default 'salle' check (poste in ('bar', 'salle', 'cuisine', 'plonge', 'direction')),
  note          text not null default '' check (length(note) <= 120),
  status        text not null default 'prevu' check (status in ('prevu', 'a_remplacer', 'propose')),
  swap_reason   text not null default '' check (length(swap_reason) <= 120),
  proposed_staff uuid references public.staff (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists shifts_restaurant_day_idx on public.shifts (restaurant_id, day);

create table if not exists public.planning_weeks (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  week_start    date not null,  -- lundi
  published_at  timestamptz,
  primary key (restaurant_id, week_start)
);

create table if not exists public.staff_unavailability (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  staff_id      uuid not null references public.staff (id) on delete cascade,
  day           date not null,
  start_min     int check (start_min is null or start_min between 0 and 1439),  -- null : toute la journée
  end_min       int check (end_min is null or end_min between 0 and 1440),
  reason        text not null default '' check (length(reason) <= 120),
  status        text not null default 'en_attente' check (status in ('en_attente', 'acceptee', 'refusee')),
  created_at    timestamptz not null default now()
);
create index if not exists staff_unav_idx on public.staff_unavailability (restaurant_id, day);

create table if not exists public.staff_punches (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  staff_id      uuid not null references public.staff (id) on delete cascade,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  edited        boolean not null default false
);
create index if not exists staff_punches_idx on public.staff_punches (restaurant_id, started_at desc);

alter table public.staff enable row level security;
drop policy if exists "Équipe visible par le restaurant" on public.staff;
create policy "Équipe visible par le restaurant" on public.staff
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.staff from anon;
revoke insert, update, delete on public.staff from authenticated;
grant select on public.staff to authenticated;

alter table public.staff_private enable row level security;
drop policy if exists "Données de paie réservées au gérant" on public.staff_private;
create policy "Données de paie réservées au gérant" on public.staff_private
  for select using (public.member_role(restaurant_id) in ('admin', 'owner'));
revoke all on public.staff_private from anon;
revoke insert, update, delete on public.staff_private from authenticated;
grant select on public.staff_private to authenticated;

-- Créneaux : le gérant voit tout ; l'équipe, seulement les semaines publiées.
alter table public.shifts enable row level security;
drop policy if exists "Créneaux visibles une fois publiés" on public.shifts;
create policy "Créneaux visibles une fois publiés" on public.shifts
  for select using (
    public.member_role(restaurant_id) in ('admin', 'owner')
    or (public.member_role(restaurant_id) is not null and exists (
      select 1 from public.planning_weeks w
      where w.restaurant_id = shifts.restaurant_id and w.week_start = date_trunc('week', shifts.day)::date and w.published_at is not null))
  );
revoke all on public.shifts from anon;
revoke insert, update, delete on public.shifts from authenticated;
grant select on public.shifts to authenticated;

alter table public.planning_weeks enable row level security;
drop policy if exists "Semaines visibles par le restaurant" on public.planning_weeks;
create policy "Semaines visibles par le restaurant" on public.planning_weeks
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.planning_weeks from anon;
revoke insert, update, delete on public.planning_weeks from authenticated;
grant select on public.planning_weeks to authenticated;

alter table public.staff_unavailability enable row level security;
drop policy if exists "Indisponibilités visibles par le restaurant" on public.staff_unavailability;
create policy "Indisponibilités visibles par le restaurant" on public.staff_unavailability
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.staff_unavailability from anon;
revoke insert, update, delete on public.staff_unavailability from authenticated;
grant select on public.staff_unavailability to authenticated;

alter table public.staff_punches enable row level security;
drop policy if exists "Pointages visibles par le restaurant" on public.staff_punches;
create policy "Pointages visibles par le restaurant" on public.staff_punches
  for select using (public.member_role(restaurant_id) is not null);
revoke all on public.staff_punches from anon;
revoke insert, update, delete on public.staff_punches from authenticated;
grant select on public.staff_punches to authenticated;

create or replace function public.planning_is_manager(p_restaurant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.member_role(p_restaurant), '') in ('admin', 'owner'); $$;

-- Action de l'équipe pour une personne : le gérant agit librement ; sinon le code PIN de
-- la personne est demandé quand il en a un (la tablette est partagée).
create or replace function public.planning_check_person(p_restaurant uuid, p_staff uuid, p_pin text)
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_hash text;
begin
  if public.member_role(p_restaurant) is null then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from public.staff where id = p_staff and restaurant_id = p_restaurant and active) then
    raise exception 'Personne introuvable';
  end if;
  if public.planning_is_manager(p_restaurant) then return; end if;
  select pin_hash into v_hash from public.staff_private where staff_id = p_staff;
  if v_hash is not null and v_hash <> md5(coalesce(p_pin, '') || p_staff::text) then
    raise exception 'Code PIN incorrect';
  end if;
end;
$$;

create or replace function public.save_staff(p_restaurant uuid, p_id uuid, p_name text, p_poste text, p_weekly_hours numeric,
                                             p_hourly_cost numeric, p_pin text, p_active boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.staff;
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Indiquez le prénom'; end if;
  if p_poste not in ('bar', 'salle', 'cuisine', 'plonge', 'direction') then raise exception 'Poste invalide'; end if;
  if p_weekly_hours is not null and (p_weekly_hours < 0 or p_weekly_hours > 60) then raise exception 'Heures du contrat invalides'; end if;
  if p_hourly_cost is not null and (p_hourly_cost < 0 or p_hourly_cost > 500) then raise exception 'Coût horaire invalide'; end if;
  if p_pin is not null and p_pin <> '' and p_pin !~ '^[0-9]{4}$' then raise exception 'Le code PIN fait 4 chiffres'; end if;
  if p_id is null then
    insert into public.staff (restaurant_id, name, poste, weekly_hours, active)
    values (p_restaurant, left(btrim(p_name), 40), p_poste, p_weekly_hours, coalesce(p_active, true)) returning * into v_row;
  else
    update public.staff set name = left(btrim(p_name), 40), poste = p_poste, weekly_hours = p_weekly_hours, active = coalesce(p_active, true)
    where id = p_id and restaurant_id = p_restaurant returning * into v_row;
    if not found then raise exception 'Personne introuvable'; end if;
  end if;
  insert into public.staff_private (staff_id, restaurant_id, hourly_cost, pin_hash)
  values (v_row.id, p_restaurant, p_hourly_cost, case when coalesce(p_pin, '') <> '' then md5(p_pin || v_row.id::text) end)
  on conflict (staff_id) do update
    set hourly_cost = excluded.hourly_cost,
        -- p_pin null : code inchangé ; '' : code retiré ; 4 chiffres : nouveau code.
        pin_hash = case when p_pin is null then public.staff_private.pin_hash when p_pin = '' then null else excluded.pin_hash end;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.save_shift(p_restaurant uuid, p_id uuid, p_staff uuid, p_day date, p_start int, p_end int,
                                             p_break int, p_poste text, p_note text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.shifts;
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from public.staff where id = p_staff and restaurant_id = p_restaurant) then raise exception 'Personne introuvable'; end if;
  if p_day is null or p_start is null or p_end is null or p_start < 0 or p_start > 1439 or p_end < 0 or p_end > 1440 then
    raise exception 'Horaires invalides';
  end if;
  if p_start = p_end then raise exception 'Le début et la fin sont identiques'; end if;
  if coalesce(p_break, 0) < 0 or coalesce(p_break, 0) > 240 then raise exception 'Pause invalide'; end if;
  if p_poste not in ('bar', 'salle', 'cuisine', 'plonge', 'direction') then raise exception 'Poste invalide'; end if;
  if p_id is null then
    insert into public.shifts (restaurant_id, staff_id, day, start_min, end_min, break_min, poste, note)
    values (p_restaurant, p_staff, p_day, p_start, p_end, coalesce(p_break, 0), p_poste, left(btrim(coalesce(p_note, '')), 120))
    returning * into v_row;
  else
    update public.shifts set staff_id = p_staff, day = p_day, start_min = p_start, end_min = p_end, break_min = coalesce(p_break, 0),
      poste = p_poste, note = left(btrim(coalesce(p_note, '')), 120),
      status = case when staff_id <> p_staff then 'prevu' else status end,
      proposed_staff = case when staff_id <> p_staff then null else proposed_staff end
    where id = p_id and restaurant_id = p_restaurant returning * into v_row;
    if not found then raise exception 'Créneau introuvable'; end if;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.delete_shift(p_restaurant uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  delete from public.shifts where id = p_id and restaurant_id = p_restaurant;
end;
$$;

-- Recopie une semaine sur une autre (même jour de la semaine), sans toucher aux créneaux déjà posés.
create or replace function public.copy_planning_week(p_restaurant uuid, p_from date, p_to date)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_n int;
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  if extract(isodow from p_from) <> 1 or extract(isodow from p_to) <> 1 then raise exception 'Semaine invalide'; end if;
  insert into public.shifts (restaurant_id, staff_id, day, start_min, end_min, break_min, poste, note)
  select s.restaurant_id, s.staff_id, s.day + (p_to - p_from), s.start_min, s.end_min, s.break_min, s.poste, s.note
  from public.shifts s join public.staff p on p.id = s.staff_id and p.active
  where s.restaurant_id = p_restaurant and s.day >= p_from and s.day < p_from + 7
    and not exists (select 1 from public.shifts t where t.restaurant_id = p_restaurant and t.staff_id = s.staff_id
                    and t.day = s.day + (p_to - p_from));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.publish_planning_week(p_restaurant uuid, p_week date, p_publish boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  if extract(isodow from p_week) <> 1 then raise exception 'Semaine invalide'; end if;
  insert into public.planning_weeks (restaurant_id, week_start, published_at)
  values (p_restaurant, p_week, case when p_publish then now() end)
  on conflict (restaurant_id, week_start) do update set published_at = case when p_publish then now() end;
end;
$$;

-- Équipe : indisponibilité (le gérant l'accepte ou la refuse).
create or replace function public.add_unavailability(p_restaurant uuid, p_staff uuid, p_day date, p_start int, p_end int,
                                                     p_reason text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.staff_unavailability;
begin
  perform public.planning_check_person(p_restaurant, p_staff, p_pin);
  if p_day is null or p_day < current_date - 1 or p_day > current_date + 365 then raise exception 'Date invalide'; end if;
  if (p_start is null) <> (p_end is null) or (p_start is not null and (p_start < 0 or p_start > 1439 or p_end < 0 or p_end > 1440)) then
    raise exception 'Horaires invalides';
  end if;
  insert into public.staff_unavailability (restaurant_id, staff_id, day, start_min, end_min, reason, status)
  values (p_restaurant, p_staff, p_day, p_start, p_end, left(btrim(coalesce(p_reason, '')), 120),
          case when public.planning_is_manager(p_restaurant) then 'acceptee' else 'en_attente' end)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.cancel_unavailability(p_restaurant uuid, p_id uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_staff uuid;
begin
  select staff_id into v_staff from public.staff_unavailability where id = p_id and restaurant_id = p_restaurant;
  if v_staff is null then raise exception 'Indisponibilité introuvable'; end if;
  perform public.planning_check_person(p_restaurant, v_staff, p_pin);
  delete from public.staff_unavailability where id = p_id;
end;
$$;

create or replace function public.decide_unavailability(p_restaurant uuid, p_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  update public.staff_unavailability set status = case when p_accept then 'acceptee' else 'refusee' end
  where id = p_id and restaurant_id = p_restaurant;
end;
$$;

-- Équipe : « je ne peux pas » sur son créneau (semaine publiée), puis un collègue le prend.
create or replace function public.release_shift(p_restaurant uuid, p_shift uuid, p_reason text, p_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_s public.shifts;
begin
  select * into v_s from public.shifts where id = p_shift and restaurant_id = p_restaurant;
  if not found then raise exception 'Créneau introuvable'; end if;
  perform public.planning_check_person(p_restaurant, v_s.staff_id, p_pin);
  if v_s.day < current_date then raise exception 'Ce créneau est passé'; end if;
  update public.shifts set status = 'a_remplacer', swap_reason = left(btrim(coalesce(p_reason, '')), 120), proposed_staff = null
  where id = p_shift;
end;
$$;

create or replace function public.take_shift(p_restaurant uuid, p_shift uuid, p_staff uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_s public.shifts;
begin
  select * into v_s from public.shifts where id = p_shift and restaurant_id = p_restaurant;
  if not found then raise exception 'Créneau introuvable'; end if;
  if v_s.status <> 'a_remplacer' then raise exception 'Ce créneau n''est plus à remplacer'; end if;
  if v_s.staff_id = p_staff then raise exception 'C''est déjà votre créneau'; end if;
  perform public.planning_check_person(p_restaurant, p_staff, p_pin);
  update public.shifts set status = 'propose', proposed_staff = p_staff where id = p_shift;
end;
$$;

-- Gérant : valide le remplacement (le créneau change de personne) ou le refuse.
create or replace function public.decide_swap(p_restaurant uuid, p_shift uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  update public.shifts
  set staff_id = case when p_accept and proposed_staff is not null then proposed_staff else staff_id end,
      status = 'prevu', proposed_staff = null, swap_reason = ''
  where id = p_shift and restaurant_id = p_restaurant;
end;
$$;

-- Pointage : arrivée puis départ (un appui de plus termine le service en cours).
create or replace function public.clock_staff(p_restaurant uuid, p_staff uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_open public.staff_punches;
begin
  perform public.planning_check_person(p_restaurant, p_staff, p_pin);
  select * into v_open from public.staff_punches
  where restaurant_id = p_restaurant and staff_id = p_staff and ended_at is null and started_at > now() - interval '20 hours'
  order by started_at desc limit 1;
  if found then
    update public.staff_punches set ended_at = now() where id = v_open.id returning * into v_open;
    return jsonb_build_object('kind', 'out', 'at', v_open.ended_at, 'started_at', v_open.started_at);
  end if;
  insert into public.staff_punches (restaurant_id, staff_id) values (p_restaurant, p_staff) returning * into v_open;
  return jsonb_build_object('kind', 'in', 'at', v_open.started_at);
end;
$$;

-- Gérant : corrige un pointage (oubli de départ, erreur).
create or replace function public.edit_punch(p_restaurant uuid, p_id uuid, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  if p_start is null or (p_end is not null and p_end <= p_start) or p_end - p_start > interval '20 hours' then raise exception 'Horaires invalides'; end if;
  update public.staff_punches set started_at = p_start, ended_at = p_end, edited = true where id = p_id and restaurant_id = p_restaurant;
end;
$$;

revoke all on function public.planning_is_manager(uuid) from public;
revoke all on function public.planning_check_person(uuid, uuid, text) from public;
revoke all on function public.save_staff(uuid, uuid, text, text, numeric, numeric, text, boolean) from public;
revoke all on function public.save_shift(uuid, uuid, uuid, date, int, int, int, text, text) from public;
revoke all on function public.delete_shift(uuid, uuid) from public;
revoke all on function public.copy_planning_week(uuid, date, date) from public;
revoke all on function public.publish_planning_week(uuid, date, boolean) from public;
revoke all on function public.add_unavailability(uuid, uuid, date, int, int, text, text) from public;
revoke all on function public.cancel_unavailability(uuid, uuid, text) from public;
revoke all on function public.decide_unavailability(uuid, uuid, boolean) from public;
revoke all on function public.release_shift(uuid, uuid, text, text) from public;
revoke all on function public.take_shift(uuid, uuid, uuid, text) from public;
revoke all on function public.decide_swap(uuid, uuid, boolean) from public;
revoke all on function public.clock_staff(uuid, uuid, text) from public;
revoke all on function public.edit_punch(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.save_staff(uuid, uuid, text, text, numeric, numeric, text, boolean) to authenticated;
grant execute on function public.save_shift(uuid, uuid, uuid, date, int, int, int, text, text) to authenticated;
grant execute on function public.delete_shift(uuid, uuid) to authenticated;
grant execute on function public.copy_planning_week(uuid, date, date) to authenticated;
grant execute on function public.publish_planning_week(uuid, date, boolean) to authenticated;
grant execute on function public.add_unavailability(uuid, uuid, date, int, int, text, text) to authenticated;
grant execute on function public.cancel_unavailability(uuid, uuid, text) to authenticated;
grant execute on function public.decide_unavailability(uuid, uuid, boolean) to authenticated;
grant execute on function public.release_shift(uuid, uuid, text, text) to authenticated;
grant execute on function public.take_shift(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.decide_swap(uuid, uuid, boolean) to authenticated;
grant execute on function public.clock_staff(uuid, uuid, text) to authenticated;
grant execute on function public.edit_punch(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- ---------- Planning : lien personnel de chaque salarié ----------
-- Chaque personne reçoit un lien secret (planning.html?t=…) pour voir son planning sur son
-- téléphone, sans compte. Le gérant l'envoie par WhatsApp, SMS ou e-mail, et peut le
-- remplacer à tout moment (l'ancien lien ne marche plus).
alter table public.staff_private add column if not exists access_token text;
alter table public.staff_private add column if not exists email text check (email is null or length(email) <= 120);
alter table public.staff_private add column if not exists phone text check (phone is null or length(phone) <= 30);
create unique index if not exists staff_private_token_idx on public.staff_private (access_token) where access_token is not null;

-- Gérant : coordonnées pour prévenir la personne, et lien personnel (créé ou remplacé).
create or replace function public.save_staff_contact(p_restaurant uuid, p_staff uuid, p_email text, p_phone text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  if btrim(coalesce(p_email, '')) <> '' and btrim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide'; end if;
  insert into public.staff_private (staff_id, restaurant_id, email, phone)
  select p_staff, p_restaurant, nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_phone, '')), '')
  where exists (select 1 from public.staff where id = p_staff and restaurant_id = p_restaurant)
  on conflict (staff_id) do update set email = excluded.email, phone = excluded.phone;
end;
$$;

create or replace function public.staff_link(p_restaurant uuid, p_staff uuid, p_renew boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_token text;
begin
  if not public.planning_is_manager(p_restaurant) then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from public.staff where id = p_staff and restaurant_id = p_restaurant) then raise exception 'Personne introuvable'; end if;
  insert into public.staff_private (staff_id, restaurant_id) values (p_staff, p_restaurant) on conflict (staff_id) do nothing;
  select access_token into v_token from public.staff_private where staff_id = p_staff;
  if v_token is null or p_renew then
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.staff_private set access_token = v_token where staff_id = p_staff;
  end if;
  return v_token;
end;
$$;

-- Personne correspondant à un lien (salarié actif d'un restaurant actif), sinon erreur.
create or replace function public.portal_person(p_token text)
returns public.staff
language plpgsql stable security definer set search_path = public
as $$
declare
  v public.staff;
begin
  if coalesce(length(p_token), 0) < 32 then raise exception 'Lien invalide'; end if;
  select s.* into v from public.staff s
  join public.staff_private p on p.staff_id = s.id
  join public.restaurants r on r.id = s.restaurant_id
  where p.access_token = p_token and s.active and r.active;
  if not found then raise exception 'Ce lien n''est plus valide : demandez-en un nouveau à votre responsable.'; end if;
  return v;
end;
$$;

-- Page personnelle : semaines publiées de la semaine passée à +4 semaines.
create or replace function public.staff_portal(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v public.staff;
  v_from date := date_trunc('week', current_date)::date - 7;
  v_to date := date_trunc('week', current_date)::date + 35;
begin
  v := public.portal_person(p_token);
  return jsonb_build_object(
    'me', jsonb_build_object('id', v.id, 'name', v.name, 'poste', v.poste, 'weeklyHours', v.weekly_hours),
    'restaurant', (select coalesce(r.info ->> 'name', 'Restaurant') from public.restaurants r where r.id = v.restaurant_id),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'poste', s.poste) order by s.name), '[]'::jsonb)
              from public.staff s where s.restaurant_id = v.restaurant_id and s.active),
    'weeks', (select coalesce(jsonb_agg(w.week_start order by w.week_start), '[]'::jsonb) from public.planning_weeks w
              where w.restaurant_id = v.restaurant_id and w.published_at is not null and w.week_start >= v_from and w.week_start < v_to),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'staffId', s.staff_id, 'day', s.day, 'start', s.start_min, 'end', s.end_min,
                 'brk', s.break_min, 'poste', s.poste, 'note', s.note, 'status', s.status, 'swapReason', s.swap_reason, 'proposedStaff', s.proposed_staff)
                 order by s.day, s.start_min), '[]'::jsonb)
               from public.shifts s join public.planning_weeks w on w.restaurant_id = s.restaurant_id and w.week_start = date_trunc('week', s.day)::date
               where s.restaurant_id = v.restaurant_id and w.published_at is not null and s.day >= v_from and s.day < v_to),
    'unav', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'day', u.day, 'start', u.start_min, 'end', u.end_min, 'reason', u.reason, 'status', u.status)
               order by u.day), '[]'::jsonb)
             from public.staff_unavailability u where u.staff_id = v.id and u.day >= current_date - 7)
  );
end;
$$;

create or replace function public.portal_add_unavailability(p_token text, p_day date, p_start int, p_end int, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.staff;
begin
  v := public.portal_person(p_token);
  if p_day is null or p_day < current_date or p_day > current_date + 365 then raise exception 'Date invalide'; end if;
  if (p_start is null) <> (p_end is null) or (p_start is not null and (p_start < 0 or p_start > 1439 or p_end < 0 or p_end > 1440)) then
    raise exception 'Horaires invalides';
  end if;
  if (select count(*) from public.staff_unavailability where staff_id = v.id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Trop de demandes aujourd''hui';
  end if;
  insert into public.staff_unavailability (restaurant_id, staff_id, day, start_min, end_min, reason, status)
  values (v.restaurant_id, v.id, p_day, p_start, p_end, left(btrim(coalesce(p_reason, '')), 120), 'en_attente');
end;
$$;

create or replace function public.portal_cancel_unavailability(p_token text, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.staff;
begin
  v := public.portal_person(p_token);
  delete from public.staff_unavailability where id = p_id and staff_id = v.id and day >= current_date;
end;
$$;

create or replace function public.portal_release_shift(p_token text, p_shift uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.staff;
begin
  v := public.portal_person(p_token);
  update public.shifts set status = 'a_remplacer', swap_reason = left(btrim(coalesce(p_reason, '')), 120), proposed_staff = null
  where id = p_shift and staff_id = v.id and day >= current_date and status = 'prevu';
  if not found then raise exception 'Créneau introuvable'; end if;
end;
$$;

create or replace function public.portal_take_shift(p_token text, p_shift uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.staff;
begin
  v := public.portal_person(p_token);
  update public.shifts set status = 'propose', proposed_staff = v.id
  where id = p_shift and restaurant_id = v.restaurant_id and status = 'a_remplacer' and staff_id <> v.id and day >= current_date;
  if not found then raise exception 'Ce créneau n''est plus disponible'; end if;
end;
$$;

revoke all on function public.save_staff_contact(uuid, uuid, text, text) from public;
revoke all on function public.staff_link(uuid, uuid, boolean) from public;
revoke all on function public.portal_person(text) from public;
revoke all on function public.staff_portal(text) from public;
revoke all on function public.portal_add_unavailability(text, date, int, int, text) from public;
revoke all on function public.portal_cancel_unavailability(text, uuid) from public;
revoke all on function public.portal_release_shift(text, uuid, text) from public;
revoke all on function public.portal_take_shift(text, uuid) from public;
grant execute on function public.save_staff_contact(uuid, uuid, text, text) to authenticated;
grant execute on function public.staff_link(uuid, uuid, boolean) to authenticated;
grant execute on function public.staff_portal(text) to anon, authenticated;
grant execute on function public.portal_add_unavailability(text, date, int, int, text) to anon, authenticated;
grant execute on function public.portal_cancel_unavailability(text, uuid) to anon, authenticated;
grant execute on function public.portal_release_shift(text, uuid, text) to anon, authenticated;
grant execute on function public.portal_take_shift(text, uuid) to anon, authenticated;

-- ---------- Temps réel ----------
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.restaurants;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.service_requests;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.item_stock;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.table_servers;
exception when duplicate_object then null;
end $$;

-- ==========================================================================
-- NOUVELLE INSTALLATION UNIQUEMENT : après avoir créé votre compte dans
-- Authentication → Users → Add user, remplacez l'e-mail puis exécutez
-- uniquement la ligne ci-dessous pour devenir administrateur Tapigo.
--
--   insert into public.admins (user_id) select id from auth.users where email = 'vous@exemple.fr';
-- ==========================================================================

-- Supabase prend immédiatement en compte les nouvelles fonctions et tables
-- (évite l'erreur « Could not find the function … in the schema cache »).
notify pgrst, 'reload schema';
