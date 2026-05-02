# SKILL: Obsidian Wiki Compiler (Sync)

**Purpose:** Connect the cloud-hosted Open Brain Knowledge Graph with your local Obsidian Vault by syncing LLM-compiled Entity and Topic dossiers.

## Architecture Context

The "Wiki Compiler" runs in two phases:
1. **Server-Side Generation:** The `entity-wiki-generator` Edge Function runs on Supabase (triggered via `pg_cron` or manually). It queries the database, uses an LLM to synthesize Markdown dossiers, and stores the results in the `entity_wikis` table.
2. **Local Sync:** Since Edge Functions cannot write to your local hard drive, this local Deno script fetches the cached dossiers from `entity_wikis` and writes them into your Obsidian Vault as `.md` files.

## Prerequisites

1. Deno installed locally (`brew install deno` or `curl -fsSL https://deno.land/install.sh | sh`).
2. Your Supabase URL and an API key (either anon or service_role).
3. The path to your local Obsidian Vault.

## Setup

Create a `.env` file in this directory (`.agents/skills/obsidian-wiki-compiler/.env`) with the following variables:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-or-service-role-key>
OBSIDIAN_VAULT_PATH=/Users/yourusername/Documents/Obsidian
```

## Running the Sync

To manually sync the latest compiled wikis from your database to Obsidian:

```bash
cd .agents/skills/obsidian-wiki-compiler
deno run --allow-net --allow-env --allow-read --allow-write sync-wikis.ts
```

This will:
1. Fetch all rows from `entity_wikis`.
2. Create `OpenBrain/Entities/` and `OpenBrain/Topics/` folders in your vault if they don't exist.
3. Write or overwrite the `.md` files, injecting Obsidian-compatible YAML frontmatter.

## Automating (macOS)

You can set this up to run silently in the background every hour using `cron`.

1. Open your crontab:
   ```bash
   crontab -e
   ```
2. Add the following line (adjust paths as needed):
   ```cron
   0 * * * * cd /path/to/my-ob1/.agents/skills/obsidian-wiki-compiler && /usr/local/bin/deno run --allow-net --allow-env --allow-read --allow-write sync-wikis.ts >> sync.log 2>&1
   ```

*(Note: The server-side Edge Function must be triggered by its own `pg_cron` schedule or via manual invocation to generate new content before the sync script will see any changes.)*
