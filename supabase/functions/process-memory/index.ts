import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmbedding, extractMetadata, evaluateAgainstTastePreferences } from "../_shared/brain-engine.ts";
import { activeVerticals } from "../_shared/verticals/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function replyInSlack(channel: string, threadTs: string, text: string): Promise<void> {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, thread_ts: threadTs, text }),
    });
    if (!res.ok) throw new Error(`Slack HTTP error: ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
}

Deno.serve(async (req: Request): Promise<Response> => {
    let memoryId: string | undefined;
    let channel: string | undefined;
    let ts: string | undefined;

    try {
        const body = await req.json();
        const record = body?.record;

        if (!record || !record.id || !record.content) {
            return new Response("Missing record data", { status: 400 });
        }

        memoryId = record.id;
        const messageText = record.content;
        const slackMetadata = record.slack_metadata || {};
        channel = slackMetadata.channel;
        ts = slackMetadata.ts;
        const files = slackMetadata.files || [];

        let totalTokens = 0;
        let promptTokens = 0;
        let compTokens = 0;

        const addUsage = (u: any) => {
            if (u) {
                totalTokens += u.total_tokens || 0;
                promptTokens += u.prompt_tokens || 0;
                compTokens += u.completion_tokens || 0;
            }
        };

        const [{ embedding, usage: embUsage }, { data: metadata, usage: metaUsage }] = await Promise.all([
            getEmbedding(messageText),
            extractMetadata(messageText),
        ]);

        addUsage(embUsage);
        addUsage(metaUsage);

        const meta = metadata as Record<string, any>;

        // 1. Update Memory with embedding and true type
        const { error: memoryError } = await supabase.from("memories")
            .update({
                embedding,
                type: meta.memory_type || "observation",
            })
            .eq("id", memoryId);

        if (memoryError) {
            throw new Error(`Supabase memory update error: ${memoryError.message}`);
        }

        // 2. Insert Tasks
        if (Array.isArray(meta.extracted_tasks) && meta.extracted_tasks.length > 0) {
            const taskInserts = meta.extracted_tasks.map((t: any) => ({
                memory_id: memoryId,
                description: t.description,
                due_date: (t.inferred_deadline && typeof t.inferred_deadline === 'string' && t.inferred_deadline !== "null") ? t.inferred_deadline : null,
                status: "pending"
            }));
            const { error: taskError } = await supabase.from("tasks").insert(taskInserts);
            if (taskError) console.error("Task insert error:", taskError);
        }

        // 3. Upsert Entities & Link
        let linkedEntitiesCount = 0;
        const entityNameToId: Record<string, string> = {};
        if (Array.isArray(meta.entities_detected) && meta.entities_detected.length > 0) {
            for (const ent of meta.entities_detected) {
                if (!ent.name || !ent.type) continue;
                const { data: entityData, error: entityError } = await supabase.from("entities")
                    .upsert({ name: ent.name, type: ent.type }, { onConflict: "name, type" })
                    .select("id").single();

                if (entityData?.id) {
                    entityNameToId[ent.name] = entityData.id;
                    await supabase.from("memory_entities").insert({
                        memory_id: memoryId,
                        entity_id: entityData.id
                    });
                    linkedEntitiesCount++;
                } else if (entityError) {
                    console.error("Entity upsert error:", entityError);
                }
            }
        }

        // 3.5 Upsert Entity Edges (Phase 22: Enhanced Knowledge Graph)
        let entityEdgesCount = 0;
        if (Array.isArray(meta.entity_relationships) && meta.entity_relationships.length > 0) {
            for (const rel of meta.entity_relationships) {
                if (!rel.source || !rel.target || !rel.relationship_type) continue;
                // Only process relationships where both entities were successfully resolved
                const sourceId = entityNameToId[rel.source];
                const targetId = entityNameToId[rel.target];
                if (!sourceId || !targetId) {
                    console.warn(`Entity edge skipped — could not resolve: "${rel.source}" or "${rel.target}"`);
                    continue;
                }
                const confidence = typeof rel.confidence === "number"
                    ? Math.min(1.0, Math.max(0.0, rel.confidence))
                    : 1.0;
                // Skip low-confidence relationships (threshold: 0.5)
                if (confidence < 0.5) continue;

                const { error: edgeError } = await supabase.rpc("entity_edges_upsert", {
                    p_source_entity_id: sourceId,
                    p_target_entity_id: targetId,
                    p_relationship_type: rel.relationship_type,
                    p_weight: confidence,
                    p_properties: { rationale: rel.rationale || null },
                    p_memory_id: memoryId,
                });
                if (edgeError) {
                    console.error("Entity edge upsert error:", edgeError);
                } else {
                    entityEdgesCount++;
                }
            }
        }

        // 4. Upsert Threads & Link
        let linkedThreadsCount = 0;
        if (Array.isArray(meta.associated_threads) && meta.associated_threads.length > 0) {
            for (const threadName of meta.associated_threads) {
                if (!threadName || typeof threadName !== "string") continue;
                const { data: threadData, error: threadError } = await supabase.from("threads")
                    .upsert({ name: threadName }, { onConflict: "name" })
                    .select("id").single();

                if (threadData?.id) {
                    await supabase.from("memory_threads").insert({
                        memory_id: memoryId,
                        thread_id: threadData.id
                    });
                    linkedThreadsCount++;
                } else if (threadError) {
                    console.error("Thread upsert error:", threadError);
                }
            }
        }

        // 4.5 Process Wisdom Verticals
        const triggeredVerticals: string[] = [];
        if (meta.wisdom_extensions) {
            for (const vertical of activeVerticals) {
                if (meta.wisdom_extensions[vertical.name]) {
                    try {
                        await vertical.process(memoryId!, meta.wisdom_extensions[vertical.name], supabase);
                        triggeredVerticals.push(vertical.name);
                    } catch (vErr) {
                        console.error(`Error processing vertical ${vertical.name}:`, vErr);
                    }
                }
            }
        }

        // 5. Handle Slack file attachments -> artifacts
        let artifactCount = 0;
        if (files.length > 0) {
            for (const file of files) {
                try {
                    const fileRes = await fetch(file.url_private, {
                        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}` },
                    });
                    if (!fileRes.ok) continue;
                    const fileBlob = await fileRes.blob();
                    const filePath = `slack-files/${memoryId}/${file.name}`;

                    const { error: uploadError } = await supabase.storage
                        .from("artifacts")
                        .upload(filePath, fileBlob, { contentType: file.mimetype });

                    if (uploadError) continue;

                    const { data: urlData } = supabase.storage.from("artifacts").getPublicUrl(filePath);

                    await supabase.from("artifacts").insert({
                        memory_id: memoryId,
                        url: urlData.publicUrl,
                        mime_type: file.mimetype || null,
                        text_content: null,
                    });
                    artifactCount++;
                } catch (fileErr) {
                    console.error("File processing error:", fileErr);
                }
            }
        }

        // 6. Active Mentorship: Evaluate against active taste preferences
        let insightText: string | null = null;
        const { data: prefsData } = await supabase.from("taste_preferences").select("want, reject").eq("status", "active");
        if (prefsData && prefsData.length > 0) {
            const params = prefsData.map((p: any) => ({ want: p.want, reject: p.reject }));
            const { insight, usage: insightUsage } = await evaluateAgainstTastePreferences(messageText, params);
            insightText = insight;
            addUsage(insightUsage);
            if (insightText) {
                await supabase.from("system_insights").insert({
                    memory_id: memoryId,
                    content: insightText,
                });
            }
        }

        // Final updates for observability
        await supabase.from("memories").update({
            processing_status: "completed",
            cost_metrics: {
                total_tokens: totalTokens,
                prompt_tokens: promptTokens,
                completion_tokens: compTokens
            }
        }).eq("id", memoryId);

        // Format Slack confirmation
        if (channel && ts) {
            let confirmation = `Captured as *${meta.memory_type || "observation"}*`;
            if (meta.extracted_tasks?.length > 0) confirmation += `\n🎯 Tasks: ${meta.extracted_tasks.length}`;
            if (linkedEntitiesCount > 0) confirmation += `\n🔗 Entities: ${linkedEntitiesCount} linked`;
            if (entityEdgesCount > 0) confirmation += `\n🕸️ Entity Edges: ${entityEdgesCount} relationship${entityEdgesCount > 1 ? "s" : ""} mapped`;
            if (linkedThreadsCount > 0) confirmation += `\n🧵 Threads: ${linkedThreadsCount}`;
            if (artifactCount > 0) confirmation += `\n📎 Files: ${artifactCount} saved`;
            if (triggeredVerticals.length > 0) {
                for (const vName of triggeredVerticals) {
                    const icon = vName === 'learning' ? '📚' : '🗳️';
                    confirmation += `\n${icon} ${vName.charAt(0).toUpperCase() + vName.slice(1)}: Triggered`;
                }
            }
            if (insightText) confirmation += `\n🧠 Insight: ${insightText}`;
            if (meta.strategic_alignment) confirmation += `\n🧭 Alignment: ${meta.strategic_alignment}`;
            confirmation += `\n💸 Cost: ${totalTokens} tokens`;

            await replyInSlack(channel, ts, confirmation);
        }


        return new Response("ok", { status: 200 });
    } catch (err: any) {
        console.error("Function error:", err);
        try {
            if (memoryId) {
                await supabase.from("memories").update({
                    processing_status: "failed",
                    processing_error: err.message || "Unknown error"
                }).eq("id", memoryId);
            }

            if (channel) {
                await replyInSlack(channel, ts || "", `⚠️ Failed to process memory: ${err.message}`);
            }
        } catch (alertErr) {
            console.error("Failed to send alert", alertErr);
        }
        return new Response("error", { status: 500 });
    }
});
