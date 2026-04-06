# Open Brain (my-ob1): N-Agentic Harness Evaluation

This evaluation was conducted under the principles of the `n-agentic-harness` skill in **evaluation mode**. It assesses the existing Open Brain architecture against solo-dev harness defaults, identifying risks in boundaries, safety, state, context handling, and observability.

---

## 1. Findings (Ordered by Severity & Leverage)

### 🚨 Finding 1: Unbounded Sandbox / Missing Mutation Approval Gates (High Severity)
- **What is weak:** The `open-brain-mcp` exposes powerful mutation tools (`merge_entities`, `archive_goal`, `complete_task`, `create_goal`) directly to the AI client.
- **Why it matters:** Once authenticated with `MCP_ACCESS_KEY`, a rogue or confused AI agent can silently scramble your Knowledge Graph (e.g., merging the wrong entities) or silently delete operational constraints (`archive_goal`).
- **Impact:** Permanent data loss or corruption without an audit trail or human intervention holding the final approval.
- **Recommended fix:** Introduce an explicit approval state for structural mutations, or restrict mutations to the Slack ingestion pipeline where human intention is strictly defined by prefixes (e.g., `goal:`). Alternatively, introduce an "Approval Queue" so the agent proposes graph mutations and the human approves them in Slack.

### 🚨 Finding 2: Missing Evals for the Core Intelligence Pipeline (High Leverage)
- **What is missing:** There is no documented evaluation loop to catch regressions when updating prompts or LLM versions (e.g., `openai/gpt-4o-mini`).
- **Why it matters:** The system's entire accuracy rests on `extractMetadata()` safely returning expected structured JSON and avoiding hallucinations. "We'll test it manually later" is an operational risk.
- **Impact:** You might find out two weeks later that your agent has been miscategorizing "Concepts" as "People" or completely missing action item deadlines.
- **Recommended fix:** Build a regression suite. Maintain a small golden dataset of 10-20 Slack messages and their expected JSON extractions to run automatically on any code or model change.

### 🟡 Finding 3: Invisible Failures & Retries on Async Graph Hydration (Medium Severity)
- **What is weak:** `process-memory` runs asynchronously asynchronously via `pg_net` webhooks to populate entities, tasks, and threads.
- **Why it matters:** If the webhook silently drops the payload, if the LLM rate-limits the worker, or if there is a crash mid-processing, there is no explicit "failed/retry" state tracked. The `embedding` stays `null`.
- **Impact:** Data silently drops, and the user assumes the Slack ingestion was successfully parsed into the graph because the edge function replied 200 OK initially.
- **Recommended fix:** Track workflow state explicitly. Add an `processing_status` column (`pending`, `completed`, `failed`) to `memories`, instead of using `embedding = null` as a proxy state. Build a dead-letter queue / retry mechanism.

### 🟡 Finding 4: Blurry Boundary Between System Orchestrator and Read/Write Roles (Medium Leverage)
- **What is weak:** The MCP Server (`open-brain-mcp`) clumps 14 radically different tools into a single context window.
- **Why it matters:** Providing broad state access (reading `search_memories`) alongside heavy mutation capabilities (`archive_goal`, `update_task_deadline`) in the same orchestrator session confuses LLMs and eats context budget. 
- **Impact:** Agents hallucinate tool usage, causing them to try graph mutations when they should just be retrieving conversational context.
- **Recommended fix:** Partition MCP tools based on roles. A "Reader/Researcher" role that only has `search` and `list` scopes, and an explicit "Mutator" role.

---

## 2. Missing or Weak Primitives

- **Permission Policy Layer:** `open-brain-mcp` lacks granular capability boundaries enforcing what each connecting client can do.
- **Explicit Workflow State:** The current architecture relies on Supabase database hooks to string processes together asynchronously. Idempotency and failure states inside `process-memory` need formal definition.
- **Context Provenance & Expiry:** There isn't clearly defined expiry or deprecation on long-standing operational beliefs or goals in `goals_and_principles`.

---

## 3. User Experience and Operational Gaps

- **Silent Processing Failures:** If `ingest-thought` accepts a Slack message but `process-memory` crashes, the operator is not notified. Operators need a Slack alert or a human-readable dashboard showing dropped processes.
- **Cost Visibility:** The system lacks tracking over how much context budget / OpenAI cost is burned per memory ingestion or synthesis generation.

---

## 4. Prioritized Upgrade Path

Do not perform a full-rewrite. Most corrections can be done in subsystem boundaries:

1. **Gate Risky Operations (Safety First):** Apply permissions to the `open-brain-mcp` server. Move `merge_entities` and `archive_goal` into an administrative / "approval required" queue rather than immediate execution via AI endpoints.
2. **Make State and Resumability Explicit:** Add `processing_status` to the `memories` table to explicitly track async hydration successes and failures. Alert Slack on `failed` states.
3. **Build the Evals Baseline:** Create a basic, version-controlled unit test using 15 golden-path Slack records to verify `extractMetadata()` stability.
4. **Partition the MCP Surface:** Clean up context bloat by segmenting list/read tools from heavy graph-altering capabilities. 

---

## 5. Acceptance Checks After Changes

When these optimizations are built, the changes should pass these verification checks:
- [ ] A rogue prompt attempting to silently `archive_goal` from a random AI chat client fails or gets queued for human approval.
- [ ] A simulated failure inside `process-memory` (e.g. failing OpenRouter key) leaves the thought in a clearly visible `failed` state rather than silently disappearing.
- [ ] Changing the `extractMetadata` prompt can be run through a test script that confirms the accuracy format of previously known Slack messages.
- [ ] Operators can look at a dashboard or DB table and explicitly locate failed injections or async errors.
