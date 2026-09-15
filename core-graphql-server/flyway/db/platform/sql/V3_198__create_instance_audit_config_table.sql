CREATE TABLE IF NOT EXISTS aiware.audit_config (
   baseline_events TEXT[] NOT NULL,
   configured_events TEXT[],
   created_at TIMESTAMP NOT NULL,
   modified_by UUID,
   modified_at TIMESTAMP NOT NULL
);

INSERT INTO aiware.audit_config (baseline_events, configured_events, created_at, modified_by, modified_at)
SELECT
    ARRAY['audit_login_success', 'audit_login_failure', 'audit_impersonate'],
    '{}',
    NOW(),
    NULL,
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM aiware.audit_config);
