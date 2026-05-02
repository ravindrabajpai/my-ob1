# 02. Capturing Thoughts

Capture happens naturally via your dedicated **Slack Capture Channel**.

## 💡 Just Type Naturally
Simply type your thoughts, observations, or meeting notes directly into your designated Slack channel.
> *"Great meeting with Manish. We need to start the 'poc' for the new AI project by Friday."*

**The bot will reply in-thread with an analysis:**
*   **🎯 Tasks:** (Extracted "start the 'poc' for the new AI project")
*   **🔗 Entities:** (Linked "Manish", "AI project")
*   **🧠 Insight:** (Strategic evaluation against your active goals)
*   **🧭 Alignment:** ("This relates to project management goals")

## 📎 Multi-modal (Images & Files)
You can upload an image of a whiteboard, a screenshot of code, or a PDF.
*   The system performs OCR and transcription to extract text.
*   The text is analyzed, embedded for vector search, and summarized in your Slack reply.

## 🛑 Smart Deduplication
If you send the exact same text twice, the system will **ignore** the second attempt. This protects your Knowledge Graph from accidental double-triggers and Slack delivery retries.

## ⚖️ Adaptive Capture
The system intelligently classifies your thoughts (observation, decision, idea, etc.) with a confidence score.
- **I'm sure:** If the system is confident, it applies the classification immediately.
- **I'm unsure:** If confidence is low, the system runs a second evaluation pass. If disagreement persists, it defaults to a safe "observation" state to avoid corrupting your signals.
- **Self-Correcting:** As you use the system, the thresholds for these checks automatically adjust (nudge loop) based on successful captures.
