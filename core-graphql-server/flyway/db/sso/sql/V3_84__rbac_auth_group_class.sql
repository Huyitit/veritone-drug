ALTER TABLE public.rbac_auth_group ADD COLUMN IF NOT EXISTS auth_group_class varchar(20) NULL;
COMMENT ON COLUMN public.rbac_auth_group.auth_group_class IS 'The user designated utility of the auth group';
