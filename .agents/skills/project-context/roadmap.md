# Open Brain Roadmap (Strategist & Mentor)

## Completed (Phases 1–4)
- [x] Initial IaC (Supabase Migrations) baseline
- [x] Refactor core AI extraction/embedding into `_shared` module
- [x] Cleanup Edge function filenames (`intex.ts` to `index.ts`)
- [x] Secure Slack Ingestion with `SLACK_SIGNING_SECRET` cryptographic verification
- [x] Drop legacy `thoughts` schema
- [x] Implement semantic Multi-Modal Contextual Graph (`memories`, `tasks`, `entities`, `threads`)
- [x] Implement `artifacts` table and Slack file download pipeline
- [x] Complex JSON extraction in `_shared/brain-engine.ts`
- [x] Multi-table routing in `ingest-thought` (memories → tasks → entities → threads)
- [x] MCP tools updated (`search_memories`, `list_memories`, `memory_stats`, `capture_memory`)
- [x] `goal:` / `principle:` prefix routing from Slack → `goals_and_principles`
- [x] Active Mentorship: `evaluateAgainstGoals` → `system_insights` on every ingestion

## Future Horizons (Prioritized)

> Ordered by impact, dependency, and implementation effort.

### 1. Async/Fallback Ingestion *(Resilience — Critical)*
Currently, if the OpenRouter API fails or times out during `extractMetadata` or `getEmbedding`, the entire Slack message is dropped. The fix: save raw text to `memories` **immediately** upon receipt, then handle LLM extraction asynchronously (e.g., via a Supabase database webhook or background worker). This prevents data loss and makes ingestion fault-tolerant.

### 2. Interactive MCP Tools *(Execution Layer — High Value)*
The current MCP server is read-only. Build mutation tools so AI clients can actively manage state:
- `complete_task` — Mark a task as done
- `update_task_deadline` — Reschedule a task
- `merge_entities` — Deduplicate knowledge graph nodes
- `create_goal` / `archive_goal` — Lifecycle management for goals

### 3. Direct Entity & Task Queries *(Execution Layer — Complement to #2)*
Add deterministic MCP tools that bypass vector search for structured lookups:
- `list_tasks` — Filter by status, due date, or linked entity
- `list_entities` — Filter by type (Person, Project, Concept)
- `list_threads` — Browse active work/life streams
- `get_thread_context` — All memories linked to a specific thread

### 4. Artifact Processing Pipeline *(Cognitive Layer — Multi-Modal)*
Implement image OCR and audio transcription for the `artifacts` table. Trigger a secondary Edge Function whenever a new row is added with an image/audio MIME type. Store extracted text in the `text_content` column for downstream vector search.

### 5. Automated Synthesis *(Cognitive Layer — Intelligence)*
Implement daily or weekly background syntheses that aggregate recent `system_insights` to provide high-level summaries of productivity, goal alignment, and emerging themes. Could run as a scheduled Supabase cron job or a triggered Edge Function.

### Deferred
- Dashboard / reporting Edge Function
