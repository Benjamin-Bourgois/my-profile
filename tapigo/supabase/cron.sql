-- ==========================================================================
-- Tapigo — Prévision de stock automatique, chaque matin
--
-- À exécuter UNE fois dans Supabase → SQL Editor, après avoir déployé la
-- fonction stock-forecast et défini le secret CRON_SECRET.
-- Remplacez VOTRE_CRON_SECRET par la même valeur que le secret CRON_SECRET.
-- (Pour changer l'heure ou le secret : relancez simplement ce script.)
-- ==========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 4 h 30 UTC = 6 h 30 à Paris l'été, 5 h 30 l'hiver.
-- Une requête par restaurant actif, envoyées en parallèle.
select cron.schedule(
  'tapigo-previsions-stock',
  '30 4 * * *',
  $$
  select net.http_post(
    url     := 'https://frylasycjociuxpcsmvc.supabase.co/functions/v1/stock-forecast',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'VOTRE_CRON_SECRET'),
    body    := jsonb_build_object('restaurant_id', r.id),
    timeout_milliseconds := 120000
  )
  from public.restaurants r
  where r.active;
  $$
);

-- Vérifier : select * from cron.job;
-- Historique : select * from cron.job_run_details order by start_time desc limit 10;
-- Arrêter   : select cron.unschedule('tapigo-previsions-stock');
