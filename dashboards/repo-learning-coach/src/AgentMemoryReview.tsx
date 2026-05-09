import { useEffect, useState } from 'react';
import './App.css';

// Placeholder component for Phase 27 Agent Memory Review
// This component will eventually connect to the `open-brain-mcp` or `open-brain-dashboard-api`
// to fetch pending agent memories and allow human operators to review/confirm them.

export function AgentMemoryReview() {
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a full implementation, this would hit the backend API to list pending memories.
    // For now, it displays a scaffolding message.
    setLoading(false);
  }, []);

  return (
    <div className="content-grid">
      <section className="content-card content-card--wide">
        <div className="lesson-header">
          <div>
            <p className="eyebrow">Agent Governance</p>
            <h3>Agent Memory Review</h3>
            <p className="content-card__summary">
              Review, confirm, or reject operational memories written by autonomous agents before they are promoted to instruction-grade context.
            </p>
          </div>
        </div>

        {loading ? (
          <p>Loading pending memories...</p>
        ) : memories.length === 0 ? (
          <p className="empty-state">No pending agent memories to review.</p>
        ) : (
          <div className="related-list">
            {memories.map((m, i) => (
              <article key={i} className="thought-card">
                <div className="thought-card__meta">
                  <span className="meta-pill">{m.runtime_name || 'agent'}</span>
                  <span className="muted">{m.task_id}</span>
                </div>
                <p>{m.content}</p>
                <div className="status-controls" style={{ marginTop: '1rem' }}>
                  <button type="button" className="primary-button">Confirm</button>
                  <button type="button">Reject</button>
                  <button type="button">Evidence Only</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
