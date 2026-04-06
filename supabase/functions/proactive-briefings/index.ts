import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSynthesis } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const SLACK_CAPTURE_CHANNEL = Deno.env.get("SLACK_CAPTURE_CHANNEL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function notifySlack(text: string) {
    if (!SLACK_BOT_TOKEN || !SLACK_CAPTURE_CHANNEL) return;
    try {
        await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                channel: SLACK_CAPTURE_CHANNEL,
                text,
            }),
        });
    } catch (e) {
        console.error("Slack notification failed:", e);
    }
}

Deno.serve(async (req: Request) => {
    try {
        // Fetch pending tasks
        const { data: tasks, error: tasksError } = await supabase
            .from("tasks")
            .select("id, description, due_date")
            .eq("status", "pending")
            .order("created_at", { ascending: false });

        if (tasksError) throw tasksError;

        // Fetch recent system insights (last 48 hours)
        const fortyEightHoursAgo = new Date();
        fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

        const { data: insights, error: insightsError } = await supabase
            .from("system_insights")
            .select("id, content, created_at")
            .gte("created_at", fortyEightHoursAgo.toISOString())
            .order("created_at", { ascending: false });

        if (insightsError) throw insightsError;

        if ((!tasks || tasks.length === 0) && (!insights || insights.length === 0)) {
            console.log("No pending tasks or recent insights. Skipping briefing.");
            return new Response("skipped", { status: 200 });
        }

        // Just build a straightforward markdown briefing
        let briefingText = "🌅 *Morning Mentor Briefing*\n\n";

        if (tasks && tasks.length > 0) {
            briefingText += "*📝 Pending Tasks (Action Required)*\n";
            tasks.slice(0, 10).forEach(t => {
                briefingText += `• ${t.description} ${t.due_date ? `(Due: ${t.due_date})` : ''}\n`;
            });
            if (tasks.length > 10) briefingText += `• ...and ${tasks.length - 10} more.\n`;
            briefingText += "\n";
        } else {
            briefingText += "*📝 Pending Tasks*\n• No active tasks right now. Great job!\n\n";
        }

        if (insights && insights.length > 0) {
            briefingText += "*🧠 Recent Strategic Insights*\n";
            // Get the last 3-5 insights
            const recentInsights = insights.slice(0, 5);
            recentInsights.forEach(i => {
                briefingText += `• ${i.content}\n`;
            });
            briefingText += "\n";
        }

        briefingText += "_Use `/open-brain list_tasks` to view all tasks, or `/open-brain complete_task <UUID>` to clear them._";

        await notifySlack(briefingText);

        return new Response("ok", { status: 200 });
    } catch (err) {
        console.error("Proactive briefings error:", err);
        return new Response("error", { status: 500 });
    }
});
