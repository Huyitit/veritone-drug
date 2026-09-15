-- Update application key from veri_ads_reporting to navigate for navigate app
UPDATE public.application
SET application_key='navigate'
WHERE application_id='42055789-0281-4885-9a70-9ba09b9219e3';

-- Update app name from veri_ads_reporting to navigate for navigate app
UPDATE public."role" 
SET app_name='navigate' 
WHERE app_name='veri_ads_reporting';