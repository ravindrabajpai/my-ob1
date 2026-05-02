# SKILL: Typed Edge Classifier

> **Parent Index:** [Project Context](../../project-context/SKILL.md) — Read root index first.
> **Phase:** 21 (Reasoning Graph)

---

## What This Skill Does

Populates the `memory_edges` table with **explicit typed logical relationships** between memories that share common entities. Upgrades the Knowledge Graph from probabilistic semantic similarity to a **logical reasoning graph**.

### Relation Vocabulary

| Relation | Meaning |
|----------|---------|
| `supports` | Memory A strengthens or provides evidence for Memory B |
| `contradicts` | Memory A directly conflicts with Memory B |
| `evolved_into` | Memory A was refined or replaced by Memory B over time |
| `supersedes` | Memory A is the newer replacement for Memory B |
| `depends_on` | Memory A is conditional on Memory B |
| `related_to` | Generic association; fallback for weak signals |

---

## Usage

```bash
# Set required environment variables (see .key.txt)
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."
export OPENROUTER_API_KEY="..."

# ALWAYS run dry-run first to review classifications before writing
deno run --allow-net --allow-env classify.ts --dry-run --limit 20

# Live run (writes to memory_edges via memory_edges_upsert RPC)
deno run --allow-net --allow-env classify.ts --limit 50

# Classify a single explicit pair you already know
deno run --allow-net --allow-env classify.ts --pair <UUID_A>,<UUID_B>
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--limit N` | 20 | Max candidate pairs to process |
| `--min-support N` | 2 | Min shared entities required per pair |
| `--min-confidence N` | 0.75 | Skip inserts below this confidence score |
| `--pair UUID_A,UUID_B` | — | Classify one explicit pair; skips sampling |
| `--dry-run` | false | Print results without writing to DB |
| `--help` | — | Print usage |

---

## Candidate Sampling Strategy

1. Reads `memory_entities` (the existing many-to-many join table)
2. Builds a `memory_id → [entity_ids]` map in memory
3. Finds all pairs of memories that share ≥ `min-support` common entities
4. Sorts by shared-entity count (most co-mentioned pairs classified first)
5. Skips any pair that already has a strong (non-`related_to`) edge in either direction

---

## When to Run

- **After large ingestion batches** — when you've captured many related thoughts in a session
- **Weekly maintenance** — as a companion to `automated-synthesis` for adding structural reasoning
- **On-demand investigation** — when you want to explicitly understand how two memories relate

---

## Output Verification

After a live run, verify edges were written:

```sql
-- Count edges by relation type
SELECT relation, count(*), round(avg(confidence)::numeric, 2) AS avg_conf
FROM public.memory_edges
GROUP BY relation
ORDER BY count(*) DESC;

-- Inspect most recent edges with rationale
SELECT
    relation,
    confidence,
    direction,
    metadata->>'rationale' AS rationale,
    created_at
FROM public.memory_edges
ORDER BY created_at DESC
LIMIT 10;
```

You can also use the `list_memory_edges` MCP tool from any AI client.

---

## Architecture Notes

- **LLM:** GPT-4o-mini via OpenRouter (single-model, no hybrid pre-filter tier)
- **Temperature:** 0.1 — deterministic, consistent classification
- **Storage:** `memory_edges_upsert` RPC handles `ON CONFLICT DO UPDATE` — repeat runs are idempotent (bump `support_count`, take max `confidence`)
- **No auto-schedule:** This skill is operator-driven. The Edge Function (`classify-memory-edges`) can be called via HTTP for cloud-side runs.

---

## Troubleshooting

**`Missing required environment variables`** — Export all three env vars before running.

**Most pairs return `none`** — Expected. Most entity co-mentions have no strong directional relation. This is correct behavior. Try `--min-support 1` to widen the candidate pool if your graph is sparse.

**`below_confidence` for most pairs** — Lower `--min-confidence` to e.g. `0.6` to see more marginal classifications. Review before lowering permanently.

**`skip_already_classified` dominates** — All strong-label pairs have already been classified. Run with a larger `--limit` or wait for new memories to be ingested.
