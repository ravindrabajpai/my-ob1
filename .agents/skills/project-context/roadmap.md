# Open Brain Roadmap

> **Parent Index:** [SKILL.md](./SKILL.md) — Read the root index first.

---

## Completed Phases

### Phase 0: Baseline MVP
- [x] Single `thoughts` table with `pgvector`
- [x] Slack ingestion Edge Function (`ingest-thought`)
- [x] MCP server Edge Function (`open-brain-mcp`) with 4 tools
- [x] `MCP_ACCESS_KEY` authentication

### Phase 1: IaC, Shared Engine & Security
- [x] Extract shared AI logic into `_shared/brain-engine.ts` (OpenRouter integration)
- [x] Initialize Supabase migrations for reproducible deployments
- [x] Implement Slack Request Verification (HMAC-SHA256 + 5-min replay protection)
- [x] Establish `schema-state.md` and `roadmap.md` for agent context sync
- [x] Fix Edge Function filename typo (`intex.ts` → `index.ts`)

### Phase 2: Relational Knowledge Graph Schema
- [x] Drop legacy `thoughts` table and `match_thoughts` RPC
- [x] Deploy 7-table graph: `memories`, `tasks`, `entities`, `memory_entities`, `artifacts`, `goals_and_principles`, `system_insights`
- [x] Deploy `match_memories` RPC for vector search

### Phase 3: AI Extraction & Multi-Table Routing
- [x] Overhaul `extractMetadata` prompt → structured JSON output (`memory_type`, `extracted_tasks`, `associated_threads`, `entities_detected`, `strategic_alignment`)
- [x] Implement relational ingestion pipeline: `memories` → `tasks` → entity upsert + `memory_entities` linking
- [x] Rewrite all 4 MCP tools: `search_memories` (with entity/task joins), `list_memories`, `memory_stats` (entity/task counts), `capture_memory` (full graph population)

### Phase 4: Threads, Artifacts & Active Mentorship
- [x] Create `threads` and `memory_threads` tables (migration `002_threads.sql`)
- [x] Upsert threads from LLM output and link to memories
- [x] Implement Slack file attachment pipeline: download → Supabase Storage upload → `artifacts` table insert
- [x] Implement `evaluateAgainstGoals()` in `brain-engine.ts` — evaluates every memory against stored goals/principles
- [x] Implement `goal:` / `principle:` prefix routing in Slack → direct insert to `goals_and_principles`
- [x] Structured Slack confirmation reply with tasks, entities, threads, files, insights, alignment

### Phase 5: Resilient Async Ingestion
- [x] Add `slack_metadata` JSONB column to `memories` table (migration `004_async_ingestion.sql`)
- [x] Refactor `ingest-thought` to insert raw memory immediately and return 200 OK
- [x] Setup `pg_net` database webhook on `memories` insert to decouple Slack ingestion
- [x] Create `process-memory` Edge Function for background LLM processing and graph population

---

## Future Horizons (Prioritized)

> Ordered by impact, dependency, and implementation effort.

### 1. Interactive MCP Tools *(Execution Layer — High Value)*
The MCP server is currently read-only (except `capture_memory`). Build mutation tools for active state management:
- `complete_task` — Mark a task as done
- `update_task_deadline` — Reschedule a task
- `merge_entities` — Deduplicate knowledge graph nodes
- `create_goal` / `archive_goal` — Lifecycle management for goals

### 2. Direct Entity & Task Queries *(Execution Layer — Complement to #1)*
Add deterministic MCP tools that bypass vector search for structured lookups:
- `list_tasks` — Filter by status, due date, or linked entity
- `list_entities` — Filter by type (Person, Project, Concept)
- `list_threads` — Browse active work/life streams
- `get_thread_context` — All memories linked to a specific thread

### 3. `capture_memory` Parity *(MCP — Quick Win)*
The MCP `capture_memory` tool currently doesn't link threads or evaluate against goals. Align it with the full Slack ingestion pipeline (steps 6e and 6g from [edge-functions.md](./edge-functions.md)).

### 4. Artifact Processing Pipeline *(Cognitive Layer — Multi-Modal)*
Implement image OCR and audio transcription for the `artifacts` table. Trigger a secondary Edge Function when a new row has an image/audio MIME type. Store extracted text in the `text_content` column for vector search inclusion.

### 5. Automated Synthesis *(Cognitive Layer — Intelligence)*
Daily or weekly background aggregation of recent `system_insights` to provide high-level summaries of productivity, goal alignment, and emerging themes. Could run as a Supabase cron job or scheduled Edge Function.

### Deferred
- Dashboard / reporting Edge Function
