import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmbedding, extractMetadata, evaluateAgainstGoals } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function replyInSlack(channel: string, threadTs: string, text: string): Promise<void> {
    await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, thread_ts: threadTs, text }),
    });
}

Deno.serve(async (req: Request): Promise<Response> => {
    try {
        const body = await req.json();
        const record = body?.record;

        if (!record || !record.id || !record.content) {
            return new Response("Missing record data", { status: 400 });
        }

        const memoryId = record.id;
        const messageText = record.content;
        const slackMetadata = record.slack_metadata || {};
        const channel = slackMetadata.channel;
        const messageTs = slackMetadata.ts;
        const files = slackMetadata.files || [];

        const [embedding, metadata] = await Promise.all([
            getEmbedding(messageText),
            extractMetadata(messageText),
        ]);

        const meta = metadata as Record<string, any>;

        // 1. Update Memory with embedding and true type
        const { error: memoryError } = await supabase.from("memories")
            .update({
                embedding,
                type: meta.memory_type || "observation",
            })
            .eq("id", memoryId);

        if (memoryError) {
            console.error("Supabase memory update error:", memoryError);
            if (channel && messageTs) {
                await replyInSlack(channel, messageTs, `Failed to process: ${memoryError.message}`);
            }
            return new Response("error", { status: 500 });
        }

        // 2. Insert Tasks
        if (Array.isArray(meta.extracted_tasks) && meta.extracted_tasks.length > 0) {
            const taskInserts = meta.extracted_tasks.map((t: any) => ({
                memory_id: memoryId,
                description: t.description,
                due_date: t.inferred_deadline || null,
                status: "pending"
            }));
            const { error: taskError } = await supabase.from("tasks").insert(taskInserts);
            if (taskError) console.error("Task insert error:", taskError);
        }

        // 3. Upsert Entities & Link
        let linkedEntitiesCount = 0;
        if (Array.isArray(meta.entities_detected) && meta.entities_detected.length > 0) {
            for (const ent of meta.entities_detected) {
                if (!ent.name || !ent.type) continue;
                const { data: entityData, error: entityError } = await supabase.from("entities")
                    .upsert({ name: ent.name, type: ent.type }, { onConflict: "name, type" })
                    .select("id").single();

                if (entityData?.id) {
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

        // 6. Active Mentorship: Evaluate against goals
        let insightText: string | null = null;
        const { data: goalsData } = await supabase.from("goals_and_principles").select("content");
        if (goalsData && goalsData.length > 0) {
            const goalStrings = goalsData.map((g: any) => g.content);
            insightText = await evaluateAgainstGoals(messageText, goalStrings);
            if (insightText) {
                await supabase.from("system_insights").insert({
                    memory_id: memoryId,
                    content: insightText,
                });
            }
        }

        // Format Slack confirmation
        if (channel && messageTs) {
            let confirmation = `Captured as *${meta.memory_type || "observation"}*`;
            if (meta.extracted_tasks?.length > 0) confirmation += `\n🎯 Tasks: ${meta.extracted_tasks.length}`;
            if (linkedEntitiesCount > 0) confirmation += `\n🔗 Entities: ${linkedEntitiesCount} linked`;
            if (linkedThreadsCount > 0) confirmation += `\n🧵 Threads: ${linkedThreadsCount}`;
            if (artifactCount > 0) confirmation += `\n📎 Files: ${artifactCount} saved`;
            if (insightText) confirmation += `\n🧠 Insight: ${insightText}`;
            if (meta.strategic_alignment) confirmation += `\n🧭 Alignment: ${meta.strategic_alignment}`;

            await replyInSlack(channel, messageTs, confirmation);
        }

        return new Response("ok", { status: 200 });
    } catch (err) {
        console.error("Function error:", err);
        return new Response("error", { status: 500 });
    }
});
