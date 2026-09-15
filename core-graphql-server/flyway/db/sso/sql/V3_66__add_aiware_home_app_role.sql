INSERT INTO public.role (
  role_id, 
  role_name, 
  role_description, 
  app_name, 
  permissions, 
  organization_id, 
  is_private, 
  is_app_event_role)
VALUES (
  '5e29d623-76ad-40b7-8307-f43993ba3ef2',
  'aiWARE Home App Viewer',
  'Access to view the aiWARE Home app',
  'home_app',
  '{-2004312064,136}', -- Permission IDs: [13 15 19 23 27 31 35 39]
  NULL,
  false,
  false
) ON CONFLICT (role_id) DO UPDATE
SET
role_name = EXCLUDED.role_name,
role_description = EXCLUDED.role_description,
permissions = EXCLUDED.permissions;
