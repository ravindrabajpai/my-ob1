-- Migration: 019_obsidian_wiki_compiler
-- Description: Creates the `entity_wikis` table to cache LLM-generated markdown dossiers for entities and learning topics, and schedules the cron job to run the compiler Edge Function.

-- 1. Create the `entity_wikis` cache table
CREATE TABLE IF NOT EXISTS public.entity_wikis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id UUID NOT NULL, -- FK to either entities.id or learning_topics.id
    reference_type TEXT NOT NULL CHECK (reference_type IN ('entity', 'learning_topic')),
    name TEXT NOT NULL, -- Slug or display name
    markdown_content TEXT NOT NULL,
    last_compiled_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add an index for quick lookup by reference
CREATE INDEX IF NOT EXISTS idx_entity_wikis_reference ON public.entity_wikis (reference_type, reference_id);

-- 3. Enable Global Row-Level Security on the new table
ALTER TABLE public.entity_wikis ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
-- Allow service_role full access
CREATE POLICY "Allow service role full access to entity_wikis"
    ON public.entity_wikis
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Allow anon (MCP/Edge Functions bypassing via service role, but just in case we have custom read logic)
-- Since my-ob1 relies on REST blocks and uses Edge Functions with service role keys, we keep this locked down.

-- 5. Schedule the cron job to trigger the Edge Function automatically (e.g., Every Sunday at 2 AM)
-- Assuming pg_cron and pg_net are enabled (from previous phases)
DO $$
DECLARE
    service_role_key TEXT;
    project_url TEXT;
BEGIN
    -- Fetch credentials from the system_config table
    SELECT value INTO service_role_key FROM public.system_config WHERE key = 'service_role_key';
    SELECT value INTO project_url FROM public.system_config WHERE key = 'project_ref';
    
    -- We assume the URL is https://<project_ref>.supabase.co
    -- For local development or different domains, this might need to be adjusted,
    -- but this follows the pattern used in previous cron setups.
    
    -- Only schedule if credentials are found
    IF service_role_key IS NOT NULL AND project_url IS NOT NULL THEN
        -- Schedule the entity-wiki-generator to run weekly on Sunday at 02:00 AM
        PERFORM cron.schedule(
            'obsidian-wiki-compiler-cron',
            '0 2 * * 0', -- Every Sunday at 2:00 AM
            format(
                $cron$
                SELECT net.http_post(
                    url := 'https://%s.supabase.co/functions/v1/entity-wiki-generator',
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
