-- Add Illuminate Editor Role
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private, is_app_event_role)
VALUES (
	'52e51c27-a732-43c8-ad06-3e6fe3cfd14d', 
	'Illuminate Editor', 
	'Access to all features for Illuminate application', 
	'illuminate', 
	'{-8192,255}', 
	NULL, 
	false, 
	false
) ON CONFLICT (role_id) DO UPDATE
SET 
  role_name = EXCLUDED.role_name,
  role_description = EXCLUDED.role_description,
  permissions = EXCLUDED.permissions;