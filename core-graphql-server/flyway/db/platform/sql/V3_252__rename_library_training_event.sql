UPDATE
    aiware.audit_config
SET
    configured_events = (
        SELECT
            ARRAY(SELECT DISTINCT unnest(array_cat(                            
                            ARRAY(
                                SELECT unnest(configured_events)
                                EXCEPT
                                SELECT unnest(ARRAY ['library_training_complete'])), ARRAY ['library_train']))))
        WHERE
        (SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1
    AND ('library_training_complete' = ANY (configured_events));


UPDATE aiware.audit_config
SET baseline_events = ARRAY(
    SELECT DISTINCT unnest(baseline_events || ARRAY[
        'unknown'        
    ])
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;