ALTER TABLE IF EXISTS
    public.login_configuration
    DROP CONSTRAINT IF EXISTS login_configuration_organization_id_key;

TRUNCATE public.login_configuration CASCADE;

ALTER TABLE IF EXISTS
    public.login_configuration
    ADD CONSTRAINT login_configuration_organization_id_key UNIQUE (organization_id);
