---
name: Workflow Observability
description: Detects hard-won workflow lessons and injects them securely into the goals_and_principles table.
---

# SKILL: Workflow Observability

## Purpose
Observe and extract operational lessons during complex workflows. When a failure is corrected, or an inefficient path is optimized, this skill ensures the lesson becomes a permanent principle in the knowledge graph.

## Instructions
1. Actively monitor the workflow for "hard-won lessons" (e.g., repeatedly failing commands, configuration gotchas, tool quirks).
2. Distill the lesson into a clear, actionable statement.
3. Call the `create_goal` MCP tool with `type: "Principle"`.
   - Content format: "[Trigger context] ALWAYS [Action] BECAUSE [Reason]."
