/**
 * Entity Relationship Backfill CLI
 * Phase 22: Enhanced Knowledge Graph
 *
 * Scans historical memories for entity co-occurrences and uses GPT-4o-mini
 * to classify explicit relationships between co-mentioned entities.
 * Writes results into `entity_edges` via the entity_edges_upsert RPC.
 *
 * Usage:
 *   deno run --allow-env --allow-net classify.ts [OPTIONS]
 *
 * Options:
 *   --dry-run              Print edges that would be upserted without writing to DB
 *   --limit N              Max number of entity pairs to process (default: 50)
 *   --min-co-occurrence N  Min number of shared memories for a pair to be a candidate (default: 2)
 *   --min-confidence N     Min LLM confidence score [0-1] to write an edge (default: 0.6)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
    console.error("❌  Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY");
    Deno.exit(1);
}

const args = Deno.args;
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
    const idx = args.indexOf("--limit");
    return idx !== -1 ? parseInt(args[idx + 1], 10) : 50;
})();
const MIN_CO_OCCURRENCE = (() => {
    const idx = args.indexOf("--min-co-occurrence");
    return idx !== -1 ? parseInt(args[idx + 1], 10) : 2;
})();
const MIN_CONFIDENCE = (() => {
    const idx = args.indexOf("--min-confidence");
    return idx !== -1 ? parseFloat(args[idx + 1]) : 0.6;
})();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Classify entity relationship via LLM
// ---------------------------------------------------------------------------
interface EntityRelationship {
    relationship_type: string;
    confidence: number;
    rationale: string;
}

async function classifyEntityRelationship(
    sourceEntity: { id: string; name: string; type: string },
    targetEntity: { id: string; name: string; type: string },
    sharedMemories: { id: string; content: string; created_at: string }[]
): Promise<EntityRelationship | null> {
    const memorySample = sharedMemories
        .slice(0, 5)
        .map((m, i) => `Memory ${i + 1} [${m.created_at.slice(0, 10)}]: ${m.content.slice(0, 300)}`)
        .join("\n\n");

    const systemPrompt = `You classify the relationship between two entities based on shared memories.

ALLOWED RELATIONSHIP TYPES (pick exactly one, or "none"):
  works_on   — The source entity is actively working on / building the target.
               YES: "Sarah is building the Apollo project"
  depends_on — The source entity requires the target to function or succeed.
               YES: "Apollo depends on the Supabase infrastructure"
  uses       — The source entity uses the target as a tool, platform, or resource.
               YES: "Sarah uses Notion for note-taking"
  knows      — The source entity has a relationship with or knows the target person.
               YES: "Sarah knows Marcus from the AI team"
  manages    — The source entity manages, leads, or is responsible for the target.
               YES: "Sarah manages the Apollo project roadmap"
  related_to — Generic association; no specific label fits clearly.
               Use sparingly. Prefer "none" if in doubt.

Return "none" if:
  - the entities merely appear in the same context without a clear directional relationship
  - the evidence is too weak or ambiguous

OUTPUT strict valid JSON only:
{"relationship_type": "<type|none>", "confidence": 0.0-1.0, "rationale": "1 sentence"}`;

    const userPrompt = `Entity A: "${sourceEntity.name}" (${sourceEntity.type})
Entity B: "${targetEntity.name}" (${targetEntity.type})

Shared memories where both entities are mentioned:
${memorySample}

What is the relationship from Entity A to Entity B?`;

    try {
        const r = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json; charset=utf-8",
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

        if (!r.ok) throw new Error(`LLM call failed: ${r.status}`);
        const d = await r.json();
        const raw = d.choices?.[0]?.message?.content?.trim() ?? "";
        const parsed = JSON.parse(raw.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim());
        if (parsed.relationship_type === "none") return null;
        return {
            relationship_type: String(parsed.relationship_type),
            confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
            rationale: String(parsed.rationale || ""),
        };
    } catch (e: any) {
        console.error(`  ⚠️  LLM error for (${sourceEntity.name} → ${targetEntity.name}): ${e.message}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log("🕸️  Entity Relationship Backfill — Phase 22: Enhanced Knowledge Graph");
console.log(`    Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
console.log(`    Limit: ${LIMIT} pairs | Min co-occurrences: ${MIN_CO_OCCURRENCE} | Min confidence: ${MIN_CONFIDENCE}`);
console.log("");

// Step 1: Find entity pairs that co-occur in shared memories using a manual join
// (entity_cooccurrence_pairs is not a DB RPC — we compute it in-memory)
console.log("🔍 Step 1: Fetching entity co-occurrence pairs...");

const candidatePairs: Array<{
    source_entity_id: string;
    source_name: string;
    source_type: string;
    target_entity_id: string;
    target_name: string;
    target_type: string;
    shared_memory_count: number;
}> = [];

const { data: rawPairs, error: pairError } = await supabase
    .from("memory_entities")
    .select("entity_id, memory_id")
    .order("memory_id");

if (pairError || !rawPairs) {
    console.error("❌ Failed to fetch memory_entities:", pairError?.message);
    Deno.exit(1);
}

// Build memory → [entity_ids] map
const memToEntities: Record<string, string[]> = {};
for (const row of rawPairs) {
    if (!memToEntities[row.memory_id]) memToEntities[row.memory_id] = [];
    memToEntities[row.memory_id].push(row.entity_id);
}

// Count pair co-occurrences across all memories
const pairCounts: Record<string, number> = {};
for (const entities of Object.values(memToEntities)) {
    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            const key = [entities[i], entities[j]].sort().join("::");
            pairCounts[key] = (pairCounts[key] || 0) + 1;
        }
    }
}

// Filter by min co-occurrence and apply limit
const eligibleKeys = Object.entries(pairCounts)
    .filter(([, count]) => count >= MIN_CO_OCCURRENCE)
    .sort(([, a], [, b]) => b - a)
    .slice(0, LIMIT)
    .map(([key, count]) => ({ ids: key.split("::"), count }));

if (eligibleKeys.length === 0) {
    console.log(`  ✅ No entity pairs meet the co-occurrence threshold (≥${MIN_CO_OCCURRENCE} shared memories). Nothing to process.`);
    console.log("  💡 Tip: Send more Slack messages mentioning the same entities together, or lower --min-co-occurrence to 1.");
    Deno.exit(0);
}

// Fetch entity details for all candidate IDs in one query
const allEntityIds = [...new Set(eligibleKeys.flatMap(p => p.ids))];
const { data: entityDetails, error: entError } = await supabase
    .from("entities")
    .select("id, name, type")
    .in("id", allEntityIds);

if (entError || !entityDetails) {
    console.error("❌ Failed to fetch entity details:", entError?.message);
    Deno.exit(1);
}

const entityMap: Record<string, { id: string; name: string; type: string }> = {};
for (const e of entityDetails) entityMap[e.id] = e;

for (const pair of eligibleKeys) {
    const [idA, idB] = pair.ids;
    if (!entityMap[idA] || !entityMap[idB]) continue;
    candidatePairs.push({
        source_entity_id: idA,
        source_name: entityMap[idA].name,
        source_type: entityMap[idA].type,
        target_entity_id: idB,
        target_name: entityMap[idB].name,
        target_type: entityMap[idB].type,
        shared_memory_count: pair.count,
    });
}


console.log(`  Found ${candidatePairs.length} candidate pair(s) with ≥${MIN_CO_OCCURRENCE} shared memories.`);
console.log("");

// Step 2: For each candidate pair, fetch shared memories and classify
let upsertedCount = 0;
let skippedCount = 0;

for (let i = 0; i < candidatePairs.length; i++) {
    const pair = candidatePairs[i];
    console.log(`[${i + 1}/${candidatePairs.length}] ${pair.source_name} → ${pair.target_name} (${pair.shared_memory_count} shared memories)`);

    // Fetch shared memory content
    const { data: sharedMems, error: memErr } = await supabase
        .from("memory_entities")
        .select("memory_id, memories(id, content, created_at)")
        .eq("entity_id", pair.source_entity_id);

    if (memErr || !sharedMems) {
        console.log(`  ⚠️  Could not fetch memories, skipping.`);
        skippedCount++;
        continue;
    }

    // Filter to memories that also contain target entity
    const { data: targetMems } = await supabase
        .from("memory_entities")
        .select("memory_id")
        .eq("entity_id", pair.target_entity_id);

    const targetMemIds = new Set((targetMems || []).map((r: any) => r.memory_id));
    const sharedMemoryContent = sharedMems
        .filter((r: any) => targetMemIds.has(r.memory_id) && r.memories)
        .map((r: any) => r.memories)
        .filter(Boolean);

    if (sharedMemoryContent.length === 0) {
        console.log(`  ℹ️  No actual shared memories found after cross-check, skipping.`);
        skippedCount++;
        continue;
    }

    // Classify
    const result = await classifyEntityRelationship(
        { id: pair.source_entity_id, name: pair.source_name, type: pair.source_type },
        { id: pair.target_entity_id, name: pair.target_name, type: pair.target_type },
        sharedMemoryContent,
    );

    if (!result) {
        console.log(`  ➖ No clear relationship detected.`);
        skippedCount++;
        continue;
    }

    if (result.confidence < MIN_CONFIDENCE) {
        console.log(`  ➖ Confidence ${result.confidence.toFixed(2)} below threshold (${MIN_CONFIDENCE}). Skipping.`);
        skippedCount++;
        continue;
    }

    console.log(`  ✅ ${result.relationship_type} (confidence: ${result.confidence.toFixed(2)})`);
    console.log(`     Rationale: ${result.rationale}`);

    if (!DRY_RUN) {
        const { error: upsertError } = await supabase.rpc("entity_edges_upsert", {
            p_source_entity_id: pair.source_entity_id,
            p_target_entity_id: pair.target_entity_id,
            p_relationship_type: result.relationship_type,
            p_weight: result.confidence,
            p_properties: { rationale: result.rationale, source: "backfill-v1" },
            p_memory_id: null,
        });
        if (upsertError) {
            console.error(`  ❌ Upsert failed: ${upsertError.message}`);
            skippedCount++;
        } else {
            upsertedCount++;
        }
    } else {
        upsertedCount++;
    }
}

console.log("");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`✅ Done. ${upsertedCount} edge${upsertedCount !== 1 ? "s" : ""} ${DRY_RUN ? "would be" : ""} upserted | ${skippedCount} skipped.`);
if (DRY_RUN) {
    console.log("   Re-run without --dry-run to write to the database.");
}
