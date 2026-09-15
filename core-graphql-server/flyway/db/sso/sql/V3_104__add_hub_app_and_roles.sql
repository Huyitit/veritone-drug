-- CREATE HUB APP
INSERT INTO public.application (
        application_id,
        application_name,
        application_key,
        application_status,
        application_description,
        application_icon_url,
        application_icon_svg,
        application_url,
        application_check_permissions,
        application_order,
        owner_organization_id,
        deployment_model,
        created_date,
        updated_date,
        oauth2_redirect_urls,
        oauth2_client_secret,
        permissions_required,
        application_free_trial_months,
        application_monthly_charge,
        application_charge_per_user,
        public,
        event_endpoint,
        headerbar_enabled,
        metadata_version)
SELECT '9b774b0e-a5b1-452c-a0aa-4e2e64ead2b3',
       'Hub Central',
       'hubcentral',
       'active',
       'Manage aiWare from Hub Central',
       'https://hub.aiware.com/images/hub-logo.svg',
       '',
       'https://hub.aiware.com',
       false,
       0,
       7682,
       0,
       1677186414,
       1677186414,
       null,
       'XsZeKmYO5Xi8KaR8b31jzBKICtgeDfP6q7n0ZJMoZ8__4syNRe8dTA',
       null,
       0,
       0,
       0,
       false,
       null,
       false,
       1
WHERE NOT EXISTS(SELECT 1 FROM public.application WHERE application_id = '9b774b0e-a5b1-452c-a0aa-4e2e64ead2b3')
ON CONFLICT DO NOTHING;


-- CREATE DEFAULT ROLE
INSERT INTO public.role (
        role_id,
        role_name,
        role_description,
        app_name,
        permissions,
        organization_id,
        is_private,
        is_app_event_role,
        application_id)
SELECT
       '68a6ea53-cf9e-405d-9f3f-4731e29aad30',
       'Default App Access',
       'Default permissions for Hub Central app event role',
       'hubcentral',
       '{-872414136,148488,544}',
       null,
       false,
       false,
       '9b774b0e-a5b1-452c-a0aa-4e2e64ead2b3'
WHERE NOT EXISTS(SELECT 1 FROM public.role WHERE role_id = '68a6ea53-cf9e-405d-9f3f-4731e29aad30')
ON CONFLICT DO NOTHING;

-- CREATE HUB ADMIN ROLE
INSERT INTO public.role (
        role_id,
        role_name,
        role_description,
        app_name,
        permissions,
        organization_id,
        is_private,
        is_app_event_role,
        application_id)
SELECT
       '6b4446f1-ac32-4ab0-954f-a5559f4fe82a',
       'Hub Admin',
       'Admin access to view the Hub Central app',
       'hubcentral',
       '{-872414136,148488,544}',
       null,
       false,
       false,
       '9b774b0e-a5b1-452c-a0aa-4e2e64ead2b3'
WHERE NOT EXISTS(SELECT 1 FROM public.role WHERE role_id = '6b4446f1-ac32-4ab0-954f-a5559f4fe82a')
ON CONFLICT DO NOTHING;
