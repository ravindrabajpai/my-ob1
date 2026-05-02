-- =============================================================================
-- Migration: 021_enhanced_knowledge_graph.sql
-- Phase 22: Enhanced Knowledge Graph (Explicit Entity Relationships)
--
-- Extends the entities table into a full graph by adding typed, directed,
-- weighted edges between entities. Includes:
--   - entity_edges table with idempotent upsert RPC
--   - traverse_entity_graph() recursive CTE for multi-hop traversal
--   - find_entity_path() BFS shortest-path between two entities
-- =============================================================================

-- =============================================================================
-- Table: entity_edges
-- Directed, typed, weighted relationships between entities (the graph edge layer
-- on top of the existing entities table). Sourced during memory ingestion via
-- the enhanced extractMetadata prompt.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.entity_edges (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity_id    UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    target_entity_id    UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    relationship_type   TEXT NOT NULL,                  -- e.g. works_on, depends_on, uses, knows, manages, related_to
    weight              NUMERIC(4,2) DEFAULT 1.00       -- Confidence/strength [0.00–1.00]
                            CHECK (weight >= 0.00 AND weight <= 1.00),
    properties          JSONB DEFAULT '{}',             -- Flexible metadata: { rationale, classifier_model }
    memory_id           UUID REFERENCES public.memories(id) ON DELETE SET NULL, -- Source memory (traceability)
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,

    -- Same entity pair can have multiple distinct relationship types
    CONSTRAINT unique_entity_edge UNIQUE (source_entity_id, target_entity_id, relationship_type),
    -- No self-loops
    CONSTRAINT no_entity_self_loop CHECK (source_entity_id <> target_entity_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_entity_edges_source
    ON public.entity_edges(source_entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_edges_target
    ON public.entity_edges(target_entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_edges_type
    ON public.entity_edges(relationship_type);

CREATE INDEX IF NOT EXISTS idx_entity_edges_memory
    ON public.entity_edges(memory_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
ALTER TABLE public.entity_edges ENABLE ROW LEVEL SECURITY;

-- Service role bypass for Edge Functions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entity_edges TO service_role;

-- =============================================================================
-- RPC: entity_edges_upsert
-- Idempotent upsert for entity edges. On conflict (same source, target, type):
--   - Takes the MAX weight (never downgrade confidence)
--   - Merges incoming properties JSONB over existing
--   - Optionally updates memory_id to the most recent source
-- =============================================================================
CREATE OR REPLACE FUNCTION public.entity_edges_upsert(
    p_source_entity_id  UUID,
    p_target_entity_id  UUID,
    p_relationship_type TEXT,
    p_weight            NUMERIC DEFAULT 1.00,
    p_properties        JSONB   DEFAULT NULL,
    p_memory_id         UUID    DEFAULT NULL
)
RETURNS public.entity_edges
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result public.entity_edges;
BEGIN
    INSERT INTO public.entity_edges (
        source_entity_id,
        target_entity_id,
        relationship_type,
        weight,
        properties,
        memory_id
    ) VALUES (
        p_source_entity_id,
        p_target_entity_id,
        p_relationship_type,
        COALESCE(p_weight, 1.00),
        COALESCE(p_properties, '{}'::jsonb),
        p_memory_id
    )
    ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
    DO UPDATE SET
        weight     = GREATEST(entity_edges.weight, EXCLUDED.weight),
        properties = entity_edges.properties || COALESCE(EXCLUDED.properties, '{}'::jsonb),
        memory_id  = COALESCE(EXCLUDED.memory_id, entity_edges.memory_id)
    RETURNING * INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.entity_edges_upsert TO service_role;

-- =============================================================================
-- RPC: traverse_entity_graph
-- Recursive CTE multi-hop walk from a starting entity through entity_edges.
-- Returns all reachable entities with depth, path, and relationship type traversed.
-- Adapted from OB1/recipes/ob-graph/schema.sql traverse_graph().
-- =============================================================================
CREATE OR REPLACE FUNCTION public.traverse_entity_graph(
    p_start_entity_id   UUID,
    p_max_depth         INT     DEFAULT 3,
    p_relationship_type TEXT    DEFAULT NULL
)
RETURNS TABLE (
    entity_id           UUID,
    entity_name         TEXT,
    entity_type         TEXT,
    depth               INT,
    path                UUID[],
    via_relationship    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE entity_walk AS (
        -- Base case: start entity
        SELECT
            e.id        AS entity_id,
            e.name      AS entity_name,
            e.type      AS entity_type,
            0           AS depth,
            ARRAY[e.id] AS path,
            NULL::TEXT  AS via_relationship
        FROM public.entities e
        WHERE e.id = p_start_entity_id

        UNION ALL

        -- Recursive case: follow outgoing edges
        SELECT
            en.id,
            en.name,
            en.type,
            ew.depth + 1,
            ew.path || en.id,
            ee.relationship_type
        FROM entity_walk ew
        JOIN public.entity_edges ee ON ee.source_entity_id = ew.entity_id
        JOIN public.entities en     ON en.id = ee.target_entity_id
        WHERE ew.depth < p_max_depth
          AND NOT en.id = ANY(ew.path)  -- prevent cycles
          AND (p_relationship_type IS NULL OR ee.relationship_type = p_relationship_type)
    )
    SELECT * FROM entity_walk
    ORDER BY entity_walk.depth, entity_walk.entity_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.traverse_entity_graph TO service_role;

-- =============================================================================
-- RPC: find_entity_path
-- BFS shortest path between two entities following edges in both directions.
-- Returns each step, entity name, and the relationship traversed at that hop.
-- Adapted from OB1/recipes/ob-graph/schema.sql find_shortest_path().
-- =============================================================================
CREATE OR REPLACE FUNCTION public.find_entity_path(
    p_start_entity_id   UUID,
    p_end_entity_id     UUID,
    p_max_depth         INT DEFAULT 6
)
RETURNS TABLE (
    step                INT,
    entity_id           UUID,
    entity_name         TEXT,
    via_relationship    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE bfs AS (
        -- Base case
        SELECT
            e.id                AS entity_id,
            e.name              AS entity_name,
            0                   AS depth,
            ARRAY[e.id]         AS path,
            ARRAY[NULL::TEXT]   AS relationships
        FROM public.entities e
        WHERE e.id = p_start_entity_id

        UNION ALL

        -- Follow edges in both directions (bidirectional BFS)
        SELECT
            en.id,
            en.name,
            b.depth + 1,
            b.path || en.id,
            b.relationships || ee.relationship_type
        FROM bfs b
        JOIN public.entity_edges ee
            ON (ee.source_entity_id = b.entity_id OR ee.target_entity_id = b.entity_id)
        JOIN public.entities en
            ON en.id = CASE
                WHEN ee.source_entity_id = b.entity_id THEN ee.target_entity_id
                ELSE ee.source_entity_id
               END
        WHERE b.depth < p_max_depth
          AND NOT en.id = ANY(b.path)
    ),
    shortest AS (
        SELECT path, relationships
        FROM bfs
        WHERE entity_id = p_end_entity_id
        ORDER BY depth
        LIMIT 1
    )
    SELECT
        row_number() OVER (ORDER BY u.ordinality)::INT AS step,
        gn.id                                           AS entity_id,
        gn.name                                         AS entity_name,
        s.relationships[ordinality]                     AS via_relationship
    FROM shortest s,
         unnest(s.path) WITH ORDINALITY AS u(nid, ordinality)
    JOIN public.entities gn ON gn.id = u.nid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_entity_path TO service_role;
