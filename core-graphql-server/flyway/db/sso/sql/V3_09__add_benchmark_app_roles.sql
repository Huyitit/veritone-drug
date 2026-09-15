-- Add Benchmark Editor Role
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
	'89b7018c-82a3-441c-ba7c-f89e4a11b53d',
	'Benchmark Editor',
	'The user has permission to access basic capabilities and features in organization.',
	'benchmark',
	'{1006879808,63118848,262144}',
	NULL,
	FALSE
) ON CONFLICT (role_id) DO UPDATE
SET 
  role_name = EXCLUDED.role_name,
  role_description = EXCLUDED.role_description,
  permissions = EXCLUDED.permissions;

-- Add Benchmark Admin Role
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
	'e098268f-014f-4518-a7d4-553a0544a032',
	'Benchmark Admin',
	'The user has permission to access all capabilities and features in organization.',
	'benchmark',
	'{1006879808,63118848,262144}',
	NULL,
	FALSE
) ON CONFLICT (role_id) DO UPDATE
SET 
  role_name = EXCLUDED.role_name,
  role_description = EXCLUDED.role_description,
  permissions = EXCLUDED.permissions;

-- Add Benchmark Super Admin Role
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
	'72ef3c90-eda0-41dc-a607-d100356a66d2',
	'Benchmark Super Admin',
	'The user has permission to access all capabilities and features in all organizations.',
	'benchmark',
	'{1006879808,63118848,262144}',
	NULL,
	FALSE
) ON CONFLICT (role_id) DO UPDATE
SET 
  role_name = EXCLUDED.role_name,
  role_description = EXCLUDED.role_description,
  permissions = EXCLUDED.permissions;
