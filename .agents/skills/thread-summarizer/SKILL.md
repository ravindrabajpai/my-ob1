# SKILL: Thread Summarizer (Wiki Synthesis)

> **Context:** Consolidates long or dormant threads into high-level wiki dossiers.
> **Logic:** Summarizes memories via LLM, creates a "summary memory", caches in `entity_wikis`, and writes `derived_from` provenance edges.

---

## When to Use

1. **Information Overload:** A thread has 10+ memories and it's getting hard for AI agents to process the raw history.
2. **Dormant Projects:** A project thread is finishing, and you want a definitive "closing digest".
3. **Weekly Maintenance:** Run as a background batch to keep the graph "compact" for efficient semantic search.

---

## Eligibility Criteria

By default, the summarizer only processes threads that meet at least one of these:
- **Memory Count:** >= 5 memories linked to the thread.
- **Thread Age:** > 14 days since the thread was created.

---

## Local Execution (Deno)

Run the CLI script to trigger summarization from your local machine.

```bash
# 1. Dry run (report eligible threads without writing to DB)
deno run -A .agents/skills/thread-summarizer/summarize.ts --dry-run

# 2. Summarize a specific thread
deno run -A .agents/skills/thread-summarizer/summarize.ts --thread=<THREAD_UUID>

# 3. Summarize top 5 eligible threads
deno run -A .agents/skills/thread-summarizer/summarize.ts --limit=5

# 4. Force re-summarization (even if not strictly eligible)
deno run -A .agents/skills/thread-summarizer/summarize.ts --thread=<THREAD_UUID> --force
```

---

## Expected Outputs

1. **`memories` Table:** A new row of `type: log` with the summary text.
2. **`entity_wikis` Table:** A new cache row with `reference_type: thread`.
3. **`memory_edges` Table:** Multiple rows with `relation: derived_from` linking the summary memory to the source atoms.

---

## Automation (pg_cron)

The system is configured to run this automatically every **Tuesday at 03:00 AM UTC** (Migration `022`).
