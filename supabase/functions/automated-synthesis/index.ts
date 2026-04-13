import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSynthesis } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const SLACK_CAPTURE_CHANNEL = Deno.env.get("SLACK_CAPTURE_CHANNEL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendToSlack(text: string): Promise<void> {
    if (!SLACK_BOT_TOKEN || !SLACK_CAPTURE_CHANNEL) {
        console.error("Slack credentials missing");
        return;
    }
    const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: SLACK_CAPTURE_CHANNEL, text }),
    });

    const result = await response.json();
    if (!result.ok) {
        throw new Error(`Slack post failed: ${result.error}`);
    }
}

Deno.serve(async (req: Request): Promise<Response> => {
    try {
        console.log("Starting automated synthesis...");

        // Calculate date ranges (defaulting to last 7 days)
        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        const now = new Date();
        const start = new Date(now.getTime() - ONE_WEEK_MS);

        const endStr = now.toISOString();
        const startStr = start.toISOString();

        console.log(`Analyzing data from ${startStr} to ${endStr}`);

        // Fetch data
        const [
            { data: memories, error: memError },
            { data: tasks, error: taskError },
            { data: insights, error: insightError },
            { data: activeGoals, error: goalError },
        ] = await Promise.all([
            supabase.from("memories").select("content, type, created_at").gte("created_at", startStr),
            supabase.from("tasks").select("description, status").eq("status", "pending"), // Want open tasks
            supabase.from("system_insights").select("content").gte("created_at", startStr),
            supabase.from("taste_preferences").select("want, reject").eq("status", "active"),
        ]);

        if (memError || taskError || insightError || goalError) {
            console.error("Database fetch error:", { memError, taskError, insightError, goalError });
            return new Response("Database fetch error", { status: 500 });
        }

        console.log(`Data counts: Memories: ${memories?.length || 0}, Tasks: ${tasks?.length || 0}, Insights: ${insights?.length || 0}, Goals: ${activeGoals?.length || 0}`);

        if (!memories?.length && !tasks?.length) {
            console.log("No sufficient data found for synthesis.");
            return new Response("No sufficient data to synthesize.", { status: 200 });
        }

        const { report: reportContent, usage } = await generateSynthesis(
            memories || [],
            tasks || [],
            insights || [],
            activeGoals || []
        );

        if (!reportContent) {
            console.error("AI failed to generate synthesis report.");
            return new Response("Synthesis generation failed.", { status: 500 });
        }

        // Insert into database
        const { error: insertError } = await supabase.from("synthesis_reports").insert({
            content: reportContent,
            date_range_start: startStr,
            date_range_end: endStr,
            cost_metrics: usage
        });

        if (insertError) {
            console.error("Failed to insert report into DB:", insertError);
            return new Response("Database insert error", { status: 500 });
        }

        // Post to Slack
        console.log("Posting synthesis to Slack...");
        const slackMessage = `🤖 *Automated Weekly Synthesis*\n\n${reportContent}`;
        await sendToSlack(slackMessage);

        console.log("Synthesis completed successfully.");
        return new Response("ok", { status: 200 });
    } catch (err: any) {
        console.error("Synthesis process error:", err);
        return new Response(`error: ${err.message}`, { status: 500 });
    }
});
