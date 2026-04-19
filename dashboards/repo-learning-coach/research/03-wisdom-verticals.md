---
slug: wisdom-verticals
title: Wisdom Verticals Extension Model
summary: How to extend the my-ob1 knowledge graph with domain-specific tables using the registry-based Wisdom Vertical architecture.
category: extensibility
---

# Wisdom Verticals

## What is a Wisdom Vertical?

A Wisdom Vertical is a modular extension to the knowledge graph. It adds domain-specific tables and `process()` logic that runs during memory ingestion, without modifying the core ingestion pipeline.

The first vertical is the `learning` domain — it adds `learning_topics`, `memory_learning_topics`, and `learning_milestones`.

## The registry architecture

Verticals live in `supabase/functions/_shared/verticals/`. Each vertical implements a `WisdomVertical` interface:

```typescript
interface WisdomVertical {
  domain: string
  process(supabase, memoryId, extensions): Promise<void>
}
```

The `process-memory` function iterates registered verticals and delegates the `wisdom_extensions` payload from the LLM extraction result.

## How the LLM knows about verticals

The `extractMetadata` prompt in `brain-engine.ts` is dynamically updated when a vertical is registered. The system prompt instructs the LLM to populate `wisdom_extensions.learning.topics` with topic names and mastery statuses.

## Adding a new vertical

See `how-to-add-wisdom-vertical.md` in `.agents/skills/project-context/` for the SOP. The process:

1. Create a migration for the new tables
2. Implement the vertical class in `_shared/verticals/`
3. Register it in the vertical registry
4. Update the `extractMetadata` prompt block
5. Add MCP tools for human/AI access
6. Add a Slack prefix if needed (like `done:` for learning)
