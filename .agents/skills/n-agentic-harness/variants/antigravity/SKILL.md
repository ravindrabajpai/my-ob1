---
name: n-agentic-harnesses-antigravity
description: "Design, evaluate, and improve agentic harnesses for the Antigravity/Gemini environment. Use this skill when the user mentions building an agentic system, structuring tool use, adding permissions or approval gates, designing multi-step AI workflows, managing context windows, making agents durable, or evaluating a harness. Trigger when symptoms imply harness gaps: unexpected tool execution without approval, context drift, silent crashes in background workflows. Tailored for Antigravity's filesystem execution loop and Open Brain schema."
author: Jonathan Edwards, adapted for Antigravity
version: 1.0.0
---

# N Agentic Harnesses For Antigravity

Use this skill as a router for designing, building, and evaluating agentic harnesses specifically within the Antigravity ecosystem and the Open Brain (my-ob1) architecture.

Read only the files you need from the `references/` directory. Do not load the entire reference set unless the request genuinely spans multiple subsystems.

Default posture:

- Bias toward lean, solo-maintainable architecture using Supabase Edge Functions.
- Base evaluations on concrete facts. Read the user's workflow rules and database schemas.
- Tie "durability" to actual database states and edge function retries, not just chat history.
- Treat approval gates as explicit, terminal-halting steps.
- Require all evaluations and phased rollout plans to be written as markdown artifacts, not pasted in chat.

## Step 0: Gather Context

Before routing, actively investigate the environment. Do not assume context is provided.

For **design** or **evaluation** requests, use your filesystem tools (`list_dir`, `grep_search`, `view_file`) to check:

1. **Project Rules:** Read `.agents/skills/project-context/SKILL.md` and `.agents/rules/01-context-management.md`.
2. **Current State:** Check `schema-state.md` and `edge-functions.md` if evaluating workflow logic or permissions.
3. **Workflows:** Check `.agents/workflows/development-loop.yaml` to understand how the user enforces approval gates.

If the request is vague, ask clarifying questions before proceeding, but always anchor your answers in the files you discovered.

## Step 1: Classify The Request

Choose one mode before reading reference files.

### `design`

Use when the user is creating a new harness, planning a major rebuild, or asking for architecture pipelines via Supabase Edge functions.

Default reads:

- `references/01-principles-and-solo-dev-defaults.md`
- `references/02-harness-shapes-and-architecture.md`
- `references/08-design-and-build-playbook.md`

### `evaluation`

Use when the user wants to audit gaps in their current workflow state, permissions, or context window management.

Default reads:

- `references/01-principles-and-solo-dev-defaults.md`
- `references/09-evaluation-and-improvement-playbook.md`

### `design + evaluation`

Use when defining acceptance criteria before building a new feature.

## Step 2: Classify The Product Shape

Determine the closest product shape before going deeper:

- **Code Agent:** (e.g., Antigravity itself operating on files)
- **Workflow Orchestrator:** (e.g., Open Brain Edge Functions scheduling jobs)
- **Hybrid System:** (e.g., A chat UI triggering durable background tasks)

## Step 3: Read The Smallest Useful Reference Set

Read these only when the request needs them:

- `references/01-principles-and-solo-dev-defaults.md`
  Use first. Defines the lean solo-dev posture.
- `references/02-harness-shapes-and-architecture.md`
  Read when defining background workers vs APIs.
- `references/03-tools-execution-and-permissions.md`
  Read when validating MCP endpoints or edge function schemas.
- `references/04-state-sessions-and-durability.md`
  Read when the system involves retries or idempotency keys in Supabase.
- `references/05-context-memory-and-evaluation.md`
  Read when handling embeddings or avoiding prompt drift.
- `references/06-agents-and-extensibility.md`
  Read when dealing with multi-personas (Planner, Strategist, Mentor).
- `references/07-ux-observability-and-operations.md`
  Read when the user needs logging or error bubbling.
- `references/08-design-and-build-playbook.md`
  Read when formatting an implementation plan.
- `references/09-evaluation-and-improvement-playbook.md`
  Read to format audit findings.
- `references/10-example-requests-and-output-patterns.md`

*(Note: There is no Codex translation note here, as the Antigravity variant is natively supported.)*

## Output Contract

**CRITICAL RULE:** All major plans, subsystem definitions, or evaluations MUST be written via the `write_to_file` tool to the `.gemini/.../artifacts/` directory as markdown files (`IsArtifact: true`). Do not output large architecture blocks in the chat dialogue.

### For `design`

Return as an Artifact:
- recommended harness shape
- phased implementation plan tied to Supabase tools
- verification criteria

### For `evaluation`

Return as an Artifact:
- findings ordered by severity
- user experience and operational gaps based on their `.md` schemas
- prioritized upgrade path

## Final Check Before Responding

- Did you investigate their `.agents/` context files first?
- Did you write the final response to an artifact?
- Did you recommend lean, single-agent logic before resorting to multi-agent claims?
