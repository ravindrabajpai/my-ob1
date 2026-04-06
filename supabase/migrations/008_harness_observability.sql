-- Create processing_status enum
CREATE TYPE processing_status AS ENUM ('pending', 'completed', 'failed');

-- Add new columns to memories table
ALTER TABLE memories
ADD COLUMN processing_status processing_status NOT NULL DEFAULT 'pending',
ADD COLUMN processing_error TEXT,
ADD COLUMN cost_metrics JSONB;

-- Create mcp_operation_queue table for gating risky operations
CREATE TABLE mcp_operation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on the new table
ALTER TABLE mcp_operation_queue ENABLE ROW LEVEL SECURITY;

-- Add expires_at to goals_and_principles
ALTER TABLE goals_and_principles
ADD COLUMN expires_at TIMESTAMPTZ;

-- Add cost_metrics to synthesis_reports
ALTER TABLE synthesis_reports
ADD COLUMN cost_metrics JSONB;
