# 10. Data Portability & Backups

Your **Open Brain** is your digital memory. To ensure you always have a copy of your data regardless of cloud availability, we provide a standalone backup and export utility.

## 📦 Local Brain Backup CLI

The **Brain Backup** tool is a local Deno script that paginates through your Supabase database and exports every major table as a version-controlled JSON file.

### 1. Prerequisites

- **Deno Runtime:** Ensure you have [Deno](https://deno.land/) installed on your local machine.
- **Environment Variables:** You need your Supabase credentials. These are typically stored in a `.env` file in the project root.
  - `SUPABASE_URL`: Your Supabase project URL.
  - `SUPABASE_SERVICE_ROLE_KEY`: Your service-role API key (required for read-access to RLS-protected tables).

### 2. How to Run

Navigate to your `my-ob1` project root and run:

```bash
deno run -A --env .agents/skills/brain-backup/backup.ts
```

*Note: The `--env` flag automatically loads variables from your `.env` file if it exists in the current directory.*

### 3. What Gets Exported?

The script exports **17 core tables**, including:
- **Core:** `memories`, `artifacts`, `tasks`
- **Knowledge Graph:** `entities`, `memory_entities`, `entity_edges`, `memory_edges`, `threads`, `memory_threads`
- **Synthesized Knowledge:** `entity_wikis`, `system_insights`
- **Preferences & Config:** `taste_preferences`, `system_config`
- **Verticals:** `learning_topics`, `memory_learning_topics`, `learning_milestones`

### 4. Output Structure

Exports are saved to a `backup/` directory (automatically ignored by Git for security) with dated filenames:
```text
my-ob1/
└── backup/
    ├── memories-2026-05-02.json
    ├── entities-2026-05-02.json
    ├── tasks-2026-05-02.json
    └── ...
```

## 🛡️ Best Practices

### Version Control
While the `backup/` directory is ignored by the main repo, it is recommended to move these files to a **private, encrypted git repository** or a secure cloud drive to maintain a historical record of your brain's evolution.

### Automated Backups
You can schedule the backup script using `cron` (Mac/Linux) to run automatically.

**Example Crontab (Daily at 2:00 AM):**
```bash
0 2 * * * cd /path/to/my-ob1 && /usr/local/bin/deno run -A --env .agents/skills/brain-backup/backup.ts >> backup.log 2>&1
```

### Data Portability
The exported JSON files follow a flat relational structure, making them easy to import into other systems (Obsidian, Notion, or a local Postgres database) if you ever decide to migrate away from Supabase.
