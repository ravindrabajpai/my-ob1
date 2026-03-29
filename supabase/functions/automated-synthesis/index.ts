import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSynthesis } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const SLACK_CAPTURE_CHANNEL = Deno.env.get("SLACK_CAPTURE_CHANNEL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendToSlack(text: string): Promise<void> {
    if (!SLACK_BOT_TOKEN || !SLACK_CAPTURE_CHANNEL) return;
    await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: SLACK_CAPTURE_CHANNEL, text }),
    });
}

Deno.serve(async (req: Request): Promise<Response> => {
    try {
        // Calculate date ranges (defaulting to last 7 days)
        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        const now = new Date();
        const start = new Date(now.getTime() - ONE_WEEK_MS);

        const endStr = now.toISOString();
        const startStr = start.toISOString();

        // Fetch data
        const [
            { data: memories },
            { data: tasks },
            { data: insights },
            { data: activeGoals },
        ] = await Promise.all([
            supabase.from("memories").select("content, type, created_at").gte("created_at", startStr),
            supabase.from("tasks").select("description, status").eq("status", "pending"), // Want open tasks
            supabase.from("system_insights").select("content").gte("created_at", startStr),
            supabase.from("goals_and_principles").select("content").eq("status", "active"),
        ]);

        if (!memories?.length && !tasks?.length) {
            return new Response("No sufficient data to synthesize.", { status: 200 });
        }

        const reportContent = await generateSynthesis(
            memories || [],
            tasks || [],
            insights || [],
            activeGoals || []
        );

        if (!reportContent) {
            return new Response("Synthesis generation failed.", { status: 500 });
        }

        // Insert into database
        const { error } = await supabase.from("synthesis_reports").insert({
            content: reportContent,
            date_range_start: startStr,
            date_range_end: endStr
        });

        if (error) {
            console.error("Failed to insert report:", error);
            return new Response("Database error", { status: 500 });
        }

        // Post to Slack
        const slackMessage = `🤖 *Automated Weekly Synthesis*\n\n${reportContent}`;
        await sendToSlack(slackMessage);

        return new Response("ok", { status: 200 });
    } catch (err) {
        console.error("Cron error:", err);
        return new Response("error", { status: 500 });
    }
});
