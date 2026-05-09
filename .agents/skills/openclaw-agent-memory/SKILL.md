# SKILL: OpenClaw Agent Memory (Governed Provenance)

> **Goal:** Safely integrate autonomous agents (OpenClaw, Codex, etc.) into the `my-ob1` Knowledge Graph without polluting core data.

## Overview
This skill outlines how agents can read and write operational memory to the `my-ob1` backend via the native `open-brain-mcp` tools. It replaces the OB1 HTTP REST integration with a direct MCP interface.

## MCP Tools Provided

The `open-brain-mcp` edge function exposes two governed tools for agents:

### 1. `agent_memory_recall`
Use this tool **before** starting a complex task to pull operational memory (decisions, constraints, lessons, prior attempts).
- Respects project boundaries.
- Returns a `use_policy` dictating whether a memory can be used as an instruction or just evidence.

### 2. `agent_memory_writeback`
Use this tool **after** completing a task to compact your operational scratchpad.
- **Do not write:** raw transcripts, secrets, large code blocks, or full workspace dumps.
- **Do write:** decisions made, outputs, lessons learned, constraints encountered, unresolved questions, next steps, and failures.
- All memories submitted by agents start in a `pending` state and require human review in the dashboard before they graduate to standard instructions.

## The Review Process
All agent-generated memories land in the `agent_memories` table with `review_status = 'pending'`. The human operator uses the **Agent Memory Review** dashboard vertical to:
1. Confirm the memory (promotes it to `confirmed` status, allowing future instruction use).
2. Mark as Evidence Only (useful for logs, but not directives).
3. Reject or Merge duplicates.

## Best Practices for Agents
1. **Be concise:** The `writeback` payload should contain bullet-point level density.
2. **Provide Idempotency Keys:** If a task retries, supply an `idempotency_key` (e.g. `workspace:task_id:hash`) to prevent double-logging.
3. **Trace IDs:** Always provide `task_id` and `runtime_name` (e.g., `openclaw`) for auditing purposes.
