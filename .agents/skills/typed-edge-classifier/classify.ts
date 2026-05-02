#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Typed Edge Classifier — Local Deno Skill Script
 * Phase 21 of my-ob1
 *
 * Populates `public.memory_edges` with explicit semantic reasoning relations
 * between memories (supports, contradicts, evolved_into, supersedes, depends_on, related_to).
 *
 * Strategy:
 *   1. Pull memory_entities to build an entity co-occurrence map.
 *   2. Find pairs of memories that share ≥ minSupport common entities.
 *   3. Skip pairs that already have a strong (non-related_to) typed edge.
 *   4. For each remaining pair, call GPT-4o-mini via OpenRouter with the six-label
 *      classification prompt (adapted from OB1 classify-edges.mjs).
 *   5. If confidence ≥ minConfidence, insert via the `memory_edges_upsert` RPC
 *      (or print in dry-run mode).
 *
 * Required environment variables:
 *   SUPABASE_URL              — https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service_role secret key (write access)
 *   OPENROUTER_API_KEY        — for GPT-4o-mini classification calls
 *
 * Usage:
 *   # Dry run (reads only; never writes)
 *   deno run --allow-net --allow-env classify.ts --dry-run --limit 20
 *
 *   # Live run
 *   deno run --allow-net --allow-env classify.ts --limit 50
 *
 *   # Classify a single explicit pair
 *   deno run --allow-net --allow-env classify.ts --pair <UUID_A>,<UUID_B>
 */

// ── constants ────────────────────────────────────────────────────────────────

const CLASSIFIER_VERSION = "typed-edge-classifier-1.0.0";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const TYPED_RELATIONS = new Set([
    "supports",
    "contradicts",
    "evolved_into",
    "supersedes",
    "depends_on",
    "related_to",
]);

// ── arg parsing ──────────────────────────────────────────────────────────────

interface Args {
    dryRun: boolean;
    limit: number;
    minSupport: number;
    minConfidence: number;
    pair: [string, string] | null;
}

function parseArgs(argv: string[]): Args {
    const args: Args = {
        dryRun: false,
        limit: 20,
        minSupport: 2,
        minConfidence: 0.75,
        pair: null,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--dry-run") args.dryRun = true;
        else if (a === "--limit") args.limit = Number(argv[++i]) || 20;
        else if (a === "--min-support") args.minSupport = Number(argv[++i]) || 2;
        else if (a === "--min-confidence") args.minConfidence = Number(argv[++i]) || 0.75;
        else if (a === "--pair") {
            const parts = String(argv[++i]).split(",").map((s) => s.trim());
            if (parts.length !== 2) {
                console.error("--pair expects exactly two UUIDs separated by a comma");
                Deno.exit(1);
            }
            args.pair = [parts[0], parts[1]];
        } else if (a === "--help" || a === "-h") {
            printHelp();
            Deno.exit(0);
        }
    }
    return args;
}

function printHelp() {
    console.log(`
Typed Edge Classifier — my-ob1 (Phase 21)

Usage: deno run --allow-net --allow-env classify.ts [flags]

Candidate selection:
  --limit N                Max candidate pairs to consider (default 20)
  --min-support N          Min shared-entity count per pair (default 2)
  --pair UUID_A,UUID_B     Classify one explicit pair; skips sampling

Filtering:
  --min-confidence N       Skip inserts below this confidence (default 0.75)

Safety:
  --dry-run                Classify but do not INSERT; just print results

Environment variables required:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  OPENROUTER_API_KEY
`.trim());
}

// ── env loading ──────────────────────────────────────────────────────────────

interface Env {
    supabaseUrl: string;
    serviceRoleKey: string;
    openrouterKey: string;
}

function loadEnv(): Env {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";
    const missing: string[] = [];
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!openrouterKey) missing.push("OPENROUTER_API_KEY");
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
    return { supabaseUrl: supabaseUrl.replace(/\/+$/, ""), serviceRoleKey, openrouterKey };
}

// ── Supabase REST client ──────────────────────────────────────────────────────

function makeSupabaseClient(env: Env) {
    const base = `${env.supabaseUrl}/rest/v1`;
    const headers = {
        apikey: env.serviceRoleKey,
        authorization: `Bearer ${env.serviceRoleKey}`,
    };
    return {
        async get(path: string): Promise<any[]> {
            const r = await fetch(`${base}/${path}`, { headers });
            if (!r.ok) {
                const body = await r.text();
                throw new Error(`GET ${path}: ${r.status} ${body.slice(0, 400)}`);
            }
            return r.json();
        },
        async post(path: string, body: unknown): Promise<any> {
            const r = await fetch(`${base}/${path}`, {
                method: "POST",
                headers: { ...headers, "content-type": "application/json", prefer: "return=representation" },
                body: JSON.stringify(body),
            });
            if (!r.ok) {
                const text = await r.text();
                throw new Error(`POST ${path}: ${r.status} ${text.slice(0, 400)}`);
            }
            return r.json();
        },
    };
}

// ── candidate sampling ────────────────────────────────────────────────────────

async function buildEntityMap(sb: ReturnType<typeof makeSupabaseClient>): Promise<Map<string, string[]>> {
    const rows = await sb.get(`memory_entities?select=memory_id,entity_id&order=memory_id&limit=5000`);
    const map = new Map<string, string[]>();
    for (const r of rows) {
        const arr = map.get(r.memory_id) || [];
        arr.push(r.entity_id);
        map.set(r.memory_id, arr);
    }
    return map;
}

function findCandidatePairs(
    entityMap: Map<string, string[]>,
    minSupport: number,
    pairLimit: number
): Array<{ from_memory_id: string; to_memory_id: string; support: number }> {
    const ids = [...entityMap.keys()];
    const pairs: Array<{ from_memory_id: string; to_memory_id: string; support: number }> = [];

    for (let i = 0; i < ids.length; i++) {
        const entA = new Set(entityMap.get(ids[i])!);
        for (let j = i + 1; j < ids.length; j++) {
            const entB = entityMap.get(ids[j])!;
            let overlap = 0;
            for (const e of entB) {
                if (entA.has(e)) overlap++;
                if (overlap >= minSupport) break;
            }
            if (overlap >= minSupport) pairs.push({ from_memory_id: ids[i], to_memory_id: ids[j], support: overlap });
            if (pairs.length >= pairLimit * 4) break;
        }
        if (pairs.length >= pairLimit * 4) break;
    }

    pairs.sort((a, b) => b.support - a.support);
    return pairs.slice(0, pairLimit);
}

async function isAlreadyClassified(sb: ReturnType<typeof makeSupabaseClient>, a: string, b: string): Promise<boolean> {
    try {
        const rows = await sb.get(
            `memory_edges?select=id&relation=neq.related_to` +
            `&or=(and(from_memory_id.eq.${a},to_memory_id.eq.${b}),and(from_memory_id.eq.${b},to_memory_id.eq.${a}))` +
            `&limit=1`
        );
        return rows.length > 0;
    } catch {
        return false;
    }
}

// ── LLM classification ────────────────────────────────────────────────────────

interface ClassifyResult {
    relation: string;
    direction: string;
    confidence: number;
    rationale: string;
    valid_from: string | null;
    valid_until: string | null;
}

async function classifyPair(
    env: Env,
    memA: { id: string; content: string; created_at: string },
    memB: { id: string; content: string; created_at: string }
): Promise<ClassifyResult> {
    const systemPrompt =
        `You classify the semantic relationship between two captured memories from someone's personal knowledge base.

ALLOWED RELATION TYPES (pick exactly one, or "none"):

  supports      — Memory A strengthens or provides evidence for Memory B.
  contradicts   — Memory A disagrees with or disproves Memory B. Be rare with this label.
  evolved_into  — Memory A was replaced by a refined or updated Memory B over time.
  supersedes    — Memory A is the newer replacement for Memory B (for decisions or versions).
  depends_on    — Memory A is conditional on Memory B being true or completing first.
  related_to    — Generic association; no specific label fits. Use sparingly; prefer "none".

RETURN "none" WHEN the memories merely co-mention an entity without a directional relation,
or when no specific label is clearly better than related_to.

DIRECTION: set direction="B_to_A" if the relation runs B→A; "symmetric" if bidirectional;
otherwise "A_to_B".

TEMPORALITY: populate valid_from/valid_until as ISO YYYY-MM-DD if clearly bounded, else null.

OUTPUT strict valid JSON, no markdown:
{"relation":"<type|none>","direction":"A_to_B|B_to_A|symmetric","confidence":0.0-1.0,"rationale":"...","valid_from":"YYYY-MM-DD|null","valid_until":"YYYY-MM-DD|null"}`;

    const userPrompt =
        `Memory A (id=${memA.id}, date=${String(memA.created_at).slice(0, 10)}):\n${String(memA.content).slice(0, 800)}\n\n` +
        `Memory B (id=${memB.id}, date=${String(memB.created_at).slice(0, 10)}):\n${String(memB.content).slice(0, 800)}\n\nClassify the relationship.`;

    const r = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.openrouterKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.1,
        }),
    });

    if (!r.ok) {
        const msg = await r.text().catch(() => "");
        throw new Error(`OpenRouter classify call failed: ${r.status} ${msg.slice(0, 200)}`);
    }

    const d = await r.json();
    const raw = d.choices?.[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();

    let parsed: any;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        throw new Error(`JSON parse failed, raw: ${raw.slice(0, 200)}`);
    }

    return {
        relation:    String(parsed.relation    || "none"),
        direction:   String(parsed.direction   || "A_to_B"),
        confidence:  typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0,
        rationale:   String(parsed.rationale   || ""),
        valid_from:  parsed.valid_from  && parsed.valid_from  !== "null" ? parsed.valid_from  : null,
        valid_until: parsed.valid_until && parsed.valid_until !== "null" ? parsed.valid_until : null,
    };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(Deno.args);
    const env = loadEnv();
    const sb = makeSupabaseClient(env);

    console.log(`[classify] dry_run=${args.dryRun}  limit=${args.limit}  min_support=${args.minSupport}  min_confidence=${args.minConfidence}`);

    // Build candidate pairs
    let pairs: Array<{ from_memory_id: string; to_memory_id: string; support: number }>;

    if (args.pair) {
        console.log(`[classify] single explicit pair: ${args.pair[0]}, ${args.pair[1]}`);
        pairs = [{ from_memory_id: args.pair[0], to_memory_id: args.pair[1], support: 1 }];
    } else {
        console.log("[classify] building entity co-occurrence map...");
        const entityMap = await buildEntityMap(sb);
        console.log(`[classify] entity map: ${entityMap.size} memories with entity links`);
        pairs = findCandidatePairs(entityMap, args.minSupport, args.limit);
        console.log(`[classify] found ${pairs.length} candidate pairs`);
    }

    // Fetch all needed memories
    const allIds = [...new Set(pairs.flatMap(p => [p.from_memory_id, p.to_memory_id]))];
    const memoriesRaw = allIds.length > 0
        ? await sb.get(`memories?select=id,content,created_at&id=in.(${allIds.join(",")})`)
        : [];
    const memoryById = new Map(memoriesRaw.map((m: any) => [m.id, m]));

    // Process pairs
    const counts: Record<string, number> = {};
    const track = (status: string) => { counts[status] = (counts[status] ?? 0) + 1; };

    for (const pair of pairs) {
        const memA = memoryById.get(pair.from_memory_id);
        const memB = memoryById.get(pair.to_memory_id);

        if (!memA || !memB) {
            track("skip_missing_memory");
            continue;
        }

        const alreadyDone = await isAlreadyClassified(sb, pair.from_memory_id, pair.to_memory_id);
        if (alreadyDone) {
            track("skip_already_classified");
            continue;
        }

        let cls: ClassifyResult;
        try {
            cls = await classifyPair(env, memA, memB);
        } catch (e: any) {
            console.error(`[classify] error for pair (${pair.from_memory_id.slice(0,8)}, ${pair.to_memory_id.slice(0,8)}): ${e.message}`);
            track("classifier_error");
            continue;
        }

        if (!TYPED_RELATIONS.has(cls.relation) || cls.relation === "none") {
            track("none");
            continue;
        }

        if (cls.confidence < args.minConfidence) {
            console.log(`  [low]  ${cls.relation}  conf=${cls.confidence.toFixed(2)}  ${pair.from_memory_id.slice(0,8)}…→${pair.to_memory_id.slice(0,8)}…`);
            track("below_confidence");
            continue;
        }

        // Resolve canonical direction
        let fromId: string, toId: string;
        if (cls.direction === "B_to_A") {
            fromId = pair.to_memory_id; toId = pair.from_memory_id;
        } else if (cls.direction === "symmetric") {
            [fromId, toId] = [pair.from_memory_id, pair.to_memory_id].sort();
        } else {
            fromId = pair.from_memory_id; toId = pair.to_memory_id;
        }

        const label = `${fromId.slice(0,8)}… -[${cls.relation}]-> ${toId.slice(0,8)}…  conf=${cls.confidence.toFixed(2)}`;

        if (args.dryRun) {
            console.log(`  [dry]  would_insert: ${label}`);
            if (cls.rationale) console.log(`         ${cls.rationale.slice(0, 160)}`);
            track("would_insert");
            continue;
        }

        try {
            await sb.post("rpc/memory_edges_upsert", {
                p_from_memory_id:    fromId,
                p_to_memory_id:      toId,
                p_relation:          cls.relation,
                p_confidence:        Math.round(cls.confidence * 100) / 100,
                p_support_count:     pair.support,
                p_classifier_version: CLASSIFIER_VERSION,
                p_valid_from:        cls.valid_from,
                p_valid_until:       cls.valid_until,
                p_metadata: {
                    rationale: cls.rationale,
                    classifier_model: "openai/gpt-4o-mini",
                    direction: cls.direction,
                },
            });
            console.log(`  [ok]   inserted: ${label}`);
            if (cls.rationale) console.log(`         ${cls.rationale.slice(0, 160)}`);
            track("inserted");
        } catch (e: any) {
            console.error(`  [err]  insert failed for ${label}: ${e.message}`);
            track("insert_failed");
        }
    }

    console.log("\n[classify] status counts:", counts);
}

main().catch((err) => {
    console.error("[classify] FAILED:", err.message);
    Deno.exit(1);
});
