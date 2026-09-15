UPDATE aiware.audit_config
SET configured_events = (
    SELECT ARRAY(
        SELECT DISTINCT unnest(
            array_cat(
                -- Remove old event names
                ARRAY(
                    SELECT unnest(configured_events)
                    EXCEPT
                    SELECT unnest(ARRAY['recording_created', 'recording_deleted', 'recording_updated'])
                ),
                -- Add new event names
                ARRAY['recording_create', 'recording_delete', 'recording_update']
            )
        )
    )
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1
AND (
    'recording_created' = ANY (configured_events) OR
    'recording_deleted' = ANY (configured_events) OR
    'recording_updated' = ANY (configured_events)
);