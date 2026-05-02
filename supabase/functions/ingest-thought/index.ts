import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scanSensitivity } from "../_shared/brain-engine.ts";

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

// ---------------------------------------------------------------------------
// Phase 17: Adaptive Capture Classification
// ---------------------------------------------------------------------------
const CAPTURE_TYPES = ["observation", "decision", "idea", "complaint", "log"] as const;
type CaptureType = typeof CAPTURE_TYPES[number];

const DEFAULT_THRESHOLD = 0.75;
const THRESHOLD_NUDGE = 0.02;
const THRESHOLD_MIN = 0.50;
const THRESHOLD_MAX = 0.95;
const CONSISTENCY_CUTOFF = 9;   // re‑run classifier if confidence below this
const CONSISTENCY_FACTOR = 0.6; // penalty when two runs disagree

interface ClassifyResult {
    type: CaptureType;
    confidence: number; // 0–10
    model: string;
}

async function classifyCapture(text: string, model = "openai/gpt-4o-mini"): Promise<ClassifyResult> {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
        // No key: skip classification, default to observation with max confidence
        return { type: "observation", confidence: 10, model };
    }

    const systemPrompt = `You classify personal knowledge captures into one of these types: ${JSON.stringify(CAPTURE_TYPES)}.
Return ONLY a JSON object with two fields: "type" (one of the listed types) and "confidence" (integer 0–10).
No markdown, no extra text.`;

    const userPrompt = `Classify this capture:\n"${text.slice(0, 400)}"`;

    try {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                temperature: 0.1,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
            }),
        });
        const json = await resp.json();
        const raw = json.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw.replace(/```(?:json)?\s*|\s*```/g, "").trim());
        const type = CAPTURE_TYPES.includes(parsed.type) ? parsed.type as CaptureType : "observation";
        const confidence = Math.max(0, Math.min(10, Math.round(Number(parsed.confidence ?? 7))));
        return { type, confidence, model };
    } catch {
        return { type: "observation", confidence: 7, model };
    }
}

async function getThreshold(itemType: string): Promise<number> {
    const { data } = await supabase
        .from("capture_thresholds")
        .select("threshold")
        .eq("item_type", itemType)
        .maybeSingle();
    return data ? Number(data.threshold) : DEFAULT_THRESHOLD;
}

async function nudgeThreshold(itemType: string, accepted: boolean): Promise<void> {
    const current = await getThreshold(itemType);
    const { data: row } = await supabase
        .from("capture_thresholds")
        .select("sample_count")
        .eq("item_type", itemType)
        .maybeSingle();
    const delta = accepted ? -THRESHOLD_NUDGE : +THRESHOLD_NUDGE;
    const newVal = Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, current + delta));
    await supabase.from("capture_thresholds").upsert({
        item_type: itemType,
        threshold: newVal,
        sample_count: (row?.sample_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
    }, { onConflict: "item_type" });
}

async function recordOutcome(classified: ClassifyResult, memoryId: string | null): Promise<void> {
    await supabase.from("classification_outcomes").insert({
        memory_id: memoryId,
        model: classified.model,
        item_type: classified.type,
        confidence: classified.confidence,
        auto_classified: true,  // Slack ingestion is always auto
        user_accepted: true,  // Accepted by default (Slack path has no confirmation loop)
    });
    // Nudge threshold positively — auto-accepted by design on Slack path
    await nudgeThreshold(classified.type, true);
}
// ---------------------------------------------------------------------------

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

        // Check for goal/principle/task prefix routing
        const lowerText = messageText.toLowerCase().trim();
        if (lowerText.startsWith("pref:") || lowerText.startsWith("goal:") || lowerText.startsWith("principle:") || lowerText.startsWith("done:") || lowerText.startsWith("complete:")) {
            const prefixIndex = messageText.indexOf(":");
            const typeStr = messageText.substring(0, prefixIndex).trim().toLowerCase();
            const content = messageText.substring(prefixIndex + 1).trim();

            if (typeStr === "done" || typeStr === "complete") {
                // Task Completion Logic
                const { data: tasks, error: searchError } = await supabase
                    .from("tasks")
                    .select("id, description")
                    .ilike("description", `%${content}%`)
                    .eq("status", "pending")
                    .order("created_at", { ascending: false })
                    .limit(1);

                if (searchError || !tasks || tasks.length === 0) {
                    await replyInSlack(channel, messageTs, `❌ No pending task found matching "${content}"`);
                    return new Response("ok", { status: 200 });
                }

                const task = tasks[0];
                const { error: updateError } = await supabase
                    .from("tasks")
                    .update({ status: "completed" })
                    .eq("id", task.id);

                if (updateError) {
                    await replyInSlack(channel, messageTs, `❌ Failed to complete task: ${updateError.message}`);
                    return new Response("error", { status: 500 });
                }

                await replyInSlack(channel, messageTs, `✅ Task completed: "${task.description}"`);
                return new Response("ok", { status: 200 });
            }

            // Preference/Goal/Principle routing logic
            const { error } = await supabase.from("taste_preferences").insert({
                preference_name: typeStr + ' ' + content.substring(0, 15),
                domain: "general",
                reject: "Things that contradict this " + typeStr,
                want: content,
                constraint_type: typeStr
            });
            if (error) {
                await replyInSlack(channel, messageTs, `❌ Failed to save preference: ${error.message}`);
                return new Response("error", { status: 500 });
            }
            await replyInSlack(channel, messageTs, `✅ Preference saved: "${content}"`);
            return new Response("ok", { status: 200 });
        }

        // SHA-256 deduplication hash
        const hashData = new TextEncoder().encode(messageText);
        const hashBuffer = await crypto.subtle.digest("SHA-256", hashData);
        const contentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

        // ---------------------------------------------------------------------------
        // Phase 24: Apply sensitivity scanner before ingestion
        // ---------------------------------------------------------------------------
        const { tier: sensitivityTier } = scanSensitivity(messageText);

        // ---------------------------------------------------------------------------
        // Phase 17: Classify the capture type with confidence gating
        // ---------------------------------------------------------------------------
        let classified = await classifyCapture(messageText);

        // Optional consistency check: if confidence is low, run a second pass
        if (classified.confidence < CONSISTENCY_CUTOFF) {
            const second = await classifyCapture(messageText);
            if (second.type !== classified.type) {
                classified = {
                    ...classified,
                    confidence: Math.round(classified.confidence * CONSISTENCY_FACTOR),
                };
            }
        }

        const threshold = await getThreshold(classified.type);
        const confident = (classified.confidence / 10) >= threshold;
        // On the Slack path we always proceed (no interactive confirmation loop available).
        // We record auto_classified=true and nudge the threshold as "accepted".
        // ---------------------------------------------------------------------------

        // Insert Memory IMMEDIATELY (Async Ingestion)
        // Background extraction handled by pg_net webhook calling `process-memory`
        const { data: memoryData, error: memoryError } = await supabase
            .from("memories")
            .insert({
                content: messageText,
                content_hash: contentHash,
                type: confident ? classified.type : "observation",
                sensitivity_tier: sensitivityTier,
                embedding: null, // process-memory will compute this
                slack_metadata: {
                    channel,
                    ts: messageTs,
                    files: event.files || []
                }
            })
            .select("id")
            .single();

        if (memoryError) {
            if (memoryError.code === "23505") { // UNIQUE_VIOLATION
                console.log(`Duplicate detected (hash ${contentHash}). Ignoring.`);
                return new Response("ok", { status: 200 });
            }
            console.error("Supabase memory insert error:", memoryError);
            await replyInSlack(channel, messageTs, `Failed to capture: ${memoryError.message}`);
            return new Response("error", { status: 500 });
        }

        // Record classification outcome asynchronously (non-blocking)
        recordOutcome(classified, memoryData?.id ?? null).catch(console.error);

        // Return immediately to avoid Slack timeouts
        // process-memory Edge Function will send the confirmation reply
        return new Response("ok", { status: 200 });
    } catch (err) {
        console.error("Function error:", err);
        return new Response("error", { status: 500 });
    }
});

