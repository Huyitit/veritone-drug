CREATE TABLE IF NOT EXISTS public.acl_sdo (
    sdo_id uuid,
    data_registry_id uuid NOT NULL,
    auth_group_id uuid NOT NULL,
    permission_set_id uuid NOT NULL,
    CONSTRAINT acl_sdo_pk PRIMARY KEY (auth_group_id, permission_set_id, data_registry_id, sdo_id)
);

ALTER TABLE public.acl_sdo OWNER TO postgres;