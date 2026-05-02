# 🛡️ Sensitivity Scanning & Privacy Tiers

> **Parent Index:** [README.md](./README.md)

Open Brain automatically protects your privacy by scanning every incoming memory for sensitive patterns and assigning a **Sensitivity Tier**. This allows you to identify and gate sensitive data before it reaches other parts of your knowledge ecosystem.

---

## 1. How It Works

The system uses a zero-latency, regex-based scanner (the **Sensitivity Gate**) that runs immediately upon ingestion. It does not use an LLM, making it fast and deterministic.

Every memory is assigned one of three tiers:

| Tier | Icon | Description |
|---|---|---|
| **standard** | 🔓 | No sensitive patterns detected. Safe for general processing. |
| **personal** | 🔒 | Contains "soft" PII: health data, medications, or broad financial details. |
| **restricted** | 🚨 | Contains "hard" PII: SSNs, Passports, Credit Cards, API Keys, Passwords, or Bank Accounts. |

---

## 2. Ingestion Paths

The sensitivity gate is applied across all capture methods:

- **Slack Capture**: Every message posted to the Slack channel is scanned before the LLM even sees it.
- **AI Clients (MCP)**: The `capture_memory` tool applies the same scanner to thoughts captured via Claude, ChatGPT, or other MCP-enabled clients.

---

## 3. Retroactive Enrichment

If you have historical memories captured before this feature was enabled, you can run the **Retroactive Enrichment** tool to backfill the sensitivity tags.

### Running the Backfill
This is performed using a local Deno skill:

```bash
cd my-ob1

# 1. Check current database status
deno run --allow-env --allow-net --allow-read .agents/skills/retroactive-enrichment/backfill.ts --status

# 2. Preview changes (Dry Run)
deno run --allow-env --allow-net --allow-read .agents/skills/retroactive-enrichment/backfill.ts --dry-run --limit 100

# 3. Apply changes to the database
deno run --allow-env --allow-net --allow-read .agents/skills/retroactive-enrichment/backfill.ts --apply
```

---

## 4. Technical Details

### Scanner Patterns
The scanner currently targets:
- **Financials**: SSNs, credit card numbers, bank account/routing numbers.
- **Security**: API keys (OpenAI, GitHub, etc.), passwords.
- **Documents**: Passport numbers.
- **Health**: Medication names, dosages, medical conditions, and biometrics.

### Schema
The tier is stored in the `sensitivity_tier` column of the `memories` table. You can filter by this column in the Supabase Dashboard or via SQL to identify sensitive entries.

---

## 5. Future Roadmap
In upcoming phases, the `sensitivity_tier` will be used to:
1. Automatically redact data before sending it to certain external AI endpoints.
2. Filter search results for public-facing dashboards.
3. Trigger additional encryption layers for **restricted** content.
