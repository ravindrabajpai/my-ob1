# Open Brain Roadmap (Strategist & Mentor)

## Completed (Phases 1–4)
- [x] Initial IaC (Supabase Migrations) baseline
- [x] Refactor core AI extraction/embedding into `_shared` module
- [x] Cleanup Edge function filenames (`intex.ts` to `index.ts`)
- [x] Secure Slack Ingestion with `SLACK_SIGNING_SECRET` cryptographic verification
- [x] Drop legacy `thoughts` schema
- [x] Implement semantic Multi-Modal Contextual Graph (`memories`, `tasks`, `entities`, `threads`)
- [x] Implement `artifacts` table and Slack file download pipeline
- [x] Complex JSON extraction in `_shared/brain-engine.ts`
- [x] Multi-table routing in `ingest-thought` (memories → tasks → entities → threads)
- [x] MCP tools updated (`search_memories`, `list_memories`, `memory_stats`, `capture_memory`)
- [x] `goal:` / `principle:` prefix routing from Slack → `goals_and_principles`
- [x] Active Mentorship: `evaluateAgainstGoals` → `system_insights` on every ingestion

## Future Horizons
- Automated daily/weekly background syntheses (`system_insights`)
- Image OCR / Audio transcription pipeline for `artifacts`
- MCP tools for querying tasks, entities, and threads directly
- Dashboard / reporting Edge Function
