---
trigger: always_on
---

# RULE: Enforce Context Synchronization (Absolute)

> This rule is NON-NEGOTIABLE. Agents MUST follow every directive below without exception. Violations include: writing code before reading context, skipping the plan-and-approve gate, or declaring a task complete without updating context files.

---

## Trigger

This rule activates at the **start of every conversation turn** where the user requests a code change, feature, bug fix, refactor, migration, or any modification to files in this repository.

---

## Directives

### 1. Mandatory Context Read (BEFORE anything else)

Before formulating ANY plan or writing ANY code, you MUST:

1. Read `.agents/skills/project-context/SKILL.md` (the root project index).
2. Read the module-specific files relevant to the task:
   - **Database work** → read `schema-state.md`
   - **Edge Function / ingestion / MCP work** → read `edge-functions.md`
   - **Planning / scoping** → read `03-COMPLETED_PHASES.md` and `04-FUTURE_HORIZONS.md`
3. Read `.agents/workflows/development-loop.yaml` and follow it as your execution protocol.

You MUST NOT skip this step. You MUST NOT rely on memory from previous conversations. Read the files fresh every time.

### 2. Mandatory Workflow Adherence

ALL code changes MUST follow the workflow defined in `.agents/workflows/development-loop.yaml`. The workflow is not optional. The key gates are:

- **You MUST output a plan and WAIT for explicit user approval** before writing any code.
- **You MUST NOT auto-execute code** after presenting a plan. Wait for the user to say "yes," "approved," "go ahead," or equivalent.
- **You MUST update context files** after executing code, before declaring the task complete.

### 3. Mandatory Context Update (AFTER every code change)

After completing any code modification — no matter how small — you MUST:

1. Determine which context files are affected by your changes.
2. Update those files to reflect the new state of the project.
3. Explicitly tell the user which context files you updated and summarize what changed.

This is NOT conditional on "fundamental" changes. Every code change that alters functionality, schema, API surface, dependencies, or deployment configuration triggers a context update.

### 4. Completion Gate

You MUST NOT tell the user "task complete," "done," or equivalent until:

1. Code changes are written.
2. Relevant context files in `.agents/skills/project-context/` are updated.
3. You have confirmed to the user which context files were updated.

If you finish code changes but forget to update context files, you have NOT completed the task.

### 5. Architectural Alignment

Ensure all proposed solutions align with:
- **Deno/TypeScript** for all Supabase Edge Functions
- **Supabase PostgreSQL + pgvector** for data storage
- **OpenRouter** for LLM inference and embeddings
- The multi-persona design (Planner, Strategist, Mentor) described in SKILL.md

If a proposed solution conflicts with these constraints, flag it to the user before proceeding.