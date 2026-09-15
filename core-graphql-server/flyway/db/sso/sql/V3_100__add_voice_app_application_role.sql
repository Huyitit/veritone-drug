DO $FLYWAY$
BEGIN
	--Create Role: "Voice Editor"
	INSERT INTO public."role" (
		role_id,
		role_name,
		role_description,
		app_name,
		permissions,
		organization_id,
		is_private,
		is_app_event_role,
		application_id
	)
	SELECT 
		'95736da9-9f3a-43bc-a0a1-8160750efc29'::uuid,
		'Veritone Voice Editor',
		'Access to all features of the application',
		'voice',
		'{}',
		NULL,
		FALSE,
		FALSE,
		application_id
	FROM application
	WHERE application_id = '3a9a9364-535c-4388-920a-806c3664a2bb'
	ON CONFLICT DO NOTHING;

	--Backfill Permissions: Give all users with application access to Veritone Voice the new "Voice Editor" Role
	INSERT INTO sso_user_role(user_id,role_id,date_created,created_by,application_id)
	SELECT
		su.user_id,
		'95736da9-9f3a-43bc-a0a1-8160750efc29'::uuid AS role_id,
		NOW() AS date_created,
		'cdae9102-026d-4674-8920-e9c6e5ec5490' AS created_by,
		sg.application_id 
	FROM application a
		LEFT JOIN application__organization ao ON ao.application_id = a.application_id 
		LEFT JOIN sso_group sg ON sg.kvp->>'organizationId'::TEXT = ao.organization_id::TEXT
		LEFT JOIN sso_user__sso_group susg ON susg.group_id = sg.group_id 
		LEFT JOIN sso_user su ON su.user_id = susg.user_id 
	WHERE
		a.application_id = '3a9a9364-535c-4388-920a-806c3664a2bb' AND
		su.status = 'active' AND
		ao.application_state = 'active'
	ON CONFLICT DO NOTHING;

END;
$FLYWAY$