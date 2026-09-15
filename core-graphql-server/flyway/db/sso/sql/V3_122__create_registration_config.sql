DROP TYPE IF EXISTS public.organization_document_type CASCADE;
CREATE TYPE public.organization_document_type AS ENUM (
    'terms_of_service',
    'privacy_policy'
);

DROP TYPE IF EXISTS public.organization_registration_status CASCADE;
CREATE TYPE public.organization_registration_status AS ENUM (
    'open',
    'restricted'
);

-- Create a new table for organization registration configurations
CREATE TABLE IF NOT EXISTS public.organization_registration_configuration (
    registration_configuration_id UUID NOT NULL PRIMARY KEY,
    organization_guid UUID NOT NULL REFERENCES public.sso_application (application_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    open_registration_status public.organization_registration_status DEFAULT 'restricted' NOT NULL,
    admin_approval_required BOOLEAN DEFAULT TRUE,
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
    created_by UUID NOT NULL,
    modified_by UUID NOT NULL
);


-- Create a new table for organization registration files
CREATE TABLE IF NOT EXISTS public.organization_registration_files (
    id UUID PRIMARY KEY,
    registration_configuration_id UUID NOT NULL REFERENCES public.organization_registration_configuration (registration_configuration_id) ON DELETE CASCADE,
    name TEXT,
    uri TEXT NOT NULL,
    type public.organization_document_type NOT NULL,
    status TEXT NOT NULL,
    created_by UUID NOT NULL,
    modified_by UUID NOT NULL,
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Table for UI customization elements
CREATE TABLE IF NOT EXISTS public.organization_registration_ui_settings (
    registration_configuration_id UUID NOT NULL PRIMARY KEY REFERENCES public.organization_registration_configuration (registration_configuration_id) ON DELETE CASCADE,
    logo TEXT,
    custom_registration_fields TEXT,
    registration_button_style TEXT,
    veritone_branding BOOLEAN DEFAULT FALSE,
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
    created_by UUID NOT NULL,
    modified_by UUID NOT NULL
);

-- Table to store domain-specific settings linked to each registration page
CREATE TABLE IF NOT EXISTS public.organization_registration_domain_settings (
    registration_configuration_id UUID NOT NULL REFERENCES public.organization_registration_configuration (registration_configuration_id) ON DELETE CASCADE,
    domain_name TEXT NOT NULL,
    auth_group_id UUID NOT NULL REFERENCES public.rbac_auth_group (auth_group_id), -- Reference to the auth group table
    application_role_ids TEXT[] NOT NULL, -- Array of application role IDs for users registering under this domain
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
    created_by UUID NOT NULL,
    modified_by UUID NOT NULL,
    PRIMARY KEY (registration_configuration_id, domain_name)  -- Composite primary key to ensure uniqueness
);

-- Create a new table for user custom profile data
CREATE TABLE IF NOT EXISTS public.user_custom_profile (
    user_id UUID NOT NULL REFERENCES public.sso_user (user_id) ON DELETE CASCADE,
    organization_guid UUID NOT NULL REFERENCES public.sso_application (application_id) ON DELETE CASCADE,
    custom_profile TEXT NOT NULL,
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL
);


ALTER TABLE public.organization_registration_configuration OWNER TO postgres;
GRANT SELECT ON TABLE public.organization_registration_configuration TO readaccess;

ALTER TABLE public.organization_registration_files OWNER TO postgres;
GRANT SELECT ON TABLE public.organization_registration_files TO readaccess;

ALTER TABLE public.organization_registration_ui_settings OWNER TO postgres;
GRANT SELECT ON TABLE public.organization_registration_ui_settings TO readaccess;

ALTER TABLE public.organization_registration_domain_settings OWNER TO postgres;
GRANT SELECT ON TABLE public.organization_registration_domain_settings TO readaccess;

ALTER TABLE public.user_custom_profile OWNER TO postgres;
GRANT SELECT ON TABLE public.user_custom_profile TO readaccess;


ALTER TABLE organization_invite
ADD COLUMN IF NOT EXISTS user_details JSON;
