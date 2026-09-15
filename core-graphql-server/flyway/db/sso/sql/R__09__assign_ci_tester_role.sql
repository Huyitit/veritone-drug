INSERT INTO sso_user_role (
	user_id,
	role_id,
	date_created,
	created_by,
    application_id
) SELECT
		user_id,
		role_id,
		NOW(),
		user_id,
        'ed075985-bc94-406b-8639-44d1da42c3fb'
	FROM
		sso_user, role
	WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
		AND user_name = 'sys_graphql_citest_superadmin@veritone.com'
			AND role_name = 'CI Tester'
ON CONFLICT DO NOTHING;
