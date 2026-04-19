import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const app = new Hono();

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
app.use("/*", async (c, next) => {
    const key = c.req.header("x-brain-key") ?? c.req.query("key");
    if (!MCP_ACCESS_KEY || key !== MCP_ACCESS_KEY) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DEFAULT_USER_ID = Deno.env.get("DEFAULT_USER_ID") ??
    "00000000-0000-0000-0000-000000000001";

// ---------------------------------------------------------------------------
// POST /start-session
// Creates or resumes a profile + session for DEFAULT_USER_ID.
// ---------------------------------------------------------------------------
app.post("/start-session", async (c) => {
    try {
        const body = await c.req.json().catch(() => ({}));
        const session_name: string | undefined = body.session_name;

        const { data, error } = await supabase.rpc("operating_model_start_session", {
            p_user_id: DEFAULT_USER_ID,
            p_session_name: session_name ?? null,
        });

        if (error) throw error;
        return c.json({ ok: true, data });
    } catch (err) {
        console.error("[start-session]", err);
        return c.json({ ok: false, error: String(err) }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /save-layer
// Saves an approved layer checkpoint for a session.
// Body: { session_id, layer, checkpoint_summary, entries[] }
// ---------------------------------------------------------------------------
app.post("/save-layer", async (c) => {
    try {
        const body = await c.req.json();
        const { session_id, layer, checkpoint_summary, entries } = body;

        if (!session_id || !layer || !checkpoint_summary) {
            return c.json({ ok: false, error: "session_id, layer, and checkpoint_summary are required" }, 400);
        }

        const { data, error } = await supabase.rpc("operating_model_save_layer", {
            p_session_id: session_id,
            p_layer: layer,
            p_checkpoint_summary: checkpoint_summary,
            p_entries: entries ?? [],
        });

        if (error) throw error;
        return c.json({ ok: true, data });
    } catch (err) {
        console.error("[save-layer]", err);
        return c.json({ ok: false, error: String(err) }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /query
// Fetches approved entries for a given layer and (optionally) session.
// Body: { layer?, session_id?, limit? }
// ---------------------------------------------------------------------------
app.post("/query", async (c) => {
    try {
        const body = await c.req.json().catch(() => ({}));
        const { layer, session_id, limit: queryLimit = 50 } = body;

        let query = supabase
            .from("operating_model_entries")
            .select(`
        id, layer, entry_order, title, summary, cadence, trigger,
        inputs, stakeholders, constraints, details, source_confidence,
        status, last_validated_at, created_at,
        operating_model_sessions!inner(profile_version)
      `)
            .eq("user_id", DEFAULT_USER_ID)
            .eq("status", "active")
            .order("entry_order", { ascending: true })
            .limit(queryLimit);

        if (layer) query = query.eq("layer", layer);
        if (session_id) query = query.eq("session_id", session_id);

        const { data, error } = await query;
        if (error) throw error;
        return c.json({ ok: true, data });
    } catch (err) {
        console.error("[query]", err);
        return c.json({ ok: false, error: String(err) }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /generate-exports
// Generates the five portable context artifacts from the latest completed
// session and stores them in operating_model_exports.
// Body: { session_id }
// ---------------------------------------------------------------------------
app.post("/generate-exports", async (c) => {
    try {
        const body = await c.req.json();
        const { session_id } = body;
        if (!session_id) return c.json({ ok: false, error: "session_id is required" }, 400);

        // Fetch session
        const { data: session, error: sessErr } = await supabase
            .from("operating_model_sessions")
            .select("*, operating_model_profiles(id, current_version)")
            .eq("id", session_id)
            .single();
        if (sessErr || !session) throw sessErr ?? new Error("Session not found");

        // Verify all 5 layers are complete
        const requiredLayers = [
            "operating_rhythms", "recurring_decisions", "dependencies",
            "institutional_knowledge", "friction",
        ];
        const missing = requiredLayers.filter(
            (l) => !session.completed_layers.includes(l)
        );
        if (missing.length > 0) {
            return c.json({ ok: false, error: `Missing layers: ${missing.join(", ")}` }, 422);
        }

        // Fetch all entries
        const { data: entries, error: entErr } = await supabase
            .from("operating_model_entries")
            .select("*")
            .eq("session_id", session_id)
            .eq("status", "active")
            .order("layer")
            .order("entry_order");
        if (entErr) throw entErr;

        const byLayer = (l: string) => (entries ?? []).filter((e) => e.layer === l);

        // Build artifact content strings
        const operatingModelJson = JSON.stringify({
            profile_version: session.profile_version,
            session_id,
            generated_at: new Date().toISOString(),
            layers: Object.fromEntries(
                requiredLayers.map((l) => [l, byLayer(l)])
            ),
        }, null, 2);

        const userMd = [
            "# USER Profile",
            "",
            "## Operating Rhythms",
            ...byLayer("operating_rhythms").map((e) =>
                `- **${e.title}**: ${e.summary}${e.cadence ? ` *(${e.cadence})*` : ""}`
            ),
            "",
            "## Recurring Decisions",
            ...byLayer("recurring_decisions").map((e) =>
                `- **${e.title}**: ${e.summary}`
            ),
            "",
            "## Key Dependencies",
            ...byLayer("dependencies").map((e) =>
                `- **${e.title}**: ${e.summary}`
            ),
        ].join("\n");

        const soulMd = [
            "# SOUL — Guardrails & Institutional Knowledge",
            "",
            "## Institutional Knowledge",
            ...byLayer("institutional_knowledge").map((e) =>
                `- **${e.title}**: ${e.summary}`
            ),
        ].join("\n");

        const heartbeatMd = [
            "# HEARTBEAT — Recurring Checks",
            "",
            "## Friction Points to Monitor",
            ...byLayer("friction").map((e) =>
                `- **${e.title}**: ${e.summary}`
            ),
        ].join("\n");

        const scheduleJson = JSON.stringify({
            rhythms: byLayer("operating_rhythms").map((e) => ({
                title: e.title,
                cadence: e.cadence,
                trigger: e.trigger,
            })),
        }, null, 2);

        const artifacts = [
            { name: "operating-model.json", content: operatingModelJson, type: "application/json" },
            { name: "USER.md", content: userMd, type: "text/markdown" },
            { name: "SOUL.md", content: soulMd, type: "text/markdown" },
            { name: "HEARTBEAT.md", content: heartbeatMd, type: "text/markdown" },
            { name: "schedule-recommendations.json", content: scheduleJson, type: "application/json" },
        ];

        for (const artifact of artifacts) {
            const { error: upsErr } = await supabase
                .from("operating_model_exports")
                .upsert({
                    profile_id: (session as any).operating_model_profiles?.id,
                    session_id,
                    user_id: DEFAULT_USER_ID,
                    profile_version: session.profile_version,
                    artifact_name: artifact.name,
                    content: artifact.content,
                    content_type: artifact.type,
                    metadata: {},
                }, { onConflict: "session_id,artifact_name" });
            if (upsErr) throw upsErr;
        }

        // Mark session complete
        await supabase
            .from("operating_model_sessions")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", session_id);

        return c.json({
            ok: true,
            session_id,
            profile_version: session.profile_version,
            artifacts: artifacts.map((a) => ({ name: a.name, type: a.type })),
        });
    } catch (err) {
        console.error("[generate-exports]", err);
        return c.json({ ok: false, error: String(err) }, 500);
    }
});

// ---------------------------------------------------------------------------
// POST /get-export
// Retrieve a previously generated artifact by name.
// Body: { session_id, artifact_name }
// ---------------------------------------------------------------------------
app.post("/get-export", async (c) => {
    try {
        const body = await c.req.json();
        const { session_id, artifact_name } = body;
        if (!session_id || !artifact_name) {
            return c.json({ ok: false, error: "session_id and artifact_name are required" }, 400);
        }

        const { data, error } = await supabase
            .from("operating_model_exports")
            .select("artifact_name, content, content_type, profile_version, created_at")
            .eq("session_id", session_id)
            .eq("artifact_name", artifact_name)
            .single();
        if (error) throw error;
        return c.json({ ok: true, data });
    } catch (err) {
        console.error("[get-export]", err);
        return c.json({ ok: false, error: String(err) }, 500);
    }
});

Deno.serve(app.fetch);
