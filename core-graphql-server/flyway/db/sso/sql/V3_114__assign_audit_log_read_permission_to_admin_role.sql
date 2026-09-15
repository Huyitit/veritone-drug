-- Assign aiware.audit_log.read permission to Admin role
INSERT INTO public."role" (role_id, role_name, role_description, app_name, permissions, organization_id, is_private, is_app_event_role, application_id, is_default_app_role, price_per_user)
VALUES(
    'ddca9b68-d775-4934-8ffd-7aecc779b652'::uuid,
    'Admin',
    'Access to all features for organization management',
    'admin',
    '{8188}',
    NULL,
    false,
    false,
    'ea1d26ab-0d29-4e97-8ae7-d998a243374e'::uuid,
    false,
    NULL
) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{8188,0,0,0,67108864}';

-- Assign aiware.audit_log.read permission to SuperAdmin role
INSERT INTO public."role" (role_id, role_name, role_description, app_name, permissions, organization_id, is_private, is_app_event_role, application_id, is_default_app_role, price_per_user)
VALUES(
    '3459c3de-493f-443a-8ad0-ddb9f3f6c76d'::uuid,
    'Super Admin',
    'Full access to all Veritone features',
    'admin',
    '{8190}',
    1,
    false,
    false, 
    'ea1d26ab-0d29-4e97-8ae7-d998a243374e'::uuid,
    false,
    NULL
) ON CONFLICT (role_id) DO UPDATE
    SET permissions = '{8190,0,0,0,67108864}';
