/**
 * summarize.ts — Local Deno CLI to trigger thread summarization.
 * 
 * Usage:
 *   deno run -A summarize.ts --dry-run
 *   deno run -A summarize.ts --thread=<UUID>
 *   deno run -A summarize.ts --limit=5
 */

import { parse } from "https://deno.land/std/flags/mod.ts";
import "https://deno.land/x/dotenv/load.ts";

const flags = parse(Deno.args, {
    boolean: ["dry-run", "force"],
    string: ["thread", "limit"],
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY");

if (!SUPABASE_URL || !MCP_ACCESS_KEY) {
    console.error("Error: SUPABASE_URL and MCP_ACCESS_KEY must be set in environment or .env file.");
    Deno.exit(1);
}

async function run() {
    const payload = {
        thread_id: flags.thread || null,
        dry_run: flags["dry-run"] || false,
        limit: flags.limit ? parseInt(flags.limit) : 10,
        force: flags.force || false,
    };

    console.log(`[thread-summarizer] Triggering summarization...`);
    console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/thread-summarizer`, {
        method: "POST",
        headers: {
            "x-brain-key": MCP_ACCESS_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Error ${response.status}: ${text}`);
        Deno.exit(1);
    }

    const result = await response.json();
    console.log(`\nSuccess!`);
    console.log(`Processed: ${result.processed}`);
    
    if (result.results && result.results.length > 0) {
        console.log(`\nResults:`);
        result.results.forEach((r: any) => {
            console.log(`- [${r.status}] ${r.name} (${r.thread_id})`);
            if (r.summary_memory_id) console.log(`  Summary Memory: ${r.summary_memory_id}`);
            if (r.reason) console.log(`  Reason: ${r.reason}`);
        });
    }

    if (result.usage) {
        console.log(`\nUsage: ${JSON.stringify(result.usage)}`);
    }
}

run().catch(err => {
    console.error("Execution failed:", err);
    Deno.exit(1);
});
