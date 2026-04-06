import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getEmbedding, extractMetadata, evaluateAgainstTastePreferences } from "../_shared/brain-engine.ts";

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
      const { embedding: qEmb } = await getEmbedding(query);
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
      const hashData = new TextEncoder().encode(content);
      const hashBuffer = await crypto.subtle.digest("SHA-256", hashData);
      const contentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

      const [{ embedding }, { data: metadata }] = await Promise.all([
        getEmbedding(content),
        extractMetadata(content),
      ]);

      const meta = metadata as Record<string, any>;

      const { data: memory, error: memoryError } = await supabase.from("memories").insert({
        content,
        content_hash: contentHash,
        embedding,
        type: meta.memory_type || "observation",
      }).select("id").single();

      if (memoryError || !memory) {
        if (memoryError?.code === "23505") { // UNIQUE_VIOLATION
          return { content: [{ type: "text" as const, text: `Duplicate memory detected.` }] }; // Not returning isError: true so it doesn't break the agent's workflow heavily, but informs it. Wait, `isError: true` might be better explicitly.
        }
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

      let linkedThreadsCount = 0;
      if (Array.isArray(meta.associated_threads) && meta.associated_threads.length > 0) {
        for (const threadName of meta.associated_threads) {
          if (!threadName || typeof threadName !== "string") continue;
          const { data: threadData } = await supabase.from("threads")
            .upsert({ name: threadName }, { onConflict: "name" })
            .select("id").single();
          if (threadData?.id) {
            await supabase.from("memory_threads").insert({
              memory_id: memoryId,
              thread_id: threadData.id
            });
            linkedThreadsCount++;
          }
        }
      }

      let insightText: string | null = null;
      const { data: prefsData } = await supabase.from("taste_preferences").select("want, reject").eq("status", "active");
      if (prefsData && prefsData.length > 0) {
        const params = prefsData.map((p: any) => ({ want: p.want, reject: p.reject }));
        const { insight } = await evaluateAgainstTastePreferences(content, params);
        insightText = insight;
        if (insightText) {
          await supabase.from("system_insights").insert({
            memory_id: memoryId,
            content: insightText,
          });
        }
      }

      let confirmation = `Captured as ${meta.memory_type || "observation"}`;
      if (meta.extracted_tasks?.length) confirmation += ` | Tasks: ${meta.extracted_tasks.length}`;
      if (linkedEntitiesCount) confirmation += ` | Entities: ${linkedEntitiesCount}`;
      if (linkedThreadsCount) confirmation += ` | Threads: ${linkedThreadsCount}`;
      if (insightText) confirmation += ` | Insight: ${insightText}`;

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
      const { error } = await supabase.from("mcp_operation_queue").insert({
        operation_type: "complete_task",
        payload: { task_id }
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Task completion request for ${task_id} added to the approval queue.` }] };
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
      const { error } = await supabase.from("mcp_operation_queue").insert({
        operation_type: "update_task_deadline",
        payload: { task_id, due_date }
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Task deadline update request for ${task_id} added to the approval queue.` }] };
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
      const { error } = await supabase.from("mcp_operation_queue").insert({
        operation_type: "merge_entities",
        payload: { source_entity_id, target_entity_id }
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Entity merge request for ${source_entity_id} into ${target_entity_id} added to the approval queue.` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 8: Add Taste Preference
server.registerTool(
  "add_taste_preference",
  {
    title: "Add Taste Preference",
    description: "Add a new strict taste preference for evaluating incoming thoughts.",
    inputSchema: {
      preference_name: z.string().describe("Short name for the preference"),
      domain: z.string().describe("Domain of the constraint (e.g. general, work, family)"),
      want: z.string().describe("Explicitly what to look out for and align with"),
      reject: z.string().describe("Explicitly what to reject, flag, or call out"),
      constraint_type: z.string().describe("Type of constraint (e.g. Goal, Principle, Style)"),
    },
  },
  async ({ preference_name, domain, want, reject, constraint_type }: { preference_name: string, domain: string, want: string, reject: string, constraint_type: string }) => {
    try {
      const { error } = await supabase.from("mcp_operation_queue").insert({
        operation_type: "add_taste_preference",
        payload: { preference_name, domain, want, reject, constraint_type }
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Taste preference creation request added to the approval queue.` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 9: Remove Taste Preference
server.registerTool(
  "remove_taste_preference",
  {
    title: "Remove Taste Preference",
    description: "Soft-delete a taste preference so it is no longer used for evaluating incoming thoughts.",
    inputSchema: {
      preference_id: z.string().uuid().describe("The UUID of the taste preference to remove"),
    },
  },
  async ({ preference_id }: { preference_id: string }) => {
    try {
      const { error } = await supabase.from("mcp_operation_queue").insert({
        operation_type: "remove_taste_preference",
        payload: { preference_id }
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Taste preference removal request for ${preference_id} added to the approval queue.` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 9b: List Taste Preferences
server.registerTool(
  "list_taste_preferences",
  {
    title: "List Taste Preferences",
    description: "List active taste preferences that act as guardrails for the system.",
    inputSchema: {},
  },
  async () => {
    try {
      const { data, error } = await supabase.from("taste_preferences").select("*").eq("status", "active");
      if (error) throw error;
      if (!data?.length) return { content: [{ type: "text" as const, text: "No active taste preferences found." }] };

      const output = data.map((p: any) => `- [${p.constraint_type}] ${p.preference_name} (ID: ${p.id})\n  WANT: ${p.want}\n  REJECT: ${p.reject}`).join("\n\n");
      return { content: [{ type: "text" as const, text: `Active Taste Preferences:\n\n${output}` }] };
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

// Tool 14: Get Recent Synthesis
server.registerTool(
  "get_recent_synthesis",
  {
    title: "Get Recent Synthesis",
    description: "Fetch the most recently generated cognitive digests/weekly summaries.",
    inputSchema: {
      limit: z.number().optional().default(1).describe("How many recent reports to fetch (default: 1)"),
    },
  },
  async ({ limit }: { limit?: number }) => {
    try {
      const { data, error } = await supabase
        .from("synthesis_reports")
        .select("content, date_range_start, date_range_end, created_at")
        .order("created_at", { ascending: false })
        .limit(limit || 1);

      if (error) throw error;
      if (!data?.length) return { content: [{ type: "text" as const, text: "No synthesis reports found in the database. Run the automated-synthesis webhook first." }] };

      const output = data.map((r: any) => {
        return `--- Report from ${new Date(r.date_range_start).toLocaleDateString()} to ${new Date(r.date_range_end).toLocaleDateString()} ---\n${r.content}`;
      }).join("\n\n");

      return { content: [{ type: "text" as const, text: output }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 15: List Learning Topics
server.registerTool(
  "list_learning_topics",
  {
    title: "List Learning Topics",
    description: "List topics from the Learning Wisdom Vertical.",
    inputSchema: {
      limit: z.number().optional().default(20),
    },
  },
  async ({ limit }: { limit?: number }) => {
    try {
      const { data, error } = await supabase.from("learning_topics").select("id, topic_name, mastery_status").order("topic_name").limit(limit || 20);
      if (error) throw error;
      if (!data?.length) return { content: [{ type: "text" as const, text: "No learning topics found." }] };

      const output = data.map((t: any) => `- ${t.topic_name} [${t.mastery_status}] (ID: ${t.id})`).join("\n");
      return { content: [{ type: "text" as const, text: `Learning Topics:\n${output}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 16: Add Learning Milestone
server.registerTool(
  "add_learning_milestone",
  {
    title: "Add Learning Milestone",
    description: "Add a new milestone to an existing learning topic. Handled via queue.",
    inputSchema: {
      topic_id: z.string().uuid().describe("The UUID of the learning topic"),
      description: z.string().describe("Description of the milestone reached"),
    },
  },
  async ({ topic_id, description }: { topic_id: string, description: string }) => {
    try {
      const { error } = await supabase.from("mcp_operation_queue").insert({
        operation_type: "add_learning_milestone",
        payload: { topic_id, description }
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Request to add learning milestone added to the approval queue.` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 17: Update Mastery Status
server.registerTool(
  "update_mastery_status",
  {
    title: "Update Mastery Status",
    description: "Update the mastery status of a learning topic. Handled via queue.",
    inputSchema: {
      topic_id: z.string().uuid().describe("The UUID of the learning topic"),
      status: z.string().describe("The new status (learning, exploring, mastered, struggling)"),
    },
  },
  async ({ topic_id, status }: { topic_id: string, status: string }) => {
    try {
      const { error } = await supabase.from("mcp_operation_queue").insert({
        operation_type: "update_mastery_status",
        payload: { topic_id, status }
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Request to update mastery status added to the approval queue.` }] };
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

