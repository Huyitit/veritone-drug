ALTER TABLE public.sso_openid_connect ADD COLUMN IF NOT EXISTS redirect_base_url TEXT;
COMMENT ON COLUMN public.sso_openid_connect.redirect_base_url IS 'Configurable OIDC redirect base URL to replace dynamically generated coreAdminUri';
