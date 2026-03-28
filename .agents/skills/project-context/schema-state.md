# Database Schema State

## Current Live Tables (Phase 4 — Full Graph)

### Core Storage
- `public.memories`: Foundational text storage with vector embeddings.
  - `id` (UUID), `content` (TEXT), `embedding` (vector(1536)), `type` (TEXT), `created_at`
- `public.artifacts`: Multi-modal file attachments from Slack.
  - `id` (UUID), `memory_id` (UUID FK), `url` (TEXT), `mime_type` (TEXT), `text_content` (TEXT), `created_at`

### The Planner (Execution Layer)
- `public.tasks`: Action items extracted by AI, linked to source memory.
  - `id` (UUID), `memory_id` (UUID FK), `description` (TEXT), `status` (TEXT), `due_date` (TIMESTAMP), `created_at`

### The Strategist (Cognitive Layer)
- `public.entities`: Knowledge Graph nodes (Person, Project, Concept).
  - `id` (UUID), `name` (TEXT), `type` (TEXT), `created_at`. Unique on `(name, type)`.
- `public.memory_entities`: Join table linking `memories` ↔ `entities`.
- `public.threads`: Active streams of work or life logistics.
  - `id` (UUID), `name` (TEXT UNIQUE), `created_at`
- `public.memory_threads`: Join table linking `memories` ↔ `threads`.

### The Mentor (Strategic Layer)
- `public.goals_and_principles`: User-defined goals and operational principles.
  - `id` (UUID), `content` (TEXT), `type` (TEXT: Goal/Principle), `created_at`
- `public.system_insights`: AI-generated evaluations against goals.
  - `id` (UUID), `memory_id` (UUID FK), `content` (TEXT), `created_at`

## Active RPC Functions
- `match_memories`: Semantic vector search over `public.memories`.

## Security Architecture
- **Inbound**: Slack requests verified via `SLACK_SIGNING_SECRET` (HMAC-SHA256 + replay protection).
- **MCP**: Requests verified via `MCP_ACCESS_KEY` header or query param.
- Both Edge Functions deployed with `--no-verify-jwt`, using application-level auth.
