---
name: Research Synthesis
description: Adds rigorous constraints to semantic memory queries for multi-document synthesis.
---

# SKILL: Research Synthesis

## Purpose
When querying the `search_memories` MCP tool across multiple documents or complex topics, this skill forces strict analytical rigor to prevent hallucinations and assure high-quality synthesis.

## Instructions
1. Explicitly state what information is MISSING or represents a GAP after running your queries.
2. Mark confidence levels (Low/Medium/High) on all synthesized conclusions before presenting them.
3. Preserve contradictions natively (i.e. if Document A says X and Document B says Y, state the conflict clearly, do not artificially merge them).
