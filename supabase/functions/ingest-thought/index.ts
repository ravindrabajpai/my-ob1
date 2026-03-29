import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

        // 1. Insert Memory IMMEDIATELY (Async Ingestion - Phase 1)
        // Background extraction handled by pg_net webhook calling `process-memory`
        const { error: memoryError } = await supabase.from("memories").insert({
            content: messageText,
            type: "observation", // Default until process-memory updates it
            embedding: null, // process-memory will compute this
            slack_metadata: {
                channel,
                ts: messageTs,
                files: event.files || []
            }
        });

        if (memoryError) {
            console.error("Supabase memory insert error:", memoryError);
            await replyInSlack(channel, messageTs, `Failed to capture: ${memoryError.message}`);
            return new Response("error", { status: 500 });
        }

        // Return immediately to avoid Slack timeouts
        // process-memory Edge Function will send the confirmation reply
        return new Response("ok", { status: 200 });
    } catch (err) {
        console.error("Function error:", err);
        return new Response("error", { status: 500 });
    }
});

