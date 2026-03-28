---
trigger: always_on
---

# RULE: Enforce Context Synchronization

**Trigger:** Activate this rule at the beginning of any new chat session, task assignment, or when the user requests a code change within the repository.

**Directives:**
1. **Mandatory Read:** Before formulating a plan or writing code, you MUST silently read the contents of `.agents/skills/project-context/SKILL.md` and any relevant sub-files (e.g., `schema-state.md` if the task involves database work).
2. **Alignment Check:** Ensure the proposed solution aligns with the established Python/Supabase backend architecture and the multi-modal design goals of the system.
3. **State Mutation:** If a task completion fundamentally changes the project architecture, adds a new database table, or completes a milestone defined in `roadmap.md`, you MUST prompt the user: *"Task complete. Shall I update the project context files to reflect these structural changes?"*
4. **Context Write:** Upon user approval, utilize local file writing tools to update the relevant markdown files in `.agents/skills/project-context/` to permanently record the new project state.