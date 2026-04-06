-- Migration 007: Artifact Processing and RLS Lockdown

SET search_path TO public, extensions;

-- 1. Enable RLS on all tables (Global RLS Lockdown)
-- No policies are created, meaning external REST/GraphQL API access is blocked.
-- Edge Functions bypass this using the SUPABASE_SERVICE_ROLE_KEY.
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals_and_principles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthesis_reports ENABLE ROW LEVEL SECURITY;

-- 2. Add embedding column to artifacts
ALTER TABLE public.artifacts ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Create HNSW index on artifacts.embedding
CREATE INDEX IF NOT EXISTS artifacts_embedding_hnsw_idx 
ON public.artifacts USING hnsw (embedding vector_cosine_ops);

-- 4. Set up database webhook for artifacts (pg_net)
CREATE OR REPLACE FUNCTION public.trigger_process_artifact()
RETURNS TRIGGER AS $$
DECLARE
  function_url text;
BEGIN
  -- Default to local kong gateway for Edge Functions, but allow override via app.settings
  function_url := coalesce(
    current_setting('app.process_artifact_url', true), 
    'http://kong:8000/functions/v1/process-artifact'
  );

  -- Call the function via pg_net
  PERFORM net.http_post(
      url := function_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object(
          'type', 'INSERT',
          'table', 'artifacts',
          'record', row_to_json(NEW)
      )::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS artifact_insert_trigger ON public.artifacts;

-- Create the trigger
CREATE TRIGGER artifact_insert_trigger
AFTER INSERT ON public.artifacts
FOR EACH ROW
WHEN (NEW.embedding IS NULL)
EXECUTE FUNCTION public.trigger_process_artifact();

-- 5. Overhaul match_memories to perform federated search
DROP FUNCTION IF EXISTS public.match_memories(vector(1536), float, int, jsonb);

CREATE OR REPLACE FUNCTION public.match_memories(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id uuid,
    content text,
    type text,
    similarity float,
    created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH memory_scores AS (
        -- Direct memory matches
        SELECT 
            m.id,
            m.content,
            m.type,
            1 - (m.embedding <=> query_embedding) AS similarity,
            m.created_at
        FROM public.memories m
        WHERE m.embedding IS NOT NULL AND 1 - (m.embedding <=> query_embedding) > match_threshold
        
        UNION ALL
        
        -- Artifact matches, mapping back to memory
        SELECT 
            m.id,
            m.content,
            m.type,
            1 - (a.embedding <=> query_embedding) AS similarity,
            m.created_at
        FROM public.artifacts a
        JOIN public.memories m ON a.memory_id = m.id
        WHERE a.embedding IS NOT NULL 
          AND 1 - (a.embedding <=> query_embedding) > match_threshold
    ),
    grouped_scores AS (
        SELECT 
            ms.id,
            ms.content,
            ms.type,
            -- Take the best score among the base memory and all its attachments
            MAX(ms.similarity) as max_similarity,
            MIN(ms.created_at) as created_at
        FROM memory_scores ms
        GROUP BY ms.id, ms.content, ms.type
    )
    SELECT 
        gs.id,
        gs.content,
        gs.type,
        gs.max_similarity AS similarity,
        gs.created_at
    FROM grouped_scores gs
    -- Optional type filtering
    WHERE (filter->>'type' IS NULL OR gs.type = filter->>'type')
    ORDER BY gs.max_similarity DESC
    LIMIT match_count;
END;
$$;
