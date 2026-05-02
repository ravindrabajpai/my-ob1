-- Migration: 020_typed_edge_classifier
-- Phase 21: Typed Edge Classifier (Reasoning Graph)
-- Description: Creates the `memory_edges` table and `memory_edges_upsert` RPC to store
--              typed logical relationships between memories (supports, contradicts, evolved_into,
--              supersedes, depends_on, related_to), upgrading the graph from probabilistic
--              semantic similarity to explicit logical reasoning links.

-- 1. Create the memory_edges table
CREATE TABLE IF NOT EXISTS public.memory_edges (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_memory_id      UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
    to_memory_id        UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
    relation            TEXT NOT NULL,
    direction           TEXT NOT NULL DEFAULT 'A_to_B',
    confidence          NUMERIC(4, 2) NOT NULL,
    support_count       INT NOT NULL DEFAULT 1,
    classifier_version  TEXT NOT NULL DEFAULT 'typed-edge-classifier-1.0.0',
    valid_from          DATE,
    valid_until         DATE,
    metadata            JSONB,  -- { rationale: string, classifier_model: string }
    created_at          TIMESTAMPTZ DEFAULT now(),

    -- Enforce that each (from, to, relation) triplet is unique; ON CONFLICT handled by RPC
    UNIQUE (from_memory_id, to_memory_id, relation),

    -- Self-loops are meaningless
    CONSTRAINT memory_edges_no_self_loop CHECK (from_memory_id <> to_memory_id),

    -- Direction must be one of the three canonical values
    CONSTRAINT memory_edges_direction_check
        CHECK (direction IN ('A_to_B', 'B_to_A', 'symmetric')),

    -- Relation must be one of the six typed-edge vocabulary labels
    CONSTRAINT memory_edges_relation_check
        CHECK (relation IN ('supports', 'contradicts', 'evolved_into', 'supersedes', 'depends_on', 'related_to'))
);

-- 2. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_memory_edges_from    ON public.memory_edges (from_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to      ON public.memory_edges (to_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_relation ON public.memory_edges (relation);

-- 3. Enable Row-Level Security (matches the global lockdown from migration 007)
ALTER TABLE public.memory_edges ENABLE ROW LEVEL SECURITY;

-- Service role gets full access; all other access (REST/GraphQL anon) is blocked
CREATE POLICY "Allow service role full access to memory_edges"
    ON public.memory_edges
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- 4. memory_edges_upsert RPC
-- Handles idempotent inserts: ON CONFLICT bumps support_count, takes max confidence,
-- and refreshes temporal bounds (GREATEST for valid_until, LEAST for valid_from).
-- Called by both the Edge Function and the local skill script.
-- Uses SECURITY DEFINER so the Edge Function (via service_role key) can write rows
-- regardless of RLS policies on the underlying table.
CREATE OR REPLACE FUNCTION public.memory_edges_upsert(
    p_from_memory_id    UUID,
    p_to_memory_id      UUID,
    p_relation          TEXT,
    p_confidence        NUMERIC,
    p_support_count     INT      DEFAULT 1,
    p_classifier_version TEXT    DEFAULT 'typed-edge-classifier-1.0.0',
    p_valid_from        DATE     DEFAULT NULL,
    p_valid_until       DATE     DEFAULT NULL,
    p_metadata          JSONB    DEFAULT NULL
)
RETURNS public.memory_edges
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result public.memory_edges;
BEGIN
    INSERT INTO public.memory_edges (
        from_memory_id,
        to_memory_id,
        relation,
        direction,
        confidence,
        support_count,
        classifier_version,
        valid_from,
        valid_until,
        metadata
    )
    VALUES (
        p_from_memory_id,
        p_to_memory_id,
        p_relation,
        -- Direction is embedded in p_metadata for display; the canonical storage is
        -- in the from/to ordering and the metadata JSONB field.
        COALESCE(p_metadata ->> 'direction', 'A_to_B'),
        p_confidence,
        p_support_count,
        p_classifier_version,
        p_valid_from,
        p_valid_until,
        p_metadata
    )
    ON CONFLICT (from_memory_id, to_memory_id, relation) DO UPDATE
        SET
            support_count       = public.memory_edges.support_count + 1,
            confidence          = GREATEST(public.memory_edges.confidence, EXCLUDED.confidence),
            -- Widen the temporal window: earlier start, later end
            valid_from          = LEAST(public.memory_edges.valid_from, EXCLUDED.valid_from),
            valid_until         = GREATEST(public.memory_edges.valid_until, EXCLUDED.valid_until),
            metadata            = EXCLUDED.metadata,
            classifier_version  = EXCLUDED.classifier_version
    RETURNING * INTO result;

    RETURN result;
END;
$$;
