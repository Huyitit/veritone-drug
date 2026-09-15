-- add openid_roles column to sso_user__openid_connect table
ALTER TABLE public.sso_user__openid_connect
    ADD COLUMN IF NOT EXISTS openid_roles TEXT[] DEFAULT '{}';
