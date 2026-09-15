-- add last_logged_in column to sso_user__sso_group table
ALTER TABLE public.sso_user__sso_group
    ADD COLUMN IF NOT EXISTS last_logged_in TIMESTAMP WITHOUT TIME ZONE;
