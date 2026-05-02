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
      const entityNameToId: Record<string, string> = {};
      if (Array.isArray(meta.entities_detected) && meta.entities_detected.length > 0) {
        for (const ent of meta.entities_detected) {
          if (!ent.name || !ent.type) continue;
          const { data: entityData } = await supabase.from("entities")
            .upsert({ name: ent.name, type: ent.type }, { onConflict: "name, type" })
            .select("id").single();
          if (entityData?.id) {
            entityNameToId[ent.name] = entityData.id;
            await supabase.from("memory_entities").insert({
              memory_id: memoryId,
              entity_id: entityData.id
            });
            linkedEntitiesCount++;
          }
        }
      }

      // 3.5 Upsert Entity Edges (Phase 22: Enhanced Knowledge Graph)
      let entityEdgesCount = 0;
      if (Array.isArray(meta.entity_relationships) && meta.entity_relationships.length > 0) {
        for (const rel of meta.entity_relationships) {
          if (!rel.source || !rel.target || !rel.relationship_type) continue;
          const sourceId = entityNameToId[rel.source];
          const targetId = entityNameToId[rel.target];
          if (!sourceId || !targetId) continue;
          const confidence = typeof rel.confidence === "number"
            ? Math.min(1.0, Math.max(0.0, rel.confidence))
            : 1.0;
          if (confidence < 0.5) continue;
          const { error: edgeError } = await supabase.rpc("entity_edges_upsert", {
            p_source_entity_id: sourceId,
            p_target_entity_id: targetId,
            p_relationship_type: rel.relationship_type,
            p_weight: confidence,
            p_properties: { rationale: rel.rationale || null },
            p_memory_id: memoryId,
          });
          if (!edgeError) entityEdgesCount++;
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
      if (entityEdgesCount) confirmation += ` | Entity Edges: ${entityEdgesCount}`;
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

// Tool 5b: Update Task Status
server.registerTool(
  "update_task_status",
  {
    title: "Update Task Status",
    description: "Move a task to a different formalized workflow stage. Handled via queue.",
    inputSchema: {
      task_id: z.string().uuid().describe("The UUID of the task to update"),
      status: z.enum(["pending", "in_progress", "blocked", "deferred", "completed"]).describe("The new status for the task"),
    },
  },
  async ({ task_id, status }: { task_id: string, status: string }) => {
    try {
      const { error } = await supabase.from("mcp_operation_queue").insert({
        operation_type: "update_task_status",
        payload: { task_id, status }
      });
      if (error) throw error;
      return { content: [{ type: "text" as const, text: `Task status update request for ${task_id} to ${status} added to the approval queue.` }] };
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
      status: z.enum(["pending", "in_progress", "blocked", "deferred", "completed"]).optional().describe("Filter by task status"),
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

// Tool 18: List Memory Edges (Reasoning Graph)
server.registerTool(
  "list_memory_edges",
  {
    title: "List Memory Edges",
    description: "List typed reasoning edges in the Knowledge Graph. Each edge represents an explicit logical relationship (supports, contradicts, evolved_into, supersedes, depends_on, related_to) between two memories. Use this to explore how thoughts logically connect.",
    inputSchema: {
      memory_id: z.string().uuid().optional().describe("Filter edges by source memory ID (from_memory_id)"),
      relation: z.enum(["supports", "contradicts", "evolved_into", "supersedes", "depends_on", "related_to"]).optional().describe("Filter by relation type"),
      limit: z.number().optional().default(20),
    },
  },
  async ({ memory_id, relation, limit }: { memory_id?: string, relation?: string, limit?: number }) => {
    try {
      let query = supabase
        .from("memory_edges")
        .select("id, from_memory_id, to_memory_id, relation, direction, confidence, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(limit || 20);

      if (memory_id) query = query.eq("from_memory_id", memory_id);
      if (relation) query = query.eq("relation", relation);

      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) return { content: [{ type: "text" as const, text: "No memory edges found." }] };

      const output = data.map((e: any) => {
        const rationale = e.metadata?.rationale ? ` — "${e.metadata.rationale.slice(0, 100)}"` : "";
        return `- [${e.relation}] ${e.from_memory_id.slice(0, 8)}… -[${e.direction}]-> ${e.to_memory_id.slice(0, 8)}… (conf=${e.confidence})${rationale}`;
      }).join("\n");

      return { content: [{ type: "text" as const, text: `Memory Edges (Reasoning Graph):\n${output}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 19: Get Entity Neighbors
server.registerTool(
  "get_entity_neighbors",
  {
    title: "Get Entity Neighbors",
    description: "Get all entities directly connected to a given entity in the Knowledge Graph. Returns neighbors with their relationship type, weight, and direction.",
    inputSchema: {
      entity_id: z.string().uuid().describe("The UUID of the entity to get neighbors for"),
      relationship_type: z.string().optional().describe("Filter by relationship type (e.g. works_on, knows, depends_on)"),
      direction: z.enum(["outgoing", "incoming", "both"]).optional().describe("Edge direction to follow. Defaults to 'both'"),
      limit: z.number().optional().default(25),
    },
  },
  async ({ entity_id, relationship_type, direction, limit }: { entity_id: string, relationship_type?: string, direction?: string, limit?: number }) => {
    try {
      const dir = direction || "both";
      const results: Array<Record<string, unknown>> = [];

      // Outgoing edges: entity_id is the source
      if (dir === "outgoing" || dir === "both") {
        let qb = supabase
          .from("entity_edges")
          .select("id, relationship_type, weight, properties, target_entity_id, entities!entity_edges_target_entity_id_fkey(id, name, type)")
          .eq("source_entity_id", entity_id)
          .limit(limit || 25);
        if (relationship_type) qb = qb.eq("relationship_type", relationship_type);
        const { data, error } = await qb;
        if (error) throw new Error(`Outgoing neighbor query failed: ${error.message}`);
        for (const edge of data || []) {
          results.push({
            direction: "outgoing",
            edge_id: edge.id,
            relationship_type: edge.relationship_type,
            weight: edge.weight,
            rationale: (edge.properties as any)?.rationale || null,
            neighbor: edge.entities,
          });
        }
      }

      // Incoming edges: entity_id is the target
      if (dir === "incoming" || dir === "both") {
        let qb = supabase
          .from("entity_edges")
          .select("id, relationship_type, weight, properties, source_entity_id, entities!entity_edges_source_entity_id_fkey(id, name, type)")
          .eq("target_entity_id", entity_id)
          .limit(limit || 25);
        if (relationship_type) qb = qb.eq("relationship_type", relationship_type);
        const { data, error } = await qb;
        if (error) throw new Error(`Incoming neighbor query failed: ${error.message}`);
        for (const edge of data || []) {
          results.push({
            direction: "incoming",
            edge_id: edge.id,
            relationship_type: edge.relationship_type,
            weight: edge.weight,
            rationale: (edge.properties as any)?.rationale || null,
            neighbor: edge.entities,
          });
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ count: results.length, neighbors: results }, null, 2) }],
      };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 20: Traverse Entity Graph
server.registerTool(
  "traverse_entity_graph",
  {
    title: "Traverse Entity Graph",
    description: "Walk the Knowledge Graph from a starting entity up to N hops deep. Returns all reachable entities with their depth, path, and the relationship type traversed at each hop. Uses PostgreSQL recursive CTEs.",
    inputSchema: {
      start_entity_id: z.string().uuid().describe("UUID of the entity to start traversal from"),
      max_depth: z.number().optional().default(3).describe("Maximum number of hops (default: 3)"),
      relationship_type: z.string().optional().describe("Only follow edges of this type. Omit to follow all types."),
    },
  },
  async ({ start_entity_id, max_depth, relationship_type }: { start_entity_id: string, max_depth?: number, relationship_type?: string }) => {
    try {
      const { data, error } = await supabase.rpc("traverse_entity_graph", {
        p_start_entity_id: start_entity_id,
        p_max_depth: max_depth ?? 3,
        p_relationship_type: relationship_type || null,
      });
      if (error) throw new Error(`Graph traversal failed: ${error.message}`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text" as const, text: "No connected entities found from the starting node at this depth." }] };
      }
      const output = data.map((n: any) =>
        `${'  '.repeat(n.depth)}${n.depth > 0 ? `--[${n.via_relationship}]--> ` : ''}${n.entity_name} [${n.entity_type}] (depth=${n.depth}, id=${n.entity_id})`
      ).join("\n");
      return { content: [{ type: "text" as const, text: `Entity Graph Traversal (${data.length} nodes reached):\n\n${output}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 21: Find Entity Path
server.registerTool(
  "find_entity_path",
  {
    title: "Find Entity Path",
    description: "Find the shortest relationship path between two entities in the Knowledge Graph. Follows edges in both directions. Returns each step with the entity name and relationship type traversed.",
    inputSchema: {
      start_entity_id: z.string().uuid().describe("UUID of the starting entity"),
      end_entity_id: z.string().uuid().describe("UUID of the target entity"),
      max_depth: z.number().optional().default(6).describe("Maximum path length to search (default: 6)"),
    },
  },
  async ({ start_entity_id, end_entity_id, max_depth }: { start_entity_id: string, end_entity_id: string, max_depth?: number }) => {
    try {
      const { data, error } = await supabase.rpc("find_entity_path", {
        p_start_entity_id: start_entity_id,
        p_end_entity_id: end_entity_id,
        p_max_depth: max_depth ?? 6,
      });
      if (error) throw new Error(`Pathfinding failed: ${error.message}`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text" as const, text: "No path found between these two entities within the depth limit." }] };
      }
      const output = data.map((step: any) =>
        `Step ${step.step}: ${step.entity_name}${step.via_relationship ? ` (via: ${step.via_relationship})` : " (start)"}`
      ).join(" → ");
      return { content: [{ type: "text" as const, text: `Shortest Entity Path (${data.length} hops):\n${output}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// Tool 22: List Entity Edge Types
server.registerTool(
  "list_entity_edge_types",
  {
    title: "List Entity Edge Types",
    description: "List all distinct relationship types currently in the entity Knowledge Graph with counts. Useful for understanding the graph's relationship vocabulary.",
    inputSchema: {},
  },
  async () => {
    try {
      const { data, error } = await supabase
        .from("entity_edges")
        .select("relationship_type, weight");
      if (error) throw new Error(`Failed to list edge types: ${error.message}`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text" as const, text: "No entity edges found. Send some memories mentioning 2+ related entities to populate the graph." }] };
      }
      const counts: Record<string, { count: number; avgWeight: number; totalWeight: number }> = {};
      for (const row of data) {
        if (!counts[row.relationship_type]) {
          counts[row.relationship_type] = { count: 0, avgWeight: 0, totalWeight: 0 };
        }
        counts[row.relationship_type].count++;
        counts[row.relationship_type].totalWeight += Number(row.weight) || 0;
      }
      const types = Object.entries(counts)
        .map(([type, stats]) => ({
          relationship_type: type,
          count: stats.count,
          avg_confidence: (stats.totalWeight / stats.count).toFixed(2),
        }))
        .sort((a, b) => b.count - a.count);
      const output = types.map(t =>
        `- ${t.relationship_type}: ${t.count} edge${t.count > 1 ? "s" : ""} (avg confidence: ${t.avg_confidence})`
      ).join("\n");
      return { content: [{ type: "text" as const, text: `Entity Relationship Types:\n${output}` }] };
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

