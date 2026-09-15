ALTER TABLE public.sso_user ADD COLUMN IF NOT EXISTS scim_connect_id text;

COMMENT ON COLUMN public.sso_user.scim_connect_id IS 'The source that user is created from. (SCIM_{{connectId}} or null)';
