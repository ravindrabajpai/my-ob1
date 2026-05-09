# Analyze Community OB1 Updates

**Usage:** Send this prompt to the agent (using **Gemini 3.1 Pro (High)**) whenever you want it to fetch and analyze the latest updates from the community OB1 repository.

---

## Prompt to send to the Agent:

Please act as my Lead Architect and perform the following workflow to update and analyze the community OB1 repository:

1. **Fetch Latest Changes:**
   - Use your `run_command` tool to execute `git pull` inside the `~/work/agi/open-brain-combined/OB1` directory. 
   - Review the console output to see which files were added or modified.

2. **Analyze the Changes:**
   - Use your `view_file` tool to inspect the contents of the most important newly added or modified files (especially documentation, SQL schemas, and READMEs) in the community `OB1` repository to fully understand the new features.

2. **Contextualize with my-ob1:** 
   - Use your tools to read `~/work/agi/open-brain-combined/my-ob1/docs/00-PROJECT_CONTEXT.md` to re-familiarize yourself with the current architecture and completed phases of my customized `my-ob1` project.

3. **Propose an Integration Roadmap:** 
   - Determine how these new community features can be adapted, ported, or leveraged to improve `my-ob1`. 
   - Generate a structured markdown artifact (e.g., `ob1_update_analysis.md`) detailing your analysis and providing a step-by-step roadmap for integration (assigning it the next logical Phase number). Wait for my feedback on this artifact.

4. **Update Future Horizons:** 
   - Once I approve the roadmap, use your tools to automatically update `~/work/agi/open-brain-combined/my-ob1/docs/04-FUTURE_HORIZONS.md`. 
   - Insert the approved feature as a new **Priority** phase directly above the "Deferred / Icebox" section, complete with its goal and key implementation steps.
