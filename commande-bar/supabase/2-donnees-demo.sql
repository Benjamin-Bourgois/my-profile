-- =====================================================================
--  COMMANDE À TABLE — 2/2 : BAR DE DÉMONSTRATION « Le Comptoir de Démo »
--
--  AVANT de lancer ce script, crée les 2 comptes du personnel dans
--  Supabase → Authentication → Users → « Add user » → « Create new user »
--  (coche « Auto Confirm User ») :
--     - gerant@comptoir-demo.fr   (le gérant : accès à l'admin)
--     - bar@comptoir-demo.fr      (le personnel : écran du bar)
--
--  Ensuite : SQL Editor → New query → coller TOUT ce fichier → « Run ».
--  Résultat attendu : la liste des 10 tables avec leur lien.
-- =====================================================================

begin;

do $$
declare
  v_venue     uuid;
  v_owner     uuid;
  v_staff     uuid;
  c_bieres    uuid;
  c_cocktails uuid;
  c_softs     uuid;
  c_grignoter uuid;
begin
  select id into v_owner from auth.users where lower(email) = 'gerant@comptoir-demo.fr';
  select id into v_staff from auth.users where lower(email) = 'bar@comptoir-demo.fr';
  if v_owner is null or v_staff is null then
    raise exception 'Crée d''abord les comptes gerant@comptoir-demo.fr et bar@comptoir-demo.fr (Authentication → Users → Add user), puis relance ce script.';
  end if;

  -- Le bar
  insert into public.venues (slug, name)
  values ('comptoir-demo', 'Le Comptoir de Démo')
  returning id into v_venue;

  -- Son personnel
  insert into public.venue_members (venue_id, user_id, role) values
    (v_venue, v_owner, 'owner'),
    (v_venue, v_staff, 'staff');

  -- 10 tables (chacune reçoit automatiquement un lien secret)
  insert into public.venue_tables (venue_id, label, sort_order)
  select v_venue, 'Table ' || n, n from generate_series(1, 10) as n;

  -- La carte
  insert into public.categories (venue_id, name, sort_order) values (v_venue, 'Bières', 1)      returning id into c_bieres;
  insert into public.categories (venue_id, name, sort_order) values (v_venue, 'Cocktails', 2)   returning id into c_cocktails;
  insert into public.categories (venue_id, name, sort_order) values (v_venue, 'Softs', 3)       returning id into c_softs;
  insert into public.categories (venue_id, name, sort_order) values (v_venue, 'À grignoter', 4) returning id into c_grignoter;

  insert into public.products (venue_id, category_id, name, description, price_cents, sort_order, is_available) values
    (v_venue, c_bieres,    'Demi blonde (25 cl)',        'Notre blonde pression, légère et rafraîchissante',            350, 1, true),
    (v_venue, c_bieres,    'Pinte blonde (50 cl)',       'La même, en grand format',                                    650, 2, true),
    (v_venue, c_bieres,    'Blanche (25 cl)',            'Notes d''agrumes et de coriandre',                            400, 3, true),
    (v_venue, c_bieres,    'IPA artisanale (33 cl)',     'Brasserie locale, houblonnée et fruitée',                     650, 4, true),
    (v_venue, c_cocktails, 'Mojito',                     'Rhum, menthe fraîche, citron vert, sucre de canne',           900, 1, true),
    (v_venue, c_cocktails, 'Spritz',                     'Apéritif italien, prosecco, eau gazeuse, orange',             850, 2, true),
    (v_venue, c_cocktails, 'Gin tonic',                  'Gin, tonic premium, concombre',                               900, 3, true),
    (v_venue, c_cocktails, 'Espresso martini',           'Vodka, café, liqueur de café',                               1000, 4, false),
    (v_venue, c_softs,     'Cola (33 cl)',               null,                                                          350, 1, true),
    (v_venue, c_softs,     'Limonade artisanale',        'Citron pressé, peu sucrée',                                   400, 2, true),
    (v_venue, c_softs,     'Jus de pomme bio',           'Pur jus de Normandie',                                        350, 3, true),
    (v_venue, c_softs,     'Virgin mojito',              'Le mojito, sans alcool',                                      600, 4, true),
    (v_venue, c_grignoter, 'Planche de charcuterie',     'Jambon sec, saucisson, coppa, cornichons, pain de campagne', 1400, 1, true),
    (v_venue, c_grignoter, 'Planche de fromages',        'Comté, tomme, chèvre frais, confiture de figues',            1300, 2, true),
    (v_venue, c_grignoter, 'Planche mixte',              'Le meilleur des deux, pour 3-4 personnes',                   1800, 3, true),
    (v_venue, c_grignoter, 'Olives marinées',            'Olives vertes et noires, herbes de Provence',                 450, 4, true);
end;
$$;

commit;

-- Les liens des tables (ajoute ton adresse Vercel devant, ex. https://commande-bar.vercel.app/t/…)
select t.label as "Table", '/t/' || t.token as "Lien"
from public.venue_tables t
join public.venues v on v.id = t.venue_id
where v.slug = 'comptoir-demo'
order by t.sort_order;
