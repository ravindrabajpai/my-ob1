-- migration 011_proactive_briefings_cron.sql

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Define the cron job to run daily at 9:00 AM UTC
SELECT cron.schedule(
  'proactive_briefings_daily', -- name of the cron job
  '0 9 * * *',                 -- cron schedule (9:00 AM UTC daily)
  $$
    DO $proc$
    DECLARE
      p_ref text := (SELECT value FROM public.system_config WHERE key = 'project_ref');
      p_key text := (SELECT value FROM public.system_config WHERE key = 'service_role_key');
    BEGIN
      PERFORM net.http_post(
          url:=coalesce(
            'https://' || p_ref || '.supabase.co/functions/v1/proactive-briefings',
            'http://kong:8000/functions/v1/proactive-briefings'
          ),
          headers:=jsonb_build_object(
              'Authorization', 'Bearer ' || coalesce(p_key, ''),
              'Content-Type', 'application/json'
          ),
          body:='{}'::jsonb
      );
    END $proc$;
  $$
);
