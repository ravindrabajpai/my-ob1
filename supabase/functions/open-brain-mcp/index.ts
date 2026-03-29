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

// Tool 5: Complete Task
server.registerTool(
  "complete_task",
  {
    title: "Complete Task",
    description: "Mark a task as completed.",
    inputSchema: {
      task_id: z.string().uuid().describe("The UUID of the task to complete"),
    },
  },
  async ({ task_id }: { task_id: string }) => {
    try {
      const { error } = await supabase.from("tasks").update({ status: "completed" }).eq("id", task_id);
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Task ${task_id} completed successfully.` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 6: Update Task Deadline
server.registerTool(
  "update_task_deadline",
  {
    title: "Update Task Deadline",
    description: "Reschedule a task to a new due date.",
    inputSchema: {
      task_id: z.string().uuid().describe("The UUID of the task to update"),
      due_date: z.string().describe("ISO-8601 date string for the new deadline"),
    },
  },
  async ({ task_id, due_date }: { task_id: string, due_date: string }) => {
    try {
      const { error } = await supabase.from("tasks").update({ due_date }).eq("id", task_id);
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Task ${task_id} deadline updated to ${due_date}.` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 7: Merge Entities
server.registerTool(
  "merge_entities",
  {
    title: "Merge Entities",
    description: "Deduplicate the Knowledge Graph by merging a source entity into a target entity. The source will be deleted and its connections transferred.",
    inputSchema: {
      source_entity_id: z.string().uuid().describe("The UUID of the entity to merge AND delete"),
      target_entity_id: z.string().uuid().describe("The UUID of the entity to keep"),
    },
  },
  async ({ source_entity_id, target_entity_id }: { source_entity_id: string, target_entity_id: string }) => {
    try {
      const { error } = await supabase.rpc("merge_entities", {
        source_id: source_entity_id,
        target_id: target_entity_id
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Successfully merged entity ${source_entity_id} into ${target_entity_id}.` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 8: Create Goal/Principle
server.registerTool(
  "create_goal",
  {
    title: "Create Goal or Principle",
    description: "Add a new strategic goal or operational principle to the system for future memory evaluation.",
    inputSchema: {
      content: z.string().describe("The text of the goal or principle"),
      type: z.enum(["Goal", "Principle"]).describe("Whether this is a Goal or a Principle"),
    },
  },
  async ({ content, type }: { content: string, type: string }) => {
    try {
      const { data, error } = await supabase.from("goals_and_principles").insert({
        content,
        type,
        status: "active"
      }).select("id").single();

      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Created ${type} with ID ${data.id}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 9: Archive Goal
server.registerTool(
  "archive_goal",
  {
    title: "Archive Goal",
    description: "Soft-delete a goal so it is no longer used for evaluating incoming thoughts.",
    inputSchema: {
      goal_id: z.string().uuid().describe("The UUID of the goal to archive"),
    },
  },
  async ({ goal_id }: { goal_id: string }) => {
    try {
      const { error } = await supabase.from("goals_and_principles").update({ status: "archived" }).eq("id", goal_id);
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Goal ${goal_id} archived successfully.` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 10: List Tasks
server.registerTool(
  "list_tasks",
  {
    title: "List Tasks",
    description: "Filter and list action items from the Knowledge Graph.",
    inputSchema: {
      status: z.enum(["pending", "completed"]).optional().describe("Filter by task status"),
      limit: z.number().optional().default(20),
    },
  },
  async ({ status, limit }: { status?: string, limit?: number }) => {
    try {
      let query = supabase.from("tasks").select("id, description, status, due_date, created_at").order("created_at", { ascending: false }).limit(limit || 20);
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) return { content: [{ type: "text" as const, text: "No tasks found." }] };

      const output = data.map((t: any) => `- [${t.status}] ${t.description} (ID: ${t.id}${t.due_date ? `, Due: ${t.due_date}` : ""})`).join("\n");
      return { content: [{ type: "text" as const, text: `Tasks:\n${output}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 11: List Entities
server.registerTool(
  "list_entities",
  {
    title: "List Entities",
    description: "Filter and list people, projects, and concepts in the Knowledge Graph.",
    inputSchema: {
      type: z.enum(["Person", "Project", "Concept"]).optional().describe("Filter by entity type"),
      limit: z.number().optional().default(20),
    },
  },
  async ({ type, limit }: { type?: string, limit?: number }) => {
    try {
      let query = supabase.from("entities").select("id, name, type").order("name").limit(limit || 20);
      if (type) query = query.eq("type", type);

      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) return { content: [{ type: "text" as const, text: "No entities found." }] };

      const output = data.map((e: any) => `- ${e.name} [${e.type}] (ID: ${e.id})`).join("\n");
      return { content: [{ type: "text" as const, text: `Entities:\n${output}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 12: List Threads
server.registerTool(
  "list_threads",
  {
    title: "List Threads",
    description: "List all active work/life streams (threads) in the Knowledge Graph.",
    inputSchema: {
      limit: z.number().optional().default(20),
    },
  },
  async ({ limit }: { limit?: number }) => {
    try {
      const { data, error } = await supabase.from("threads").select("id, name").order("name").limit(limit || 20);
      if (error) throw error;
      if (!data?.length) return { content: [{ type: "text" as const, text: "No threads found." }] };

      const output = data.map((t: any) => `- ${t.name} (ID: ${t.id})`).join("\n");
      return { content: [{ type: "text" as const, text: `Threads:\n${output}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 13: Get Thread Context
server.registerTool(
  "get_thread_context",
  {
    title: "Get Thread Context",
    description: "Retrieve all memories and structured metadata linked to a specific thread.",
    inputSchema: {
      thread_id: z.string().uuid().describe("The UUID of the thread"),
    },
  },
  async ({ thread_id }: { thread_id: string }) => {
    try {
      const { data, error } = await supabase
        .from("memory_threads")
        .select("memories(id, content, type, created_at)")
        .eq("thread_id", thread_id)
        .order("memories(created_at)", { ascending: true });

      if (error) throw error;
      if (!data?.length) return { content: [{ type: "text" as const, text: "No memories linked to this thread." }] };

      const output = data.map((d: any) => {
        const m = d.memories;
        return `[${new Date(m.created_at).toLocaleDateString()}] (${m.type}): ${m.content}`;
      }).join("\n\n");

      return { content: [{ type: "text" as const, text: `Thread Content:\n\n${output}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
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

