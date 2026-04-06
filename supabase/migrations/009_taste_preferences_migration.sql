-- 1. Create the new table
CREATE TABLE public.taste_preferences (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    preference_name text NOT NULL,
    domain text,
    reject text NOT NULL,
    want text NOT NULL,
    constraint_type text NOT NULL,
    status text DEFAULT 'active',
    created_at timestamp with time zone DEFAULT clock_timestamp(),
    CONSTRAINT taste_preferences_pkey PRIMARY KEY (id)
);

-- 2. Migrate existing goals/principles into taste_preferences
INSERT INTO public.taste_preferences (
    id,
    preference_name,
    domain,
    reject,
    want,
    constraint_type,
    status,
    created_at
)
SELECT 
    id,
    type || ' ' || substring(content from 1 for 15),
    'general',
    'Things that contradict this ' || type,
    content,
    type,
    status,
    created_at
FROM public.goals_and_principles;

-- 3. Drop the old table
DROP TABLE public.goals_and_principles CASCADE;

-- 4. Enable RLS
ALTER TABLE public.taste_preferences ENABLE ROW LEVEL SECURITY;

-- 5. Open policy for Service Role
CREATE POLICY "Enable ALL for service-role on taste_preferences"
    ON public.taste_preferences
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
