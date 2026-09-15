ALTER TABLE IF EXISTS public.rbac_acl ADD COLUMN IF NOT EXISTS auth_inherit BOOLEAN DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_rbac_acl_auth_inherit_index ON public.rbac_acl (auth_inherit) WHERE auth_inherit IS NOT NULL;
