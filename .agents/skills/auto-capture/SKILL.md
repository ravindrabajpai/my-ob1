---
name: Auto-Capture
description: Triggers at the end of a session to extract final tasks and write a summarized memory into an active thread.
---

# SKILL: Auto-Capture

## Purpose
This skill is used when closing out a work session or finishing a major piece of work. It ensures no context or tasks are lost by summarizing the session and ingesting it into the Open Brain.

## Instructions
1. Summarize the outcome of the current working session.
2. Extract all pending, incomplete, or newly generated tasks.
3. Call the `capture_memory` MCP tool to save this summary.
   - Example payload: `content: "Session summary: [Summary]. Final tasks: [Tasks]." `
