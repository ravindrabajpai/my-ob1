# Future Horizons (Prioritized)

> **Parent Index:** [SKILL.md](./SKILL.md) — Read the root index first.

---

### 4. Retroactive Enrichment & Sensitivity Scanning
- **Description:** Create a batch backfill script to process historical memories that lack advanced metadata. Additionally, add a regex-based sensitivity scanner to `ingest-thought` to apply a `sensitivity_tier` tag (personal vs. restricted) before vectorizing, ensuring secure data handling.

### 5. Local Brain Backup & Export
- **Description:** Develop a standalone utility script to paginate through core tables (`memories`, `entities`, `tasks`) and export them as version-controlled JSON files for local data portability and peace-of-mind.

### Deferred / Icebox

- Dashboard / reporting Edge Function
- **Self-Hosted Kubernetes Deployment:** Adapt the OB1 helm charts/blueprints to create a fully local, self-contained PostgreSQL + pgvector deployment for `my-ob1` as a future-proofing measure.
