ALTER TABLE public.sso_user__sso_group ADD COLUMN IF NOT EXISTS priority smallint DEFAULT 0;
