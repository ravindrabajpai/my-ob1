-- 023_retroactive_enrichment_sensitivity.sql
-- Phase 24: Retroactive Enrichment & Sensitivity Scanning

-- 1. Add sensitivity_tier column to memories
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS sensitivity_tier TEXT DEFAULT 'standard'
    CHECK (sensitivity_tier IN ('standard', 'personal', 'restricted'));

-- 2. Index for filtered queries
CREATE INDEX IF NOT EXISTS memories_sensitivity_tier_idx
  ON public.memories (sensitivity_tier);

-- 3. Backfill RPC (service_role only; bypasses RLS)
CREATE OR REPLACE FUNCTION public.set_memory_sensitivity(
  p_memory_id UUID,
  p_tier      TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_tier NOT IN ('standard', 'personal', 'restricted') THEN
    RAISE EXCEPTION 'Invalid sensitivity_tier: %', p_tier;
  END IF;
  UPDATE public.memories
    SET sensitivity_tier = p_tier
  WHERE id = p_memory_id;
END;
$$;

-- Grant to service_role only
REVOKE ALL ON FUNCTION public.set_memory_sensitivity(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_memory_sensitivity(UUID, TEXT) TO service_role;
