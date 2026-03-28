# Open Brain Release Notes

## Phase 4: Multi-modal Artifacts, Threads & Active Mentoring
**Date**: March 28, 2026

Phase 4 completed the full "Strategist & Mentor" vision from the original README.

**Key Changes:**
1. **Threads**: Created `threads` and `memory_threads` tables. The LLM's `associated_threads` array is now upserted and linked to each memory, grouping related thoughts into active work streams.
2. **Slack File Artifacts**: When files are attached to a Slack message, they are downloaded via the Bot Token, uploaded to a Supabase Storage bucket (`artifacts`), and metadata is saved to the `artifacts` table.
3. **Active Mentorship (`system_insights`)**: A new `evaluateAgainstGoals` function in `brain-engine.ts` fetches all stored `goals_and_principles`, sends them with the incoming memory to GPT-4o-mini, and saves any strategic insight to `system_insights`. The insight is shown in the Slack confirmation reply.
4. **Goal/Principle Ingestion from Slack**: Messages prefixed with `goal:` or `principle:` are routed directly to the `goals_and_principles` table, bypassing the AI extraction pipeline.

---

## Phase 3: The Interceptor & Contextual Search
**Date**: March 28, 2026

Phase 3 rewired the AI extraction and the Edge Functions to populate the new relational graph schema.

**Key Changes:**
1. **LLM Prompt Overhaul (`brain-engine.ts`)**: The `extractMetadata` prompt now outputs a multi-dimensional JSON: `memory_type`, `extracted_tasks`, `associated_threads`, `entities_detected`, and `strategic_alignment`.
2. **Relational Ingestion (`ingest-thought`)**: The Slack interceptor now sequentially inserts into `memories`, then `tasks`, then upserts `entities` and links via `memory_entities`.
3. **MCP Server Overhaul (`open-brain-mcp`)**: All 4 tools renamed and rewritten — `search_memories` (uses `match_memories` RPC with entity/task joins), `list_memories`, `memory_stats` (includes task and entity counts), and `capture_memory` (full graph population).

---

## Phase 2: Expanded Schema Migration
**Date**: March 28, 2026

Phase 2 replaced the unstructured `thoughts` table with a true relational Knowledge Graph schema.

**Key Changes:**
1. **Database Re-Architecture (DB Push)**:
   - Dropped the legacy `thoughts` table and old `match_thoughts` RPC.
   - Deployed **Core Knowledge Graph**: `memories`, `entities`, `memory_entities`.
   - Deployed **Task Layer**: `tasks` table with execution tracking.
   - Deployed **Mentor Layer**: `goals_and_principles` and `system_insights`.
   - Deployed **Multi-modal Hub**: `artifacts` table.
   - Added `match_memories` RPC for MCP vector search.

---

## Phase 1: Refactoring, IaC Foundations & Security
**Date**: March 28, 2026

Phase 1 established a secure, version-controlled foundation.

**Key Changes:**
1. **Shared AI Engine (`_shared/brain-engine.ts`)**: Extracted OpenRouter integration into a central module reused across both Edge Functions.
2. **Infrastructure-as-Code**: Initialized Supabase migrations for reproducible deployments.
3. **Cryptographic Security**: Implemented Slack Request Verification using `SLACK_SIGNING_SECRET` with HMAC-SHA256 and 5-minute replay protection.
4. **Context Synchronization**: `schema-state.md` and `roadmap.md` established for agentic workflows.

---

## Phase 0: Baseline Proof of Concept (MVP)
**Date**: March 2026

Phase 0 proved end-to-end viability of semantic search and ingestion via Slack and an MCP server.

**Key Capabilities:**
- **Flat Storage**: Single `thoughts` table with `pgvector`.
- **Slack Ingestion (`ingest-thought`)**: Edge function for Slack webhook POST → embeddings → storage.
- **MCP Server (`open-brain-mcp`)**: 4 semantic tools for LLM clients, protected by `MCP_ACCESS_KEY`.
