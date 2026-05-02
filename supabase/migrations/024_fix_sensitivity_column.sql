-- 024_fix_sensitivity_column.sql
-- Force apply sensitivity_tier column if it's missing despite 023 status.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'memories' 
        AND column_name = 'sensitivity_tier'
    ) THEN
        ALTER TABLE public.memories ADD COLUMN sensitivity_tier TEXT DEFAULT 'standard';
        ALTER TABLE public.memories ADD CONSTRAINT memories_sensitivity_tier_check 
            CHECK (sensitivity_tier IN ('standard', 'personal', 'restricted'));
        CREATE INDEX IF NOT EXISTS memories_sensitivity_tier_idx ON public.memories (sensitivity_tier);
    END IF;
END
$$;

-- Ensure RPC exists
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

REVOKE ALL ON FUNCTION public.set_memory_sensitivity(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_memory_sensitivity(UUID, TEXT) TO service_role;
