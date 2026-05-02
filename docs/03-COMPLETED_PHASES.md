# Completed Phases

> **Parent Index:** [SKILL.md](./SKILL.md) — Read the root index first.

---

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
- [x] Create `automated-synthesis` Edge Function to fetch last 7 days of data and evaluate via LLM (Scheduled: Fri 17:00 UTC).
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
- [x] **Agent/Human Interfaces:** Deployed MCP tools (`list_learning_topics`, `add_learning_milestone`, `update_mastery_status`) and Slack prefix routing (`done:`) ensuring tables can be independently managed securely.
- [x] **SOP Authored:** `user-manuals/08-adding-wisdom-verticals.md` to safely replicate this process for future verticals.

### Phase 16: System Observability & Persistent Configuration (Hardening)
- [x] **Config Table Migration:** Replaced restricted Database GUCs with a `system_config` table for project credentials.
- [x] **Reliable Cron Workers:** Hardened `automated-synthesis` and `proactive-briefings` to use table-based lookups.
- [x] **Diagnostic SOP:** Authored an `investigation-guide.md` for Edge Function execution debugging.

### Phase 17: Advanced Inbound Processing & Context Routing
- [x] **Adaptive Capture Classification:** Added confidence gating on the `ingest-thought` Edge Function. The LLM now classifies capture type with a 0–10 confidence score, compares against per-type adaptive thresholds stored in `capture_thresholds`, and records outcomes in `classification_outcomes`. Thresholds self-adjust via a ±0.02 nudge loop, clamped 0.50–0.95.
- [x] **Bring-Your-Own-Context (BYOC):** Deployed `work-operating-model-mcp` Edge Function implementing a five-layer interview workflow (`operating_rhythms`, `recurring_decisions`, `dependencies`, `institutional_knowledge`, `friction`). Generates five portable context artifacts (`USER.md`, `SOUL.md`, `HEARTBEAT.md`, `operating-model.json`, `schedule-recommendations.json`). Backed by `operating_model_profiles/sessions/layer_checkpoints/entries/exports` tables and three RPCs. Work Operating Model skill added to `.agents/skills/`.

### Phase 18: Application-Layer Wisdom Verticals & Extensions
- [x] **Repository Learning Coach:** Full Express + React dashboard ported from OB1 to `dashboards/repo-learning-coach/`. Key adaptation: Brain Bridge now calls `search_memories` and `capture_memory` through the `open-brain-mcp` Edge Function (MCP HTTP). 3 my-ob1 architecture lessons included. Migration `018_repo_learning_coach.sql` adds 10 `repo_learning_*` tables.
- [x] **Infographic Generator:** Ported OB1 `generate.py` script and SKILL.md into `.agents/skills/infographic-generator/`. The skill's brain integration uses `search_memories`/`capture_memory` MCP tools natively.

### Phase 19: Explicit Lifecycle & Metacognitive Operating Models
- [x] **Formalized Workflow Statuses:** Expanded task states to include `pending`, `in_progress`, `blocked`, `deferred`, and `completed`. Added check constraint and `update_task_status` MCP tool.
- [x] **World-Model Diagnostic & Signal Diffs:** Integrated automated contradiction auditing and strategic drift detection into the `automated-synthesis` pipeline by supplying the previous report to the synthesis engine.

### Phase 20: The Obsidian Wiki Compiler (Orchestration & Entity Pages)
- [x] **Server-Side Generation:** Built the `entity-wiki-generator` Edge Function and `obsidian-wiki-compiler-cron` `pg_cron` schedule to synthesize markdown dossiers (Summary, Timeline, Related Entities) for specific entities and learning topics, cached in `entity_wikis`.
- [x] **Local Sync CLI:** Created a local script (`.agents/skills/obsidian-wiki-compiler/sync-wikis.ts`) to write the compiled dossiers directly into the local Obsidian Vault as an auto-updating, browsable frontend.

### Phase 21: Typed Edge Classifier (Reasoning Graph)
- [x] **Reasoning Graph Schema:** Created `memory_edges` table with 6-label typed relation vocabulary (`supports`, `contradicts`, `evolved_into`, `supersedes`, `depends_on`, `related_to`), direction, confidence, and temporal bounds. `memory_edges_upsert` RPC handles idempotent insertion. Migration `020_typed_edge_classifier.sql`.
- [x] **Edge Function:** Deployed `classify-memory-edges` Edge Function. Samples candidate pairs via entity co-occurrence (`memory_entities`), classifies via `classifyMemoryEdge()` in `brain-engine.ts`, upserts edges via RPC.
- [x] **LLM Classifier:** Added `classifyMemoryEdge(memoryA, memoryB)` to `_shared/brain-engine.ts`. Uses GPT-4o-mini via OpenRouter with deterministic temperature (0.1) and `response_format: json_object`.
- [x] **Local Skill:** Ported OB1 `classify-edges.mjs` to Deno/TypeScript at `.agents/skills/typed-edge-classifier/classify.ts` with `--dry-run`, `--pair`, `--limit`, and `--min-confidence` flags.
- [x] **MCP Tool:** Added read-only `list_memory_edges` tool to `open-brain-mcp` exposing the reasoning graph to AI clients.
