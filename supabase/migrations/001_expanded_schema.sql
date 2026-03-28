-- Phase 2: Expanded "Strategist & Mentor" Schema
-- WARNING: This migration unconditionally drops the legacy thoughts table.

-- Drop legacy table and functions
DROP TABLE IF EXISTS public.thoughts CASCADE;
DROP FUNCTION IF EXISTS public.match_thoughts;

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Ensure both schemas are checked for types
SET search_path TO public, extensions;

-- 1. Core Capture Table
CREATE TABLE public.memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    embedding vector(1536),
    type TEXT DEFAULT 'observation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Execution Layer
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Cognitive Layer (Entities)
CREATE TABLE public.entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g., 'Person', 'Project', 'Concept'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(name, type)
);

-- Join table for Memories <-> Entities
CREATE TABLE public.memory_entities (
    memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
    PRIMARY KEY (memory_id, entity_id)
);

-- 4. Multi-modal Assets
CREATE TABLE public.artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
    url TEXT NOT NULL, -- Supabase Storage URL
    mime_type TEXT,
    text_content TEXT, -- OCR or Transcribed text
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Mentorship Layer
CREATE TABLE public.goals_and_principles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g., 'Goal', 'Principle'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.system_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Re-create match_memories RPC (replacing match_thoughts)
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    filter jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
    id uuid,
    content text,
    type text,
    similarity float,
    created_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.type,
        1 - (m.embedding <=> query_embedding) AS similarity,
        m.created_at
    FROM public.memories m
    WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
