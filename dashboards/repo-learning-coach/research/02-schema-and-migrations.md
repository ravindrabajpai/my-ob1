---
slug: schema-and-migrations
title: Schema & Migrations
summary: The nine core tables, how they relate, and how the IaC migration system ensures reproducible deployments.
category: database
---

# Schema & Migrations

## How migrations work

All schema changes are tracked in numbered SQL files under `supabase/migrations/`. Supabase applies them in order. There are currently 18 migrations applied (001 through 018).

Key guardrail: every migration should be idempotent where possible — using `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc.

## Core tables at a glance

| Table | Role |
|-------|------|
| `memories` | Central capture; every thought lands here first |
| `tasks` | Extracted action items with lifecycle status |
| `entities` | Knowledge Graph nodes (Person, Project, Concept) |
| `memory_entities` | Join table: many-to-many memories↔entities |
| `threads` | Named work/life streams |
| `memory_threads` | Join table: many-to-many memories↔threads |
| `artifacts` | File attachments with Storage URLs + embeddings |
| `taste_preferences` | Strict WANT/REJECT guardrails |
| `system_insights` | AI-generated evaluations per memory |

## Key columns to understand

### `memories`

- `processing_status` — ENUM (`pending`, `completed`, `failed`). Tracks async hydration state.
- `content_hash` — SHA-256 of the text. `UNIQUE` — prevents duplicate ingestion.
- `embedding` — 1536-dim vector from `text-embedding-3-small`. Nullable until `process-memory` runs.

### `tasks`

- `status` — CHECK constraint: `pending`, `in_progress`, `blocked`, `deferred`, `completed`

## Row Level Security

**All tables have RLS enabled.** The REST/GraphQL API is fully locked down. Only the `service_role` key (used by Edge Functions) can read or write data.

## The `match_memories` RPC

This is the core retrieval primitive. It runs cosine similarity search across both `memories` and `artifacts` tables, groups by memory, and returns the best match per memory.

```sql
match_memories(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
```
