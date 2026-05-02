# 📖 Open Brain (my-ob1) | User Manuals Index

Welcome to your **Open Brain**, a cognitive data layer that captures your raw thoughts, extracts structured knowledge (tasks, entities, threads), and evaluates them against your strategic goals.

This directory contains comprehensive user documentation to help you get the most out of your my-ob1 installation.

## Table of Contents

1. [Getting Started](./01-getting-started.md) - Learn about the core personas and how to connect your AI assistants.
2. [Capturing Thoughts](./02-capturing-thoughts.md) - How to use the Slack Capture Channel, multi-modal features, and adaptive capture.
3. [Interactive Commands](./03-interactive-commands.md) - Prefix routing for task lifecycles, goals, principles, and taste preferences.
4. [MCP Server & AI Integration](./04-mcp-server.md) - How to connect clients via MCP and use the available tools.
5. [Dashboards & Verticals](./05-dashboards-and-verticals.md) - The Repo Learning Coach dashboard and Wisdom Verticals (Learning, Infographics). Also covers standard UI Dashboards (e.g. `open-brain-dashboard-next`) connecting via the `open-brain-dashboard-api` REST gateway.
6. [Advanced Features](./06-advanced-features.md) - Automated Synthesis, Obsidian Wiki Compiler, Thread Summarization (consolidating long threads into wiki dossiers), the Reasoning Graph (Typed Edges), and the **Entity Knowledge Graph** (entity relationship traversal).
7. [Troubleshooting & Security](./07-troubleshooting.md) - Security layers, operations, and troubleshooting automated tasks.
8. [Developer Guide: Adding Wisdom Verticals](./08-adding-wisdom-verticals.md) - SOP for extending the graph.
9. [Sensitivity Scanning](./09-sensitivity-scanning.md) - Automatic PII detection, privacy tiers, and retroactive backfilling.
10. [Data Portability & Backups](./10-data-backups.md) - Use the Local Brain Backup CLI (`.agents/skills/brain-backup/backup.ts`) to export your entire Knowledge Graph to version-controlled JSON files.

---

*Open Brain acts as three things at once:*
- **📦 The Planner** — Watches for action items and extracts tasks with inferred deadlines.
- **🧩 The Strategist** — Maps out a Knowledge Graph of people, projects, and concepts from your context.
- **🧭 The Mentor** — Evaluates every thought against your stored goals/preferences and surfaces strategic insights.
