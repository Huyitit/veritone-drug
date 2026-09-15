DO $FLYWAY$
BEGIN

  ALTER TABLE IF EXISTS public.rbac_auth_group DROP CONSTRAINT IF EXISTS fk_created_by;

  ALTER TABLE IF EXISTS public.rbac_auth_group DROP CONSTRAINT IF EXISTS fk_modified_by;


  ALTER TABLE IF EXISTS public.rbac_permission_set DROP CONSTRAINT IF EXISTS fk_created_by;

  ALTER TABLE IF EXISTS public.rbac_permission_set DROP CONSTRAINT IF EXISTS fk_modified_by;


  ALTER TABLE IF EXISTS public.rbac_acl DROP CONSTRAINT IF EXISTS fk_created_by;

  ALTER TABLE IF EXISTS public.rbac_acl DROP CONSTRAINT IF EXISTS fk_modified_by;

END;
$FLYWAY$
