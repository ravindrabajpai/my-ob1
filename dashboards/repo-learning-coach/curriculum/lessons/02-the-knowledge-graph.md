---
slug: the-knowledge-graph
title: The Knowledge Graph Schema
stage: Foundations
difficulty: Beginner
order: 2
estimatedMinutes: 25
summary: Understand the nine core tables, their relationships, and the RLS security model.
goals:
  - Explain why memories is the central table and how tasks/entities/threads relate to it.
  - Describe what content_hash and processing_status are used for.
  - State why all tables have RLS enabled and how Edge Functions bypass it.
relatedResearch:
  - schema-and-migrations
quiz:
  title: Schema knowledge check
  passingScore: 70
  questions:
    - prompt: What does the content_hash column on memories prevent?
      options:
        - Schema migration conflicts when multiple agents write concurrently
        - Duplicate memory ingestion — two messages with the same text will reject the second
        - LLM token overuse by caching identical embeddings
        - Slack retries from creating duplicate webhook events
      correctOption: Duplicate memory ingestion — two messages with the same text will reject the second
      explanation: content_hash is a SHA-256 fingerprint of the text with a UNIQUE constraint. Any duplicate message text triggers a conflict and is rejected at the DB level.
    - prompt: How do Edge Functions bypass Row Level Security?
      options:
        - They have a special Supabase JWT with admin claims
        - They use the service_role key, which bypasses RLS entirely
        - RLS is disabled on tables that Edge Functions touch
        - They connect directly to the Postgres port, bypassing PostgREST
      correctOption: They use the service_role key, which bypasses RLS entirely
      explanation: The SUPABASE_SERVICE_ROLE_KEY is injected automatically into Edge Functions. service_role bypasses all RLS policies, allowing full read/write to all tables.
    - prompt: What happens to a memory row immediately after ingest-thought inserts it?
      options:
        - It has processing_status = 'pending' and no embedding yet
        - It is immediately complete with embedding and full graph populated
        - It is stored in a staging queue and only migrated after manual review
        - It triggers a Slack DM asking the user to confirm the memory type
      correctOption: It has processing_status = 'pending' and no embedding yet
      explanation: ingest-thought does a fast sync insert with raw content. process-memory fills in the embedding, type, tasks, entities, and marks it 'completed' asynchronously.
---

## The central table: memories

Every thought enters the system through `memories`. Everything else in the graph is either linked to a memory row or derived from one.

Key things to understand:

- `processing_status` tells you where in the pipeline a memory is (`pending` → `completed` or `failed`)
- `embedding` is NULL until `process-memory` runs. Do not query it on fresh rows.
- `content_hash` is the deduplication key. If two Slack messages have the same text, only the first is stored.

## The relational graph around memories

```
memories
  ├── tasks (1:N)
  ├── artifacts (1:N)
  ├── system_insights (1:N)
  ├── memory_entities → entities (N:M)
  └── memory_threads → threads (N:M)
```

Deleting a memory cascades to all related rows.

## Why RLS on every table?

Supabase exposes a REST API (`PostgREST`) and a GraphQL API automatically. Without RLS, anyone with the public `anon` key could read or write every table directly.

With RLS enabled and no permissive policies for `anon`, both APIs are fully locked down. Only the `service_role` key — used exclusively by Edge Functions — can read or write data.

## The `match_memories` RPC

This function is the heart of semantic retrieval. It does a `cosine distance` search using pgvector across both `memories` and `artifacts` (federated search). When an artifact matches, it returns the parent memory, not the artifact row directly.

Threshold of 0.5 is the default — lower means "more related results," higher means "only very close matches."
