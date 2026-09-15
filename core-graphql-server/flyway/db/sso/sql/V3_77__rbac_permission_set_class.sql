ALTER TABLE public.rbac_permission_set ADD COLUMN IF NOT EXISTS permission_set_class varchar(20) NULL;
COMMENT ON COLUMN public.rbac_permission_set.permission_set_class IS 'The user designated utility of the permission set';
