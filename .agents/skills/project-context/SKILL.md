# SKILL: Open Brain (my-ob1) — Project Context Index

> **Purpose:** This is the root context file for the Open Brain project. Agents MUST read this file at the start of every task. It provides the canonical project state and links to module-specific deep-dives.

---

## 1. Project Vision & Identity

**Open Brain** is a standalone AI-powered cognitive data layer. It captures raw thoughts (primarily from Slack), extracts structured knowledge (tasks, entities, threads), evaluates them against personal goals, and provides semantic retrieval — all stored in a relational Knowledge Graph on Supabase.

It acts as three personas simultaneously:
- **📦 The Planner** — Extracts tasks with deadlines from stream-of-consciousness input.
- **🧩 The Strategist** — Builds a Knowledge Graph of people, projects, and concepts.
- **🧭 The Mentor** — Evaluates every thought against stored goals and surfaces strategic insights.

**Origin:** Bootstrapped from [Nate Jones' OB1](https://github.com/NateBJones-Projects/OB1), extended with a multi-table Knowledge Graph, active mentorship, and thread-based context grouping.

---

## 2. Architecture Overview

```
Slack Message (+ optional file attachments)
     │
     ▼
┌─────────────────────────┐
│  ingest-thought          │  Supabase Edge Function (Deno/TS)
│  • Slack signature auth  │
│  • goal:/principle: route│
│  • LLM metadata extract  │◄── brain-engine.ts (GPT-4o-mini via OpenRouter)
│  • Vector embedding      │◄── brain-engine.ts (text-embedding-3-small)
│  • Multi-table routing   │
│  • File → Storage upload │
│  • Goal evaluation       │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│  Supabase PostgreSQL (pgvector)                  │
│                                                  │
│  memories ──┬── tasks                            │
│             ├── memory_entities ── entities       │
│             ├── memory_threads ── threads         │
│             ├── artifacts (Supabase Storage)      │
│             └── system_insights                  │
│                                                  │
│  goals_and_principles (mentor baseline)          │
│  match_memories() RPC                            │
└──────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  open-brain-mcp          │  Supabase Edge Function (Deno/TS)
│  • search_memories       │  Semantic vector search + entity/task joins
│  • list_memories         │  Filtered chronological listing
│  • memory_stats          │  Dashboard stats (memories, tasks, entities)
│  • capture_memory        │  Direct graph ingestion from any AI client
└─────────────────────────┘
         │
         ▼
   Any MCP Client (Claude, Antigravity, etc.)
```

**Key tech decisions:**
- **All server-side code is Deno/TypeScript** — both Edge Functions run on Supabase's Deno runtime.
- **No Python backend** — the `mcp-server/` directory exists but is unused; the MCP server is the `open-brain-mcp` Edge Function.
- **Security** — Slack signature verification (HMAC-SHA256 + replay protection) for ingestion; `MCP_ACCESS_KEY` for the MCP endpoint. Both deployed with `--no-verify-jwt`.

---

## 3. Current State (as of 2026-03-29)

**All core phases (0–5) are complete and deployed.** The system is fully operational.

| Milestone | Status | Details |
|-----------|--------|---------|
| Phase 0: MVP (flat `thoughts` table) | ✅ Complete | Replaced by Phase 2 |
| Phase 1: IaC, shared engine, Slack security | ✅ Complete | `brain-engine.ts`, migrations, HMAC auth |
| Phase 2: Relational Knowledge Graph schema | ✅ Complete | 9 tables + `match_memories` RPC |
| Phase 3: AI extraction → multi-table routing | ✅ Complete | LLM JSON extraction, relational ingestion, MCP overhaul |
| Phase 4: Threads, artifacts, active mentorship | ✅ Complete | Thread grouping, Slack file pipeline, `evaluateAgainstGoals` |
| Phase 5: Resilient Async Ingestion | ✅ Complete | `pg_net` webhook, decoupled `process-memory` Edge Function, zero data loss |
| Phase 6: Interactive MCP Tools | ✅ Complete | Mutation tools for tasks, entities, and goals + deduplication RPC |
| Phase 7: Direct Entity & Task Queries | ✅ Complete | Deterministic structure lookup tools (`list_tasks`, `list_entities`, etc.) |

**What is NOT yet built** (see [roadmap.md](./roadmap.md) for details):
1. `capture_memory` parity (threads and goal evaluation)
2. Artifact processing pipeline (OCR, transcription)
3. Automated synthesis (weekly digests)

---

## 4. Module Reference Index

Agents MUST read the relevant module file before working on that domain:

| Module File | Domain | What It Covers |
|-------------|--------|----------------|
| [schema-state.md](./schema-state.md) | Database | All 9 tables, columns, relationships, RPC functions, and security architecture |
| [edge-functions.md](./edge-functions.md) | Ingestion & MCP | `ingest-thought` pipeline, `open-brain-mcp` tools, `brain-engine.ts` shared module |
| [roadmap.md](./roadmap.md) | Planning | Completed phases and prioritized future horizons |

---

## 5. Repository Structure

```
my-ob1/
├── supabase/
│   ├── functions/
│   │   ├── _shared/
│   │   │   └── brain-engine.ts         # Shared AI: embeddings, metadata extraction, goal evaluation
│   │   ├── ingest-thought/
│   │   │   ├── index.ts                # Slack webhook → fast sync insert
│   │   │   └── deno.json
│   │   ├── process-memory/
│   │   │   ├── index.ts                # Async background job for LLM extraction and graph population
│   │   │   └── deno.json
│   │   └── open-brain-mcp/
│   │       ├── index.ts                # MCP server (4 tools) via Hono + StreamableHTTPTransport
│   │       └── deno.json
│   └── migrations/
│       ├── 001_expanded_schema.sql     # Core graph schema (7 tables + RPC)
│       ├── 002_threads.sql             # threads + memory_threads
│       ├── 003_delete_all_data.sql     # Data reset utility (TRUNCATE CASCADE)
│       ├── 004_async_ingestion.sql     # Database webhook for async processing
│       └── 005_mcp_mutations.sql       # RPCs and schema additions for MCP tools
├── mcp-server/                         # UNUSED — MCP lives in supabase/functions/open-brain-mcp
├── .agents/
│   ├── skills/project-context/
│   │   ├── SKILL.md                    # THIS FILE — root project index
│   │   ├── schema-state.md             # Database schema reference
│   │   ├── edge-functions.md           # Edge Function module reference
│   │   └── roadmap.md                  # Project roadmap & future horizons
│   ├── workflows/
│   │   └── development-loop.yaml       # Standard feature dev workflow
│   └── rules/
│       └── 01-context-management.md    # Context sync enforcement rule (absolute, non-negotiable)
├── README.md                           # Public-facing documentation
├── RELEASE_NOTES.md                    # Phase-by-phase changelog
├── .key.txt                            # Credential tracker (NOT committed)
└── .gitignore
```

---

## 6. Core Development Directives

1. **All Edge Functions must be Deno/TypeScript** — Supabase Edge Functions run on Deno, not Node.
2. **Never hardcode user context** — the schema dynamically holds evolving beliefs, goals, and principles.
3. **LLM calls go through OpenRouter** — API key is `OPENROUTER_API_KEY`; models used are `openai/gpt-4o-mini` and `openai/text-embedding-3-small`.
4. **Deploy with `--no-verify-jwt`** — Slack and MCP clients don't use Supabase JWTs; auth is application-level.
5. **Context files must stay current** — after any structural change, update the relevant module file in this directory.

---

## 7. Environment & Secrets

| Secret | Purpose |
|--------|---------|
| `OPENROUTER_API_KEY` | LLM inference & embeddings via OpenRouter |
| `SLACK_BOT_TOKEN` | Slack API calls (replies, file downloads) |
| `SLACK_CAPTURE_CHANNEL` | Channel ID to listen for messages |
| `SLACK_SIGNING_SECRET` | HMAC-SHA256 request verification |
| `MCP_ACCESS_KEY` | Authentication for MCP endpoint |
| `SUPABASE_URL` | Auto-provided by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided by Supabase runtime |