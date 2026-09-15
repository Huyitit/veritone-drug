-- add column "password_reset_token" to table "organization_invite" to save the token for org-invite
ALTER TABLE public.organization_invite  ADD COLUMN IF NOT EXISTS password_reset_token TEXT;