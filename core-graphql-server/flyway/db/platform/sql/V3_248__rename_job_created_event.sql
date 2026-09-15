UPDATE aiware.audit_config
SET configured_events = ARRAY(
    SELECT DISTINCT unnest(configured_events || ARRAY[
        'job_create'
    ])
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;