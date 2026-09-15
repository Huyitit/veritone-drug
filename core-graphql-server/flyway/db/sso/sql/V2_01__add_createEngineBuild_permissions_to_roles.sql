
-- update Automate Editor permissions
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
  'a5f72287-10b2-47d5-8b68-bd97b0a31f16',
  'Automate Editor',
  'Access to the Automate Studio application',
  'automate',
  '{1006632960,536870912,0,4096}',
  NULL,
  FALSE
) ON CONFLICT (role_id) DO UPDATE
SET permissions = '{1006632960,536870912,0,4096}';


-- update Developer Admin permissions
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
  '1fa5da82-841b-4efa-b998-45e03fbb3b03',
  'Developer Admin',
  '',
  'developer',
  '{0,0,1073741824,8339443}',
  @@{ROOT_ORG_ID}@@,
  FALSE
) ON CONFLICT (role_id) DO UPDATE
SET permissions = '{0,0,1073741824,8339443}';

-- update Developer Editor permissions
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
VALUES (
  '912e377e-f4a4-4184-8db1-baa9670d8081',
  'Developer Editor',
  '',
  'developer',
  '{0,0,1073741824,5193715}',
  NULL,
  FALSE
) ON CONFLICT (role_id) DO UPDATE
SET permissions = '{0,0,1073741824,5193715}';
