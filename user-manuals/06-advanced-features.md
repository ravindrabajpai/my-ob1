# 06. Advanced Features

Your Open Brain comes with several advanced automated workflows that operate in the background.

## 📈 Automated Synthesis
Every week, the brain performs an **Automated Synthesis** to give you a strategic overview of your week.
1.  **Analyzes** the last 7 days of capture.
2.  **Evaluates adherence** to your explicit Taste Preferences.
3.  **Contradiction Auditing:** Checks if new thoughts conflict with previous plans or beliefs.
4.  **Strategic Drift Detection:** Flags if your daily activity is drifting away from your long-term goals.
5.  **Posts an Executive Digest** (Themes, Alignment, Priorities) directly to your Slack channel.

## 📓 Obsidian Wiki Compiler
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

## 🕸️ Reasoning Graph & Typed Edges
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
The classifier is **operator-driven** — you run it when you want to enrich your graph. Always start with a dry run.

**Local Deno script (recommended):**
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

## 🧵 Thread Summarization (Wiki Synthesis)
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

## 🗺️ Entity Knowledge Graph (Relationship Traversal)
The **Enhanced Knowledge Graph** allows you to navigate explicit, directed relationships between people, projects, and concepts (e.g., *Person X "works_on" Project Y*).

**Traversal Tools:**
- `get_entity_neighbors`: See everything directly connected to a specific node.
- `traverse_entity_graph`: Walk the graph multiple hops deep to find indirect connections.
- `find_entity_path`: Find the shortest logical path between any two entities in your brain.

**Populating Relationships:**
Relationships are **automatically extracted** whenever you capture a memory that mentions two or more related entities.
## 🛡️ Sensitivity Scanning (Privacy Tiers)
The **Sensitivity Gate** is a zero-latency privacy layer that scans all incoming thoughts for sensitive patterns (PII, credentials, health data) and assigns a **Sensitivity Tier**.

**Tiers:**
- **🔓 standard**: Safe for general processing.
- **🔒 personal**: Contains health, medications, or financial data.
- **🚨 restricted**: Contains hard PII (SSNs, API keys, Passwords, etc.).

For more details, see the dedicated [Sensitivity Scanning Manual](./09-sensitivity-scanning.md).

## 📦 Data Portability & Backups
You can export your entire Knowledge Graph to version-controlled JSON files using the **Brain Backup** CLI. This ensures your data is always safe and portable.

For detailed instructions, see the [Data Portability & Backups Manual](./10-data-backups.md).
