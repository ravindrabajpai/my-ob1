import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateThreadSummary } from "../_shared/brain-engine.ts";

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
        const body = await req.json().catch(() => ({}));
        const { thread_id, dry_run, limit = 10 } = body;

        console.log(`Starting thread summarization... ${thread_id ? `Thread: ${thread_id}` : `Batch Limit: ${limit}`}${dry_run ? " (DRY RUN)" : ""}`);

        // 1. Identify threads to process
        let threadsQuery = supabase.from("threads").select("id, name, created_at");
        if (thread_id) {
            threadsQuery = threadsQuery.eq("id", thread_id);
        }

        const { data: threads, error: tErr } = await threadsQuery;
        if (tErr || !threads) throw new Error(`Failed to fetch threads: ${tErr?.message}`);

        // 2. Fetch memory counts and process eligible threads
        const results = [];
        let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        let processedCount = 0;

        for (const thread of threads) {
            if (processedCount >= limit && !thread_id) break;

            // Fetch linked memories
            const { data: threadMemories, error: tmErr } = await supabase
                .from("memory_threads")
                .select("memory_id, memories(content, created_at)")
                .eq("thread_id", thread.id)
                .order("memories(created_at)", { ascending: true });

            if (tmErr || !threadMemories) {
                console.error(`Failed to fetch memories for thread ${thread.name}:`, tmErr);
                continue;
            }

            const memories = threadMemories
                .map((tm: any) => tm.memories)
                .filter((m: any) => m !== null);

            // Eligibility: >= 5 memories OR age > 14 days
            const ageInDays = (new Date().getTime() - new Date(thread.created_at).getTime()) / (1000 * 60 * 60 * 24);
            const isEligible = memories.length >= 5 || ageInDays > 14;

            if (!isEligible) {
                results.push({ thread_id: thread.id, name: thread.name, status: "skipped_ineligible", reason: `memories: ${memories.length}, age: ${Math.floor(ageInDays)}d` });
                continue;
            }

            if (dry_run) {
                results.push({ thread_id: thread.id, name: thread.name, status: "eligible_dry_run", memories: memories.length });
                continue;
            }

            // 3. Summarize
            console.log(`Summarizing thread: ${thread.name} (${memories.length} memories)`);
            const { summary, usage } = await generateThreadSummary(thread.name, memories);
            if (!summary) {
                console.error(`Failed to generate summary for thread ${thread.name}`);
                continue;
            }

            // 4. Insert summary memory
            // We use a content hash to avoid duplicate summaries if run manually multiple times
            const { data: sumMem, error: sumMemErr } = await supabase.from("memories").insert({
                content: summary,
                type: "log",
                processing_status: "completed",
                metadata: {
                    source_type: "thread_summary",
                    thread_id: thread.id,
                    thread_name: thread.name,
                    memory_count: memories.length
                }
            }).select("id").single();

            if (sumMemErr || !sumMem) {
                console.error(`Failed to insert summary memory for ${thread.name}:`, sumMemErr);
                continue;
            }

            // 5. Upsert entity_wikis
            await supabase.from("entity_wikis").delete().eq("reference_id", thread.id).eq("reference_type", "thread");
            const { error: wikiErr } = await supabase.from("entity_wikis").insert({
                reference_id: thread.id,
                reference_type: "thread",
                name: thread.name,
                markdown_content: summary,
                summary_memory_id: sumMem.id
            });

            if (wikiErr) {
                console.error(`Failed to upsert thread wiki for ${thread.name}:`, wikiErr);
            }

            // 6. Write derived_from edges
            const edges = threadMemories.map((tm: any) => ({
                p_from_memory_id: sumMem.id,
                p_to_memory_id: tm.memory_id,
                p_relation: "derived_from",
                p_confidence: 1.0,
                p_metadata: { generator: "thread-summarizer", thread_id: thread.id, thread_name: thread.name }
            }));

            for (const edge of edges) {
                await supabase.rpc("memory_edges_upsert", edge);
            }

            processedCount++;
            if (usage) {
                totalUsage.prompt_tokens += usage.prompt_tokens || 0;
                totalUsage.completion_tokens += usage.completion_tokens || 0;
                totalUsage.total_tokens += usage.total_tokens || 0;
            }
            results.push({ thread_id: thread.id, name: thread.name, status: "completed", summary_memory_id: sumMem.id });
        }

        return new Response(JSON.stringify({
            success: true,
            processed: processedCount,
            results,
            usage: totalUsage,
            dry_run
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (err: any) {
        console.error("Thread summarizer error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});
