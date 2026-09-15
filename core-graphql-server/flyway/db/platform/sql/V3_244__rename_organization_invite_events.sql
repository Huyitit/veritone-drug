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
                                        ARRAY ['organization_invitation', 'organization_request', 'organization_request_rejected', 'organization_request_approved', 'organization_invitation_rejected', 'organization_invitation_accepted']
                                    )
                            ),
                            -- Add new event names
                            ARRAY ['organization_invitation_create', 'organization_request_create', 'organization_request_reject', 'organization_request_accept', 'organization_invitation_reject', 'organization_invitation_accept']
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
        'organization_invitation' = ANY (configured_events)
        OR 'organization_request' = ANY (configured_events)
        OR 'organization_request_rejected' = ANY (configured_events)
        OR 'organization_request_approved' = ANY (configured_events)
        OR 'organization_invitation_rejected' = ANY (configured_events)
        OR 'organization_invitation_accepted' = ANY (configured_events)
    );