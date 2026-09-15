ALTER TABLE public.application ADD COLUMN  IF NOT EXISTS application_free_trial_months INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.application.application_free_trial_months IS 'If 0, no free trial.  If greater than 0, then that many months';

ALTER TABLE public.application ADD COLUMN  IF NOT EXISTS application_monthly_charge INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.application.application_monthly_charge IS 'If 0, no charge.  If greater than zero that charge per month per application';

ALTER TABLE public.application ADD COLUMN  IF NOT EXISTS application_charge_per_user INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.application.application_charge_per_user IS 'If 0, no per user charge.  If greater than 0, then that charge per month';

ALTER TABLE public.application ADD COLUMN  IF NOT EXISTS public BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.application.public IS 'If FALSE, application is private to org';

DO $$ BEGIN
    CREATE TYPE public.organization_application_type_enum AS ENUM (
    'org',
    'bu'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
COMMENT ON TYPE public.organization_application_type_enum IS 'org - app is enable to organization, bu - app is available to business unit';


ALTER TABLE public.application__organization ADD COLUMN IF NOT EXISTS type organization_application_type_enum DEFAULT 'org';
ALTER TABLE public.application__organization ADD COLUMN IF NOT EXISTS business_unit VARCHAR(50);

ALTER TABLE public.application__organization ADD COLUMN IF NOT EXISTS created_date TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE public.application__organization ADD COLUMN IF NOT EXISTS modifed_date TIMESTAMP NOT NULL DEFAULT NOW();

DO $$ BEGIN
    CREATE TYPE public.organization_application_state_enum AS ENUM (
    'available',
    'active'
	);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.application__organization
    ADD COLUMN IF NOT EXISTS application_state organization_application_state_enum DEFAULT 'active';
COMMENT ON COLUMN public.application__organization.application_state IS 'The state of the application for the org';
