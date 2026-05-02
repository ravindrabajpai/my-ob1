# 05. Dashboards & Wisdom Verticals

Specialized "verticals" track niche data beyond standard tasks and entities. This allows your Open Brain to deeply understand specific domains of your life.

## 📚 Learning Vertical
Specialized tracking for skills. It automatically matches messages relating to learning or mastery.
- **Trigger:** Included automatically if your message relates to learning a skill.
- **Confirmation:** In Slack, you will see `📚 Learning: Updated`.
- **Dashboard:** Use the **Repo Learning Coach** to view your full curriculum and mastery map.

## 🎓 Repo Learning Coach
A dedicated web interface for structured learning and codebase onboarding that connects to your Open Brain.
- **URL:** `http://localhost:5173`
- **Commands:**
    - `npm run sync`: **(Required First Step)** Parsers your local `research/` and `curriculum/` markdown files and syncs them into Supabase. Run this whenever you modify your local learning content.
    - `npm run dev`: Starts the local development environment (Vite frontend on `5173` and Express backend on `8787`).
- **Operation:**
    1.  `cd dashboards/repo-learning-coach`
    2.  `npm run sync`
    3.  `npm run dev`
    4.  Open `http://localhost:5173`
- **Features:** 
    - **Lessons:** Guided walkthroughs of the my-ob1 architecture.
    - **Quizzes:** Validate your understanding of the schema and extension patterns.
    - **Research:** Deep-dives into the project context files.
    - **Brain Bridge:** See linked memories from your Open Brain while you learn. This uses the `open-brain-mcp` search tool to surface your actual thoughts related to the lesson content.

## 🌐 Dashboard Reporting API
The `open-brain-dashboard-api` provides a standard REST interface for external web dashboards (like `open-brain-dashboard-next`) to visualize your cognitive data.

- **Endpoints:**
    - `/health`: Service status check.
    - `/stats`: Summary counts of memories, tasks, entities, and threads.
    - `/memories`: Paginated list of memories with type and sensitivity filters.
    - `/tasks`: List of tasks filtered by status.
    - `/search`: Vector-based semantic search over your entire brain.
- **Authentication:** All requests must include the `x-brain-key` header (matching your `MCP_ACCESS_KEY`).
- **Base URL:** `https://<PROJECT_REF>.supabase.co/functions/v1/open-brain-dashboard-api`

## 📊 Infographic Generation
Turn your research or memories into visual infographics.
- **Invocation:** Ask your AI assistant (Claude/Cursor) to "generate an infographic from my latest research on X."
- **Result:** The system writes verbose visual prompts, calls the Gemini API, and saves the resulting image to the `media/` folder.
