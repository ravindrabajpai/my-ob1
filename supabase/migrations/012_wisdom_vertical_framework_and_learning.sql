-- Migration: 012_wisdom_vertical_framework_and_learning.sql

-- 1. Create Learning Topics Table
CREATE TABLE IF NOT EXISTS public.learning_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_name TEXT NOT NULL UNIQUE,
    mastery_status TEXT DEFAULT 'learning',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Join Table for Memories and Topics
CREATE TABLE IF NOT EXISTS public.memory_learning_topics (
    memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.learning_topics(id) ON DELETE CASCADE,
    PRIMARY KEY (memory_id, topic_id)
);

-- 3. Create Learning Milestones Table
CREATE TABLE IF NOT EXISTS public.learning_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID REFERENCES public.learning_topics(id) ON DELETE CASCADE,
    memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable Global RLS on all new tables
ALTER TABLE public.learning_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_learning_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_milestones ENABLE ROW LEVEL SECURITY;
