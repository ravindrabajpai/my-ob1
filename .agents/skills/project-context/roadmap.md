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

### Phase 6: Interactive MCP Tools
- [x] Modify `goals_and_principles` table to add `status` column (migration `005_mcp_mutations.sql`)
- [x] Create `merge_entities` RPC to securely handle Knowledge Graph node deduplication
- [x] Add 5 mutation tools to `open-brain-mcp`: `complete_task`, `update_task_deadline`, `merge_entities`, `create_goal`, `archive_goal`
- [x] Update Active Mentorship in `process-memory` to exclusively evaluate against `active` goals

### Phase 7: Direct Entity & Task Queries
- [x] Add deterministic MCP tools for structured lookups: `list_tasks`, `list_entities`, `list_threads`, `get_thread_context`

### Phase 8: `capture_memory` Parity (Mentorship & Threads)
- [x] Integrate `evaluateAgainstGoals` into the MCP tool to evaluate memories against active goals on ingestion.
- [x] Upsert generated threads and link them via `memory_threads`.
- [x] Expand MCP feedback response to include Thread counting and Insight surfacing.

### Phase 9: Automated Synthesis
- [x] Create `synthesis_reports` table (migration `006_automated_synthesis.sql`).
- [x] Create `automated-synthesis` Edge Function to fetch last 7 days of data and evaluate via LLM.
- [x] Add Slack integration to push generated digest directly to `SLACK_CAPTURE_CHANNEL`.
- [x] Add `get_recent_synthesis` tool to MCP server for AI clients to fetch latest report.

### Phase 10: Core AI Skills Adaptation (Agent Workflows)
- [x] **Auto-Capture:** Workflow that triggers at end of a session to extract final tasks and summarize into an active thread.
- [x] **Workflow Observability:** Observability rule to distil hard-won lessons into `goals_and_principles` table.
- [x] **Heavy File Ingestion:** Pre-processing scripts to convert large files before placing them in `artifacts`.
- [x] **Research Synthesis:** Constraints on semantic queries for explicitly stating gaps and marking confidence.
- [x] **N Agentic Harnesses:** Architectural rule set evaluating tool boundaries and permission policies.

---

## Future Horizons (Prioritized)

> Ordered by impact, dependency, and implementation effort.

### 1. Artifact Processing Pipeline *(Cognitive Layer — Multi-Modal)*
Address the "Multimodal Mystery Box". Implement text extraction, image OCR, and audio transcription for the `artifacts` table via a secondary `process-artifact` Edge Function, enabling rich vector search over attachments.

**Context:** The `artifacts` table currently stores Supabase Storage URLs for file attachments but leaves the `text_content` column permanently `null`. To enable true multimodal capture and vector search, files must be processed.

**Tasks:**
- [ ] **Text Extraction Strategy:** Integrate with an affordable LLM vision or transcription model within the Edge Function ecosystem.
- [ ] **Database Webhook:** Set up a secondary `pg_net` webhook that triggers when a new row is added to the `artifacts` table.
- [ ] **Processing Edge Function:** Create a `process-artifact` Edge Function that runs the extraction, generates a vector embedding over the extracted text, and updates the `artifacts` row.
- [ ] **Search Upgrades:** Modify the `match_memories` RPC to optionally query the `artifacts` table text payloads.

### 2. The "Taste Preferences" Migration *(Mentor Guardrails)*
Migrate from generalized constraints to a strict `taste_preferences` table with explicit `reject` and `want` parameters to reduce LLM hallucination and ensure the Mentor persona evaluates inputs accurately.

**Context:** Currently, `my-ob1` uses a generic `goals_and_principles` table to store constraints for *The Mentor* persona. Nate's best practices dictate using a dedicated, structured `taste_preferences` table with explicit `reject` and `want` boundaries to drastically reduce LLM hallucinations on evaluations.

**Tasks:**
- [ ] **Database Migration:** Create a `taste_preferences` table with columns: `id`, `preference_name`, `domain`, `reject`, `want`, `constraint_type`, `created_at`. Add Row Level Security (RLS) for the service role.
- [ ] **Edge Function Update:** Update `process-memory` (and `brain-engine.ts`) to fetch from `taste_preferences` and inject the structured `reject`/`want` pairings into the `evaluateAgainstGoals()` prompt.
- [ ] **MCP Server Update:** Add new mutation tools (`add_taste_preference`, `list_taste_preferences`, `remove_taste_preference`) to `open-brain-mcp` to allow AI clients to maintain this registry.
- [ ] **Data Migration:** Convert existing entries in `goals_and_principles` into the new `taste_preferences` format.

### 3. Standalone Automations *(Proactive Engagement)*
Develop Edge Functions (cron jobs) to enable proactive Slack briefings ("Life Engine" model) highlighting pending tasks/insights, and enforce strict SHA-256 deduplication on ingestion.

**Context:** Expanding beyond direct LLM integration to include background cron automations and data integrity scripts.

**Tasks:**
- [ ] **Proactive Briefings (Life Engine Model):** Develop an automated daily/weekly cron job (Edge Function) to send a "Mentor Briefing" to Slack highlighting active `tasks` and unresolved `system_insights`.
- [ ] **Hash Deduplication:** Implement SHA-256 content fingerprinting on the ingestion endpoint to categorically block duplicate entries into the database.

### 4. Wisdom Verticals *(Domain-Specific Graph Extensions)*
Branch the generalized graph out into tailored extensions (e.g., Family & Kids' Learning, Career & Finance) with specialized tables and LLM routing logic.

**Context:** The current graph (`memories`, `tasks`, `entities`, `threads`) is perfectly generalized. Inspired by OB1's `/extensions`, `my-ob1` will branch into specific "Wisdom Verticals" to grant the AI deep domain context.

**Tasks:**
- [ ] **Identify the First Extension:** Build targeted schema additions and routing for Family & Kids' Learning, Career & Finance, or Spirituality & Personal Learning.
- [ ] **Specialized Schema:** Create dedicated extension tables (e.g., `learning_goals`, `financial_assets`) that securely foreign-key back into the `memories` table to maintain the central graph.
- [ ] **Agent/Human Interfaces:** Ensure the new tables can be independently managed via targeted MCP tools and human-facing queries.
- [ ] **Routing Upgrades:** Update the `extractMetadata` system prompt to recognize the new domain and route attributes strictly to the extension table.

### Deferred / Icebox

- Dashboard / reporting Edge Function
- **Self-Hosted Kubernetes Deployment:** Adapt the OB1 helm charts/blueprints to create a fully local, self-contained PostgreSQL + pgvector deployment for `my-ob1` as a future-proofing measure.
