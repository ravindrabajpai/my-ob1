# SKILL: Open Brain (my-ob1) Project Context

## 1. Project Vision & Identity
This project ("my-ob1") is a standalone cognitive data layer. It functions as a multi-modal capture system, a logistics planner, and a mentor. It aims to bridge daily task execution with long-term strategic alignment and personal growth.

## 2. Architectural Paradigm
- **Data Layer (Supabase):** Postgres backend utilizing `pgvector` for semantic search.
- **Ingestion Layer:** Frictionless capture via Slack webhooks and Supabase Edge Functions.
- **Cognitive Layer:** Antigravity acting as the execution engine via MCP, utilizing distinct persona logic (Strategist, Planner, Mentor).
- **Execution Backend:** Python-based MCP server.

## 3. Current State vs. Target State
- **Current (Phase 1):** Basic foundation established. Manual text capture via Slack into a minimal vector DB. Antigravity MCP connected for basic Q&A.
- **Active Target (Phase 2):** Implementing the Edge Function interceptor (`slack-ingest`) to handle multi-modal inputs, auto-extract metadata using LLMs, and route data into a multi-table relational schema.

## 4. Sub-Context References
Agents must read the following files when working on specific domains:
- **Database Architecture:** Read `schema-state.md` for definitions of `memories`, `artifacts`, `tasks`, `threads`, `entities`, `goals_and_principles`, and `system_insights`.
- **Project Phasing:** Read `roadmap.md` for details on future phases (HyDE Contradictions, Autonomous routing).

## 5. Core Development Directives
- Prefer Python for backend MCP logic.
- Ensure all Edge Functions are written in Deno/TypeScript for Supabase compatibility.
- Never hardcode user context; design the schema to dynamically hold evolving beliefs and goals.