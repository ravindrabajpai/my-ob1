-- Migration 013: Enable Automated Synthesis Cron
-- Schedules the weekly synthesis to run every Friday at 5:00 PM UTC

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Define the cron job for weekly synthesis
-- Schedule: '0 17 * * 5' (Every Friday at 17:00 UTC)
SELECT cron.schedule(
  'weekly_synthesis_report',
  '0 17 * * 5',
  $$
    DO $proc$
    DECLARE
      p_ref text := (SELECT value FROM public.system_config WHERE key = 'project_ref');
      p_key text := (SELECT value FROM public.system_config WHERE key = 'service_role_key');
    BEGIN
      PERFORM net.http_post(
          url:=coalesce(
            'https://' || p_ref || '.supabase.co/functions/v1/automated-synthesis',
            'http://kong:8000/functions/v1/automated-synthesis'
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
