
INSERT INTO	public.sso_token (token_id, application_id, group_id, json) VALUES (
	'graphql_test:3d11062eab179dad954305df5e424c5aef87d804ea83876f9e600d7c27d4eb56d6d57a67bb817588',
	'ed075985-bc94-406b-8639-44d1da42c3fb',
	'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
	'{
		"rights": ["asset:uri", "job:create", "job:read", "job:update", "job:delete", "task:read", "task:update", 
								"task:create", "task_type:internal", "recording:create", "recording:read", "recording:update", 
								"recording:delete", "report:create", "analytics:usage", "ami-node:create", 
								"developer:access", "developer:build:read", "developer.build.deploy", "developer.build.update", "developer:build.upload",
								"developer:engine.update", "developer:build.invalidate", "developer:build:create",
								"developer:build:invalidate", "developer:build:upload", "developer:build:update", "developer.build.delete",
								"developer:engine:create", "developer:engine:read", "developer:engine:delete", "developer:engine:disable",
								"developer:engine:enable",
								"cms:access", "discovery:access", "devops:querymonitor", "cluster:manager", 
								"admin:org:read", "user:create", "user:update", "user:read","user:delete"],
		"tokenId": "graphql_test:3d11062eab179dad954305df5e424c5aef87d804ea83876f9e600d7c27d4eb56d6d57a67bb817588", 
		"internal": true, 
		"isRevoked": false, 
		"approverId": "f94d1303-6abd-49a5-9d98-fb93fb22d063", 
		"tokenLabel": "jenkins build pipeline", 
		"requestorId": "f94d1303-6abd-49a5-9d98-fb93fb22d063"
	}'
)
ON CONFLICT (token_id) DO UPDATE
	SET "json" = '{
		"rights": ["asset:uri", "job:create", "job:read", "job:update", "job:delete", "task:read", "task:update", 
								"task:create", "task_type:internal", "recording:create", "recording:read", "recording:update", 
								"recording:delete", "report:create", "analytics:usage", "ami-node:create", 
								"developer:access", "developer:build:read", "developer.build.deploy", "developer.build.update", "developer:build.upload",
								"developer:engine.update", "developer:build.invalidate", "developer:build:create",
								"developer:build:invalidate", "developer:build:upload", "developer:build:update", "developer.build.delete",
								"developer:engine:create", "developer:engine:read", "developer:engine:delete", "developer:engine:disable",
								"developer:engine:enable",
								"cms:access", "discovery:access", "devops:querymonitor", "cluster:manager", 
								"admin:org:read", "user:create", "user:update", "user:read","user:delete"],
		"tokenId": "graphql_test:3d11062eab179dad954305df5e424c5aef87d804ea83876f9e600d7c27d4eb56d6d57a67bb817588", 
		"internal": true, 
		"isRevoked": false, 
		"approverId": "f94d1303-6abd-49a5-9d98-fb93fb22d063", 
		"tokenLabel": "jenkins build pipeline", 
		"requestorId": "f94d1303-6abd-49a5-9d98-fb93fb22d063"
	}';

-- Create CI-tests user
INSERT INTO public.sso_user (user_id, user_name, password, kvp, date_modified, modified_by, status)
SELECT
	'10ffa55a-d68b-494b-83df-49ce2d008e6d',
	'sys_graphql_citest_superadmin@veritone.com',
	'$2a$12$Q.rNf3/5bEwBDwG3IiO5CeBowQ5mw9X.nc5wU7pQ2EMbjbpj4p3na',
	'{"firstName":"sys_graphql_citest_superadmin","lastName":"sys_graphql_citest_superadmin"}',
	current_timestamp,
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
	'active'
WHERE
	'@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
ON CONFLICT DO NOTHING;

-- createAclsForUser
INSERT INTO public.sso_acl (application_id, user_id, object_type, object_id, access)
SELECT
	'ed075985-bc94-406b-8639-44d1da42c3fb',
	'10ffa55a-d68b-494b-83df-49ce2d008e6d',
	'obj-access-grant',
	'organization/7682',
	'{"owner":true}'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = '10ffa55a-d68b-494b-83df-49ce2d008e6d')
ON CONFLICT DO NOTHING;

-- createUserGroups
INSERT INTO public.sso_user__sso_group (user_id, group_id) 
SELECT
	'10ffa55a-d68b-494b-83df-49ce2d008e6d',
	'ea738f5b-9f52-45f3-8db8-3167bfd625fe'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = '10ffa55a-d68b-494b-83df-49ce2d008e6d')
ON CONFLICT DO NOTHING;

-- createRolesForUser
-- Role superadmin
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'10ffa55a-d68b-494b-83df-49ce2d008e6d',
	'3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = '10ffa55a-d68b-494b-83df-49ce2d008e6d')
ON CONFLICT DO NOTHING;

-- Role Developer Admin
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'10ffa55a-d68b-494b-83df-49ce2d008e6d',
	'1fa5da82-841b-4efa-b998-45e03fbb3b03',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = '10ffa55a-d68b-494b-83df-49ce2d008e6d')
ON CONFLICT DO NOTHING;

-- Role Collections Editor
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'10ffa55a-d68b-494b-83df-49ce2d008e6d',
	'e9c2c71a-80dd-4a35-af68-cbc256bb23a6',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = '10ffa55a-d68b-494b-83df-49ce2d008e6d')
ON CONFLICT DO NOTHING;

-- Role CMS Editor
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'10ffa55a-d68b-494b-83df-49ce2d008e6d',
	'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = '10ffa55a-d68b-494b-83df-49ce2d008e6d')
ON CONFLICT DO NOTHING;

-- Role Discovery Editor
INSERT INTO public.sso_user_role (user_id, role_id, created_by, application_id)
SELECT
	'10ffa55a-d68b-494b-83df-49ce2d008e6d',
	'3577dfc6-f441-41f9-8dab-ef9079530450',
	'9c5e4b53-25b8-44c6-91a5-1e46497c9903',
    'ed075985-bc94-406b-8639-44d1da42c3fb'
WHERE EXISTS (SELECT * FROM public.sso_user WHERE user_id = '10ffa55a-d68b-494b-83df-49ce2d008e6d')
ON CONFLICT DO NOTHING;