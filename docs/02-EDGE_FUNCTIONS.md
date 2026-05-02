# Edge Functions Module Reference

> **Parent Index:** [SKILL.md](./SKILL.md) — Read the root index first.

---

## Overview

All server-side logic runs as **Supabase Edge Functions** written in **Deno/TypeScript**. There are two deployed functions and one shared module:

| Function | Path | Purpose |
|----------|------|---------|
| `ingest-thought` | `supabase/functions/ingest-thought/index.ts` | Slack webhook receiver → fast sync insert to `memories` with adaptive classification gating |
| `process-memory` | `supabase/functions/process-memory/index.ts` | Background job (triggered by `pg_net` webhook) → LLM extraction + graph ingestion |
| `process-artifact` | `supabase/functions/process-artifact/index.ts` | Background job (triggered by `pg_net` webhook) → OCR/transcription and vector embedding |
| `automated-synthesis` | `supabase/functions/automated-synthesis/index.ts` | Cron job (`weekly_synthesis_report`) → generates weekly digest with drift detection, saves to DB, posts to Slack |
| `proactive-briefings` | `supabase/functions/proactive-briefings/index.ts` | Cron job (sends daily Slack briefing with pending tasks and recent insights) |
| `work-operating-model-mcp` | `supabase/functions/work-operating-model-mcp/index.ts` | REST API for BYOC five-layer interview workflow and portable context bundle export |
| `open-brain-mcp` | `supabase/functions/open-brain-mcp/index.ts` | MCP server exposing tools to AI clients |
| `entity-wiki-generator` | `supabase/functions/entity-wiki-generator/index.ts` | Cron job (`obsidian-wiki-compiler-cron`) → generates markdown dossiers for entities with 3+ linked memories |
| `thread-summarizer` | `supabase/functions/thread-summarizer/index.ts` | Cron job (`thread-summarizer-cron`) → consolidates memories into high-level thread summary dossiers |
| `classify-memory-edges` | `supabase/functions/classify-memory-edges/index.ts` | On-demand HTTP trigger → samples entity co-occurrence candidate pairs and classifies typed reasoning edges into `memory_edges` |
| `classify-memory-edges` | `supabase/functions/classify-memory-edges/index.ts` | On-demand HTTP trigger → samples entity co-occurrence candidate pairs and classifies typed reasoning edges into `memory_edges` |
| `_shared/brain-engine.ts` | `supabase/functions/_shared/brain-engine.ts` | Shared AI module (embeddings, metadata extraction, goal evaluation) |

---

## 1. Shared AI Module: `brain-engine.ts`

All LLM operations are centralized here. Both Edge Functions import from this module.

### Functions

| Function | Model | Purpose |
|----------|-------|---------|
| `getEmbedding(text)` | `openai/text-embedding-3-small` | Generates 1536-dim vector embedding via OpenRouter (Returns `{ embedding, usage }`) |
| `extractMetadata(text)` | `openai/gpt-4o-mini` | Extracts structured JSON: `memory_type`, `extracted_tasks`, `associated_threads`, `entities_detected`, `strategic_alignment`, `wisdom_extensions` (Returns `{ data, usage }`) |
| `extractImageText(imageUrl)`| `openai/gpt-4o-mini` | Performs OCR to extract text and a concise summary from an image URL (Returns `{ text, usage }`) |
| `evaluateAgainstTastePreferences(memoryText, preferences[])` | `openai/gpt-4o-mini` | Evaluates against active taste preferences using their WANT/REJECT guardrails; returns insight + usage. |
| `generateSynthesis(memories, tasks, insights, activePreferences, previousReport)` | `openai/gpt-4o-mini` | Extracts patterns, summarizes a weekly backlog against structured preferences into a single markdown digest, and performs contradiction auditing \& signal diffs against the previous report. (Returns `{ report, usage }`) |
| `generateWikiDossier(entityName, entityType, memories)` | `openai/gpt-4o-mini` | Synthesizes a structured Markdown wiki dossier for an entity based on its linked memories. (Returns `{ dossier, usage }`) |
| `generateThreadSummary(threadName, memories)` | `openai/gpt-4o-mini` | Consolidates a thread into a high-level Markdown summary. (Returns `{ summary, usage }`) |
| `classifyMemoryEdge(memoryA, memoryB)` | `openai/gpt-4o-mini` | Classifies the semantic relationship between two memories. Returns `{ relation, direction, confidence, rationale, valid_from, valid_until, usage }`. Used by Phase 21 Typed Edge Classifier. |

### LLM Output Schema (from `extractMetadata`)

```json
{
  "memory_type": "observation | decision | idea | complaint | log",
  "extracted_tasks": [
    { "description": "Action string", "inferred_deadline": "YYYY-MM-DD | null" }
  ],
  "associated_threads": ["Thread name strings"],
  "entities_detected": [
    { "name": "Proper noun", "type": "Person | Project | Concept" }
  ],
  "entity_relationships": [
    {
      "source": "Source entity name (must match entities_detected)",
      "target": "Target entity name (must match entities_detected)",
      "relationship_type": "works_on | depends_on | uses | knows | manages | related_to",
      "confidence": 0.0
    }
  ],
  "strategic_alignment": "1 sentence or null",
  "wisdom_extensions": {
    "learning": { // Handled dynamically via registry architecture
      "topics": [{ "topic_name": "String", "mastery_status": "learning", "milestone_achieved": "String | null" }]
    }
  }
}
```

**Fallback behavior:** If JSON parsing fails, returns a safe default with `memory_type: "observation"` and empty arrays for all list fields.

---

## 2. Ingestion: `ingest-thought`

**Entry point:** Slack `message.channels` event subscription → HTTP POST.

### Request Flow

### Request Flow (`ingest-thought`)

```
1. Receive raw POST body
2. Verify Slack signature (HMAC-SHA256 + 5-min replay window)
3. Handle url_verification challenge (Slack setup handshake)
4. Filter: only process messages from SLACK_CAPTURE_CHANNEL, no subtypes, no bot messages
5. Check for pref:/goal:/principle:/done:/complete: prefix → direct structured routing to taste_preferences or tasks table
6. Generate SHA-256 hash of message content (strictly based on text, no timestamp, to categorically block duplicates)
7. [Phase 17] Classify capture type via LLM with a 0–10 confidence score:
   a. Call `classifyCapture()` → returns { type, confidence }
   b. If confidence < 9 (CONSISTENCY_CUTOFF), run a second pass. If types disagree, apply 0.6 penalty multiplier.
   c. Look up per-type threshold from `capture_thresholds` (defaults to 0.75 if not seeded).
   d. If confidence/10 ≥ threshold → use classified type. Otherwise → fall back to "observation".
8. Insert memory block to `memories` with classified type, `slack_metadata` and `content_hash`.
9. [Async, non-blocking] Record outcome in `classification_outcomes`; nudge threshold down by 0.02 (positive feedback on Slack path).
```

### Full Graph Ingestion Pipeline (`process-memory`)

Triggered asynchronously by Supabase `pg_net` webhook on `memories` insert.

| Step | Operation | Target Table |
|------|-----------|-------------|
| 6a | `getEmbedding()` + `extractMetadata()` (parallel) | — |
| 6b | Update memory with computed embedding and true type | `memories` |
| 6c | Insert extracted tasks | `tasks` |
| 6d | Upsert entities + link via join table (builds `entityNameToId` map) | `entities`, `memory_entities` |
| **6d.5** | **Upsert typed entity edges** (from `entity_relationships` in metadata; resolves source/target via `entityNameToId` map; min confidence 0.5) | **`entity_edges`** |
| 6e | Upsert threads + link via join table | `threads`, `memory_threads` |
| 6f | Download Slack file attachments → upload to Supabase Storage → insert metadata | `artifacts` (table + storage bucket) |
| 6g | (Background webhook on artifacts insert) Fetch artifact, extract OCR/text, generate embedding, update | `artifacts` |
| 6h | (Dynamic) Iterate `wisdom_extensions` payload and delegate to Vertical `.process()` implementations | Dynamic Tables (e.g. `learning_topics`) |
| 6i | Fetch active preferences → `evaluateAgainstTastePreferences()` → insert insight | `system_insights` |
| 6j | Mark `processing_status = 'completed'` and push `cost_metrics` usage | `memories` |

### Error Resiliency & Logging

If the graph population in `process-memory` fails due to external APIs or constraint violations, it will catch the exception, set the row `processing_status = 'failed'`, write the exception block to `processing_error`, and **trigger a Slack HTTP push notification to the capture channel** instructing the operator of the malfunction.

### Slack Confirmation Reply

After processing, the bot replies in-thread with a structured confirmation:
```
Captured as *observation*
🎯 Tasks: 2
🔗 Entities: 3 linked
🧵 Threads: 1
📎 Files: 1 saved
📚 Learning: 1 topic updated (or other Wisdom Verticals)
🧠 Insight: This supports your Q2 delivery milestone.
🧭 Alignment: Relates to project management goals
```

### Dependencies

```json
// deno.json
{
    "imports": {
        "@supabase/functions-js": "jsr:@supabase/functions-js@^2"
    }
}
```

**Direct imports:** `@supabase/supabase-js@2` via `esm.sh`, `brain-engine.ts` via relative path.

---

## 3. MCP Server: `open-brain-mcp`

**Protocol:** Model Context Protocol (MCP) over Streamable HTTP, served via [Hono](https://hono.dev/) web framework.

**Authentication:** `MCP_ACCESS_KEY` verified via `x-brain-key` header or `?key=` query parameter.

### Registered Tools

| Tool | Input | Description |
|------|-------|-------------|
| `search_memories` | `query` (string), `limit?` (10), `threshold?` (0.5) | Semantic vector search via `match_memories` RPC. Returns memory content + joined tasks + linked entity names. |
| `list_memories` | `limit?` (10), `type?`, `days?` | Chronological listing with optional type/date filters. |
| `memory_stats` | *(none)* | Dashboard: total memories, tasks, entities, type breakdown, date range. |
| `capture_memory` | `content` (string) | Full graph ingestion from any AI client — embedding, metadata extraction, task/entity/entity-edge population. |
| `complete_task` | `task_id` (string/uuid) | Mark a task as completed. (Moved to queue) |
| `update_task_status` | `task_id` (string), `status` (string) | Move a task to a different formalized workflow stage (pending, in_progress, blocked, deferred, completed). (Moved to queue) |
| `update_task_deadline` | `task_id` (string), `due_date` (string) | Reschedule a task to a new due date. (Moved to queue) |
| `merge_entities` | `source_entity_id` (string), `target_entity_id` (string) | Deduplicate Knowledge Graph by merging source into target securely. (Moved to queue) |
| `add_taste_preference` | `preference_name`, `domain`, `want`, `reject`, `constraint_type` | Add strict taste preference with boundary parameters. (Moved to queue) |
| `remove_taste_preference` | `preference_id` (string) | Soft-deletes a preference so it's no longer evaluated against. (Moved to queue) |
| `list_taste_preferences` | *(none)* | Directly returns the active taste preferences currently used as rules. |
| `list_tasks` | `status?` (pending \| completed), `limit?` (20) | List and filter tasks by status. |
| `list_entities` | `type?` (Person \| Project \| Concept), `limit?` (20) | List and filter entities by type. |
| `list_threads` | `limit?` (20) | List all active work/life streams. |
| `get_thread_context` | `thread_id` (string/uuid) | Retrieve all memories linked to a specific thread. |
| `get_recent_synthesis` | `limit?` (1) | Fetch the most recently generated cognitive digests/weekly summaries. |
| `list_learning_topics` | `limit?` (20) | List topics tracked in the Learning Wisdom Vertical. |
| `add_learning_milestone` | `topic_id`, `description` | Append a milestone locally to a learning topic via queue. |
| `update_mastery_status` | `topic_id`, `status` | Adjust mastery state of a learning topic via queue. |
| `list_memory_edges` | `memory_id?` (uuid), `relation?`, `limit?` (20) | List typed reasoning edges from the Knowledge Graph. Read-only; not queued. |
| `get_entity_neighbors` | `entity_id` (uuid), `relationship_type?`, `direction?` (outgoing\|incoming\|both), `limit?` (25) | Get all entities directly connected to a given entity with relationship type, weight, and direction. |
| `traverse_entity_graph` | `start_entity_id` (uuid), `max_depth?` (3), `relationship_type?` | Multi-hop entity graph walk via `traverse_entity_graph` recursive CTE RPC. |
| `find_entity_path` | `start_entity_id` (uuid), `end_entity_id` (uuid), `max_depth?` (6) | BFS shortest path between two entities. |
| `list_entity_edge_types` | *(none)* | List all distinct entity relationship types in use with counts and average confidence. |
| `summarize_thread` | `thread_id` (uuid), `dry_run?` (bool) | Trigger thread summarization for a specific thread. Consolidates memories and creates `derived_from` edges. |

---

## 4. Bridge Pattern (Application-Layer)

Applications living in `dashboards/` (like the **Repo Learning Coach**) do not connect to the database directly for Knowledge Graph mutations or semantic search. Instead, they use a **Brain Bridge** that reaches back into the Open Brain via the `open-brain-mcp` Edge Function.

- **Request Format:** Standard JSON-RPC 2.0 via HTTP POST.
- **Authentication:** `x-brain-key` header matching `MCP_ACCESS_KEY`.
- **Primary Tools Used:** `search_memories`, `capture_memory`.

### Key Implementation Details

- **`search_memories`** enriches results by joining `tasks` and `memory_entities → entities` for each match.
- **`capture_memory`** replicates the core ingestion pipeline entirely (metadata extraction, task/entity/thread population, and evaluation against preferences).
- **Gated Risky Operations:** `merge_entities`, `add_taste_preference`, `remove_taste_preference`, `update_task_deadline` and `complete_task` no longer mutate state immediately. Instead they push an intent payload into `mcp_operation_queue` for manual evaluation/approval as a safety lockdown.
- Server uses `McpServer` from `@modelcontextprotocol/sdk` + `StreamableHTTPTransport` from `@hono/mcp`.

### Dependencies

```json
// deno.json (imports resolved by Supabase Deno runtime)
```

**Direct imports:** `@modelcontextprotocol/sdk`, `@hono/mcp`, `hono`, `zod`, `@supabase/supabase-js`, `brain-engine.ts`.

---

## 4. Deployment

```bash
# Deploy functions (no JWT verification — app-level auth is used)
npx supabase functions deploy ingest-thought --no-verify-jwt --workdir .
npx supabase functions deploy process-memory --no-verify-jwt --workdir .
npx supabase functions deploy process-artifact --no-verify-jwt --workdir .
npx supabase functions deploy automated-synthesis --no-verify-jwt --workdir .
npx supabase functions deploy proactive-briefings --no-verify-jwt --workdir .
npx supabase functions deploy work-operating-model-mcp --no-verify-jwt --workdir .
npx supabase functions deploy open-brain-mcp --no-verify-jwt --workdir .
npx supabase functions deploy entity-wiki-generator --no-verify-jwt --workdir .
npx supabase functions deploy classify-memory-edges --no-verify-jwt --workdir .
# Phase 22 — no new Edge Function needed; entity edges are produced by process-memory and open-brain-mcp
```

### Endpoints

| Function | URL Pattern |
|----------|-------------|
| `ingest-thought` | `https://<PROJECT_REF>.supabase.co/functions/v1/ingest-thought` |
| `work-operating-model-mcp` | `https://<PROJECT_REF>.supabase.co/functions/v1/work-operating-model-mcp?key=<MCP_ACCESS_KEY>` |
| `open-brain-mcp` | `https://<PROJECT_REF>.supabase.co/functions/v1/open-brain-mcp?key=<MCP_ACCESS_KEY>` |

---

## 6. Deployment Prerequisites

For scheduled functions (`automated-synthesis`, `proactive-briefings`) to execute via `pg_cron`, the database must be configured with the project's credentials.

### Required Configuration (`system_config` table)
The migrations expect the following keys in the `public.system_config` table:
1. `project_ref`: Your Supabase Project Reference ID.
2. `service_role_key`: Your Service Role API Key.

**How to set:**
Run the following in the Supabase SQL Editor:
```sql
INSERT INTO public.system_config (key, value) VALUES
('project_ref', 'your-project-ref'),
('service_role_key', 'your-service-role-key')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

If these values are missing from the table, the functions will attempt to fallback to `http://kong:8000` (local development), which will likely fail in production.

---

## 5. Known Gaps (vs. Roadmap)

| Gap | Impact |
|-----|--------|
| Only simple files (images, text) supported natively by Edge Functions | Massive spreadsheets or complex PDFs still rely on the out-of-band `heavy-file-ingestion` scripts prior to upload. |
