DO $$
BEGIN
IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'aiware'
    AND table_name = 'audit_config'
) THEN
    ALTER TABLE aiware.audit_config OWNER TO postgres;
    GRANT SELECT ON aiware.audit_config TO readaccess;
    ELSE
    RAISE NOTICE 'Table aiware.audit_config does not exist. Skipping permission assignment.';
END IF;
END
$$;