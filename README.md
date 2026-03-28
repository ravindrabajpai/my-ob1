# 🧠 Open Brain

An AI-powered second brain that captures your raw thoughts from Slack, extracts structured knowledge (tasks, entities, threads), and evaluates them against your long-term goals — all stored in a relational Knowledge Graph on Supabase.

> **Built on the shoulders of [Nate Jones' OB1](https://github.com/NateBJones-Projects/OB1).** This project was inspired by and bootstrapped from Nate's original Open Brain concept and his [YouTube walkthrough](https://www.youtube.com/watch?v=2JiMmye2ezg&t=780s). It has since been extended with a multi-table Knowledge Graph, active mentorship, and thread-based context grouping.

**Open Brain acts as three things at once:**
- **📦 A Planner** — Automatically extracts tasks with deadlines from your stream of consciousness.
- **🧩 A Strategist** — Builds a Knowledge Graph of the people, projects, and concepts you talk about.
- **🧭 A Mentor** — Evaluates every thought against your personal goals and surfaces strategic insights.

---

## Architecture

```
Slack Message
     │
     ▼
┌─────────────────────┐
│  ingest-thought      │  (Supabase Edge Function)
│  • Verify Slack sig  │
│  • Extract metadata  │◄── brain-engine.ts (OpenRouter GPT-4o-mini)
│  • Generate embed    │◄── brain-engine.ts (text-embedding-3-small)
│  • Route to tables   │
│  • Evaluate goals    │◄── brain-engine.ts (evaluateAgainstGoals)
└────────┬────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│  Supabase PostgreSQL (pgvector)                  │
│                                                  │
│  memories ──┬── tasks                            │
│             ├── memory_entities ── entities       │
│             ├── memory_threads ── threads         │
│             ├── artifacts (file storage)          │
│             └── system_insights                  │
│                                                  │
│  goals_and_principles (mentor baseline)          │
└──────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│  open-brain-mcp      │  (Supabase Edge Function)
│  • search_memories   │  Semantic vector search
│  • list_memories     │  Filtered listing
│  • memory_stats      │  Dashboard stats
│  • capture_memory    │  Direct ingestion from AI
└─────────────────────┘
         │
         ▼
   Any MCP Client (Claude, Antigravity, etc.)
```

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
npx supabase link --project-ref YOUR_PROJECT_REF
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

This applies two migrations:
- `001_expanded_schema.sql` — Creates `memories`, `tasks`, `entities`, `memory_entities`, `artifacts`, `goals_and_principles`, `system_insights`, and the `match_memories` RPC.
- `002_threads.sql` — Creates `threads` and `memory_threads`.

### 4. Deploy Edge Functions

```bash
npx supabase functions deploy ingest-thought --no-verify-jwt --workdir .
npx supabase functions deploy open-brain-mcp --no-verify-jwt --workdir .
```

> **Why `--no-verify-jwt`?** Slack and MCP clients don't send Supabase JWTs. Security is handled at the application level via Slack Signing Secret verification and `MCP_ACCESS_KEY`.

### 5. Configure Slack

1. Go to your [Slack App Dashboard](https://api.slack.com/apps) → **Event Subscriptions**.
2. Set the Request URL to: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest-thought`
3. Subscribe to bot events: `message.channels`
4. Invite your bot to your capture channel.

### 6. (Optional) Create a Storage Bucket

If you want to capture file attachments from Slack:
1. Go to Supabase Dashboard → **Storage** → **New Bucket**
2. Name it `artifacts`
3. Set it to public (or configure RLS as needed)

---

## Usage

### Capturing Thoughts
Just type naturally in your Slack channel:
```
Had a great meeting with Sarah about Project Phoenix. Need to draft the budget proposal by Friday.
```

The bot replies with a structured confirmation:
```
Captured as *observation*
🎯 Tasks: 1
🔗 Entities: 2 linked
🧵 Threads: 1
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

Available tools: `search_memories`, `list_memories`, `memory_stats`, `capture_memory`.

---

## Project Structure

```
open-brain/
├── supabase/
│   ├── functions/
│   │   ├── _shared/
│   │   │   └── brain-engine.ts        # Shared AI: embeddings, metadata extraction, goal evaluation
│   │   ├── ingest-thought/
│   │   │   ├── index.ts               # Slack webhook → multi-table graph ingestion
│   │   │   └── deno.json
│   │   └── open-brain-mcp/
│   │       ├── index.ts               # MCP server with 4 semantic tools
│   │       └── deno.json
│   └── migrations/
│       ├── 001_expanded_schema.sql    # Core graph schema (9 tables + RPC)
│       └── 002_threads.sql           # Threads & memory_threads
├── .agents/
│   └── skills/project-context/
│       ├── SKILL.md                   # Agent context loading instructions
│       ├── schema-state.md            # Live database schema reference
│       └── roadmap.md                 # Project roadmap
├── README.md
├── RELEASE_NOTES.md
└── .key.txt                           # Credential tracker (do NOT commit)
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `memories` | Core text storage with vector embeddings |
| `tasks` | Action items with status and deadlines |
| `entities` | Knowledge Graph nodes (Person, Project, Concept) |
| `memory_entities` | Links memories ↔ entities |
| `threads` | Active work/life streams |
| `memory_threads` | Links memories ↔ threads |
| `artifacts` | File attachments (images, docs) from Slack |
| `goals_and_principles` | User-defined strategic goals and principles |
| `system_insights` | AI-generated evaluations against goals |

---

## Security

| Layer | Mechanism |
|-------|-----------|
| Slack → `ingest-thought` | HMAC-SHA256 signature verification via `SLACK_SIGNING_SECRET` + 5-min replay protection |
| AI Client → `open-brain-mcp` | `MCP_ACCESS_KEY` via header (`x-brain-key`) or query param (`?key=`) |
| Supabase JWT | Disabled (`--no-verify-jwt`) in favor of application-level checks above |

---

## License

MIT