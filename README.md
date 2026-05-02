# 🧠 Open Brain

An AI-powered second brain that captures your raw thoughts from Slack, extracts structured knowledge (tasks, entities, threads), and evaluates them against your long-term goals — all stored in a relational Knowledge Graph on Supabase.

> **Built on the shoulders of [Nate Jones' OB1](https://github.com/NateBJones-Projects/OB1).** This project was inspired by and bootstrapped from Nate's original Open Brain concept and his [YouTube walkthrough](https://www.youtube.com/watch?v=2JiMmye2ezg&t=780s). It has since been extended with a multi-table Knowledge Graph, active mentorship, automated synthesis, multi-modal capabilities, and thread-based context grouping.

**Open Brain acts as three things at once:**
- **📦 A Planner** — Automatically extracts tasks with deadlines from your stream of consciousness.
- **🧩 A Strategist** — Builds a Knowledge Graph of the people, projects, and concepts you talk about.
- **🧭 A Mentor** — Evaluates every thought against your personal goals and surfaces strategic insights.

---

📖 **[USER MANUALS](./user-manuals/README.md)** — Go here for daily usage, Slack commands, and MCP tips.

---

## Architecture

```text
Slack Message (+ optional file attachments)
     │
     ▼
┌─────────────────────────┐
│  ingest-thought          │  Supabase Edge Function (Deno/TS)
│  • Slack signature auth  │
│  • goal:/principle: route│
│  • LLM metadata extract  │◄── brain-engine.ts (GPT-4o-mini via OpenRouter)
│  • Vector embedding      │◄── brain-engine.ts (text-embedding-3-small)
│  • Multi-table routing   │
│  • File → Storage upload │
│  • Goal evaluation       │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│  Supabase PostgreSQL (pgvector)                  │
│                                                  │
│  memories ──┬── tasks                            │
│             ├── memory_entities ── entities       │
│             ├── memory_threads ── threads         │
│             ├── artifacts (Supabase Storage)      │
│             ├── system_insights                  │
│             ├── synthesis_reports                │
│             └── learning_topics ── milestones     │
│                                                  │
│  taste_preferences (strict WANT/REJECT)          │
│  system_config (project configuration)           │
│  match_memories() RPC (Federated vector search)  │
└──────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  open-brain-mcp          │  Supabase Edge Function (Deno/TS)
│  • search_memories       │  Semantic vector search + entity/task joins
│  • list_memories         │  Filtered chronological listing
│  • memory_stats          │  Dashboard stats (memories, tasks, entities)
│  • capture_memory        │  Direct graph ingestion from any AI client
│  • ...and 18 more tools  │
└─────────────────────────┘
     │
     ▼
┌─────────────────────────┐
│  Learning Coach App      │  Express + React Dashboard
│  (Brain Bridge Pattern)  │  Connects via MCP HTTP Bridge
└─────────────────────────┘

Background Processing Edge Functions:
• process-memory: Async LLM extraction and graph ingestion (triggered via pg_net).
• process-artifact: OCR/Transcription for Multi-Modal attachments (triggered via pg_net).
• automated-synthesis: Weekly digest generation with drift detection.
• proactive-briefings: Daily morning status and strategic insights.
• work-operating-model-mcp: Five-layer interview workflow for BYOC contexts.
```

---

## Phase 4: Enforcing the "Doc-First" Workflow

To maintain this discipline over time, adapt your prompting strategy:

1. **Start tasks with an explicit plan request:**
   *Example Prompt:* "I want to add a new edge function for processing emails. Read the docs, then draft the update to `docs/02-EDGE_FUNCTIONS.md` for my approval before you touch the `supabase/functions` code."
2. **Enforce Markdown Artifacts:**
   Ask Antigravity to present the proposed architecture design as an Artifact (a formatted markdown document). Review the artifact, and once approved, instruct the agent to copy that artifact into the `docs/` folder and begin coding.

---

## Quick Start

### Prerequisites
- A [Supabase](https://supabase.com) account (free tier works)
- A [Slack](https://api.slack.com/apps) workspace with a bot app
- An [OpenRouter](https://openrouter.ai) API key
- Node.js 18+ and the [Supabase CLI](https://supabase.com/docs/guides/cli)

### 1. Clone & Link

```bash
git clone https://github.com/YOUR_USERNAME/open-brain.git
cd open-brain
npx supabase link --project-ref YOUR_PROJECT_REF --workdir .
```

### 2. Set Secrets

```bash
npx supabase secrets set \
  OPENROUTER_API_KEY=sk-or-v1-... \
  SLACK_BOT_TOKEN=xoxb-... \
  SLACK_CAPTURE_CHANNEL=C0XXXXXXX \
  SLACK_SIGNING_SECRET=your_slack_signing_secret \
  MCP_ACCESS_KEY=$(openssl rand -hex 32)
```

### 3. Push the Database Schema

```bash
npx supabase db push --workdir .
```

This applies migrations up to `007_artifact_processing_and_rls.sql`, establishing 10 tables, federated search RPCs, pg_net webhooks, and ensuring Global Row-Level Security (RLS) is enforced.

### 4. Deploy Edge Functions

```bash
npx supabase functions deploy ingest-thought --no-verify-jwt --workdir .
npx supabase functions deploy process-memory --no-verify-jwt --workdir .
npx supabase functions deploy process-artifact --no-verify-jwt --workdir .
npx supabase functions deploy automated-synthesis --no-verify-jwt --workdir .
npx supabase functions deploy open-brain-mcp --no-verify-jwt --workdir .
```

> **Why `--no-verify-jwt`?** Slack, internal webhooks, and MCP clients don't send Supabase Auth JWTs. Security is handled at the application level via Slack Signing Secret verification, the `SUPABASE_SERVICE_ROLE_KEY` for internal webhooks, and the `MCP_ACCESS_KEY`.

### 5. Configure Slack

1. Go to your [Slack App Dashboard](https://api.slack.com/apps) → **Event Subscriptions**.
2. Set the Request URL to: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest-thought`
3. Subscribe to bot events: `message.channels`
4. Invite your bot to your capture channel.

### 6. Create Artifacts Storage Bucket

1. Go to Supabase Dashboard → **Storage** → **New Bucket**
2. Name it `artifacts`
3. Set it to public (or configure RLS as needed)

### 7. Configure Project Credentials

For scheduled jobs (Automated Synthesis, Proactive Briefings) to work in production, you must store your project credentials in the `system_config` table.

Run this SQL in your Supabase Dashboard:
```sql
INSERT INTO public.system_config (key, value) VALUES
('project_ref', 'your-actual-project-ref'),
('service_role_key', 'your-actual-service-role-key')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

---

## Applying Changes

Whenever you modify the database schema or Edge Functions, use the following commands to synchronize your remote project:

### 1. Link & Push Database Migrations
```bash
npx supabase link --project-ref YOUR_PROJECT_REF --workdir .
npx supabase db push --workdir .
```

### 2. Deploy Modified Functions
```bash
npx supabase functions deploy <function-name> --no-verify-jwt --workdir .
```

---

## Usage

### Capturing Thoughts
Just type naturally in your Slack channel, optionally attaching images/files:
```
Had a great meeting with Sarah about Project Phoenix. Need to draft the budget proposal by Friday.
```

The bot replies with a structured confirmation:
```
Captured as *observation*
🎯 Tasks: 1
🔗 Entities: 2 linked
🧵 Threads: 1
📎 Files: 1 saved
🧭 Alignment: Relates to project management goals
🧠 Insight: This directly supports your Q2 delivery milestone.
```

### Setting Goals & Principles
Use the `goal:` or `principle:` prefix:
```
goal: Ship the Open Brain v2 architecture by end of March
principle: Always prefer Infrastructure-as-Code over manual changes
```

Once goals are set, **every future message** is evaluated against them and strategic insights appear automatically.

### Querying via MCP
Connect any MCP-compatible AI client using:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/open-brain-mcp?key=YOUR_MCP_ACCESS_KEY
```

Available tools support searching via semantic matching, querying graph entities, completing tasks, and directly ingesting data through AI.

---

## Project Structure

```
open-brain/
├── supabase/
│   ├── functions/
│   │   ├── _shared/
│   │   │   └── brain-engine.ts        # Shared AI: embeddings, metadata, verticals registry
│   │   ├── ingest-thought/            # Adaptive classification (Phase 17)
│   │   ├── process-memory/            # LLM ingestion worker with Vertical delegation
│   │   ├── process-artifact/          # Multi-Modal extraction worker
│   │   ├── automated-synthesis/       # Weekly digest cron (Drift detection, Signal Diffs)
│   │   ├── proactive-briefings/       # Daily Slack briefings
│   │   ├── work-operating-model-mcp/  # BYOC interview workflow
│   │   └── open-brain-mcp/            # MCP server with 18 tools
│   └── migrations/
│       ├── 001..018...sql             # Migrations up to Repo Learning Coach tables
├── dashboards/
│   └── repo-learning-coach/           # Express + React learning dashboard
├── .agents/
│   ├── skills/
│   │   ├── project-context/
│   │   ├── infographic-generator/     # Visual summary generation skill
│   │   ├── work-operating-model/      # BYOC context synthesis skill
│   │   └── ...
│   └── workflows/
├── README.md
├── RELEASE_NOTES.md
├── user-manuals/
```

---

## Database Schema

| `memories` | Core text storage with vector embeddings |
| `tasks` | Action items with lifecycle statuses (pending, in_progress, blocked, deferred, completed) |
| `entities` | Knowledge Graph nodes (Person, Project, Concept) |
| `threads` | Active work/life streams |
| `artifacts` | File attachments (images, docs) with OCR text & embeddings |
| `taste_preferences` | Explicit WANT/REJECT guardrails |
| `system_insights` | AI-generated evaluations against preferences |
| `synthesis_reports` | AI-generated weekly digest with Signal Diffs and Drift Detection |
| `learning_topics` | Domain tracking for skills (Wisdom Vertical) |
| `repo_learning_*` | 10 tables backing the dashboard app (quizzes, progress, research) |
| `system_config` | Persistent configuration for background workers |

---

## Security

| Layer | Mechanism |
|-------|-----------|
| Slack → `ingest-thought` | HMAC-SHA256 signature verification via `SLACK_SIGNING_SECRET` + 5-min replay protection |
| AI Client → `open-brain-mcp` | `MCP_ACCESS_KEY` via header (`x-brain-key`) or query param (`?key=`) |
| Data API → PostgreSQL | Global Row-Level Security (RLS) is ENFORCED on ALL Tables. External REST/GraphQL queries are blocked |
| Supabase JWT | Disabled (`--no-verify-jwt`) in favor of application-level checks and secure `SUPABASE_SERVICE_ROLE_KEY` usage for backend triggers |

---

## License

MIT