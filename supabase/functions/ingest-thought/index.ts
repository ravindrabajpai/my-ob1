import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmbedding, extractMetadata, evaluateAgainstGoals } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const SLACK_CAPTURE_CHANNEL = Deno.env.get("SLACK_CAPTURE_CHANNEL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
async function replyInSlack(channel: string, threadTs: string, text: string): Promise<void> {
    await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, thread_ts: threadTs, text }),
    });
}

async function verifySlackSignature(req: Request, rawBody: string): Promise<boolean> {
    const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET");
    if (!SIGNING_SECRET) return true; // Fallback for transition

    const timestamp = req.headers.get("x-slack-request-timestamp");
    const signature = req.headers.get("x-slack-signature");
    if (!timestamp || !signature) return false;

    // Reject requests older than 5 minutes
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;

    const baseString = `v0:${timestamp}:${rawBody}`;
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(SIGNING_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(baseString)
    );
    const generatedSignature = `v0=${Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")}`;

    return generatedSignature === signature;
}

Deno.serve(async (req: Request): Promise<Response> => {
    try {
        const rawBody = await req.text();
        if (!(await verifySlackSignature(req, rawBody))) {
            return new Response("Unauthorized", { status: 401 });
        }

        const body = JSON.parse(rawBody);
        if (body.type === "url_verification") {
            return new Response(JSON.stringify({ challenge: body.challenge }), {
                headers: { "Content-Type": "application/json" },
            });
        }
        const event = body.event;
        if (!event || event.type !== "message" || event.subtype || event.bot_id
            || event.channel !== SLACK_CAPTURE_CHANNEL) {
            return new Response("ok", { status: 200 });
        }
        const messageText: string = event.text;
        const channel: string = event.channel;
        const messageTs: string = event.ts;
        if (!messageText || messageText.trim() === "") return new Response("ok", { status: 200 });

        // Check for goal/principle prefix routing
        const lowerText = messageText.toLowerCase().trim();
        if (lowerText.startsWith("goal:") || lowerText.startsWith("principle:")) {
            const isGoal = lowerText.startsWith("goal:");
            const type = isGoal ? "Goal" : "Principle";
            const content = messageText.substring(messageText.indexOf(":") + 1).trim();

            const { error } = await supabase.from("goals_and_principles").insert({ content, type });
            if (error) {
                await replyInSlack(channel, messageTs, `❌ Failed to save ${type}: ${error.message}`);
                return new Response("error", { status: 500 });
            }
            await replyInSlack(channel, messageTs, `✅ ${type} saved: "${content}"`);
            return new Response("ok", { status: 200 });
        }

        const [embedding, metadata] = await Promise.all([
            getEmbedding(messageText),
            extractMetadata(messageText),
        ]);

        const meta = metadata as Record<string, any>;

        // 1. Insert Memory
        const { data: memory, error: memoryError } = await supabase.from("memories").insert({
            content: messageText,
            embedding,
            type: meta.memory_type || "observation",
        }).select("id").single();

        if (memoryError || !memory) {
            console.error("Supabase memory insert error:", memoryError);
            await replyInSlack(channel, messageTs, `Failed to capture: ${memoryError?.message}`);
            return new Response("error", { status: 500 });
        }

        const memoryId = memory.id;

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

                // Upsert the entity to ensure it exists and we get its ID
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
        if (Array.isArray(event.files) && event.files.length > 0) {
            for (const file of event.files) {
                try {
                    // Download from Slack
                    const fileRes = await fetch(file.url_private, {
                        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}` },
                    });
                    if (!fileRes.ok) continue;
                    const fileBlob = await fileRes.blob();
                    const filePath = `slack-files/${memoryId}/${file.name}`;

                    // Upload to Supabase Storage
                    const { error: uploadError } = await supabase.storage
                        .from("artifacts")
                        .upload(filePath, fileBlob, { contentType: file.mimetype });

                    if (uploadError) {
                        console.error("Storage upload error:", uploadError);
                        continue;
                    }

                    const { data: urlData } = supabase.storage.from("artifacts").getPublicUrl(filePath);

                    // Insert into artifacts table
                    await supabase.from("artifacts").insert({
                        memory_id: memoryId,
                        url: urlData.publicUrl,
                        mime_type: file.mimetype || null,
                        text_content: null, // OCR/transcription can be added later
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
        let confirmation = `Captured as *${meta.memory_type || "observation"}*`;
        if (meta.extracted_tasks?.length > 0) {
            confirmation += `\n🎯 Tasks: ${meta.extracted_tasks.length}`;
        }
        if (linkedEntitiesCount > 0) {
            confirmation += `\n🔗 Entities: ${linkedEntitiesCount} linked`;
        }
        if (linkedThreadsCount > 0) {
            confirmation += `\n🧵 Threads: ${linkedThreadsCount}`;
        }
        if (artifactCount > 0) {
            confirmation += `\n📎 Files: ${artifactCount} saved`;
        }
        if (insightText) {
            confirmation += `\n🧠 Insight: ${insightText}`;
        }
        if (meta.strategic_alignment) {
            confirmation += `\n🧭 Alignment: ${meta.strategic_alignment}`;
        }

        await replyInSlack(channel, messageTs, confirmation);
        return new Response("ok", { status: 200 });
    } catch (err) {
        console.error("Function error:", err);
        return new Response("error", { status: 500 });
    }
});

