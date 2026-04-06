# How to Add a Wisdom Vertical (Domain-Specific Extension)

> **Parent Index:** [SKILL.md](./SKILL.md) — Read the root index first.

This guide provides standard operating procedures (SOP) for adding a new Domain-Specific Graph Extension (Wisdom Vertical) to the Open Brain using the scalable Vertical Framework.

## 1. Create the Database Schema Requirements
1. Create a new SQL migration in `supabase/migrations/` (e.g., `013_wisdom_vertical_finance.sql`).
2. Define your new domain-specific tables (e.g., `finance_assets`).
3. **Core Requirement:** Ensure they link to the central graph via `memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE`. If the node represents an entity that transcends a single memory, use a join table pattern (like `memory_learning_topics`).
4. Enable Global Row-Level Security (`ENABLE ROW LEVEL SECURITY;`) on all newly created tables.

## 2. Create the Vertical Implementation File
1. Create a new file in `supabase/functions/_shared/verticals/` (e.g., `finance.ts`).
2. Export an object that implements the `WisdomVertical` interface. You must provide:
   - `name`: A unique namespace string (e.g., "finance").
   - `schema`: A JSON Schema subset dictionary describing exactly what the LLM should output.
   - `promptInjection`: A string instructing the LLM *when* and *how* to extract this domain.
   - `process(memoryId, payload, supabase)`: An async function that parses the LLM output and executes the `.insert()` or `.upsert()` into your custom tables.

## 3. Register the Vertical
1. Open `supabase/functions/_shared/verticals/index.ts`.
2. Import your new vertical implementation.
3. Add it to the `activeVerticals` array.
*That's it!* The `brain-engine.ts` metadata extractor and `process-memory` ingestion pipeline will automatically pick up your schema, build the prompt, and delegate ingestion without further code changes.

## 4. Add the AI/Human Interfaces (MCP Tools)
1. Open `supabase/functions/open-brain-mcp/index.ts`.
2. Register **read tools** directly (e.g., `list_finance_assets`) so AI agents can query the domain.
3. Register **mutation tools** (e.g., `add_finance_asset`), but ensure they insert payloads into the `mcp_operation_queue` parameter instead of modifying the database directly to maintain approval locks.

## 5. Update Documentation Context
Complete the loop by updating the `.agents/skills/project-context/` files:
1. Add the new tables to `schema-state.md` and the ER diagram.
2. Ensure any new specific details are captured in `edge-functions.md`.
