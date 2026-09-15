-- verify_user_mfa_registration
UPDATE aiware.audit_config
SET configured_events = (
    SELECT ARRAY(
        SELECT DISTINCT unnest(
            array_cat(                
                ARRAY(
                    SELECT unnest(configured_events)
                    EXCEPT
                    SELECT unnest(ARRAY['register_mfa_verify_mfa_token'])
                ),                
                ARRAY['verify_user_mfa_registration']
            )
        )
    )
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1
AND (
    'register_mfa_verify_mfa_token' = ANY (configured_events)
);