ALTER TABLE public.rbac_permission_set ADD COLUMN IF NOT EXISTS protected bool NOT NULL DEFAULT false;
COMMENT ON COLUMN public.rbac_permission_set.protected IS 'If protected, unable to update or delete via API or User';

UPDATE public.rbac_permission_set
SET protected = true
WHERE permission_set_name ~ 'orgAdmin|orgAllAccess';

