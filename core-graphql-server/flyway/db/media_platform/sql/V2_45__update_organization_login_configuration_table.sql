-- AWT-12905

-- Rename the table
ALTER TABLE IF EXISTS public.organization_login_configuration RENAME TO login_configuration;

-- Drop the existing primary key constraint
ALTER TABLE IF EXISTS public.login_configuration DROP CONSTRAINT IF EXISTS organization_login_configuration_pkey;

-- Alter the column to allow NULL values
ALTER TABLE IF EXISTS public.login_configuration ALTER COLUMN organization_id DROP NOT NULL;

-- Add new "id" serial column as the table's primary key
ALTER TABLE IF EXISTS public.login_configuration ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;

-- Update comments
COMMENT ON TABLE public.login_configuration IS 'This table lists all the existing organization-level and instance-level branded login configurations';
COMMENT ON COLUMN public.login_configuration.organization_id IS 'Organization ID for the organization that the login configuration belongs to, if this value is NULL, then it is an instance-level login configuration';

ALTER TABLE public.login_configuration OWNER TO postgres;
GRANT SELECT ON TABLE public.login_configuration TO readaccess;
