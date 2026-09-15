-- retention_run event
UPDATE aiware.audit_config
SET configured_events = (
    SELECT ARRAY(
        SELECT DISTINCT unnest(
            array_cat(                
                ARRAY(
                    SELECT unnest(configured_events)                    
                ),                
                ARRAY['retention_run']
            )
        )
    )
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;
