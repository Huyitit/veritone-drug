ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS require_open_id bool DEFAULT false;
ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS login_slug varchar(50);

COMMENT ON COLUMN public.organization.login_slug IS 'If set, this used to identify an organization instead of a less human-readable identifier like an id';

CREATE UNIQUE INDEX IF NOT EXISTS _ix_unique_login_slug ON public.organization (login_slug) WHERE login_slug IS NOT NULL;
