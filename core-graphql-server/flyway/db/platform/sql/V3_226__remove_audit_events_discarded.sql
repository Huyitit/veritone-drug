-- Remove 'user_created', 'user_deleted', 'recording_inserted', 'recording_insert_failed' and 'recording_cognition_completed' from baseline_events
UPDATE aiware.audit_config
SET baseline_events = ARRAY(
    SELECT unnest(baseline_events)
    EXCEPT
    SELECT unnest(ARRAY['user_created', 'user_deleted', 'recording_inserted', 'recording_insert_failed', 'recording_cognition_completed'])
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1
  AND baseline_events && ARRAY['user_created', 'user_deleted', 'recording_inserted', 'recording_insert_failed', 'recording_cognition_completed'];
