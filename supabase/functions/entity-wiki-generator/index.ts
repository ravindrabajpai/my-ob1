import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateWikiDossier } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request): Promise<Response> => {
    // Basic Authentication: allow service role or MCP access key
    const authHeader = req.headers.get("Authorization");
    const mcpKey = req.headers.get("x-brain-key");
    const isServiceRole = authHeader && authHeader.includes(SUPABASE_SERVICE_ROLE_KEY);
    const isMcpKey = mcpKey && mcpKey === MCP_ACCESS_KEY;

    if (!isServiceRole && !isMcpKey) {
        return new Response("Unauthorized", { status: 401 });
    }

    try {
        console.log("Starting entity wiki generation...");
        
        // 1. Identify entities with >= 3 linked memories
        // Since we don't have a direct grouping in PostgREST, we use an RPC or fetch all links
        // For simplicity and to match the recipe, we'll do a robust query using the database
        // We will fetch entities and count their links in memory
        
        // Fetch entities
        const { data: entities, error: eErr } = await supabase.from("entities").select("id, name, type");
        if (eErr || !entities) throw new Error("Failed to fetch entities");

        // Fetch all memory_entities links
        const { data: memoryEntities, error: meErr } = await supabase.from("memory_entities").select("memory_id, entity_id");
        if (meErr || !memoryEntities) throw new Error("Failed to fetch memory_entities");

        // Group links by entity
        const entityLinks: Record<string, string[]> = {};
        for (const link of memoryEntities) {
            if (!entityLinks[link.entity_id]) entityLinks[link.entity_id] = [];
            entityLinks[link.entity_id].push(link.memory_id);
        }

        // Filter for entities with >= 3 links
        const targetEntities = entities.filter(e => (entityLinks[e.id]?.length || 0) >= 3);
        console.log(`Found ${targetEntities.length} entities with 3+ memories.`);

        let processedCount = 0;
        let totalCostMetrics = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        // Process in small batches to avoid timeouts (limit to 10 per run for safety)
        const batch = targetEntities.slice(0, 10);

        for (const entity of batch) {
            console.log(`Generating wiki for entity: ${entity.name} (${entity.type})`);
            
            // Fetch memories for this entity
            const memoryIds = entityLinks[entity.id];
            const { data: memories, error: mErr } = await supabase
                .from("memories")
                .select("content, created_at")
                .in("id", memoryIds)
                .order("created_at", { ascending: true });

            if (mErr || !memories || memories.length === 0) {
                console.warn(`No memories fetched for ${entity.name}, skipping.`);
                continue;
            }

            // Synthesize the dossier
            const { dossier, usage } = await generateWikiDossier(entity.name, entity.type, memories);
            if (!dossier) {
                console.error(`Failed to generate dossier for ${entity.name}`);
                continue;
            }

            // Upsert into entity_wikis
            // We use delete/insert or upsert. Since reference_id is not unique (in theory), 
            // we delete the old one and insert the new one to keep it simple, or update if exists.
            
            // Delete old
            await supabase.from("entity_wikis").delete().eq("reference_id", entity.id);
            
            // Insert new
            const { error: insErr } = await supabase.from("entity_wikis").insert({
                reference_id: entity.id,
                reference_type: "entity",
                name: entity.name,
                markdown_content: dossier
            });

            if (insErr) {
                console.error(`Failed to insert dossier for ${entity.name}:`, insErr);
            } else {
                processedCount++;
                if (usage) {
                    totalCostMetrics.prompt_tokens += usage.prompt_tokens || 0;
                    totalCostMetrics.completion_tokens += usage.completion_tokens || 0;
                    totalCostMetrics.total_tokens += usage.total_tokens || 0;
                }
            }
        }

        console.log(`Successfully generated ${processedCount} wikis.`);
        return new Response(JSON.stringify({ 
            success: true, 
            processed: processedCount,
            usage: totalCostMetrics
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (err: any) {
        console.error("Entity wiki generator error:", err);
        return new Response(JSON.stringify({ error: err.message }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
        });
    }
});
