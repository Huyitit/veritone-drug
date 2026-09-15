-- Replace 'asset_metadata_updated' with 'asset_metadata_update' in configured_events
UPDATE aiware.audit_config
SET configured_events = (
    SELECT ARRAY(
        SELECT DISTINCT unnest(
            array_append(
                ARRAY(
                    SELECT unnest(configured_events)
                    EXCEPT
                    SELECT 'asset_metadata_updated'
                ),
                'asset_metadata_update'
            )
        )
    )
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1
AND 'asset_metadata_updated' = ANY (configured_events);
