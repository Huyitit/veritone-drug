INSERT INTO public.application (application_id, application_name, application_key, application_status,
                                application_description, application_icon_url, application_icon_svg, application_url,
                                application_check_permissions, application_order, owner_organization_id,
                                deployment_model, created_date, updated_date, oauth2_redirect_urls,
                                oauth2_client_secret, permissions_required, application_free_trial_months,
                                application_monthly_charge, application_charge_per_user, public, event_endpoint,
                                headerbar_enabled)
SELECT 'e0133c8b-4ed0-48e6-8d92-ad034837ce29',
       'Home',
       'home_app',
       'active',
       'The Home Application is a landing page for Organizations that have a multi-organization structure. This app allows users to switch between their various Organizations in a dedicated interface',
       'https://s3.amazonaws.com/prod-api.veritone.com/7682/other/2022/9/4/_/Group%20930-19-47-541_eae22fdf-8d79-460d-8cfc-a56d11c636e2.svg?X-Amz-Algorithm=AWS4-HMAC-SHA256&amp;X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20221013%2Fus-east-1%2Fs3%2Faws4_request&amp;X-Amz-Date=20221013T193847Z&amp;X-Amz-Expires=86400&amp;X-Amz-Signature=2a9206870a990b9adbe6a18158e7af3317825399bf7706c59f68e3b0538606fa&amp;X-Amz-SignedHeaders=host',
       null,
       'https://home.@@{EXTERNAL_DNS_ZONE}@@',
       false,
       0,
       1,
       0,
       1657918075,
       1665689929,
       null,
       'JDbqEwnKSH0eBJKkkcdnj46DzDgeoRrcwrjGTKrmypys7MwvoTe32g',
       null,
       0,
       0,
       0,
       false,
       null,
       true
WHERE ('@@{NODE_ENV}@@' NOT IN ('prod', 'stage', 'dev', 'uk-prod', 'zsfc01-usgoveast1', 'wpcc03-useast1'))
  AND (NOT EXISTS(SELECT 1 FROM public.application WHERE application_id = 'e0133c8b-4ed0-48e6-8d92-ad034837ce29'))
ON CONFLICT DO NOTHING;

INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private,
                         is_app_event_role, application_id)
SELECT '5e29d623-76ad-40b7-8307-f43993ba3ef2',
       'aiWARE Home App Viewer',
       'Access to view the aiWARE Home app',
       'home',
       '{-2004312064,136}',
       null,
       false,
       false,
       'e0133c8b-4ed0-48e6-8d92-ad034837ce29'

WHERE ('@@{NODE_ENV}@@' NOT IN ('prod', 'stage', 'dev', 'uk-prod', 'zsfc01-usgoveast1', 'wpcc03-useast1'))
  AND (NOT EXISTS(SELECT 1 FROM public.role WHERE role_id = '5e29d623-76ad-40b7-8307-f43993ba3ef2'))
ON CONFLICT DO NOTHING;