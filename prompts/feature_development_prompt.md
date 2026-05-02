# Next Feature Development Prompt

**Context & Objective**
I want to implement the next feature from `docs/04-FUTURE_HORIZONS.md`: **"[INSERT FEATURE NUMBER AND NAME, e.g., 3. Enhanced Knowledge Graph (Explicit Entity Relationships)]"**. 

Please act as a Senior AI Architect working on the `.` project. Before writing any code, you must search the `open-brain-combined/OB1` community repository to understand how this feature was originally built as a local recipe. Then, adapt that logic to fit the cloud-centric `.` architecture (Supabase PostgreSQL, Edge Functions, pg_cron).

note: current directory is my-ob1.

**Follow this exact step-by-step workflow:**

### Step 1: Research & Plan (Draft Artifact First)
1. Read `./docs/00-PROJECT_CONTEXT.md` to ground yourself in the current architecture.
2. Search the `open-brain-combined/OB1/recipes/` directory for the matching community implementation.
3. Draft a comprehensive **Implementation Plan** as an artifact file. The plan MUST bridge the gap between the local OB1 script and the `.` Edge Function environment. 
4. **Pause and wait for my approval** on the artifact before proceeding to code generation.

### Step 2: Database Migrations
Once approved, scaffold the Supabase SQL migration (`020_[feature_name].sql`):
- Ensure RLS (Row-Level Security) is enabled on all new tables.
- Use modern Postgres functions (e.g., use `gen_random_uuid()` instead of `uuid_generate_v4()`).
- If background processing is needed, configure the appropriate `pg_cron` schedule or `pg_net` webhook.

### Step 3: Edge Functions & Shared Engine
- Scaffold the required Edge Function in `supabase/functions/[feature_name]/index.ts` along with its `deno.json`.
- If new LLM logic is needed, update the shared module `supabase/functions/_shared/brain-engine.ts`.
- Ensure endpoints bypass JWT verification (`--no-verify-jwt`) and rely on `SUPABASE_SERVICE_ROLE_KEY` or `MCP_ACCESS_KEY` for authentication.

### Step 4: Documentation & Parity Updates
Update all canonical documentation to reflect the new state:
- **`docs/01-SCHEMA_STATE.md`**: Document new tables, columns, and RPCs. Update the ER diagram.
- **`docs/02-EDGE_FUNCTIONS.md`**: Register the new Edge Function and update the shared AI module functions.
- **`docs/03-COMPLETED_PHASES.md`**: Move the feature from `04-FUTURE_HORIZONS.md` to here.
- **`user-manuals/README.md`**: Add a new section detailing how the user interacts with this feature.
- If applicable, create a `.agents/skills/[feature_name]/SKILL.md` to document local script execution.

### Step 5: Deployment & Testing Instructions
After scaffolding, provide a concise summary outlining:
1. The exact CLI commands to deploy the database changes (e.g., `npx supabase db push --workdir .`).
2. The exact CLI commands to deploy the Edge Function (e.g., `npx supabase functions deploy [feature] --no-verify-jwt --workdir .`).
3. 2-3 explicit test cases (e.g., `curl` commands with the required headers to trigger the function manually, or SQL checks to verify background jobs).
