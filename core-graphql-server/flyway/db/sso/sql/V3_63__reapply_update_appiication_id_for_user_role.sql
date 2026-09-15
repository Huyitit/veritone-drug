DO $$
DECLARE
	root_org_guids UUID[];
BEGIN
	SELECT ARRAY_AGG(application_id) INTO root_org_guids  FROM sso_group sg 
	WHERE  kvp ->> 'groupType' = 'organization' AND kvp ->> 'organizationId' = CAST ( @@{ROOT_ORG_ID}@@ AS TEXT)
	LIMIT 1;	

	UPDATE sso_user_role sr
	SET application_id = g.application_id 
	FROM (SELECT user_id, application_id FROM sso_user__sso_group susg JOIN sso_group sg ON susg.group_id = sg.group_id WHERE susg.priority = 0) AS g
	WHERE g.user_id = sr.user_id AND sr.application_id IS NULL;
	
	-- The remaining user roles with null application are assigned to the root organization to avoid constraint primary key conflict.
	UPDATE sso_user_role sr
	SET application_id = root_org_guids[1]
	WHERE sr.application_id IS NULL;

  ALTER TABLE ONLY public.sso_user_role DROP CONSTRAINT IF EXISTS "_pk_sso_user_role@user_id,role_id";
  ALTER TABLE ONLY public.sso_user_role DROP CONSTRAINT IF EXISTS "_pk_sso_user_role@user_id,role_id,application_id";

  ALTER TABLE ONLY public.sso_user_role ADD CONSTRAINT "_pk_sso_user_role@user_id,role_id,application_id" PRIMARY KEY (user_id, role_id, application_id);
END;
$$;
