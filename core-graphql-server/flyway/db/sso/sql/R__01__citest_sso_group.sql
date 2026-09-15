INSERT INTO public.sso_application (
    application_id,
    application_name,
    kvp,
    is_platform
  )
VALUES
  (
    'ed075985-bc94-406b-8639-44d1da42c3fb',
    'Veritone, Inc.-default',
    '{
		"platformType":	"enterprise",
		"trialEndDate":	"2015-12-04 00:18:46.059024836 +0000 UTC"
	}',
    FALSE
  )
  ON CONFLICT DO NOTHING;


INSERT INTO public.sso_group (
    group_id,
    group_name,
    application_id,
    date_modified,
    modified_by,
    permissions,
    kvp
  )
VALUES
  (
    'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
    'Veritone, Inc.',
    'ed075985-bc94-406b-8639-44d1da42c3fb',
    current_timestamp,
    '04178474-2256-4b87-8bb6-ad5baa0ae7c2',
    -- TODO: Not really sure what this is meant to be
    '{"cms":{"access":"true"}}',
    '{
        "groupType":"organization",
        "organizationId":"7682",
        "organizationName":"Veritone, Inc."
    }'
  )
  ON CONFLICT DO NOTHING;


INSERT INTO public.sso_user (user_id, user_name, password, kvp, date_created, date_modified, modified_by)
SELECT
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'hji+superadmin@veritone.com',
	'$2b$12$/oHIaOhOWVbilwsMfpq4xe.EftD2iNqASjZiWyl.4/HYfGDcmeA0K',
	'{"firstName": "Hong", "lastName": "Ji"}',
	current_timestamp,
	current_timestamp,
	'00000000-0000-0000-0000-000000000000'  -- TODO: Not really sure what this is meant to be
WHERE
  '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
  AND NOT EXISTS (SELECT * FROM public.sso_user WHERE user_name = 'hji+superadmin@veritone.com')
ON CONFLICT DO NOTHING;


INSERT INTO public.sso_user__sso_group (user_id, group_id)
SELECT
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'ea738f5b-9f52-45f3-8db8-3167bfd625fe'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = 'a9822dc9-a961-42eb-821b-d78d8d081dc3')
ON CONFLICT DO NOTHING;

-- createAclsForUser
INSERT INTO public.sso_acl (application_id, user_id, object_type, object_id, access)
SELECT
	'ed075985-bc94-406b-8639-44d1da42c3fb',
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'obj-access-grant',
	'organization/7682',
	'{"owner":true}'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = 'a9822dc9-a961-42eb-821b-d78d8d081dc3')
ON CONFLICT DO NOTHING;

-- createUserGroups
INSERT INTO public.sso_user__sso_group (user_id, group_id) 
SELECT
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'ea738f5b-9f52-45f3-8db8-3167bfd625fe'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = 'a9822dc9-a961-42eb-821b-d78d8d081dc3')
ON CONFLICT DO NOTHING;

-- createRolesForUser
-- Role superadmin
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = 'a9822dc9-a961-42eb-821b-d78d8d081dc3')
ON CONFLICT DO NOTHING;

-- Role Developer Admin
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'1fa5da82-841b-4efa-b998-45e03fbb3b03',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = 'a9822dc9-a961-42eb-821b-d78d8d081dc3')
ON CONFLICT DO NOTHING;

-- Role Collections Editor
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'e9c2c71a-80dd-4a35-af68-cbc256bb23a6',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = 'a9822dc9-a961-42eb-821b-d78d8d081dc3')
ON CONFLICT DO NOTHING;

-- Role CMS Editor
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = 'a9822dc9-a961-42eb-821b-d78d8d081dc3')
ON CONFLICT DO NOTHING;

-- Role Discovery Editor
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'a9822dc9-a961-42eb-821b-d78d8d081dc3',
	'3577dfc6-f441-41f9-8dab-ef9079530450',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = 'a9822dc9-a961-42eb-821b-d78d8d081dc3')
ON CONFLICT DO NOTHING;
