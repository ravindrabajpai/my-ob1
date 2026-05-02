#!/usr/bin/env -S deno run --allow-env --allow-net --allow-read

/**
 * backfill.ts
 * Retroactively applies sensitivity_tier to historical memories.
 */

import { parse } from "https://deno.land/std@0.204.0/flags/mod.ts";
import { load } from "https://deno.land/std@0.204.0/dotenv/mod.ts";

const flags = parse(Deno.args, {
  boolean: ["dry-run", "apply", "status"],
  string: ["limit"],
  default: { limit: "200" },
});

const env = await load({ envPath: "./.env.local" });
const SUPABASE_URL = env["SUPABASE_URL"] || Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"] || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local or environment.");
  Deno.exit(1);
}

const RESTRICTED_PATTERNS: [RegExp, string][] = [
  [/\b\d{3}-?\d{2}-?\d{4}\b/, "ssn_pattern"],
  [/\b[A-Z]{1,2}\d{6,9}\b/, "passport_pattern"],
  [/\b\d{8,17}\b.*\b(account|routing|iban)\b/i, "bank_account"],
  [/\b(account|routing)\b.*\b\d{8,17}\b/i, "bank_account"],
  [/\b(sk-|pk_live_|sk_live_|ghp_|gho_|AKIA)[A-Za-z0-9]{10,}/i, "api_key"],
  [/\bpassword\s*[:=]\s*\S+/i, "password_value"],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, "credit_card"],
];

const PERSONAL_PATTERNS: [RegExp, string][] = [
  [/\b\d+\s*mg\b(?!\s*\/\s*(dL|kg|L|ml))/i, "medication_dosage"],
  [/\b(pregabalin|metoprolol|losartan|lisinopril|aspirin|atorvastatin|sertraline|metformin|gabapentin|prednisone|insulin|warfarin)\b/i, "drug_name"],
  [/\b(glucose|a1c|cholesterol|blood pressure|bp|hrv|bmi)\b.*\b\d+/i, "health_measurement"],
  [/\b(diagnosed|diagnosis|prediabetic|diabetic|arrhythmia|ablation)\b/i, "medical_condition"],
  [/\b(salary|income|net worth|401k|ira|portfolio)\b.*\b\$?\d/i, "financial_detail"],
  [/\b\$\d{3,}[,\d]*\b/i, "financial_amount"],
];

function scanSensitivity(text: string): { tier: string; reasons: string[] } {
  for (const [pattern, reason] of RESTRICTED_PATTERNS) {
    if (pattern.test(text)) return { tier: "restricted", reasons: [reason] };
  }
  const reasons: string[] = [];
  for (const [pattern, reason] of PERSONAL_PATTERNS) {
    if (pattern.test(text)) reasons.push(reason);
  }
  if (reasons.length > 0) return { tier: "personal", reasons };
  return { tier: "standard", reasons: [] };
}

async function fetchBatch(offset: number, limit: number) {
  const url = `${SUPABASE_URL}/rest/v1/memories?select=id,content,sensitivity_tier&order=created_at.asc&limit=${limit}&offset=${offset}`;
  const resp = await fetch(url, {
    headers: {
      "apikey": SERVICE_ROLE_KEY!,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

async function updateSensitivity(id: string, tier: string) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/set_memory_sensitivity`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": SERVICE_ROLE_KEY!,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_memory_id: id, p_tier: tier }),
  });
  if (!resp.ok) throw new Error(`Update failed for ${id}: ${resp.status} ${await resp.text()}`);
}

async function main() {
  if (flags.status) {
    const url = `${SUPABASE_URL}/rest/v1/memories?select=sensitivity_tier`;
    const resp = await fetch(url, {
        headers: {
            "apikey": SERVICE_ROLE_KEY!,
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
    });
    if (!resp.ok) {
        const err = await resp.text();
        console.error(`Error: Status check failed: ${resp.status} ${err}`);
        return;
    }
    const data = await resp.json();
    if (!Array.isArray(data)) {
        console.error("Error: Expected array from Supabase, got:", data);
        return;
    }
    const stats: Record<string, number> = { standard: 0, personal: 0, restricted: 0 };
    data.forEach((m: any) => { 
        const tier = m.sensitivity_tier || "standard";
        stats[tier] = (stats[tier] || 0) + 1;
    });
    console.log("Sensitivity Stats:");
    console.table(stats);
    return;
  }

  if (!flags["dry-run"] && !flags.apply) {
    console.log("Usage: backfill.ts [--dry-run | --apply | --status] [--limit N]");
    return;
  }

  console.log(`Starting sensitivity backfill (${flags["dry-run"] ? "DRY RUN" : "APPLY"})...`);

  let offset = 0;
  const limit = parseInt(flags.limit);
  let processed = 0;
  let upgraded = 0;

  while (true) {
    const batch = await fetchBatch(offset, 100);
    if (!batch.length) break;

    for (const memory of batch) {
      if (processed >= limit) break;
      
      const { tier, reasons } = scanSensitivity(memory.content || "");
      if (tier !== (memory.sensitivity_tier || "standard")) {
        console.log(`[${tier.toUpperCase()}] ${memory.id} - Reasons: ${reasons.join(", ")}`);
        if (flags.apply) {
          await updateSensitivity(memory.id, tier);
        }
        upgraded++;
      }
      processed++;
    }

    if (processed >= limit || batch.length < 100) break;
    offset += 100;
  }

  console.log(`\nDone. Processed: ${processed}, Upgraded: ${upgraded}`);
}

main().catch(console.error);
