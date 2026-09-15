-- Update the Home app URL to point to the desktop app with the organizations path
UPDATE public.application
SET application_url = 'https://desktop.@@{EXTERNAL_DNS_ZONE}@@/ui/organizations'
WHERE application_id = 'e0133c8b-4ed0-48e6-8d92-ad034837ce29';