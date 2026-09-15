ALTER TABLE public.acl_sdo DROP CONSTRAINT IF EXISTS acl_sdo_pk;

ALTER TABLE public.acl_sdo ALTER COLUMN sdo_id DROP NOT NULL;

ALTER TABLE public.acl_sdo ADD CONSTRAINT acl_sdo_unique 
    UNIQUE (auth_group_id, permission_set_id, data_registry_id, sdo_id);

-- Create a partial unique index to handle the case where sdo_id is NULL
-- This ensures uniqueness for combinations where sdo_id is NULL
CREATE UNIQUE INDEX IF NOT EXISTS acl_sdo_null_sdo_unique 
    ON public.acl_sdo (auth_group_id, permission_set_id, data_registry_id) 
    WHERE sdo_id IS NULL;