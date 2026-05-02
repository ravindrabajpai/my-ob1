# Future Horizons (Prioritized)

> **Parent Index:** [SKILL.md](./SKILL.md) — Read the root index first.

---

### 3. Enhanced Knowledge Graph (Explicit Entity Relationships)
- **Description:** Extend the `process-memory` extraction prompt to identify explicit semantic relationships between entities (e.g., `works_on`, `uses`). Store these in a new `entity_edges` table to enable rich, multi-hop network queries.

### 4. Thread Summarization (Wiki Synthesis)
- **Description:** Upgrade the `automated-synthesis` pipeline to detect dormant or excessively long threads and consolidate them into a single high-level "Summary Memory". Maintain `derived_from` links to the raw messages to drastically improve context window efficiency during vector searches.

### 5. Retroactive Enrichment & Sensitivity Scanning
- **Description:** Create a batch backfill script to process historical memories that lack advanced metadata. Additionally, add a regex-based sensitivity scanner to `ingest-thought` to apply a `sensitivity_tier` tag (personal vs. restricted) before vectorizing, ensuring secure data handling.

### 6. Local Brain Backup & Export
- **Description:** Develop a standalone utility script to paginate through core tables (`memories`, `entities`, `tasks`) and export them as version-controlled JSON files for local data portability and peace-of-mind.

### Deferred / Icebox

- Dashboard / reporting Edge Function
- **Self-Hosted Kubernetes Deployment:** Adapt the OB1 helm charts/blueprints to create a fully local, self-contained PostgreSQL + pgvector deployment for `my-ob1` as a future-proofing measure.
