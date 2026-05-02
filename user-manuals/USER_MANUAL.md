# 📖 Open Brain (my-ob1) | User Manual

Welcome to your **Open Brain**, a cognitive data layer that captures your raw thoughts, extracts structured knowledge (tasks, entities, threads), and evaluates them against your strategic goals.

---

## 1. The Core Personas
When you interact with **my-ob1**, it acts as three roles simultaneously:

*   **📦 The Planner** — Watches for action items and extracts tasks with inferred deadlines.
*   **🧩 The Strategist** — Maps out a Knowledge Graph of people, projects, and concepts from your context.
*   **🧭 The Mentor** — Evaluates every thought against your stored goals/preferences and surfaces strategic insights.

---

## 2. Capturing Your Thoughts
Capture happens naturally via your dedicated **Slack Capture Channel**.

### 💡 Just Type Naturally
Simply type your thoughts, observations, or meeting notes.
> *"Great meeting with the manager. We need to start the 'poc' for the new AI project by Friday."*

**The bot will reply in-thread with:**
*   **🎯 Tasks:** (Extracted "finalize building AI roadmap")
*   **🔗 Entities:** (Linked "the manager", "AI project")
*   **🧠 Insight:** (Strategic evaluation against your active goals)
*   **🧭 Alignment:** ("This relates to project management goals")

### 📎 Multi-modal (Images & Files)
Upload an image of a whiteboard, a screenshot of code, or a PDF.
*   The system performs OCR to extract text.
*   The text is analyzed, embedded for vector search, and summarized in your Slack reply.

### 🛑 Smart Deduplication
If you send the exact same text twice, the system will **ignore** the second attempt. This protects your Knowledge Graph from accidental double-triggers and Slack delivery retries.

### ⚖️ Adaptive Capture (Phase 17)
The system now classifies your thoughts (observation, decision, idea, etc.) with a confidence score.
- **I'm sure:** If the system is confident, it applies the classification immediately.
- **I'm unsure:** If confidence is low, the system runs a second evaluation pass. If disagreement persists, it defaults to a safe "observation" state to avoid corrupting your signals.
- **Self-Correcting:** As you use the system, the thresholds for these checks automatically adjust (nudge loop) based on successful captures.

---

## 3. Interactive Slack Commmands (Prefix Routing)
You can directly command the brain by using specific prefixes:

### ✅ Task Lifecycle (Phase 19)
Tasks now follow a formal lifecycle. You can move tasks between stages by prefixing:
- **`done: <task>`** — Mark as **completed**.
- **`doing: <task>`** — Mark as **in_progress**.
- **`block: <task>`** — Mark as **blocked**.
- **`defer: <task>`** — Mark as **deferred**.

*Example:* `block: finalize UI design`
*Effect:* Searches for that task and moves it to the `blocked` status.

### 🎯 Setting Goals & Principles
To establish your strategic foundation:
> **`goal: <high-level target>`**
> *Example:* `goal: Ship the Open Brain v2 architecture by end of April`
>
> **`principle: <operating rule>`**
> *Example:* `principle: Always favor Infrastructure-as-Code (IaC)`

### 🎨 Personal Taste Preferences
To create guardrails for the Mentor persona:
> **`pref: <explicit rule>`**
> *Example:* `pref: I want to focus on deep-work coding; reject meetings without an agenda.`
*   *Effect:* Stored as a "WANT" and "REJECT" rule. Future thoughts violating this (like attending an agenda-less meeting) will trigger a Slack warning.

---

## 4. Wisdom Verticals (Domain Extensions)
Specialized "verticals" track niche data beyond standard tasks and entities.

### 📚 Learning Vertical
Specialized tracking for skills. Matches messages relating to learning or mastery.
- **Trigger:** Included automatically if your message relates to learning a skill.
- **Confirmation:** `📚 Learning: Updated`
- **Dashboard:** Use the **Repo Learning Coach** (see Section 5) to view your full curriculum and mastery map.

### 📊 Infographic Generation (Phase 18)
Turn your research or memories into visual infographics.
- **Invocation:** Ask your AI assistant (Claude/Cursor) to "generate an infographic from my latest research on X."
- **Result:** The system writes verbose visual prompts, calls the Gemini API, and saves the resulting image to the `media/` folder.

---

## 5. Connecting Your AI Assistants (MCP Server)
The real power of **my-ob1** is using it as an external knowledge source for AI clients (like Claude, Cursor, or Antigravity).

### 🔗 Connect via URL:
`https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/open-brain-mcp?key=<YOUR_MCP_ACCESS_KEY>`

### 🛠️ Key Tools for Your AI:
*   **`search_memories`**: Perform semantic search over your entire history.
*   **`list_tasks`**: View your active to-do list with life-cycle statuses.
*   **`capture_memory`**: Allow your AI assistant to "remember" its findings directly into your brain.
*   **`list_learning_topics`**: Query your progress in the Learning vertical.
*   **`get_recent_synthesis`**: Fetch the latest weekly report including drift detection notes.
*   **`list_memory_edges`**: Explore the Reasoning Graph — see explicit typed relationships (`supports`, `contradicts`, etc.) between memories.

---

## 6. Repo Learning Coach (Dashboard)
A dedicated web interface for structured learning and codebase onboarding.
- **URL:** `http://localhost:5173` (when running locally)
- **Features:** 
    - **Lessons:** Guided walkthroughs of the my-ob1 architecture.
    - **Quizzes:** Validate your understanding of the schema and extension patterns.
    - **Research:** Deep-dives into the project context files.
    - **Brain Bridge:** See linked memories from your Open Brain while you learn.

---

## 6. Automated Synthesis
Every week, the brain performs an **Automated Synthesis**:
1.  Analyzes the last 7 days of capture.
2.  Evaluates adherence to your **Taste Preferences**.
3.  **Contradiction Auditing:** Checks if new thoughts conflict with previous plans or beliefs.
4.  **Strategic Drift detection:** Flags if daily activity is drifting away from your long-term goals.
5.  Posts an **Executive Digest** (Themes, Alignment, Priorities) directly to your Slack channel.

---

## 7. Obsidian Wiki Compiler (Phase 20)
The Open Brain can compile your unstructured memories into structured, reading-friendly wiki pages and sync them directly to your local Obsidian Vault.

**How it works:**
1.  **Cloud Generation:** A background task (`entity-wiki-generator`) periodically scans your entities and topics that have 3 or more memories linked. It asks an LLM to generate a comprehensive Dossier (Summary, Key Facts, Timeline, Related Entities).
2.  **Local Sync:** You run a local script that downloads these dossiers into your Obsidian directory.

**To run the sync manually:**
1. Ensure your `.env` is set in `.agents/skills/obsidian-wiki-compiler/` (with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `OBSIDIAN_VAULT_PATH`).
2. Run the script:
   ```bash
   cd .agents/skills/obsidian-wiki-compiler
   deno run --allow-net --allow-env --allow-read --allow-write sync-wikis.ts
   ```

---

## 8. Reasoning Graph & Typed Edges (Phase 21)

The **Typed Edge Classifier** upgrades your Knowledge Graph from semantic *similarity* to explicit *logic*. Instead of only knowing "these two memories are related," the system can now answer: **"How are they related?"**

### Relation Types

| Label | Meaning |
|-------|---------|
| `supports` | Memory A strengthens or provides evidence for Memory B |
| `contradicts` | Memory A directly conflicts with Memory B |
| `evolved_into` | Memory A was refined into Memory B over time |
| `supersedes` | Memory A replaced Memory B (newer decision wins) |
| `depends_on` | Memory A is contingent on Memory B |
| `related_to` | Generic association; no strong directional label found |

### How to Run the Classifier

The classifier is **operator-driven** — you run it when you want to enrich your graph. Always start with a dry run:

**Option A — Local Deno script (recommended for first runs):**
```bash
cd my-ob1
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export OPENROUTER_API_KEY="..."

# Dry run first — inspect what would be written
deno run --allow-net --allow-env .agents/skills/typed-edge-classifier/classify.ts --dry-run --limit 20

# Live run — write edges to the database
deno run --allow-net --allow-env .agents/skills/typed-edge-classifier/classify.ts --limit 50
```

**Option B — Via Edge Function (HTTP trigger):**
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/classify-memory-edges" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"limit": 20, "dry_run": true}'
```

### Querying the Reasoning Graph

Once edges are classified, explore them via:
- **MCP tool:** Ask your AI assistant to use `list_memory_edges` (optionally filter by `relation` type)
- **SQL:** `SELECT relation, confidence, metadata->>'rationale' FROM memory_edges ORDER BY created_at DESC LIMIT 20;`

---

## 9. Entity Knowledge Graph (Phase 22)
The **Enhanced Knowledge Graph** allows you to navigate explicit, directed relationships between people, projects, and concepts (e.g., *Person X "works_on" Project Y*).

**Traversal Tools:**
- `get_entity_neighbors`: See everything directly connected to a specific node.
- `traverse_entity_graph`: Walk the graph multiple hops deep to find indirect connections.
- `find_entity_path`: Find the shortest logical path between any two entities in your brain.

**Populating Relationships:**
Relationships are **automatically extracted** whenever you capture a memory that mentions two or more related entities.

---

## 10. Thread Summarization (Phase 23)
As your conversations and projects grow, specific threads can become cluttered with dozens of memories. The **Thread Summarizer** consolidates these long-running streams into high-level dossiers to improve retrieval efficiency and keep the context clear.

**Key Features:**
1.  **Dossier Generation:** Synthesizes a 4-section summary: Core Theme, Key Decisions/Milestones, Open Questions, and Primary Entities.
2.  **Searchability:** The summary is inserted back into your core `memories` table, making it searchable via standard vector search.
3.  **Provenance:** Each summary maintains `derived_from` edges linking back to every source memory, ensuring no data is lost.

**How to Trigger:**
- **Automated:** Runs every **Tuesday at 03:00 AM UTC** for threads with 5+ memories or threads older than 14 days.
- **Manual (MCP):** Use the `summarize_thread` tool in any AI client with a `thread_id`.
- **Manual (CLI):**
  ```bash
  deno run -A .agents/skills/thread-summarizer/summarize.ts --thread=<UUID>
  ```

---

## 11. Security Layers
*   **Slack HMAC Signature Verification**: Ensures only your Slack workspace can trigger ingestion.
*   **Global Database RLS**: Row-Level Security is locked down at the database level. Direct access is blocked.
*   **MCP Secret**: All AI client access requires your unique `MCP_ACCESS_KEY`.

---

## 12. Troubleshooting & Operations

If your **Automated Synthesis** or **Proactive Briefings** fail to appear in Slack, check your project credentials.

### Verifying Credentials
The system stores its own `project_ref` and `service_role_key` in the `system_config` table for scheduled background tasks.

1.  Go to the **Supabase Dashboard** -> **Table Editor**.
2.  Select `system_config`.
3.  Ensure `project_ref` matches your current project.
4.  Ensure `service_role_key` is correct (this must be the `service_role` key, not the `anon` key).
