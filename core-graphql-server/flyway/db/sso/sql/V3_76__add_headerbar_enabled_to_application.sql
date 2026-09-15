ALTER TABLE public.application
ADD COLUMN IF NOT EXISTS headerbar_enabled BOOLEAN NOT NULL DEFAULT TRUE;
COMMENT ON COLUMN public.application.headerbar_enabled IS 'If TRUE, the application will be wrapped in aiware as an iframe';
