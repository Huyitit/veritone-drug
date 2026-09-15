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
                                        ARRAY ['package_created', 'package_deleted', 'package_approved', 'package_rejected', 'package_installed', 'package_grant_removed']
                                    )
                            ),
                            -- Add new event names
                            ARRAY ['package_create', 'package_delete', 'package_approve', 'package_reject', 'package_install', 'package_grant_remove']
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
                                        ARRAY ['package_created', 'package_deleted', 'package_approved', 'package_rejected', 'package_installed', 'package_grant_removed']
                                    )
                            ),
                            -- Add new event names to baseline_events
                            ARRAY ['package_create', 'package_delete', 'package_approve', 'package_reject', 'package_install', 'package_grant_remove']
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
        'package_created' = ANY (configured_events)
        OR 'package_deleted' = ANY (configured_events)
        OR 'package_approved' = ANY (configured_events)
        OR 'package_rejected' = ANY (configured_events)
        OR 'package_installed' = ANY (configured_events)
        OR 'package_grant_removed' = ANY (configured_events)
        OR 'package_created' = ANY (baseline_events)
        OR 'package_deleted' = ANY (baseline_events)
        OR 'package_approved' = ANY (baseline_events)
        OR 'package_rejected' = ANY (baseline_events)
        OR 'package_installed' = ANY (baseline_events)
        OR 'package_grant_removed' = ANY (baseline_events)
    );
