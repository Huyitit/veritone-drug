-- Replace 'audit_config_change' with 'audit_log_config_change' in configured_events
UPDATE aiware.audit_config
SET baseline_events = (
    SELECT ARRAY(
        SELECT DISTINCT unnest(
            array_append(
                ARRAY(
                    SELECT unnest(baseline_events)
                    EXCEPT
                    SELECT 'audit_config_change'
                ),
                'audit_log_config_change'                
            )
        )
    )
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1
AND 'audit_config_change' = ANY (baseline_events);

UPDATE aiware.audit_config
SET configured_events = ARRAY(
    SELECT DISTINCT unnest(configured_events || ARRAY[
        'audit_log_export_create',
        'audit_log_export_cancel',
        'audit_log_export_query',
        'audit_log_access'
    ])
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;
