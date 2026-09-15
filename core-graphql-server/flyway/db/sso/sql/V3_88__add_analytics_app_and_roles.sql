-- Add Analytics app if not present.
INSERT INTO application (
     application_id,
     application_name,
     application_key,
     application_status,
     application_description,
     application_url,
     application_check_permissions,
     oauth2_redirect_urls,
     owner_organization_id
)
SELECT
    'a1ed9b40-0193-431a-98e5-c1c22e211058',
    'CE Analytics App',
    'ce_analytics_app',
    'active',
    'Analytics for integrated Veritone applications',
    'https://ce-analytics.@@{EXTERNAL_DNS_ZONE}@@',
    true,
    'https://ce-analytics.@@{EXTERNAL_DNS_ZONE}@@',
    @@{ROOT_ORG_ID}@@
WHERE NOT EXISTS (SELECT 1 FROM application WHERE application_id = 'a1ed9b40-0193-431a-98e5-c1c22e211058');

-- Add Analytics SuperAdmin Role
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private, application_id)
VALUES (
    '09ee3a74-4339-47ba-9497-71fedffe5e77',
    'CE Analytics Super Admin',
    'Access to all feature for CE Analytics and view all customers',
    'ce_analytics_app',
    '{}',
    NULL,
    true,
    'a1ed9b40-0193-431a-98e5-c1c22e211058'
) ON CONFLICT (role_id) DO NOTHING;

-- Add Analytics Admin Role
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private, application_id)
VALUES (
    'ee3a78e0-4317-4dff-a6aa-243aece2018f',
    'CE Analytics Admin',
    'Access to all feature for CE Analytics',
    'ce_analytics_app',
    '{}',
    NULL,
    false,
    'a1ed9b40-0193-431a-98e5-c1c22e211058'
) ON CONFLICT (role_id) DO NOTHING;

-- Add Analytics Reader Role
INSERT INTO role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private, application_id)
VALUES (
   'ddcca605-bc9f-4971-95c9-52b6ebcd7541',
   'CE Analytics Reader',
   'Access to read-only feature for CE Analytics',
   'ce_analytics_app',
   '{}',
   NULL,
   false,
   'a1ed9b40-0193-431a-98e5-c1c22e211058'
) ON CONFLICT (role_id) DO NOTHING;