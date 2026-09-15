-- table external_credential
ALTER TYPE public.service_type ADD VALUE IF NOT EXISTS 'oidc';

-- table sso_openid_connect
ALTER TABLE public.sso_openid_connect
    ADD COLUMN IF NOT EXISTS external_credential_id text NULL;
