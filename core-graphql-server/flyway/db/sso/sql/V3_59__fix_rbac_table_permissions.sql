-- fix table ownership

-- system RBAC tables
ALTER TABLE public.rbac_auth_group OWNER TO postgres;
GRANT SELECT ON TABLE public.rbac_auth_group TO readaccess;

ALTER TABLE public.rbac_role OWNER TO postgres;
GRANT SELECT ON TABLE public.rbac_role TO readaccess;

ALTER TABLE public.rbac_auth_group_member OWNER TO postgres;
GRANT SELECT ON TABLE public.rbac_auth_group_member TO readaccess;

ALTER TABLE public.rbac_organization_role OWNER TO postgres;
GRANT SELECT ON TABLE public.rbac_organization_role TO readaccess;


-- resource role tables
ALTER TABLE public.rbac_recording_role OWNER TO postgres;
GRANT SELECT ON TABLE public.rbac_recording_role TO readaccess;

ALTER TABLE public.rbac_folder_role OWNER TO postgres;
GRANT SELECT ON TABLE public.rbac_folder_role TO readaccess;
