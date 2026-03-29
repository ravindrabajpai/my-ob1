-- Migration 006: Automated Synthesis
-- Creates table to store weekly cognitive digests

CREATE TABLE IF NOT EXISTS public.synthesis_reports (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    content TEXT NOT NULL,
    date_range_start TIMESTAMPTZ NOT NULL,
    date_range_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: To execute the synthesis function on a schedule via pg_cron, you would run:
-- CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
-- SELECT cron.schedule(
--   'weekly-synthesis',
--   '0 17 * * 5', -- Every Friday at 17:00
--   $$
--   SELECT net.http_post(
--       url:='https://your-project-ref.supabase.co/functions/v1/automated-synthesis'
--   );
--   $$
-- );
