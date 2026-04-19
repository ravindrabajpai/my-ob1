---
slug: extending-the-brain
title: Extending with Wisdom Verticals
stage: Advanced
difficulty: Intermediate
order: 3
estimatedMinutes: 30
summary: Learn how to add a new domain to the knowledge graph using the Wisdom Vertical registry pattern.
goals:
  - Describe the WisdomVertical interface and how process() is called during ingestion.
  - Identify the five steps required to add a new vertical.
  - Explain why the LLM system prompt must be updated when adding a vertical.
relatedResearch:
  - wisdom-verticals
  - architecture-overview
quiz:
  title: Vertical extension check
  passingScore: 70
  questions:
    - prompt: Where does the process() method of a Wisdom Vertical get called?
      options:
        - During ingest-thought synchronously, before the 200 OK is returned
        - During process-memory, after entity and thread population
        - During the automated-synthesis weekly cron job
        - During the open-brain-mcp capture_memory tool
      correctOption: During process-memory, after entity and thread population
      explanation: Verticals are processed in the final graph population step of process-memory, after tasks, entities, and threads have been populated from the LLM metadata.
    - prompt: Why must extractMetadata be updated when adding a new vertical?
      options:
        - So the LLM knows to include the vertical's domain in the JSON output under wisdom_extensions
        - Because brain-engine.ts reads vertical configs at startup and caches system prompts
        - To prevent the LLM from hallucinating new entity types for the new domain
        - Because MCP tools require matching LLM output schemas to work correctly
      correctOption: So the LLM knows to include the vertical's domain in the JSON output under wisdom_extensions
      explanation: The LLM only populates wisdom_extensions fields it knows about from its system prompt. If it does not see the vertical's domain in the prompt, it ignores it silently.
    - prompt: What is the correct name for the shared interface all verticals must implement?
      options:
        - DomainPlugin
        - WisdomExtension
        - WisdomVertical
        - BrainModule
      correctOption: WisdomVertical
      explanation: The interface is WisdomVertical, defined in _shared/verticals/. Each vertical registers itself and implements a process(supabase, memoryId, extensions) method.
---

## The vertical architecture

Wisdom Verticals let you add domain-specific tables and logic without touching the core ingestion pipeline. The `process-memory` function iterates all registered verticals and calls `process()` on each one, passing the memory ID and the relevant slice of the LLM extraction result.

## The WisdomVertical interface

```typescript
interface WisdomVertical {
  domain: string  // matches the key in wisdom_extensions JSON
  process(
    supabase: SupabaseClient,
    memoryId: string,
    extensions: Record<string, unknown>
  ): Promise<void>
}
```

The `learning` vertical is the reference implementation. It reads `extensions.learning.topics`, upserts rows into `learning_topics`, creates `memory_learning_topics` join rows, and logs `learning_milestones` for any milestone text.

## The five-step process to add a vertical

1. **Migration** — add the domain tables with proper FKs, indices, and RLS
2. **Implement the class** — create `_shared/verticals/[domain].ts` implementing `WisdomVertical`
3. **Register it** — add it to the vertical registry array in `_shared/verticals/index.ts`
4. **Update the system prompt** — add the new domain and its expected structure to the `extractMetadata` prompt block in `brain-engine.ts`
5. **Add interfaces** — MCP tools for reading/writing, and optionally a Slack prefix for direct routing

## Key design principle

Verticals own their tables. They do not write to `memories` or `tasks`. The boundary is: vertical tables + join tables linking back to `memory_id`. This keeps the core graph clean and verticals independently evolvable.
