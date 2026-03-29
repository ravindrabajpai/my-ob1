-- Migration 004: Async Ingestion Setup
-- Adds slack_metadata to memories and sets up a webhook to trigger the process-memory edge function.

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS slack_metadata JSONB DEFAULT '{}'::jsonb;

-- Ensure pg_net is enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the trigger function that calls the Edge Function
CREATE OR REPLACE FUNCTION public.trigger_process_memory()
RETURNS TRIGGER AS $$
DECLARE
  function_url text;
BEGIN
  -- Default to local kong gateway for Edge Functions, but allow override via app.settings
  function_url := coalesce(
    current_setting('app.process_memory_url', true), 
    'http://kong:8000/functions/v1/process-memory'
  );

  -- We call the function and don't wait for the result
  PERFORM net.http_post(
      url := function_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object(
          'type', 'INSERT',
          'table', 'memories',
          'record', row_to_json(NEW)
      )::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS memory_insert_trigger ON public.memories;

-- Create the trigger
CREATE TRIGGER memory_insert_trigger
AFTER INSERT ON public.memories
FOR EACH ROW
-- Only trigger on observation/raw inserts that don't have an embedding yet
WHEN (NEW.embedding IS NULL)
EXECUTE FUNCTION public.trigger_process_memory();
