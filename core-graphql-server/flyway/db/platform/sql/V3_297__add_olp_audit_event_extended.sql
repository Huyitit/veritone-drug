UPDATE aiware.audit_config
SET baseline_events = ARRAY(
    SELECT DISTINCT unnest(
        baseline_events || ARRAY[
            'default_ace_policy_update',
            'ace_grant',
            'ace_revoke'
        ]
    )
)
WHERE EXISTS (
    SELECT 1 
    FROM information_schema.tables
    WHERE table_schema = 'aiware' AND table_name = 'audit_config'
);

-- authorization_denied is configurable and enabled by default.
-- ace_query is configurable but default OFF (high-volume OLP access checks): it is
-- registered in the events map / EventNameEnum only, so an admin must opt in via
-- updateInstanceAuditLogConfig before it is persisted. Do NOT seed it here.
UPDATE aiware.audit_config
SET configured_events = ARRAY(
        SELECT DISTINCT unnest(configured_events || ARRAY[
            'authorization_denied'
        ]
    )
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;