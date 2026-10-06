-- =====================================================================
--  COMMANDE À TABLE — 4 : ESPACE GÉRANT (étape 4)
--
--  À exécuter une fois, APRÈS les scripts 1, 2 et 3 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
--
--  Toutes ces fonctions vérifient que la personne connectée est bien le
--  GÉRANT du bar concerné avant de lire ou de modifier quoi que ce soit.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Lecture
-- ---------------------------------------------------------------------

-- Réglages, carte complète (y compris catégories vides) et tables du bar
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
            'is_available', p.is_available
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
    ), '[]'::jsonb)
  );
end;
$$;

-- Commandes d'une journée (par défaut : aujourd'hui) et totaux.
-- Les paiements en ligne abandonnés ne sont pas comptés.
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
        'to_collect_cents', (select coalesce(sum(total_cents), 0) from day where status <> 'cancelled' and payment_method = 'staff' and payment_status = 'unpaid')
      )
    )
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Ordre d'affichage (boutons ↑ ↓) : renumérote puis échange deux lignes
-- ---------------------------------------------------------------------
create or replace function private.move_row(
  p_table regclass, p_scope_column text, p_scope uuid, p_tiebreak text, p_id uuid, p_direction int
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_position int;
  v_target   int;
begin
  execute format(
    'update %1$s t set sort_order = r.n
       from (select id, row_number() over (order by sort_order, %3$I) as n from %1$s where %2$I = $1) r
      where t.id = r.id',
    p_table, p_scope_column, p_tiebreak
  ) using p_scope;

  execute format('select sort_order from %s where id = $1', p_table) into v_position using p_id;
  v_target := v_position + sign(p_direction)::int;

  execute format(
    'update %1$s set sort_order = case when id = $1 then $2 else $3 end
      where %2$I = $4 and (id = $1 or sort_order = $2)
        and exists (select 1 from %1$s where %2$I = $4 and sort_order = $2)',
    p_table, p_scope_column
  ) using p_id, v_target, v_position, p_scope;
end;
$$;

create or replace function public.admin_move(p_kind text, p_id uuid, p_direction int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
  v_scope uuid;
begin
  if p_kind = 'category' then
    select venue_id, venue_id into v_venue, v_scope from public.categories where id = p_id;
  elsif p_kind = 'product' then
    select venue_id, category_id into v_venue, v_scope from public.products where id = p_id;
  elsif p_kind = 'table' then
    select venue_id, venue_id into v_venue, v_scope from public.venue_tables where id = p_id;
  end if;
  if v_venue is null or not private.is_owner(v_venue) then
    raise exception 'INTROUVABLE';
  end if;

  if p_kind = 'category' then
    perform private.move_row('public.categories', 'venue_id', v_scope, 'name', p_id, p_direction);
  elsif p_kind = 'product' then
    perform private.move_row('public.products', 'category_id', v_scope, 'name', p_id, p_direction);
  else
    perform private.move_row('public.venue_tables', 'venue_id', v_scope, 'label', p_id, p_direction);
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Carte : catégories
-- ---------------------------------------------------------------------
create or replace function public.admin_save_category(p_venue_id uuid, p_category_id uuid, p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'NOM_INVALIDE';
  end if;

  if p_category_id is null then
    insert into public.categories (venue_id, name, sort_order)
    values (p_venue_id, v_name, coalesce((select max(sort_order) + 1 from public.categories where venue_id = p_venue_id), 1))
    returning id into v_id;
  else
    update public.categories set name = v_name
     where id = p_category_id and venue_id = p_venue_id
    returning id into v_id;
    if v_id is null then
      raise exception 'INTROUVABLE';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_category(p_category_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.categories where id = p_category_id;
  if v_venue is null or not private.is_owner(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  if exists (select 1 from public.products where category_id = p_category_id) then
    raise exception 'CATEGORIE_NON_VIDE';
  end if;
  delete from public.categories where id = p_category_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Carte : produits
-- p_product = {"id": null|uuid, "category_id": uuid, "name": "...", "description": "...",
--              "price_cents": 650, "image_url": null|"https://...", "is_available": true}
-- ---------------------------------------------------------------------
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
  v_old_category uuid;
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
  return v_id;
end;
$$;

create or replace function public.admin_set_product_available(p_product_id uuid, p_available boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.products where id = p_product_id;
  if v_venue is null or not private.is_owner(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  update public.products set is_available = coalesce(p_available, true) where id = p_product_id;
end;
$$;

-- Supprimer un produit ne touche pas aux anciennes commandes (nom et prix y sont recopiés)
create or replace function public.admin_delete_product(p_product_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.products where id = p_product_id;
  if v_venue is null or not private.is_owner(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  delete from public.products where id = p_product_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Tables et cartes NFC
-- ---------------------------------------------------------------------

-- Créer (p_table_id null) ou renommer une table. Le lien secret ne change pas.
create or replace function public.admin_save_table(p_venue_id uuid, p_table_id uuid, p_label text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_id    uuid;
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  if char_length(v_label) not between 1 and 40 then
    raise exception 'NOM_INVALIDE';
  end if;

  if p_table_id is null then
    insert into public.venue_tables (venue_id, label, sort_order)
    values (p_venue_id, v_label, coalesce((select max(sort_order) + 1 from public.venue_tables where venue_id = p_venue_id), 1))
    returning id into v_id;
  else
    update public.venue_tables set label = v_label
     where id = p_table_id and venue_id = p_venue_id
    returning id into v_id;
    if v_id is null then
      raise exception 'INTROUVABLE';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_set_table_active(p_table_id uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.venue_tables where id = p_table_id;
  if v_venue is null or not private.is_owner(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  update public.venue_tables set is_active = coalesce(p_active, true) where id = p_table_id;
end;
$$;

-- Supprimer une table : sa carte NFC cesse de fonctionner ; l'historique des commandes est conservé.
create or replace function public.admin_delete_table(p_table_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.venue_tables where id = p_table_id;
  if v_venue is null or not private.is_owner(v_venue) then
    raise exception 'INTROUVABLE';
  end if;
  delete from public.venue_tables where id = p_table_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Réglages du bar
-- p_settings = {"name": "...", "logo_url": null|"https://...",
--               "pay_to_staff_enabled": true, "online_payment_enabled": true}
-- ---------------------------------------------------------------------
create or replace function public.admin_update_settings(p_venue_id uuid, p_settings jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_settings->>'name', ''));
  v_logo text := nullif(btrim(coalesce(p_settings->>'logo_url', '')), '');
begin
  if not private.is_owner(p_venue_id) then
    raise exception 'ACCES_REFUSE';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'NOM_INVALIDE';
  end if;
  if v_logo is not null and (v_logo !~ '^https?://' or char_length(v_logo) > 500) then
    raise exception 'IMAGE_INVALIDE';
  end if;

  update public.venues
     set name                   = v_name,
         logo_url               = v_logo,
         pay_to_staff_enabled   = coalesce((p_settings->>'pay_to_staff_enabled')::boolean, pay_to_staff_enabled),
         online_payment_enabled = coalesce((p_settings->>'online_payment_enabled')::boolean, online_payment_enabled)
   where id = p_venue_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits : réservé aux personnes connectées (chaque fonction vérifie le rôle de gérant)
-- ---------------------------------------------------------------------
revoke execute on function private.move_row(regclass, text, uuid, text, uuid, int) from public, anon, authenticated;

revoke execute on function public.admin_get_data(uuid)                         from public, anon;
revoke execute on function public.admin_get_day(uuid, date)                    from public, anon;
revoke execute on function public.admin_move(text, uuid, int)                  from public, anon;
revoke execute on function public.admin_save_category(uuid, uuid, text)        from public, anon;
revoke execute on function public.admin_delete_category(uuid)                  from public, anon;
revoke execute on function public.admin_save_product(uuid, jsonb)              from public, anon;
revoke execute on function public.admin_set_product_available(uuid, boolean)   from public, anon;
revoke execute on function public.admin_delete_product(uuid)                   from public, anon;
revoke execute on function public.admin_save_table(uuid, uuid, text)           from public, anon;
revoke execute on function public.admin_set_table_active(uuid, boolean)        from public, anon;
revoke execute on function public.admin_delete_table(uuid)                     from public, anon;
revoke execute on function public.admin_update_settings(uuid, jsonb)           from public, anon;

grant execute on function public.admin_get_data(uuid)                          to authenticated, service_role;
grant execute on function public.admin_get_day(uuid, date)                     to authenticated, service_role;
grant execute on function public.admin_move(text, uuid, int)                   to authenticated, service_role;
grant execute on function public.admin_save_category(uuid, uuid, text)         to authenticated, service_role;
grant execute on function public.admin_delete_category(uuid)                   to authenticated, service_role;
grant execute on function public.admin_save_product(uuid, jsonb)               to authenticated, service_role;
grant execute on function public.admin_set_product_available(uuid, boolean)    to authenticated, service_role;
grant execute on function public.admin_delete_product(uuid)                    to authenticated, service_role;
grant execute on function public.admin_save_table(uuid, uuid, text)            to authenticated, service_role;
grant execute on function public.admin_set_table_active(uuid, boolean)         to authenticated, service_role;
grant execute on function public.admin_delete_table(uuid)                      to authenticated, service_role;
grant execute on function public.admin_update_settings(uuid, jsonb)            to authenticated, service_role;

commit;
