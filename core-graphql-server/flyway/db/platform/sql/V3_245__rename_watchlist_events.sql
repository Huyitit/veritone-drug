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
                                        ARRAY ['watchlist_created', 'watchlist_updated']
                                    )
                            ),
                            -- Add new event names
                            ARRAY ['watchlist_create', 'watchlist_update']
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
        'watchlist_created' = ANY (configured_events)
        OR 'watchlist_updated' = ANY (configured_events)
    );