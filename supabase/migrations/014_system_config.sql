-- Migration 014: System Configuration Table
-- Replaces GUCs (custom settings) which are restricted in managed Supabase environments.

CREATE TABLE IF NOT EXISTS public.system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Helpful function to get config values safely
CREATE OR REPLACE FUNCTION public.get_config(config_key TEXT)
RETURNS TEXT AS $$
    SELECT value FROM public.system_config WHERE key = config_key;
$$ LANGUAGE sql SECURITY DEFINER;

-- Note: To seed the values, run:
-- INSERT INTO public.system_config (key, value, description) VALUES 
-- ('project_ref', 'your-ref', 'Supabase Project Reference ID'),
-- ('service_role_key', 'your-key', 'Supabase Service Role API Key')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
