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
    SELECT net.http_post(
        url:='https://' || current_setting('custom.project_ref', true) || '.supabase.co/functions/v1/automated-synthesis',
        headers:=jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('custom.service_role_key', true),
            'Content-Type', 'application/json'
        ),
        body:='{}'::jsonb
    );
  $$
);
