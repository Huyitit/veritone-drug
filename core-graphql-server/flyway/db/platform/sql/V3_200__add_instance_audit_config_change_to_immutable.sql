UPDATE aiware.audit_config
SET baseline_events = COALESCE(baseline_events || ARRAY['audit_config_change'], ARRAY['audit_config_change'])
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1
AND NOT 'audit_config_change' = ANY (baseline_events);
