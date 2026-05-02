# 05. Dashboards & Wisdom Verticals

Specialized "verticals" track niche data beyond standard tasks and entities. This allows your Open Brain to deeply understand specific domains of your life.

## 📚 Learning Vertical
Specialized tracking for skills. It automatically matches messages relating to learning or mastery.
- **Trigger:** Included automatically if your message relates to learning a skill.
- **Confirmation:** In Slack, you will see `📚 Learning: Updated`.
- **Dashboard:** Use the **Repo Learning Coach** to view your full curriculum and mastery map.

## 🎓 Repo Learning Coach
A dedicated web interface for structured learning and codebase onboarding that connects to your Open Brain.
- **URL:** `http://localhost:5173` (when running locally from the `dashboards/repo-learning-coach` directory)
- **Features:** 
    - **Lessons:** Guided walkthroughs of the my-ob1 architecture.
    - **Quizzes:** Validate your understanding of the schema and extension patterns.
    - **Research:** Deep-dives into the project context files.
    - **Brain Bridge:** See linked memories from your Open Brain while you learn.

## 📊 Infographic Generation
Turn your research or memories into visual infographics.
- **Invocation:** Ask your AI assistant (Claude/Cursor) to "generate an infographic from my latest research on X."
- **Result:** The system writes verbose visual prompts, calls the Gemini API, and saves the resulting image to the `media/` folder.
