-- Add IDentify Editor Role
INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private, is_app_event_role, application_id)
SELECT 
    '8b12ec55-30c8-40a0-9011-5c32bc713d7d',
    'IDentify Editor',
    'Access to all features for IDentify application',
    'identify',
    '{-8192,255}',
    NULL,
    false,
    false,
    '5704cfc1-799f-422d-bc98-25b1083f37f9'
FROM application WHERE application_id = '5704cfc1-799f-422d-bc98-25b1083f37f9'
ON CONFLICT (role_id) DO UPDATE
SET 
    role_name = EXCLUDED.role_name,
    role_description = EXCLUDED.role_description,
    permissions = EXCLUDED.permissions;
