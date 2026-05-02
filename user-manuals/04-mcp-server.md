# 04. MCP Server & AI Integration

The real power of **my-ob1** is using it as an external knowledge source for AI clients (like Claude, Cursor, or Antigravity). The system provides an MCP (Model Context Protocol) server out of the box.

## 🔗 How to Connect

You can connect any MCP-compatible AI client using your deployed Edge Function URL.

**URL Format:**
`https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/open-brain-mcp?key=<YOUR_MCP_ACCESS_KEY>`

You can configure your AI clients to use this URL as an HTTP MCP Server.

## 🛠️ Key Tools for Your AI

Once connected, your AI assistant will have access to powerful tools to query and mutate your Open Brain.

*   **`search_memories`**: Perform semantic vector search over your entire history. This is the primary way for an AI to pull in your context.
*   **`list_tasks`**: View your active to-do list with life-cycle statuses.
*   **`capture_memory`**: Allow your AI assistant to "remember" its findings directly into your brain. If an AI solves a hard problem, you can tell it: "Capture this solution to my Open Brain."
*   **`list_learning_topics`**: Query your progress in the Learning vertical.
*   **`get_recent_synthesis`**: Fetch the latest weekly report including drift detection notes.
*   **`list_memory_edges`**: Explore the Reasoning Graph — see explicit typed relationships (`supports`, `contradicts`, etc.) between memories.
*   **`memory_stats`**: View high-level statistics about the size and composition of your Knowledge Graph.
