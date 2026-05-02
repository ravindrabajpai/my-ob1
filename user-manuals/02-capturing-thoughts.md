# 02. Capturing Thoughts

Capture happens naturally via your dedicated **Slack Capture Channel**.

## 💡 Just Type Naturally
Simply type your thoughts, observations, or meeting notes directly into your designated Slack channel.
> *"Great meeting with the manager. We need to start the 'poc' for the new AI project by Friday."*

**The bot will reply in-thread with an analysis:**
*   **🎯 Tasks:** (Extracted "start the 'poc' for the new AI project")
*   **🔗 Entities:** (Linked "the manager", "AI project")
*   **🕸️ Entity Edges:** (Relationship mapped between detected entities)
*   **🧠 Insight:** (Strategic evaluation against your active goals)
*   **🧭 Alignment:** ("This relates to project management goals")

## 🕸️ Entity Knowledge Graph (Testing Relationships)

When your message mentions **2 or more entities with a clear relationship**, the system automatically maps the connection into the Entity Knowledge Graph. These edges are queryable via MCP tools (`get_entity_neighbors`, `traverse_entity_graph`, `find_entity_path`).

### Rich Test Message
Post this to trigger **3 entity relationships** in one message:

> *"Just had a great sync with Sarah Chen. She's managing the Apollo Platform project and confirmed that Apollo depends on our Supabase infrastructure for all real-time data. Sarah also uses Notion to track the Apollo roadmap. Need to schedule a demo by Friday."*

**Expected bot reply:**
```
Captured as *observation*
🎯 Tasks: 1
🔗 Entities: 4 linked
🕸️ Entity Edges: 3 relationships mapped
🧭 Alignment: ...
```

**Expected relationships extracted:**

| Source | Relationship | Target |
|---|---|---|
| Sarah Chen | `manages` | Apollo Platform |
| Apollo Platform | `depends_on` | Supabase |
| Sarah Chen | `uses` | Notion |

### More Examples

**`works_on` + `uses`:**
> *"Working with Marcus on the new ML pipeline. The pipeline uses PyTorch for model training and exports to a Hugging Face endpoint."*

**`knows` relationship:**
> *"Met with Jordan Kim today who introduced me to the Vertex AI team. Jordan knows the PM lead there and can help us get a partnership intro."*

### Verify in Database
After the bot replies, confirm rows were written:
```sql
SELECT
  e1.name AS source,
  ee.relationship_type,
  e2.name AS target,
  ee.weight AS confidence
FROM entity_edges ee
JOIN entities e1 ON e1.id = ee.source_entity_id
JOIN entities e2 ON e2.id = ee.target_entity_id
ORDER BY ee.created_at DESC
LIMIT 5;
```

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
