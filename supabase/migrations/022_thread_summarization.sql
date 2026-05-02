-- Migration: 022_thread_summarization
-- Description: Extends entity_wikis and memory_edges to support thread summarization (Phase 23) and schedules the background summarizer.

-- 1. Extend entity_wikis.reference_type CHECK constraint
-- We drop and recreate to add 'thread'
ALTER TABLE public.entity_wikis DROP CONSTRAINT IF EXISTS entity_wikis_reference_type_check;
ALTER TABLE public.entity_wikis ADD CONSTRAINT entity_wikis_reference_type_check
    CHECK (reference_type IN ('entity', 'learning_topic', 'thread'));

-- 2. Add summary_memory_id FK to entity_wikis
-- This links the cached wiki entry to the summary memory in the core table
ALTER TABLE public.entity_wikis
    ADD COLUMN IF NOT EXISTS summary_memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL;

-- 3. Extend memory_edges.relation CHECK constraint
-- We drop and recreate to add 'derived_from'
ALTER TABLE public.memory_edges DROP CONSTRAINT IF EXISTS memory_edges_relation_check;
ALTER TABLE public.memory_edges ADD CONSTRAINT memory_edges_relation_check
    CHECK (relation IN ('supports', 'contradicts', 'evolved_into', 'supersedes', 'depends_on', 'related_to', 'derived_from'));

-- 4. Schedule the cron job to trigger the thread-summarizer Edge Function
-- Runs every Tuesday at 3:00 AM UTC
DO $$
DECLARE
    service_role_key TEXT;
    project_url TEXT;
BEGIN
    -- Fetch credentials from the system_config table
    SELECT value INTO service_role_key FROM public.system_config WHERE key = 'service_role_key';
    SELECT value INTO project_url FROM public.system_config WHERE key = 'project_ref';
    
    -- Only schedule if credentials are found
    IF service_role_key IS NOT NULL AND project_url IS NOT NULL THEN
        PERFORM cron.schedule(
            'thread-summarizer-cron',
            '0 3 * * 2', -- Every Tuesday at 3:00 AM
            format(
                $cron$
                SELECT net.http_post(
                    url := 'https://%s.supabase.co/functions/v1/thread-summarizer',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer %s'
                    )
                );
                $cron$,
                project_url,
                service_role_key
            )
        );
    ELSE
        RAISE NOTICE 'Skipping pg_cron schedule creation: missing service_role_key or project_ref in system_config.';
    END IF;
END $$;
