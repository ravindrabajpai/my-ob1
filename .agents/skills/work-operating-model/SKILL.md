---
name: "Work Operating Model"
description: |
  Elicits and structures a durable personal operating model via a five-layer
  interview. Backs the Bring-Your-Own-Context (BYOC) workflow. Outputs five
  portable context artifacts: operating-model.json, USER.md, SOUL.md,
  HEARTBEAT.md, and schedule-recommendations.json.
---

# SKILL: Work Operating Model

## Purpose

The Work Operating Model skill structures a conversation-first interview that
captures how you actually work — rhythms, decisions, dependencies, institutional
knowledge, and friction — into five canonical layers stored in Open Brain.

Once all five layers are approved the system exports a portable context bundle
that any AI client can load to get an immediate, accurate picture of how you
operate.

---

## Required MCP Tools

This skill requires the `work-operating-model-mcp` Edge Function to be deployed
and connected to your AI client. The five endpoints it exposes are:

| Endpoint | Description |
|----------|-------------|
| `POST /start-session` | Creates or resumes a profile + session |
| `POST /save-layer` | Saves one approved layer checkpoint |
| `POST /query` | Fetches active entries for a layer |
| `POST /generate-exports` | Generates all five portable artifacts |
| `POST /get-export` | Retrieves a single artifact by name |

Connect the function at:
```
https://<PROJECT_REF>.supabase.co/functions/v1/work-operating-model-mcp?key=<MCP_ACCESS_KEY>
```

---

## The Five Layers

Interview the user through these layers **in order**. Do not skip ahead.
Before saving each layer, show a checkpoint summary and wait for explicit
approval.

| # | Layer | What to elicit |
|---|-------|----------------|
| 1 | `operating_rhythms` | Recurring rituals, standups, review cycles, planning cadences |
| 2 | `recurring_decisions` | Choices you make repeatedly — prioritisation, delegation, trade-offs |
| 3 | `dependencies` | People, systems, and information you rely on to do your best work |
| 4 | `institutional_knowledge` | Context that isn't written down but is critical — constraints, history, team norms |
| 5 | `friction` | Recurring blockers, energy drains, and systemic pain points |

---

## Interview Protocol

### Starting the interview
1. Call `POST /start-session` to create or resume a session.
2. Note `session_id`, `completed_layers`, and `pending_layer` from the response.
3. If layers are already completed, show a summary and resume from `pending_layer`.

### For each layer
1. Tell the user which layer you are on and why it matters.
2. Search Open Brain (`search_memories` if available) for contextual hints.
3. Ask 3–5 targeted questions relevant to the layer.
4. Synthesise responses into structured entries:
   ```json
   [
     {
       "title": "Short descriptive name",
       "summary": "1–2 sentence description",
       "cadence": "daily | weekly | etc. (optional)",
       "trigger": "what causes this to happen (optional)",
       "inputs": ["people or systems involved"],
       "stakeholders": ["who is affected"],
       "constraints": ["boundaries or rules"],
       "source_confidence": "confirmed"
     }
   ]
   ```
5. Show the user a checkpoint summary: list all entries, totals, and ask:
   > "Does this accurately capture your [layer]? Say **yes** to save and move on,
   > or tell me what to change."
6. Only call `POST /save-layer` after explicit approval.

### Contradictions
Before generating exports, call `POST /query` for each layer and scan for
contradictions (e.g. a dependency on a person listed as a friction source).
Surface these to the user before finalising.

### Generating exports
Once all five layers are approved, call `POST /generate-exports` with the
`session_id`. The function will return the five artifact names. Use
`POST /get-export` to retrieve individual artifacts if the user needs them.

---

## Context Import (BYOC — Extraction Phase)

Before running the interview you can seed Open Brain with raw context using
one of two prompts:

### Prompt 1: Memory Extraction
Use when the AI client already has memory about the user (e.g. ChatGPT memory,
Claude Projects).

```text
<role>
You are a portable-context extraction assistant. Extract everything you already
know about the user from memory and conversation history, organise it into
clean knowledge chunks, and save each approved chunk to Open Brain via
capture_memory.
</role>

<context-gathering>
1. Check that capture_memory is available. If not, stop.
2. Pull up everything from memory: people, projects, tool preferences,
   workflow habits, repeated decisions, business/personal context.
3. Organise into categories: People, Projects, Preferences, Decisions,
   Recurring topics, Professional context, Personal context.
4. Present results before saving. State how many items per category.
5. Wait for the user to approve, edit, or skip items.
</context-gathering>

<execution>
Save each approved item as a clear standalone statement:
Good: "Sarah Chen is my direct report, joined March 2026, focuses on backend."
Bad: "Sarah - DR - backend"
Save in small batches. Confirm each batch before moving to the next category.
</execution>

<guardrails>
- Never invent context.
- Flag stale information before saving.
- Do not generate USER.md or SOUL.md in this step — extraction only.
</guardrails>
```

### Prompt 2: Context Import
Use when migrating notes, exports, or another second-brain system.

```text
<role>
You are a portable-context import assistant. Help the user migrate notes and
exports into Open Brain as clean, standalone statements.
</role>

<context-gathering>
1. Confirm capture_memory is available.
2. Ask what source is being imported and what it contains.
3. Ask the user to paste a manageable batch.
4. Split long notes into logical chunks before saving.
5. Show a preview batch before saving. Wait for approval.
</context-gathering>

<execution>
For each approved chunk:
- Transform to a standalone statement preserving names, dates, and context.
- Remove formatting artifacts from the source.
- Save with capture_memory.
After each batch, report items saved and items remaining.
</execution>

<guardrails>
- Never invent context not present in the source.
- Warn before processing very large imports.
- Do not generate final profile artifacts in this step.
</guardrails>
```

---

## Portable Bundle Contract

The five exported artifacts form the portable context bundle:

| Artifact | Purpose |
|----------|---------|
| `operating-model.json` | Machine-readable full profile |
| `USER.md` | Human-readable operator profile |
| `SOUL.md` | Guardrails, heuristics, and institutional knowledge |
| `HEARTBEAT.md` | Recurring check recommendations |
| `schedule-recommendations.json` | Machine-readable rhythm/schedule output |

Feed `USER.md`, `SOUL.md`, and `HEARTBEAT.md` into any agent workflow that
accepts durable system context or operating files.

---

## Re-running the Interview

Re-run after a major role change, team restructuring, or whenever the exported
bundle feels stale. Each run creates a new session and increments `profile_version`.
