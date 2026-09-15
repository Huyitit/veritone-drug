INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
  'a5f72287-10b2-47d5-8b68-bd97b0a31f16',
  'Automate Editor',
  'Access to the Automate Studio application',
  'automate',
  '{-8192, 536871167, 1073741824, 5193715}',
  NULL,
  FALSE
) ON CONFLICT (role_id) DO UPDATE
SET permissions = '{-8192, 536871167, 1073741824, 5193715}';