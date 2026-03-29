-- Migration 005: MCP Mutations Layout
-- Adds status column to goals_and_principles for archiving.
-- Creates `merge_entities` RPC graph deduplication.

ALTER TABLE public.goals_and_principles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Create RPC for safely merging two entities.
CREATE OR REPLACE FUNCTION public.merge_entities(source_id UUID, target_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Handle the memory link transfers
    -- If a memory is linked to the target_id already, this update would hit a unique constraint.
    -- We can just ignore those duplicates with ON CONFLICT DO NOTHING.
    UPDATE public.memory_entities
    SET entity_id = target_id
    WHERE entity_id = source_id;
    
    -- Now safe to delete the source entity, all references are transferred or safely ignored
    DELETE FROM public.entities
    WHERE id = source_id;
EXCEPTION WHEN unique_violation THEN
    -- In PostgreSQL 15+, ON CONFLICT is standard for INSERT, but for UPDATE it's harder.
    -- Better way:
    -- 1. Insert links for the target entity where they existed for the source entity (ignoring duplicates)
    INSERT INTO public.memory_entities (memory_id, entity_id)
    SELECT memory_id, target_id 
    FROM public.memory_entities 
    WHERE entity_id = source_id
    ON CONFLICT (memory_id, entity_id) DO NOTHING;

    -- 2. Delete the old links
    DELETE FROM public.memory_entities WHERE entity_id = source_id;

    -- 3. Delete the source entity
    DELETE FROM public.entities WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Redefine simply without the exception block to be safe and clean:
CREATE OR REPLACE FUNCTION public.merge_entities(source_id UUID, target_id UUID)
RETURNS VOID AS $$
BEGIN
    -- 1. Insert links for the target entity where they existed for the source entity (ignoring duplicates)
    INSERT INTO public.memory_entities (memory_id, entity_id)
    SELECT memory_id, target_id 
    FROM public.memory_entities 
    WHERE entity_id = source_id
    ON CONFLICT (memory_id, entity_id) DO NOTHING;

    -- 2. Delete the old links so the source entity can be deleted
    DELETE FROM public.memory_entities WHERE entity_id = source_id;

    -- 3. Delete the source entity itself
    DELETE FROM public.entities WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
