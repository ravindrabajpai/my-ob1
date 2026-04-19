---
slug: architecture-overview
title: Architecture Overview
summary: The three-layer architecture of my-ob1 — ingestion, knowledge graph, and MCP retrieval — and why each component exists.
category: architecture
---

# Architecture Overview

my-ob1 is a cognitive data layer built on Supabase PostgreSQL with pgvector. It captures raw thoughts, extracts structured knowledge, evaluates against personal guardrails, and exposes everything semantically through an MCP server.

## The three personas

The system acts as three AI personas simultaneously:

- **📦 The Planner** — extracts tasks with deadlines from stream-of-consciousness input
- **🧩 The Strategist** — builds a Knowledge Graph of people, projects, and concepts linked to memories
- **🧭 The Mentor** — evaluates every thought against stored taste preferences and surfaces strategic insights

## The ingestion pipeline

```
Slack Message
     │
     ▼
ingest-thought (Edge Function)
  • HMAC-SHA256 auth
  • SHA-256 deduplication
  • Adaptive capture classification
  • Fast sync insert to memories
     │
     ▼ (pg_net webhook on insert)
process-memory (Edge Function)
  • getEmbedding() in parallel with extractMetadata()
  • Populates tasks, entities, threads, learning topics
  • Evaluates against taste_preferences → system_insights
  • Sends Slack confirmation reply
```

## The knowledge graph

Nine core tables plus three wisdom vertical tables form the graph:

- `memories` — the central capture table (every thought enters here)
- `tasks` — extracted action items
- `entities` — people, projects, concepts
- `threads` — active work/life streams
- `artifacts` — file attachments with OCR and vector embeddings
- `taste_preferences` — strict WANT/REJECT guardrails
- `system_insights` — AI-generated strategic evaluations
- `learning_topics`, `learning_milestones` — the Learning Wisdom Vertical

## The MCP server

The `open-brain-mcp` Edge Function exposes 18 tools to any AI client (Claude, Antigravity). Key tools:

- `search_memories` — semantic vector search across memories and artifacts
- `capture_memory` — full graph ingestion from any AI agent
- `list_tasks` / `list_entities` / `list_threads` — deterministic structured lookups
- `list_taste_preferences` — the active guardrail set
