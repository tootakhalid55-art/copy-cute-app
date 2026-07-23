
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule previous version if any
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'ap-intake-processor' LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'ap-intake-processor',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--wwiclujwhdejdijynkht.lovable.app/api/public/hooks/ap-intake-process?batch=3',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_5l4d8bF5opZPEQ7DPzxpWA_cm3d3HE9'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
