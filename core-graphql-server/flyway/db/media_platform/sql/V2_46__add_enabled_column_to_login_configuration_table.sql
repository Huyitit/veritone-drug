-- AWT-13082

ALTER TABLE IF EXISTS
    public.login_configuration
ADD COLUMN IF NOT EXISTS
    enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.login_configuration.enabled IS 'A flag to indicate if the login configuration is enabled or not';
