UPDATE aiware.audit_config
SET configured_events = ARRAY(
    SELECT DISTINCT unnest(
        array_cat(
            ARRAY(
                SELECT unnest(configured_events)
                EXCEPT
                SELECT unnest(ARRAY['asset_updated', 'asset_deleted'])
            ),
            ARRAY['asset_update', 'asset_delete']
        )
    )
)
WHERE (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = 'aiware' AND table_name = 'audit_config'
) = 1;
