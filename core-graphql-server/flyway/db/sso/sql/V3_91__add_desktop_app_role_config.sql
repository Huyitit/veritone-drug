-- CREATE aiWARE DESKTOP APP
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
        headerbar_enabled)
SELECT 'e4739d44-53d2-4153-b55f-5e246fc989b1',
       'aiWARE Desktop',
       'aiware_desktop',
       'active',
       'The aiWARE Desktop is the entry point to the aiWARE platform. It enables a more streamlined process for application deployment and management, ultimately improving the developer experience and contributing to the success of the platform',
       '',
       '',
       'https://aiware2.@@{EXTERNAL_DNS_ZONE}@@',
       false,
       0,
       7682,
       0,
       1681942164,
       1681942164,
       'https://aiware2.@@{EXTERNAL_DNS_ZONE}@@,https://local.veritone.com,http://localhost:9000,http://localhost:4201',
       'Sdcei0stVjmXEKUc1NlScJkvkCl3iCIV4YTCQt5BXIUw051Lpc2GxQ',
       null,
       0,
       0,
       0,
       false,
       null,
       true
WHERE NOT EXISTS(SELECT 1 FROM public.application WHERE application_id = 'e4739d44-53d2-4153-b55f-5e246fc989b1')
ON CONFLICT DO NOTHING;

-- CREATE APP ROLE
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
       '7b0aa003-c762-4bf2-8f1f-08a4a98b4cb4',
       'aiWARE Desktop App Viewer',
       'Access to view the aiWARE Desktop app',
       'aiware_desktop',
       '{-2004312064,136}',
       null,
       false,
       false,
       'e4739d44-53d2-4153-b55f-5e246fc989b1'
WHERE NOT EXISTS(SELECT 1 FROM public.role WHERE role_id = '7b0aa003-c762-4bf2-8f1f-08a4a98b4cb4')
ON CONFLICT DO NOTHING;

-- make organization_guid nullable to allow seeding configs with flyway scripts in all envs
ALTER TABLE public.app_config_definition ALTER COLUMN organization_guid DROP NOT NULL;

-- CREATE WALLPAPER CONFIGS
INSERT INTO public.app_config_definition
    (application_id,     
     config_key,
     config_level,
     config_type,
     config_description,
     default_value,
     default_value_json,
     is_required,
     is_secured,
     created_by,
     modified_by)
SELECT 'e4739d44-53d2-4153-b55f-5e246fc989b1',       
       'wallpaperCurrent',
       'user',
       'string',
       'desktop application active wallpaper',
       'Desktop_0',
       '{}',
       true,
       false,
       'a5c09131-c51a-4991-b830-e5860e0087f2',
       'a5c09131-c51a-4991-b830-e5860e0087f2'
WHERE NOT EXISTS(
    SELECT 1 FROM public.app_config_definition
    WHERE application_id = 'e4739d44-53d2-4153-b55f-5e246fc989b1'
    AND config_key = 'wallpaperCurrent'
    )
ON CONFLICT DO NOTHING;

INSERT INTO public.app_config_definition
    (application_id,     
     config_key,
     config_level,
     config_type,
     config_description,
     default_value,
     default_value_json,
     is_required,
     is_secured,
     created_by,
     modified_by)
SELECT 'e4739d44-53d2-4153-b55f-5e246fc989b1',       
       'wallpaperCustom_1',
       'user',
       'string',
       'desktop application custom wallpaper #1',
       'none',
       '{}',
       true,
       false,
       'a5c09131-c51a-4991-b830-e5860e0087f2',
       'a5c09131-c51a-4991-b830-e5860e0087f2'
WHERE NOT EXISTS(
    SELECT 1 FROM public.app_config_definition
    WHERE application_id = 'e4739d44-53d2-4153-b55f-5e246fc989b1'
    AND config_key = 'wallpaperCustom_1'
    )
ON CONFLICT DO NOTHING;

INSERT INTO public.app_config_definition
    (application_id,     
     config_key,
     config_level,
     config_type,
     config_description,
     default_value,
     default_value_json,
     is_required,
     is_secured,
     created_by,
     modified_by)
SELECT 'e4739d44-53d2-4153-b55f-5e246fc989b1',       
       'wallpaperCustom_2',
       'user',
       'string',
       'desktop application custom wallpaper #2',
       'none',
       '{}',
       true,
       false,
       'a5c09131-c51a-4991-b830-e5860e0087f2',
       'a5c09131-c51a-4991-b830-e5860e0087f2'
WHERE NOT EXISTS(
    SELECT 1 FROM public.app_config_definition
    WHERE application_id = 'e4739d44-53d2-4153-b55f-5e246fc989b1'
    AND config_key = 'wallpaperCustom_2'
    )
ON CONFLICT DO NOTHING;

INSERT INTO public.app_config_definition
    (application_id,     
     config_key,
     config_level,
     config_type,
     config_description,
     default_value,
     default_value_json,
     is_required,
     is_secured,
     created_by,
     modified_by)
SELECT 'e4739d44-53d2-4153-b55f-5e246fc989b1',       
       'wallpaperCustom_3',
       'user',
       'string',
       'desktop application custom wallpaper #3',
       'none',
       '{}',
       true,
       false,
       'a5c09131-c51a-4991-b830-e5860e0087f2',
       'a5c09131-c51a-4991-b830-e5860e0087f2'
WHERE NOT EXISTS(
    SELECT 1 FROM public.app_config_definition
    WHERE application_id = 'e4739d44-53d2-4153-b55f-5e246fc989b1'
    AND config_key = 'wallpaperCustom_3'
    )
ON CONFLICT DO NOTHING;