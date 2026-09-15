DO $FLYWAY$
BEGIN

  -- Auth Group Table
  ALTER TABLE public.rbac_auth_group ADD COLUMN IF NOT EXISTS is_protected BOOLEAN;

  UPDATE public.rbac_auth_group SET
    is_protected = CASE WHEN is_protected IS NULL THEN is_system ELSE false END
  WHERE is_protected IS NULL;

  ALTER TABLE public.rbac_auth_group ALTER COLUMN is_protected SET DEFAULT false;
  ALTER TABLE public.rbac_auth_group ALTER COLUMN is_protected SET NOT NULL;
  ALTER TABLE public.rbac_auth_group ALTER COLUMN is_system DROP NOT NULL;


  -- Permission Set Table
  ALTER TABLE public.rbac_permission_set ADD COLUMN IF NOT EXISTS is_protected BOOLEAN;

  UPDATE public.rbac_permission_set SET
    is_protected = CASE WHEN is_protected IS NULL THEN protected ELSE false END
  WHERE is_protected IS NULL;

  ALTER TABLE public.rbac_permission_set ALTER COLUMN is_protected SET DEFAULT false;
  ALTER TABLE public.rbac_permission_set ALTER COLUMN is_protected SET NOT NULL;
  ALTER TABLE public.rbac_permission_set ALTER COLUMN protected DROP NOT NULL;

END;
$FLYWAY$
