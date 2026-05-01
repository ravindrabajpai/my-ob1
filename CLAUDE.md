# Agent Instructions for my-ob1

## 1. Philosophy: Doc/Spec First, Code Later
You must strictly adhere to a documentation-first workflow. Before writing or modifying any code:
1. **MANDATORY READ:** You MUST read `docs/00-PROJECT_CONTEXT.md`.
2. **PROPOSE CHANGES:** Detail the architectural changes, schema updates, or API modifications you intend to make.
3. **SYNC DOCS:** Update the relevant documentation in `docs/` (e.g., schema-state, edge-functions) to reflect the new design *before* writing the actual source code.

## 2. Context Navigation
- **Architecture & Ecosystem:** Read `docs/00-PROJECT_CONTEXT.md`
- **Database / Schema:** Read `docs/01-SCHEMA_STATE.md`
- **Backend / MCP:** Read `docs/02-EDGE_FUNCTIONS.md`
- **Future Goals:** Read `docs/03-ROADMAP.md`
- **Rules:** Read `docs/04-CONTEXT_MANAGEMENT_RULES.md`

Failure to update the documentation alongside code changes is considered a critical error.
