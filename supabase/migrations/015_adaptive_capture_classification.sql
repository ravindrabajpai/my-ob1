-- ============================================================
-- Migration 015: Adaptive Capture Classification (Phase 17)
-- ============================================================
-- Adds four learning tables for confidence-gated ingestion.
-- Tracks per‑type thresholds, classification outcomes, A/B
-- model comparisons, and optional spell‑correction learnings.
-- No existing OB1 tables are modified.
-- ============================================================

-- 1. correction_learnings
--    Tracks user feedback on individual word corrections.
--    After two rejections a correction is suppressed permanently.
CREATE TABLE IF NOT EXISTS correction_learnings (
    word        TEXT NOT NULL,
    correction  TEXT NOT NULL,
    accepted    INTEGER DEFAULT 0,
    rejected    INTEGER DEFAULT 0,
    PRIMARY KEY (word, correction)
);

ALTER TABLE correction_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages correction_learnings"
    ON correction_learnings
    FOR ALL
    USING (auth.role() = 'service_role');

-- 2. classification_outcomes
--    One row per capture attempt. Records the model used,
--    LLM confidence, whether it was auto-classified, and the
--    user's eventual verdict. Drives accuracy tracking and
--    threshold adjustments.
CREATE TABLE IF NOT EXISTS classification_outcomes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id       UUID REFERENCES memories(id) ON DELETE SET NULL,
    model           TEXT NOT NULL,
    item_type       TEXT NOT NULL,
    confidence      REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 10),
    auto_classified BOOLEAN NOT NULL DEFAULT FALSE,
    user_accepted   BOOLEAN,
    user_correction TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_model ON classification_outcomes (model);
CREATE INDEX IF NOT EXISTS idx_outcomes_type  ON classification_outcomes (item_type);
CREATE INDEX IF NOT EXISTS idx_outcomes_date  ON classification_outcomes (created_at DESC);

ALTER TABLE classification_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages classification_outcomes"
    ON classification_outcomes
    FOR ALL
    USING (auth.role() = 'service_role');

-- 3. capture_thresholds
--    Stores the current auto-classify confidence threshold for
--    each capture type. Starts at 0.75 for every type.
--    Nudged down (more aggressive) when user accepts; nudged up
--    (more conservative) when user corrects. Clamped 0.50–0.95.
CREATE TABLE IF NOT EXISTS capture_thresholds (
    item_type    TEXT PRIMARY KEY,
    threshold    REAL NOT NULL DEFAULT 0.75
                 CHECK (threshold >= 0.50 AND threshold <= 0.95),
    sample_count INTEGER NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults for all known memory types
INSERT INTO capture_thresholds (item_type, threshold) VALUES
    ('observation', 0.75),
    ('decision',    0.80),
    ('idea',        0.75),
    ('complaint',   0.75),
    ('log',         0.70)
ON CONFLICT (item_type) DO NOTHING;

ALTER TABLE capture_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages capture_thresholds"
    ON capture_thresholds
    FOR ALL
    USING (auth.role() = 'service_role');

-- 4. ab_comparisons
--    Head-to-head model comparison results for empirical model
--    selection. One row per comparison session.
CREATE TABLE IF NOT EXISTS ab_comparisons (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_a      TEXT NOT NULL,
    model_b      TEXT NOT NULL,
    item_type_a  TEXT NOT NULL,
    item_type_b  TEXT NOT NULL,
    confidence_a REAL NOT NULL,
    confidence_b REAL NOT NULL,
    time_ms_a    INTEGER NOT NULL,
    time_ms_b    INTEGER NOT NULL,
    tokens_a     INTEGER,
    tokens_b     INTEGER,
    winner       TEXT CHECK (winner IN ('a', 'b', 'both', 'neither')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_model_a ON ab_comparisons (model_a);
CREATE INDEX IF NOT EXISTS idx_ab_model_b ON ab_comparisons (model_b);

ALTER TABLE ab_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages ab_comparisons"
    ON ab_comparisons
    FOR ALL
    USING (auth.role() = 'service_role');

-- Verification query (run manually to confirm):
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('correction_learnings', 'classification_outcomes', 'capture_thresholds', 'ab_comparisons')
-- ORDER BY table_name;
