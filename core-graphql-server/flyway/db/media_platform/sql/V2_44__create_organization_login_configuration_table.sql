-- AWT-12533

-- Create a new table for organization login configurations
CREATE TABLE IF NOT EXISTS public.organization_login_configuration (
    organization_id INT NOT NULL PRIMARY KEY REFERENCES public.organization (organization_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo TEXT,
    login_button_style JSON,
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
    created_by UUID NOT NULL,
    modified_by UUID NOT NULL
);

COMMENT ON TABLE public.organization_login_configuration IS 'This table lists all the login configurations for organizations';
COMMENT ON COLUMN public.organization_login_configuration.organization_id IS 'Organization ID for the organization that the login configuration belongs to';
COMMENT ON COLUMN public.organization_login_configuration.name IS 'Name of the login configuration';
COMMENT ON COLUMN public.organization_login_configuration.slug IS 'Slug name that will be appended to the login URL for the organization';
COMMENT ON COLUMN public.organization_login_configuration.logo IS 'Logo for the login configuration; stored as base 64 string';
COMMENT ON COLUMN public.organization_login_configuration.login_button_style IS 'JSON object that contains the configuration for the login button';

ALTER TABLE public.organization_login_configuration OWNER TO postgres;
GRANT SELECT ON TABLE public.organization_login_configuration TO readaccess;
