# SKILL: Entity Relationship Backfill

> **Parent Index:** [00-PROJECT_CONTEXT.md](../../docs/00-PROJECT_CONTEXT.md)
> **Feature Phase:** Phase 22 — Enhanced Knowledge Graph (Explicit Entity Relationships)

---

## Purpose

This skill retroactively populates the `entity_edges` table for historical memories that were captured before Phase 22 was deployed. For each entity pair that co-occurs in 2+ shared memories, it uses GPT-4o-mini to classify the explicit semantic relationship and upserts the result into `entity_edges`.

> Going forward, entity relationships are extracted automatically during ingestion via the enhanced `extractMetadata` prompt. This script is only needed for backfill.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (from Supabase dashboard) |
| `OPENROUTER_API_KEY` | LLM inference key |
| Migration `021_enhanced_knowledge_graph.sql` deployed | `entity_edges` table and `entity_edges_upsert` RPC must exist |

Set env vars in your shell:
```bash
export SUPABASE_URL="https://your-project-ref.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export OPENROUTER_API_KEY="your-openrouter-key"
```

---

## Usage

### Dry Run (inspect candidates without writing)
```bash
deno run --allow-env --allow-net \
  /path/to/my-ob1/.agents/skills/entity-relationship-backfill/classify.ts \
  --dry-run --limit 20
```

### Live Run (write edges to DB)
```bash
deno run --allow-env --allow-net \
  /path/to/my-ob1/.agents/skills/entity-relationship-backfill/classify.ts \
  --limit 100 --min-co-occurrence 2 --min-confidence 0.6
```

---

## CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--dry-run` | off | Print edges that would be upserted without writing to DB |
| `--limit N` | 50 | Maximum number of entity pairs to process |
| `--min-co-occurrence N` | 2 | Minimum shared memories for a pair to be a candidate |
| `--min-confidence N` | 0.6 | Minimum LLM confidence score [0–1] to write an edge |

---

## How It Works

1. **Co-occurrence scan** — Queries `memory_entities` to find all entity pairs that share ≥ `--min-co-occurrence` memories.
2. **Memory fetch** — For each candidate pair, retrieves the full content of their shared memories (up to 5 samples).
3. **LLM classification** — Sends entity names + memory samples to GPT-4o-mini with a strict vocabulary prompt (`works_on | depends_on | uses | knows | manages | related_to`).
4. **Confidence filter** — Discards results below `--min-confidence`.
5. **Idempotent upsert** — Calls `entity_edges_upsert` RPC. Safe to re-run; on conflict it takes MAX weight and merges properties.

---

## Relationship Vocabulary

| Type | Meaning |
|---|---|
| `works_on` | Source entity actively works on / builds the target |
| `depends_on` | Source entity requires the target to function or succeed |
| `uses` | Source entity uses target as a tool, platform, or resource |
| `knows` | Source entity has a relationship with the target person |
| `manages` | Source entity manages, leads, or is responsible for the target |
| `related_to` | Generic association; no specific label fits |

---

## Post-Backfill Verification

```sql
-- Check how many entity edges were created
SELECT relationship_type, COUNT(*) as count, AVG(weight) as avg_confidence
FROM entity_edges
GROUP BY relationship_type
ORDER BY count DESC;

-- Spot-check a specific entity's connections
SELECT
  e1.name AS source,
  ee.relationship_type,
  e2.name AS target,
  ee.weight,
  ee.properties->>'rationale' AS rationale
FROM entity_edges ee
JOIN entities e1 ON e1.id = ee.source_entity_id
JOIN entities e2 ON e2.id = ee.target_entity_id
ORDER BY ee.weight DESC
LIMIT 20;
```
