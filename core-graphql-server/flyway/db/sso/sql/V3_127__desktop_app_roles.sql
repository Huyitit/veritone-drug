-- aiWARE Desktop App Roles
DO $$
BEGIN
    -- Instance Admin
    IF NOT EXISTS (SELECT 1 FROM role WHERE role_id = 'cb18eb9c-3264-434a-8a8d-e6b2d680f66e') THEN
    INSERT INTO role (role_id, role_name, role_description, app_name, application_id, permissions, organization_id, is_private, is_app_event_role)
    SELECT
        'cb18eb9c-3264-434a-8a8d-e6b2d680f66e',
        'aiWARE Instance Administrator',
        'The Instance Administrator is a highly privileged role available exclusively within the root organization of the instance. This role is entrusted with comprehensive access to all users, organizations, and functions across the entire instance. Due to the extensive permissions associated with this role, it is critical that it be assigned only to individuals with the highest level of trust and expertise.',
        'aiware_desktop',
        'e4739d44-53d2-4153-b55f-5e246fc989b1',
        '{-2, -264241153, -1, -1107296257, 134217727}',
        NULL,
        false,
        false
    WHERE
        '@@{EXTERNAL_DNS_ZONE}@@' NOT LIKE '%us-1.veritone.com'
        AND '@@{EXTERNAL_DNS_ZONE}@@' NOT LIKE '%uk-1.veritone.com';
    END IF;

    -- Admin (SA permissions excluded)
    IF NOT EXISTS (SELECT 1 FROM role WHERE role_id = '032218c3-d47e-4287-9d16-7bb867c01266') THEN
    INSERT INTO role (role_id, role_name, role_description, app_name, application_id, permissions, organization_id, is_private, is_app_event_role)
    SELECT
        '032218c3-d47e-4287-9d16-7bb867c01266',
        'aiWARE Administrator',
        'The aiWARE Administrator is a key role responsible for managing and overseeing administrative tasks at the organization level within the aiWARE instance. This role ensures the smooth operation and optimal configuration of the organization''s systems, including product provisioning, user management, groups and permission sets, system settings, and audit logs. The Organization Administrator is also responsible for the approval of new aiWARE resources, packages, and user invitations, maintaining audit logs, and ensuring compliance with internal and external regulations.',
        'aiware_desktop',
        'e4739d44-53d2-4153-b55f-5e246fc989b1',
        '{-4, -264241153, -1, -1107296257, 100663295}',
        NULL,
        false,
        false
    WHERE
        '@@{EXTERNAL_DNS_ZONE}@@' NOT LIKE '%us-1.veritone.com'
        AND '@@{EXTERNAL_DNS_ZONE}@@' NOT LIKE '%uk-1.veritone.com';
    END IF;
END $$;
