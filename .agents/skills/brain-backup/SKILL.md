# SKILL: Local Brain Backup & Export

> **Domain:** Data Portability / Persistence
> **Objective:** Export all core Supabase tables to local JSON files for version control and backup.

## 1. Overview

This skill provides a standalone Deno script that paginates through the Supabase PostgREST API and dumps every major table in the `my-ob1` schema to a dated JSON file in a local `backup/` directory.

## 2. Prerequisites

- **Deno** installed locally.
- **Environment Variables**: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be available. 
  - You can provide them in a `.env` file and run with the `--env` flag.

## 3. Usage

Run the backup script from the project root:

```bash
deno run -A --env .agents/skills/brain-backup/backup.ts
```

### Options
- The script automatically creates a `backup/` directory in the current working directory.
- It paginates 1,000 rows at a time to remain memory-efficient.
- It generates files named `<table>-YYYY-MM-DD.json`.

## 4. Tables Exported

- `memories`
- `tasks`
- `entities`
- `memory_entities`
- `artifacts`
- `system_insights`
- `threads`
- `memory_threads`
- `entity_wikis`
- `memory_edges`
- `entity_edges`
- `taste_preferences`
- `mcp_operation_queue`
- `system_config`
- `learning_topics`
- `memory_learning_topics`
- `learning_milestones`

## 5. Best Practices

- **Versioning**: Add the `backup/` directory to a private Git repository to track your cognitive data growth over time.
- **Automation**: Schedule this script via `cron` (Mac/Linux) or Task Scheduler (Windows) for daily automated backups.
- **Verification**: Check the summary table printed at the end of execution to ensure all tables were exported without errors.
