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

### Phase 11: Artifact Processing Pipeline & Security Lockdown
- [x] **Global RLS Lockdown:** Enabled Row Level Security on all tables to secure the database against exposed REST APIs.
- [x] **Artifact Processing:** Created `process-artifact` Edge Function to handle `pg_net` webhooks on new artifact inserts.
- [x] **Multimodal Extraction:** Integrated OpenRouter `gpt-4o-mini` Vision for image OCR.
- [x] **Federated Vector Search:** Overhauled `match_memories` RPC to search across both memory and artifact embeddings.

### Phase 12: Harness Architecture Upgrades (Safety & Observability)
- [x] **Gate Risky Operations (Safety First):** Apply granular permissions to the `open-brain-mcp` server. Move `merge_entities`, `archive_goal`, `create_goal`, and `complete_task` into an administrative/"approval required" queue rather than allowing immediate execution via AI endpoints.
- [x] **Explicit Workflow State & Resumability:** Add `processing_status` (`pending`, `completed`, `failed`) to the `memories` table to track async hydration explicitely. Move away from using `embedding = null` as a proxy state. Build a dead-letter queue / retry mechanism for failed processes.
- [x] **Operational Alerts:** Implement a Slack notification triggered when a memory process enters a `failed` state.
- [x] **Core Intelligence Evals Baseline:** Develop an automated regression suite powered by a small golden dataset (10-20 known Slack messages and their expected JSON extractions) to safely verify `extractMetadata()` consistency natively.
- [x] **Partition the MCP Surface:** Segment list/read tools from heavy graph-altering capabilities to resolve context bloat and prevent LLMs from confusing reading vs. writing roles.
- [x] **Cost Visibility:** Implement native tracking for OpenAI budget and context token usage burned per memory ingestion and synthesis cycle.

### Phase 13: The "Taste Preferences" Migration (Mentor Guardrails)
- [x] **Database Migration:** Created a `taste_preferences` table with explicit `reject` and `want` columns, migrated `goals_and_principles` data, and locked it down with RLS.
- [x] **Edge Function Update:** Updated `brain-engine.ts` prompts to use strict parameters and rewired `process-memory` to query preferences instead of goals.
- [x] **MCP Server Update:** Swapped goal mutations out for `add_taste_preference`, `remove_taste_preference`, and `list_taste_preferences`. All mutations are appropriately pushed to the `mcp_operation_queue`.
- [x] **Data Capture Parity:** Updated `ingest-thought` to route `pref:`, `goal:`, and `principle:` prefixed Slack messages directly into `taste_preferences`.

### Phase 14: Standalone Automations (Proactive Engagement)
- [x] **Proactive Briefings (Life Engine Model):** Developed `proactive-briefings` Edge Function triggered daily via `pg_cron` / `pg_net` to send a mentor briefing to Slack highlighting active tasks and unresolved system insights.
- [x] **Hash Deduplication:** Implemented strict SHA-256 content fingerprinting (`content_hash`) in both `ingest-thought` and `open-brain-mcp` to categorically block duplicate entries.

### Phase 15: Wisdom Verticals (Domain-Specific Graph Extensions)
- [x] **Scalable Registration Framework:** Established `_shared/verticals/` architecture to decouple domain logic from standard ingestion pipelines and prompt blocks.
- [x] **First Extension (Learning):** Built targeted schema additions (`learning_topics`, `learning_milestones`) representing the Learning & Skills domain.
- [x] **Dynamic Routing Upgrades:** Updated `extractMetadata` system prompt and `process-memory` payload ingestion to dynamically recognize and route attributes strictly to configured extension tables via the `WisdomVertical` interface.
- [x] **Agent/Human Interfaces:** Deployed MCP tools (`list_learning_topics`, `add_learning_milestone`, `update_mastery_status`) ensuring tables can be independently managed securely.
- [x] **SOP Authored:** Added developer documentation in `how-to-add-wisdom-vertical.md` to safely replicate this process for future verticals.

---

## Future Horizons (Prioritized)



### Deferred / Icebox

- Dashboard / reporting Edge Function
- **Self-Hosted Kubernetes Deployment:** Adapt the OB1 helm charts/blueprints to create a fully local, self-contained PostgreSQL + pgvector deployment for `my-ob1` as a future-proofing measure.
