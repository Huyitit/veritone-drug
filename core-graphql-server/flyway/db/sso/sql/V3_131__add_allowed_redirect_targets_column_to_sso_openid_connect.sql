ALTER TABLE public.sso_openid_connect
    ADD COLUMN IF NOT EXISTS allowed_redirect_targets text[] NULL;
