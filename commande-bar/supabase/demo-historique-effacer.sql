-- =====================================================================
--  COMMANDE À TABLE — EFFACER L'HISTORIQUE DE DÉMONSTRATION
--
--  Retire les commandes fictives ajoutées par supabase/demo-historique.sql
--  (et les appels des tables passés du bar de démo). Les vraies commandes
--  et les autres bars ne sont pas touchés.
--
--  SQL Editor → New query → coller TOUT ce fichier → « Run ».
-- =====================================================================

begin;

delete from public.orders o
using public.venues v
where v.id = o.venue_id
  and v.slug = 'comptoir-demo'
  and o.stripe_payment_intent_id = 'demo-historique';

delete from public.table_calls c
using public.venues v
where v.id = c.venue_id
  and v.slug = 'comptoir-demo'
  and c.handled_at is not null
  and c.created_at < ((private.business_date(v)::timestamp + make_interval(hours => v.day_starts_at)) at time zone v.timezone);

commit;

select 'Historique de démonstration effacé' as "résultat";
