import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyMemoryEdge } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Classifier version — bump this if the prompt/vocabulary changes so edges
// from different runs remain distinguishable.
const CLASSIFIER_VERSION = "typed-edge-classifier-1.0.0";

// The full typed-edge relation vocabulary. Must match the CHECK constraint in
// the 020_typed_edge_classifier migration.
const TYPED_RELATIONS = new Set([
    "supports",
    "contradicts",
    "evolved_into",
    "supersedes",
    "depends_on",
    "related_to",
]);

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a memory_id → [entity_ids] map from the memory_entities join table.
 * Capped at 5000 rows to keep memory bounded on large graphs.
 */
async function buildEntityMap(limit = 5000): Promise<Map<string, string[]>> {
    const { data, error } = await supabase
        .from("memory_entities")
        .select("memory_id, entity_id")
        .order("memory_id")
        .limit(limit);

    if (error) throw new Error(`Failed to fetch memory_entities: ${error.message}`);

    const map = new Map<string, string[]>();
    for (const row of data || []) {
        const arr = map.get(row.memory_id) || [];
        arr.push(row.entity_id);
        map.set(row.memory_id, arr);
    }
    return map;
}

/**
 * Find candidate memory pairs that share at least `minSupport` common entities.
 * Returns at most `pairLimit` pairs, sorted by shared-entity count descending.
 */
function findCandidatePairs(
    entityMap: Map<string, string[]>,
    minSupport: number,
    pairLimit: number
): Array<{ from_memory_id: string; to_memory_id: string; support: number }> {
    const memoryIds = [...entityMap.keys()];
    const pairs: Array<{ from_memory_id: string; to_memory_id: string; support: number }> = [];

    for (let i = 0; i < memoryIds.length; i++) {
        const entitiesA = new Set(entityMap.get(memoryIds[i])!);
        for (let j = i + 1; j < memoryIds.length; j++) {
            const entitiesB = entityMap.get(memoryIds[j])!;
            let overlap = 0;
            for (const e of entitiesB) {
                if (entitiesA.has(e)) overlap++;
                // Early exit once min satisfied
                if (overlap >= minSupport) break;
            }
            if (overlap >= minSupport) {
                pairs.push({
                    from_memory_id: memoryIds[i],
                    to_memory_id: memoryIds[j],
                    support: overlap,
                });
            }
            // Stop early if we have enough candidates to choose from
            if (pairs.length >= pairLimit * 4) break;
        }
        if (pairs.length >= pairLimit * 4) break;
    }

    // Sort by shared-entity count (most connected pairs first) and trim
    pairs.sort((a, b) => b.support - a.support);
    return pairs.slice(0, pairLimit);
}

/**
 * Check if a pair already has a strong (non-related_to) typed edge in either direction.
 * Pairs already classified with a real label are skipped; those with only related_to
 * can be reclassified into a stronger label on a later run.
 */
async function isAlreadyClassified(a: string, b: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("memory_edges")
        .select("id")
        .neq("relation", "related_to")
        .or(`and(from_memory_id.eq.${a},to_memory_id.eq.${b}),and(from_memory_id.eq.${b},to_memory_id.eq.${a})`)
        .limit(1);

    if (error) {
        console.warn(`isAlreadyClassified check failed for (${a}, ${b}): ${error.message}`);
        return false;
    }
    return (data?.length || 0) > 0;
}

// ── main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
    // Auth: accept service role key via Authorization header, or MCP key via x-brain-key
    const authHeader = req.headers.get("Authorization") || "";
    const mcpKey = req.headers.get("x-brain-key") || "";
    const isServiceRole = authHeader.includes(SUPABASE_SERVICE_ROLE_KEY);
    const isMcpKey = MCP_ACCESS_KEY && mcpKey === MCP_ACCESS_KEY;

    if (!isServiceRole && !isMcpKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Parse optional body params
    let limit = 20;
    let dryRun = false;
    let minConfidence = 0.75;
    let minSupport = 2;

    if (req.method === "POST") {
        try {
            const body = await req.json();
            if (typeof body.limit === "number") limit = body.limit;
            if (typeof body.dry_run === "boolean") dryRun = body.dry_run;
            if (typeof body.min_confidence === "number") minConfidence = body.min_confidence;
            if (typeof body.min_support === "number") minSupport = body.min_support;
        } catch {
            // No body / non-JSON body — use defaults
        }
    }

    console.log(`[classify-memory-edges] Starting: limit=${limit}, dry_run=${dryRun}, min_confidence=${minConfidence}, min_support=${minSupport}`);

    try {
        // Step 1: Build entity co-occurrence map from memory_entities
        const entityMap = await buildEntityMap();
        console.log(`[classify-memory-edges] entity map built: ${entityMap.size} memories with entity links`);

        if (entityMap.size < 2) {
            return new Response(JSON.stringify({
                success: true,
                message: "Not enough memories with entity links to form candidate pairs.",
                processed: 0,
                inserted: 0,
                skipped: 0,
                dry_run: dryRun,
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // Step 2: Sample candidate pairs
        const pairs = findCandidatePairs(entityMap, minSupport, limit);
        console.log(`[classify-memory-edges] found ${pairs.length} candidate pairs`);

        // Step 3: Fetch all unique memory IDs needed
        const allIds = [...new Set(pairs.flatMap(p => [p.from_memory_id, p.to_memory_id]))];
        const { data: memoriesData, error: mErr } = await supabase
            .from("memories")
            .select("id, content, created_at")
            .in("id", allIds);

        if (mErr) throw new Error(`Failed to fetch memories: ${mErr.message}`);

        const memoryById = new Map((memoriesData || []).map(m => [m.id, m]));

        // Step 4: Classify each pair
        let processedCount = 0;
        let insertedCount = 0;
        let skippedCount = 0;
        const results: any[] = [];

        for (const pair of pairs) {
            const memA = memoryById.get(pair.from_memory_id);
            const memB = memoryById.get(pair.to_memory_id);

            if (!memA || !memB) {
                skippedCount++;
                results.push({ ...pair, status: "skip_missing_memory" });
                continue;
            }

            // Skip pairs already classified with a strong label
            const alreadyDone = await isAlreadyClassified(pair.from_memory_id, pair.to_memory_id);
            if (alreadyDone) {
                skippedCount++;
                results.push({ ...pair, status: "skip_already_classified" });
                continue;
            }

            processedCount++;

            // Call the LLM classifier
            let cls;
            try {
                cls = await classifyMemoryEdge(
                    { id: memA.id, content: memA.content, created_at: memA.created_at },
                    { id: memB.id, content: memB.content, created_at: memB.created_at }
                );
            } catch (e: any) {
                console.error(`[classify-memory-edges] classifier error for pair (${pair.from_memory_id}, ${pair.to_memory_id}): ${e.message}`);
                results.push({ ...pair, status: "classifier_error", error: e.message });
                continue;
            }

            // Skip "none" / unknown relation
            if (!TYPED_RELATIONS.has(cls.relation) || cls.relation === "none") {
                results.push({ ...pair, status: "none", relation: cls.relation, confidence: cls.confidence });
                continue;
            }

            // Skip below confidence threshold
            if (cls.confidence < minConfidence) {
                results.push({ ...pair, status: "below_confidence", relation: cls.relation, confidence: cls.confidence });
                continue;
            }

            // Resolve canonical from/to direction based on LLM output
            let fromId: string;
            let toId: string;
            if (cls.direction === "B_to_A") {
                fromId = pair.to_memory_id;
                toId = pair.from_memory_id;
            } else if (cls.direction === "symmetric") {
                // Stable ordering: alphabetically smaller UUID is always from
                [fromId, toId] = [pair.from_memory_id, pair.to_memory_id].sort();
            } else {
                fromId = pair.from_memory_id;
                toId = pair.to_memory_id;
            }

            const label = `${fromId} -[${cls.relation}]-> ${toId}  (conf=${cls.confidence.toFixed(2)})`;

            if (dryRun) {
                console.log(`[dry] would_insert: ${label}`);
                results.push({ ...pair, status: "would_insert", relation: cls.relation, confidence: cls.confidence, label });
                continue;
            }

            // Upsert via RPC (idempotent — bumps support_count on repeat runs)
            const { error: rpcErr } = await supabase.rpc("memory_edges_upsert", {
                p_from_memory_id: fromId,
                p_to_memory_id: toId,
                p_relation: cls.relation,
                p_confidence: Math.round(cls.confidence * 100) / 100,
                p_support_count: pair.support,
                p_classifier_version: CLASSIFIER_VERSION,
                p_valid_from: cls.valid_from || null,
                p_valid_until: cls.valid_until || null,
                p_metadata: {
                    rationale: cls.rationale,
                    classifier_model: "openai/gpt-4o-mini",
                    direction: cls.direction,
                },
            });

            if (rpcErr) {
                console.error(`[classify-memory-edges] RPC insert failed for ${label}: ${rpcErr.message}`);
                results.push({ ...pair, status: "insert_failed", error: rpcErr.message, label });
            } else {
                console.log(`[ok] inserted: ${label}`);
                insertedCount++;
                results.push({ ...pair, status: "inserted", relation: cls.relation, confidence: cls.confidence, label });
            }
        }

        // Summary counts by status
        const counts: Record<string, number> = {};
        for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;

        console.log(`[classify-memory-edges] done — processed=${processedCount}, inserted=${insertedCount}, skipped=${skippedCount}`);
        console.log("[classify-memory-edges] status breakdown:", JSON.stringify(counts));

        return new Response(JSON.stringify({
            success: true,
            processed: processedCount,
            inserted: insertedCount,
            skipped: skippedCount,
            dry_run: dryRun,
            status_counts: counts,
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (err: any) {
        console.error("[classify-memory-edges] FAILED:", err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
