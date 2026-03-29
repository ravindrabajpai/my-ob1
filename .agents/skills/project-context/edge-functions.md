# Edge Functions Module Reference

> **Parent Index:** [SKILL.md](./SKILL.md) — Read the root index first.

---

## Overview

All server-side logic runs as **Supabase Edge Functions** written in **Deno/TypeScript**. There are two deployed functions and one shared module:

| Function | Path | Purpose |
|----------|------|---------|
| `ingest-thought` | `supabase/functions/ingest-thought/index.ts` | Slack webhook receiver → fast sync insert to `memories` |
| `process-memory` | `supabase/functions/process-memory/index.ts` | Background job (triggered by `pg_net` webhook) → LLM extraction + graph ingestion |
| `open-brain-mcp` | `supabase/functions/open-brain-mcp/index.ts` | MCP server exposing 4 semantic tools to AI clients |
| `_shared/brain-engine.ts` | `supabase/functions/_shared/brain-engine.ts` | Shared AI module (embeddings, metadata extraction, goal evaluation) |

---

## 1. Shared AI Module: `brain-engine.ts`

All LLM operations are centralized here. Both Edge Functions import from this module.

### Functions

| Function | Model | Purpose |
|----------|-------|---------|
| `getEmbedding(text)` | `openai/text-embedding-3-small` | Generates 1536-dim vector embedding via OpenRouter |
| `extractMetadata(text)` | `openai/gpt-4o-mini` | Extracts structured JSON: `memory_type`, `extracted_tasks`, `associated_threads`, `entities_detected`, `strategic_alignment` |
| `evaluateAgainstGoals(memoryText, goals[])` | `openai/gpt-4o-mini` | Evaluates a memory against user's goals/principles; returns 1-2 sentence insight or `null` |

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
  "strategic_alignment": "1 sentence or null"
}
```

**Fallback behavior:** If JSON parsing fails, returns a safe default with `memory_type: "observation"` and empty arrays.

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
5. Check for goal:/principle: prefix → direct route to goals_and_principles table
6. Otherwise: Insert memory block to `memories` with `slack_metadata` -> return 200 OK instantly.
```

### Full Graph Ingestion Pipeline (`process-memory`)

Triggered asynchronously by Supabase `pg_net` webhook on `memories` insert.

| Step | Operation | Target Table |
|------|-----------|-------------|
| 6a | `getEmbedding()` + `extractMetadata()` (parallel) | — |
| 6b | Update memory with computed embedding and true type | `memories` |
| 6c | Insert extracted tasks | `tasks` |
| 6d | Upsert entities + link via join table | `entities`, `memory_entities` |
| 6e | Upsert threads + link via join table | `threads`, `memory_threads` |
| 6f | Download Slack file attachments → upload to Supabase Storage → insert metadata | `artifacts` (table + storage bucket) |
| 6g | Fetch all goals → `evaluateAgainstGoals()` → insert insight | `system_insights` |

### Slack Confirmation Reply

After processing, the bot replies in-thread with a structured confirmation:
```
Captured as *observation*
🎯 Tasks: 2
🔗 Entities: 3 linked
🧵 Threads: 1
📎 Files: 1 saved
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
| `capture_memory` | `content` (string) | Full graph ingestion from any AI client — embedding, metadata extraction, task/entity population. |
| `complete_task` | `task_id` (string/uuid) | Mark a task as completed. |
| `update_task_deadline` | `task_id` (string), `due_date` (string) | Reschedule a task to a new due date. |
| `merge_entities` | `source_entity_id` (string), `target_entity_id` (string) | Deduplicate Knowledge Graph by merging source into target securely. |
| `create_goal` | `content` (string), `type` ("Goal" \| "Principle") | Add a new strategic goal or operational principle. |
| `archive_goal` | `goal_id` (string) | Soft-delete a goal so it is no longer used for evaluating memories. |
| `list_tasks` | `status?` (pending \| completed), `limit?` (20) | List and filter tasks by status. |
| `list_entities` | `type?` (Person \| Project \| Concept), `limit?` (20) | List and filter entities by type. |
| `list_threads` | `limit?` (20) | List all active work/life streams. |
| `get_thread_context` | `thread_id` (string/uuid) | Retrieve all memories linked to a specific thread. |

### Key Implementation Details

- **`search_memories`** enriches results by joining `tasks` and `memory_entities → entities` for each match.
- **`capture_memory`** replicates the core ingestion pipeline entirely (metadata extraction, task/entity/thread population, and evaluation against goals).
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
npx supabase functions deploy open-brain-mcp --no-verify-jwt --workdir .
```

### Endpoints

| Function | URL Pattern |
|----------|-------------|
| `ingest-thought` | `https://<PROJECT_REF>.supabase.co/functions/v1/ingest-thought` |
| `open-brain-mcp` | `https://<PROJECT_REF>.supabase.co/functions/v1/open-brain-mcp?key=<MCP_ACCESS_KEY>` |

---

## 5. Known Gaps (vs. Roadmap)

| Gap | Impact |
|-----|--------|
| No artifact processing (OCR/transcription) | `text_content` column in `artifacts` is always `null` |
