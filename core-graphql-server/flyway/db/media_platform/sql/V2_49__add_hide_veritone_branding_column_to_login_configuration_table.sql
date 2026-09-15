-- AWT-13082

ALTER TABLE IF EXISTS
    public.login_configuration
ADD COLUMN IF NOT EXISTS
    hide_veritone_branding BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.login_configuration.hide_veritone_branding IS 'A flag to indicate if veritone branding should be hidden';
