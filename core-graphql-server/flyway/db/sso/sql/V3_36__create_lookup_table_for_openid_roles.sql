DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.sso_openid_connect__role (
	organization_id int4 NOT NULL,
	openid_role text NOT NULL,
	role_ids _uuid NOT NULL DEFAULT '{}'::uuid[],
	application_ids _uuid NOT NULL DEFAULT '{}'::uuid[],
	date_created timestamp NOT NULL DEFAULT now(),
	date_modified timestamp NOT NULL,
	modified_by uuid NOT NULL,
	CONSTRAINT "_pk_sso_openid_connect__role@organization_id__openid_role" PRIMARY KEY (organization_id, openid_role)
  );

  COMMENT ON COLUMN public.sso_openid_connect__role.organization_id IS 'The organizationId that will be mapped with roles.';
  COMMENT ON COLUMN public.sso_openid_connect__role.openid_role IS 'The open id role, .e.g..cms_editor, admin, full_access,..';
  COMMENT ON COLUMN public.sso_openid_connect__role.role_ids IS 'Array of role_ids that will be mapped.';
  COMMENT ON COLUMN public.sso_openid_connect__role.application_ids IS 'Array of application_ids that will be mapped.';

  ALTER TABLE public.sso_openid_connect__role OWNER TO postgres;
  GRANT SELECT ON TABLE public.sso_openid_connect__role TO readaccess;
END;
$$;
