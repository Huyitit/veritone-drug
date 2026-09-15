-- Add the new value 'structured_data_registry_delete' to configured_events, deduplicating any existing values
UPDATE aiware.audit_config
SET configured_events = ARRAY(
    SELECT DISTINCT unnest(configured_events || ARRAY[
        'structured_data_registry_delete'
    ])
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;