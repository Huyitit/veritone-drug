ALTER TABLE public.program
    ADD COLUMN IF NOT EXISTS app_application_id text;
COMMENT ON COLUMN public.program.app_application_id IS 'id of real application instead of organization';