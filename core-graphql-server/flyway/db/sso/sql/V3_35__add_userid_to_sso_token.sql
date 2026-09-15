
ALTER TABLE public.sso_token ADD COLUMN IF NOT EXISTS user_id uuid;

COMMENT ON COLUMN public.sso_token.user_id IS 'If set, this is the userId context of api token.';

