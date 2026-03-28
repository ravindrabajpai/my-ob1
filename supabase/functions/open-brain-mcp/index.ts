import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getEmbedding, extractMetadata } from "../_shared/brain-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- MCP Server Setup ---

// --- MCP Server Setup ---

const server = new McpServer({
  name: "open-brain",
  version: "1.0.0",
});

// Tool 1: Semantic Search
server.registerTool(
  "search_memories",
  {
    title: "Search Memories",
    description:
      "Search captured memories by meaning. Use this when the user asks about a topic, person, or idea they've previously captured.",
    inputSchema: {
      query: z.string().describe("What to search for"),
      limit: z.number().optional().default(10),
      threshold: z.number().optional().default(0.5),
    },
  },
  async ({ query, limit, threshold }) => {
    try {
      const qEmb = await getEmbedding(query);
      const { data, error } = await supabase.rpc("match_memories", {
        query_embedding: qEmb,
        match_threshold: threshold,
        match_count: limit,
      });

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Search error: ${error.message}` }],
          isError: true,
        };
      }

      if (!data || data.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No memories found matching "${query}".` }],
        };
      }

      const results = await Promise.all(data.map(async (t: any, i: number) => {
        // Fetch tasks for this memory
        const { data: tasks } = await supabase.from("tasks").select("description, status").eq("memory_id", t.id);
        const { data: entityData } = await supabase.from("memory_entities").select("entities(name)").eq("memory_id", t.id);

        const parts = [
          `--- Result ${i + 1} (${(t.similarity * 100).toFixed(1)}% match) ---`,
          `Captured: ${new Date(t.created_at).toLocaleDateString()}`,
          `Type: ${t.type || "unknown"}`,
        ];

        if (tasks && tasks.length > 0) {
          parts.push(`Tasks: ${tasks.map((tk: any) => `[${tk.status}] ${tk.description}`).join("; ")}`);
        }
        if (entityData && entityData.length > 0) {
          parts.push(`Entities: ${entityData.map((e: any) => e.entities.name).join(", ")}`);
        }
        parts.push(`\n${t.content}`);
        return parts.join("\n");
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${data.length} memory(s):\n\n${results.join("\n\n")}`,
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 2: List Recent
server.registerTool(
  "list_memories",
  {
    title: "List Recent Memories",
    description:
      "List recently captured memories with optional filters by type or time range.",
    inputSchema: {
      limit: z.number().optional().default(10),
      type: z.string().optional().describe("Filter by type: observation, decision, idea, complaint, log"),
      days: z.number().optional().describe("Only logs from the last N days"),
    },
  },
  async ({ limit, type, days }) => {
    try {
      let q = supabase
        .from("memories")
        .select("content, type, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (type) q = q.eq("type", type);
      if (days) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        q = q.gte("created_at", since.toISOString());
      }

      const { data, error } = await q;

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      if (!data || !data.length) {
        return { content: [{ type: "text" as const, text: "No memories found." }] };
      }

      const results = data.map(
        (
          t: { content: string; type: string; created_at: string },
          i: number
        ) => {
          return `${i + 1}. [${new Date(t.created_at).toLocaleDateString()}] (${t.type || "??"})\n   ${t.content}`;
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `${data.length} recent memories:\n\n${results.join("\n\n")}`,
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 3: Stats
server.registerTool(
  "memory_stats",
  {
    title: "Memory Statistics",
    description: "Get a summary of all captured memories: totals, types, and entity counts.",
    inputSchema: {},
  },
  async () => {
    try {
      const { count } = await supabase
        .from("memories")
        .select("*", { count: "exact", head: true });

      const { data } = await supabase
        .from("memories")
        .select("type, created_at")
        .order("created_at", { ascending: false });

      const { count: tasksCount } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true });

      const { count: entitiesCount } = await supabase
        .from("entities")
        .select("*", { count: "exact", head: true });

      const types: Record<string, number> = {};

      for (const r of data || []) {
        if (r.type) types[r.type as string] = (types[r.type as string] || 0) + 1;
      }

      const sort = (o: Record<string, number>): [string, number][] =>
        Object.entries(o)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

      const lines: string[] = [
        `Total Memories: ${count}`,
        `Total Tasks: ${tasksCount}`,
        `Total Entities: ${entitiesCount}`,
        `Date range: ${data?.length
          ? new Date(data[data.length - 1].created_at).toLocaleDateString() +
          " → " +
          new Date(data[0].created_at).toLocaleDateString()
          : "N/A"
        }`,
        "",
        "Types:",
        ...sort(types).map(([k, v]) => `  ${k}: ${v}`),
      ];

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 4: Capture Memory
server.registerTool(
  "capture_memory",
  {
    title: "Capture Memory",
    description:
      "Save a new thought/memory to the Open Brain. Generates an embedding and extracts metadata automatically. Populates graph automatically.",
    inputSchema: {
      content: z.string().describe("The thought to capture — a clear, standalone statement."),
    },
  },
  async ({ content }) => {
    try {
      const [embedding, metadata] = await Promise.all([
        getEmbedding(content),
        extractMetadata(content),
      ]);

      const meta = metadata as Record<string, any>;

      const { data: memory, error: memoryError } = await supabase.from("memories").insert({
        content,
        embedding,
        type: meta.memory_type || "observation",
      }).select("id").single();

      if (memoryError || !memory) {
        return { content: [{ type: "text" as const, text: `Memory insert error: ${memoryError?.message}` }], isError: true };
      }

      const memoryId = memory.id;

      if (Array.isArray(meta.extracted_tasks) && meta.extracted_tasks.length > 0) {
        const taskInserts = meta.extracted_tasks.map((t: any) => ({
          memory_id: memoryId,
          description: t.description,
          due_date: t.inferred_deadline || null,
          status: "pending"
        }));
        await supabase.from("tasks").insert(taskInserts);
      }

      let linkedEntitiesCount = 0;
      if (Array.isArray(meta.entities_detected) && meta.entities_detected.length > 0) {
        for (const ent of meta.entities_detected) {
          if (!ent.name || !ent.type) continue;
          const { data: entityData } = await supabase.from("entities")
            .upsert({ name: ent.name, type: ent.type }, { onConflict: "name, type" })
            .select("id").single();
          if (entityData?.id) {
            await supabase.from("memory_entities").insert({
              memory_id: memoryId,
              entity_id: entityData.id
            });
            linkedEntitiesCount++;
          }
        }
      }

      let confirmation = `Captured as ${meta.memory_type || "observation"}`;
      if (meta.extracted_tasks?.length) confirmation += ` | Tasks: ${meta.extracted_tasks.length}`;
      if (linkedEntitiesCount) confirmation += ` | Entities: ${linkedEntitiesCount}`;

      return {
        content: [{ type: "text" as const, text: confirmation }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// --- Hono App with Auth Check ---

const app = new Hono();

app.all("*", async (c) => {
  // Accept access key via header OR URL query parameter
  const provided = c.req.header("x-brain-key") || new URL(c.req.url).searchParams.get("key");
  if (!provided || provided !== MCP_ACCESS_KEY) {
    return c.json({ error: "Invalid or missing access key" }, 401);
  }

  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

Deno.serve(app.fetch);

