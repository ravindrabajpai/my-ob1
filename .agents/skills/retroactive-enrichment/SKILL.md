# SKILL: Retroactive Enrichment & Sensitivity Scanning

> **Purpose:** Backfills the `sensitivity_tier` column for historical memories using regex-based scanning.

## 1. Overview

This skill provides a local Deno CLI to iterate over existing memories and apply the sensitivity classification logic (`standard`, `personal`, `restricted`) retroactively.

## 2. Usage

Run this skill from the root of the `my-ob1` repository.

### Status Check
Show how many memories are currently classified as `standard` (default) vs others.
```bash
deno run --allow-env --allow-net --allow-read .agents/skills/retroactive-enrichment/backfill.ts --status
```

### Dry Run
Scan memories and preview what would be upgraded without writing to the database.
```bash
deno run --allow-env --allow-net --allow-read .agents/skills/retroactive-enrichment/backfill.ts --dry-run --limit 50
```

### Apply Backfill
Perform the live update on the database.
```bash
deno run --allow-env --allow-net --allow-read .agents/skills/retroactive-enrichment/backfill.ts --apply
```

## 3. Configuration

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to be set in `.env.local` at the root of the `my-ob1` repository.
