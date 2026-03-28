-- Phase 4: Add threads concept for grouping memories
SET search_path TO public, extensions;

-- Active streams of work or life logistics
CREATE TABLE public.threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Join table linking memories to threads
CREATE TABLE public.memory_threads (
    memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE,
    PRIMARY KEY (memory_id, thread_id)
);
