-- =====================================================================
--  COMMANDE À TABLE — 9 : GESTION DES BARS PAR L'AGENCE
--
--  À exécuter une fois, APRÈS les scripts 1 à 8 :
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : « Success. No rows returned ».
--  (On peut le relancer sans risque.)
--
--  - Les comptes de l'agence ont accès à TOUS les bars (espace gérant,
--    écran du bar, stocks…), y compris un bar suspendu.
--  - L'agence crée les bars, leurs comptes (gérant, équipe), change les
--    rôles, retire les accès.
--  - Suspendre un bar (abonnement arrêté) : les clients ne peuvent plus
--    commander ni appeler, l'équipe ne peut plus se connecter à l'écran du
--    bar ni à l'espace gérant. Les données sont conservées ; on peut le
--    réactiver à tout moment.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Suspension d'un bar
-- ---------------------------------------------------------------------
alter table public.venues add column if not exists suspended_at timestamptz;
alter table public.venues add column if not exists suspended_note text;
do $$
begin
  alter table public.venues add constraint venues_suspended_note_check
    check (suspended_note is null or char_length(suspended_note) <= 200);
exception when duplicate_object then null;
end;
$$;

create or replace function private.venue_suspended(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select v.suspended_at is not null from public.venues v where v.id = p_venue_id), false);
$$;

-- Personnel : son bar, sauf s'il est suspendu. Agence : tous les bars.
-- (Ces deux fonctions protègent toutes les tables et toutes les pages du personnel.)
create or replace function private.is_member(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_agency() or (
    exists (
      select 1 from public.venue_members m
      where m.venue_id = p_venue_id and m.user_id = (select auth.uid())
    )
    and not private.venue_suspended(p_venue_id)
  );
$$;

create or replace function private.is_owner(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_agency() or (
    exists (
      select 1 from public.venue_members m
      where m.venue_id = p_venue_id and m.user_id = (select auth.uid()) and m.role = 'owner'
    )
    and not private.venue_suspended(p_venue_id)
  );
$$;

-- Bars de la personne connectée (l'agence les voit tous, comme gérante)
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
    'orders_paused', v.orders_paused,
    'role', coalesce(m.role::text, 'owner'),
    'suspended', v.suspended_at is not null
  ) order by v.name), '[]'::jsonb)
  from public.venues v
  left join public.venue_members m on m.venue_id = v.id and m.user_id = (select auth.uid())
  where m.user_id is not null or private.is_agency();
$$;

-- Bar suspendu : aucune nouvelle commande ni aucun appel, d'où qu'ils viennent
create or replace function private.block_suspended_venue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.venue_suspended(new.venue_id) then
    raise exception 'BAR_SUSPENDU';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_block_suspended on public.orders;
create trigger orders_block_suspended before insert on public.orders
  for each row execute function private.block_suspended_venue();
drop trigger if exists table_calls_block_suspended on public.table_calls;
create trigger table_calls_block_suspended before insert on public.table_calls
  for each row execute function private.block_suspended_venue();

-- Carte d'un client : le bar est-il suspendu ? (null : lien inconnu)
create or replace function public.get_table_venue_suspended(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select v.suspended_at is not null
  from public.venue_tables t
  join public.venues v on v.id = t.venue_id
  where t.token = p_token;
$$;


-- ---------------------------------------------------------------------
-- Agence : les bars
-- ---------------------------------------------------------------------
create or replace function private.require_agency()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_agency() then
    raise exception 'ACCES_REFUSE';
  end if;
end;
$$;

-- Liste des bars avec leur activité des 30 derniers jours
create or replace function public.agency_get_venues()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id,
      'name', v.name,
      'created_at', v.created_at,
      'suspended_at', v.suspended_at,
      'suspended_note', v.suspended_note,
      'orders_paused', v.orders_paused,
      'tables', (select count(*) from public.venue_tables t where t.venue_id = v.id and t.is_active),
      'members', (select count(*) from public.venue_members m where m.venue_id = v.id),
      'owners', (
        select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb)
        from public.venue_members m join auth.users u on u.id = m.user_id
        where m.venue_id = v.id and m.role = 'owner'
      ),
      'orders_30d', (
        select count(*) from public.orders o
        where o.venue_id = v.id and o.status not in ('cancelled', 'pending_payment')
          and o.created_at > now() - interval '30 days'
      ),
      'revenue_30d_cents', (
        select coalesce(sum(o.total_cents), 0) from public.orders o
        where o.venue_id = v.id and o.status not in ('cancelled', 'pending_payment')
          and o.created_at > now() - interval '30 days'
      ),
      'last_order_at', (
        select max(o.created_at) from public.orders o
        where o.venue_id = v.id and o.status <> 'pending_payment'
      )
    ) order by v.suspended_at is not null, lower(v.name))
    from public.venues v
  ), '[]'::jsonb);
end;
$$;

-- Un bar et ses comptes
create or replace function public.agency_get_venue(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
begin
  perform private.require_agency();
  select * into v_venue from public.venues where id = p_venue_id;
  if not found then
    raise exception 'INTROUVABLE';
  end if;
  return jsonb_build_object(
    'id', v_venue.id,
    'name', v_venue.name,
    'created_at', v_venue.created_at,
    'suspended_at', v_venue.suspended_at,
    'suspended_note', v_venue.suspended_note,
    'tables', (select count(*) from public.venue_tables t where t.venue_id = v_venue.id and t.is_active),
    'orders_30d', (
      select count(*) from public.orders o
      where o.venue_id = v_venue.id and o.status not in ('cancelled', 'pending_payment')
        and o.created_at > now() - interval '30 days'
    ),
    'revenue_30d_cents', (
      select coalesce(sum(o.total_cents), 0) from public.orders o
      where o.venue_id = v_venue.id and o.status not in ('cancelled', 'pending_payment')
        and o.created_at > now() - interval '30 days'
    ),
    'last_order_at', (
      select max(o.created_at) from public.orders o
      where o.venue_id = v_venue.id and o.status <> 'pending_payment'
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'role', m.role,
        'added_at', m.created_at,
        'last_sign_in_at', u.last_sign_in_at
      ) order by m.role, lower(u.email))
      from public.venue_members m
      join auth.users u on u.id = m.user_id
      where m.venue_id = v_venue.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Nouveau bar (adresse interne tirée du nom : « Le Zinc » → le-zinc)
create or replace function public.agency_create_venue(p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_n    int := 1;
  v_id   uuid;
begin
  perform private.require_agency();
  if char_length(v_name) not between 1 and 80 then
    raise exception 'NOM_INVALIDE';
  end if;
  v_base := translate(replace(replace(lower(v_name), 'œ', 'oe'), 'æ', 'ae'),
                      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy');
  v_base := left(btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-'), 50);
  if char_length(v_base) < 2 then
    v_base := 'bar';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.venues where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  insert into public.venues (slug, name) values (v_slug, v_name) returning id into v_id;
  return v_id;
end;
$$;

-- Suspendre (abonnement arrêté) ou réactiver un bar
create or replace function public.agency_set_suspended(p_venue_id uuid, p_suspended boolean, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  update public.venues
     set suspended_at   = case when p_suspended then coalesce(suspended_at, now()) end,
         suspended_note = case when p_suspended then left(nullif(btrim(coalesce(p_note, '')), ''), 200) end
   where id = p_venue_id;
  if not found then
    raise exception 'INTROUVABLE';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Agence : les comptes des bars
-- (la création du compte et le mot de passe passent par le serveur du site)
-- ---------------------------------------------------------------------

-- Compte existant pour cet email ?
create or replace function public.agency_find_user(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  return (select id from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1);
end;
$$;

-- Compte dont l'agence peut changer le mot de passe : membre d'au moins un bar,
-- et pas un autre compte de l'agence.
create or replace function public.agency_can_manage_user(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  return exists (select 1 from public.venue_members where user_id = p_user_id)
     and not exists (select 1 from private.platform_admins where user_id = p_user_id);
end;
$$;

-- Donner l'accès à un bar (ou changer le rôle : 'owner' gérant, 'staff' équipe)
create or replace function public.agency_set_member(p_venue_id uuid, p_user_id uuid, p_role public.member_role)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  if not exists (select 1 from public.venues where id = p_venue_id)
     or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'INTROUVABLE';
  end if;
  if exists (select 1 from private.platform_admins where user_id = p_user_id) then
    raise exception 'COMPTE_AGENCE';
  end if;
  insert into public.venue_members (venue_id, user_id, role)
  values (p_venue_id, p_user_id, coalesce(p_role, 'staff'))
  on conflict (venue_id, user_id) do update set role = excluded.role;
end;
$$;

-- Retirer l'accès d'un compte à un bar
create or replace function public.agency_remove_member(p_venue_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_agency();
  delete from public.venue_members where venue_id = p_venue_id and user_id = p_user_id;
  if not found then
    raise exception 'INTROUVABLE';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function private.venue_suspended(uuid)                       from public, anon;
revoke execute on function private.block_suspended_venue()                     from public, anon, authenticated;
revoke execute on function private.require_agency()                            from public, anon;
grant  execute on function private.venue_suspended(uuid)                       to authenticated, service_role;
grant  execute on function private.require_agency()                            to authenticated, service_role;

revoke execute on function public.get_table_venue_suspended(text)              from public, anon, authenticated;
grant  execute on function public.get_table_venue_suspended(text)              to service_role;

revoke execute on function public.agency_get_venues()                          from public, anon;
revoke execute on function public.agency_get_venue(uuid)                       from public, anon;
revoke execute on function public.agency_create_venue(text)                    from public, anon;
revoke execute on function public.agency_set_suspended(uuid, boolean, text)    from public, anon;
revoke execute on function public.agency_find_user(text)                       from public, anon;
revoke execute on function public.agency_can_manage_user(uuid)                 from public, anon;
revoke execute on function public.agency_set_member(uuid, uuid, public.member_role) from public, anon;
revoke execute on function public.agency_remove_member(uuid, uuid)             from public, anon;
grant  execute on function public.agency_get_venues()                          to authenticated, service_role;
grant  execute on function public.agency_get_venue(uuid)                       to authenticated, service_role;
grant  execute on function public.agency_create_venue(text)                    to authenticated, service_role;
grant  execute on function public.agency_set_suspended(uuid, boolean, text)    to authenticated, service_role;
grant  execute on function public.agency_find_user(text)                       to authenticated, service_role;
grant  execute on function public.agency_can_manage_user(uuid)                 to authenticated, service_role;
grant  execute on function public.agency_set_member(uuid, uuid, public.member_role) to authenticated, service_role;
grant  execute on function public.agency_remove_member(uuid, uuid)             to authenticated, service_role;

commit;
