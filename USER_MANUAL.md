# 📖 Open Brain (my-ob1) | User Manual

Welcome to your **Open Brain**, a cognitive data layer that captures your raw thoughts, extracts structured knowledge (tasks, entities, threads), and evaluates them against your strategic goals.

---

## 1. The Core Personas
When you interact with **my-ob1**, it acts as three roles simultaneously:

*   **📦 The Planner** — Watches for action items and extracts tasks with inferred deadlines.
*   **🧩 The Strategist** — Maps out a Knowledge Graph of people, projects, and concepts from your context.
*   **🧭 The Mentor** — Evaluates every thought against your stored goals/preferences and surfaces strategic insights.

---

## 2. Capturing Your Thoughts
Capture happens naturally via your dedicated **Slack Capture Channel**.

### 💡 Just Type Naturally
Simply type your thoughts, observations, or meeting notes.
> *"Great meeting with Manish. We need to start the 'poc' for the new AI project by Friday."*

**The bot will reply in-thread with:**
*   **🎯 Tasks:** (Extracted "finalize building AI roadmap")
*   **🔗 Entities:** (Linked "Manish", "AI project")
*   **🧠 Insight:** (Strategic evaluation against your active goals)
*   **🧭 Alignment:** ("This relates to project management goals")

### 📎 Multi-modal (Images & Files)
Upload an image of a whiteboard, a screenshot of code, or a PDF.
*   The system performs OCR to extract text.
*   The text is analyzed, embedded for vector search, and summarized in your Slack reply.

### 🛑 Smart Deduplication
If you send the exact same text twice, the system will **ignore** the second attempt. This protects your Knowledge Graph from accidental double-triggers and Slack delivery retries.

---

## 3. Interactive Slack Commmands (Prefix Routing)
You can directly command the brain by using specific prefixes:

### ✅ Task Management
To complete a task directly from Slack:
> **`done: <task description snippet>`**
> *Example:* `done: AI roadmap`
*   *Effect:* Searches for a pending "AI roadmap" task and marks it as **completed**.

### 🎯 Setting Goals & Principles
To establish your strategic foundation:
> **`goal: <high-level target>`**
> *Example:* `goal: Ship the Open Brain v2 architecture by end of April`
>
> **`principle: <operating rule>`**
> *Example:* `principle: Always favor Infrastructure-as-Code (IaC)`

### 🎨 Personal Taste Preferences
To create guardrails for the Mentor persona:
> **`pref: <explicit rule>`**
> *Example:* `pref: I want to focus on deep-work coding; reject meetings without an agenda.`
*   *Effect:* Stored as a "WANT" and "REJECT" rule. Future thoughts violating this (like attending an agenda-less meeting) will trigger a Slack warning.

---

## 4. Wisdom Verticals (Domain Extensions)
Specialized "verticals" track niche data beyond standard tasks and entities.

### 📚 Learning Vertical
When you share progress on a skill:
> *"I've mastered memory management in Deno today!"*
*   **Trigger:** Included automatically if your message relates to learning a skill.
*   **Confirmation:** `📚 Learning: Triggered`
*   **Registry:** Persists the topic, your mastery status, and your latest milestone achievements.

---

## 5. Connecting Your AI Assistants (MCP Server)
The real power of **my-ob1** is using it as an external knowledge source for AI clients (like Claude, Cursor, or Antigravity).

### 🔗 Connect via URL:
`https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/open-brain-mcp?key=<YOUR_MCP_ACCESS_KEY>`

### 🛠️ Key Tools for Your AI:
*   **`search_memories`**: Perform semantic search over your entire history.
*   **`list_tasks`**: View your active to-do list.
*   **`capture_memory`**: Allow your AI assistant to "remember" its findings directly into your brain.
*   **`list_learning_topics`**: Query your progress in the Learning vertical.

---

## 6. Automated Synthesis
Every week, the brain performs an **Automated Synthesis**:
1.  Analyzes the last 7 days of capture.
2.  Evaluates adherence to your **Taste Preferences**.
3.  Drafts an **Executive Digest** (Themes, Alignment, Priorities).
4.  Posts the report directly to your Slack channel.

---

## 7. Security Layers
*   **Slack HMAC Signature Verification**: Ensures only your Slack workspace can trigger ingestion.
*   **Global Database RLS**: Row-Level Security is locked down at the database level. Direct access is blocked.
*   **MCP Secret**: All AI client access requires your unique `MCP_ACCESS_KEY`.
