UPDATE public.application
SET application_icon_url = 'https://static.veritone.com/aiware_desktop_app_icon.png',
    application_url      = 'https://desktop.@@{EXTERNAL_DNS_ZONE}@@'
WHERE application_id = 'e4739d44-53d2-4153-b55f-5e246fc989b1';
