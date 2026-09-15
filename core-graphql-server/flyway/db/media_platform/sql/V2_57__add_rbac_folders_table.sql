CREATE TABLE IF NOT EXISTS public.rbac_folders (
	folder_id uuid NOT NULL,
	organization_id integer NOT NULL,
	auth_group_id uuid NOT NULL,
	permission_set_id uuid NOT NULL,
	CONSTRAINT rbac_folders_pk PRIMARY KEY (folder_id, auth_group_id, permission_set_id)
);

ALTER TABLE public.rbac_folders OWNER TO postgres;
GRANT SELECT ON TABLE public.rbac_folders TO readaccess;

CREATE INDEX IF NOT EXISTS idx_rbac_folders_folder_id ON public.rbac_folders(folder_id);

CREATE INDEX IF NOT EXISTS idx_rbac_folders_organization_id ON public.rbac_folders(organization_id);
