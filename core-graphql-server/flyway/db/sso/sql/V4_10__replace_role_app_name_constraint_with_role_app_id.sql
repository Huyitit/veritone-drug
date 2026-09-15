ALTER TABLE IF EXISTS public.role DROP CONSTRAINT IF EXISTS "_ix_role@role_name,app_name" CASCADE;
ALTER TABLE IF EXISTS public.role DROP CONSTRAINT IF EXISTS "_ix_role@role_name,application_id" CASCADE;

-- add ON DELETE CASCADE to dependent foreign key constraints so we can purge roles that have null app_name --
-- rbac_acl
ALTER TABLE IF EXISTS public.rbac_acl DROP CONSTRAINT IF EXISTS rbac_recording_role_fk CASCADE;
ALTER TABLE IF EXISTS public.rbac_acl ADD CONSTRAINT rbac_recording_role_fk
    FOREIGN KEY (auth_group_id) REFERENCES public.rbac_auth_group ON DELETE CASCADE;

-- rbac_auth_group
ALTER TABLE IF EXISTS public.rbac_auth_group DROP CONSTRAINT IF EXISTS fk_role_id CASCADE;
ALTER TABLE IF EXISTS public.rbac_auth_group ADD CONSTRAINT fk_role_id
    FOREIGN KEY (role_id) REFERENCES public.role ON DELETE CASCADE;

-- sso_user_role
ALTER TABLE IF EXISTS public.sso_user_role DROP CONSTRAINT IF EXISTS "_fk_sso_user_role@role_id" CASCADE;
ALTER TABLE IF EXISTS public.sso_user_role ADD CONSTRAINT "_fk_sso_user_role@role_id"
    FOREIGN KEY (role_id) REFERENCES public.role ON DELETE CASCADE;

-- sso_user_role
ALTER TABLE IF EXISTS public.rbac_permission_set DROP CONSTRAINT IF EXISTS fk_role_id CASCADE;
ALTER TABLE IF EXISTS public.rbac_permission_set ADD CONSTRAINT fk_role_id
    FOREIGN KEY (role_id) REFERENCES public.role ON DELETE CASCADE;

-- clean up any rows that have null app_name to avoid issues adding the new constraint
DELETE FROM public.role WHERE app_name IS NULL;

ALTER TABLE IF EXISTS public.role ADD CONSTRAINT "_ix_role@role_name,application_id" UNIQUE (role_name, application_id);
