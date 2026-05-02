import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { getEmbedding } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-brain-key, accept",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS, DELETE",
};

const app = new Hono().basePath("/open-brain-dashboard-api");

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return c.text("ok", 200, corsHeaders);
  }

  const provided = c.req.header("x-brain-key") || new URL(c.req.url).searchParams.get("key");
  if (!provided || provided !== MCP_ACCESS_KEY) {
    return c.json({ error: "Invalid or missing x-brain-key" }, 401, corsHeaders);
  }
  await next();
  
  // Apply CORS to all responses
  for (const [key, value] of Object.entries(corsHeaders)) {
    c.res.headers.set(key, value);
  }
});

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "open-brain-dashboard-api" });
});

app.get("/stats", async (c) => {
  const { data, error } = await supabase.rpc("get_dashboard_stats");
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

app.get("/memories", async (c) => {
  const type = c.req.query("type");
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  const sensitivity = c.req.query("sensitivity_tier");

  let q = supabase
    .from("memories")
    .select("id, content, type, sensitivity_tier, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) q = q.eq("type", type);
  if (sensitivity) q = q.eq("sensitivity_tier", sensitivity);

  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

app.get("/tasks", async (c) => {
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") || "100");

  let q = supabase
    .from("tasks")
    .select("id, description, status, due_date, created_at, memories(content)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data });
});

app.post("/search", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const query = body.query;
  const limit = parseInt(body.limit || "10");
  const threshold = parseFloat(body.threshold || "0.5");

  if (!query) return c.json({ error: "Missing query" }, 400);

  try {
    const { embedding: qEmb } = await getEmbedding(query);
    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: qEmb,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) throw error;
    return c.json({ data });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

Deno.serve(app.fetch);
