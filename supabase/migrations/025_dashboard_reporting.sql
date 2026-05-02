-- Migration 025: Dashboard Reporting RPCs

-- Create a helper function to aggregate dashboard stats efficiently
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_memories INT;
    total_tasks INT;
    total_entities INT;
    total_threads INT;
    memory_types JSON;
    task_statuses JSON;
    entity_types JSON;
BEGIN
    SELECT COUNT(*) INTO total_memories FROM memories;
    SELECT COUNT(*) INTO total_tasks FROM tasks;
    SELECT COUNT(*) INTO total_entities FROM entities;
    SELECT COUNT(*) INTO total_threads FROM threads;

    -- Aggregate memory types
    SELECT COALESCE(json_object_agg(type, count), '{}'::json) INTO memory_types
    FROM (
        SELECT type, COUNT(*) as count FROM memories WHERE type IS NOT NULL GROUP BY type ORDER BY count DESC LIMIT 10
    ) sub;

    -- Aggregate task statuses
    SELECT COALESCE(json_object_agg(status, count), '{}'::json) INTO task_statuses
    FROM (
        SELECT status, COUNT(*) as count FROM tasks WHERE status IS NOT NULL GROUP BY status ORDER BY count DESC
    ) sub;

    -- Aggregate entity types
    SELECT COALESCE(json_object_agg(type, count), '{}'::json) INTO entity_types
    FROM (
        SELECT type, COUNT(*) as count FROM entities WHERE type IS NOT NULL GROUP BY type ORDER BY count DESC LIMIT 10
    ) sub;

    RETURN json_build_object(
        'total_memories', total_memories,
        'total_tasks', total_tasks,
        'total_entities', total_entities,
        'total_threads', total_threads,
        'memory_types', memory_types,
        'task_statuses', task_statuses,
        'entity_types', entity_types
    );
END;
$$;
