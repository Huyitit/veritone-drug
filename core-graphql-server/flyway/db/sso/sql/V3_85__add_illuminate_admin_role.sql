-- Add Illuminate Admin Role
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private, is_app_event_role, application_id)
VALUES (
	'd3f1de76-747d-4a18-b520-620725073c69', 
	'Illuminate Admin', 
	'Administrator for Illuminate application', 
	'illuminate', 
	'{-8192,255}', 
	NULL, 
	false, 
	false,
    '8b3eac1c-5150-448e-8d99-fb7b860e7e41'
) ON CONFLICT (role_id) DO UPDATE
SET 
  role_name = EXCLUDED.role_name,
  role_description = EXCLUDED.role_description,
  permissions = EXCLUDED.permissions;