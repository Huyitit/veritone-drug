UPDATE aiware.audit_config
SET baseline_events = ARRAY(
    SELECT DISTINCT unnest(baseline_events || ARRAY['session_ended'])
)
WHERE (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'aiware' AND table_name = 'audit_config'
) = 1;
