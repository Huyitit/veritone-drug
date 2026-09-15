ALTER TABLE public.role ADD COLUMN IF NOT EXISTS is_default_app_role bool NOT NULL DEFAULT false;
COMMENT ON COLUMN public.role.is_default_app_role IS 'It is the default app role or not';

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_default_role_per_app
    ON public.role (application_id, is_default_app_role) WHERE (is_default_app_role);

