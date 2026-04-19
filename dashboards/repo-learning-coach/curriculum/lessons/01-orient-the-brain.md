---
slug: orient-the-brain
title: Orient the Open Brain Architecture
stage: Foundations
difficulty: Intro
order: 1
estimatedMinutes: 20
summary: Understand what my-ob1 is, what it is not, and the three-layer architecture that makes it useful.
goals:
  - Name the three AI personas and what each one does.
  - Describe the ingestion pipeline from Slack message to Supabase graph.
  - Explain why the MCP server is implemented as an Edge Function instead of a local Node server.
relatedResearch:
  - architecture-overview
quiz:
  title: Check your architecture understanding
  passingScore: 70
  questions:
    - prompt: What is the Strategist persona responsible for?
      options:
        - Sending daily Slack briefings with pending tasks
        - Building a Knowledge Graph of people, projects, and concepts
        - Evaluating thoughts against WANT/REJECT guardrails
        - Scheduling pg_cron jobs for synthesis
      correctOption: Building a Knowledge Graph of people, projects, and concepts
      explanation: The Strategist populates entities and threads, building the relational Knowledge Graph during process-memory.
    - prompt: Why does ingest-thought return a 200 OK before the LLM runs?
      options:
        - To satisfy Slack's 3-second webhook timeout
        - Because the LLM is too expensive to call synchronously
        - To allow the database to batch process multiple thoughts at once
        - Because edge functions cannot call external APIs synchronously
      correctOption: To satisfy Slack's 3-second webhook timeout
      explanation: Slack requires a response within 3 seconds or it retries. The fast sync insert unblocks Slack; process-memory runs asynchronously via pg_net.
    - prompt: Where does the MCP server live?
      options:
        - A local Node.js process running alongside Supabase
        - A Python FastAPI service deployed on Fly.io
        - A Supabase Edge Function (open-brain-mcp) using Hono + StreamableHTTPTransport
        - A Cloudflare Worker with KV storage
      correctOption: A Supabase Edge Function (open-brain-mcp) using Hono + StreamableHTTPTransport
      explanation: The mcp-server/ directory in the repo is unused. The MCP server is entirely the open-brain-mcp Edge Function running on Supabase's Deno runtime.
---

## What my-ob1 is

my-ob1 is a cognitive data layer — a system that captures raw thoughts, extracts structure from them, and makes them retrievable through semantic search and a relational knowledge graph.

It is not a chat interface, not a note-taking app, and not a search engine. It is a backend that makes your existing thoughts smarter over time.

## The ingestion pipeline

Everything starts with a Slack message. `ingest-thought` receives it, verifies the HMAC-SHA256 signature, checks for deduplication via SHA-256 hash, and inserts the raw memory to the database. It returns 200 immediately so Slack does not retry.

A `pg_net` database webhook then fires `process-memory` asynchronously. That function runs the embeddings and LLM extraction in parallel, then populates the full graph.

## The three personas

During `process-memory`, three things happen in sequence:

1. **The Planner** inserts extracted tasks with inferred deadlines
2. **The Strategist** upserts entities and threads, linking them to the memory
3. **The Mentor** fetches active taste preferences and evaluates the memory against each WANT and REJECT axis, then inserts a `system_insights` row if strategically relevant

## Why an Edge Function for MCP

Edge Functions run on Deno, deploy globally, and have zero cold-start overhead for Supabase's internal network to the database. The MCP server needs high availability and low latency — exactly what an Edge Function provides without separate infrastructure.
