UPDATE
    aiware.audit_config
SET
    configured_events = (
        SELECT
            ARRAY(
                SELECT
                    DISTINCT unnest(
                        array_cat(
                            -- Remove old event names
                            ARRAY(
                                SELECT
                                    unnest(configured_events)
                                EXCEPT
                                SELECT
                                    unnest(
                                        ARRAY ['platform_new_version_available']
                                    )
                            ),
                            -- Add new event names
                            ARRAY ['new_version_create']
                        )
                    )
            )
    ),
    baseline_events = (
        SELECT
            ARRAY(
                SELECT
                    DISTINCT unnest(
                        array_cat(
                            -- Remove old event names from baseline_events
                            ARRAY(
                                SELECT
                                    unnest(baseline_events)
                                EXCEPT
                                SELECT
                                    unnest(
                                        ARRAY ['platform_new_version_installed']
                                    )
                            ),
                            -- Add new event names to baseline_events
                            ARRAY ['new_version_install']
                        )
                    )
            )
    )
WHERE
    (
        SELECT
            COUNT(*)
        FROM
            information_schema.tables
        WHERE
            table_schema = 'aiware'
            AND table_name = 'audit_config'
    ) = 1
    AND (
        'platform_new_version_available' = ANY (configured_events)
        OR 'platform_new_version_installed' = ANY (configured_events)
    );
