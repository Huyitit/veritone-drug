UPDATE  public.application
SET   application_url = 'https://pay.@@{EXTERNAL_DNS_ZONE}@@'
WHERE application_id = '4a30782e-2808-487b-a359-bc50247af31d' 
  AND application_key = 'pay';

UPDATE  public.application
SET   application_url = 'https://attribute.@@{EXTERNAL_DNS_ZONE}@@',
      oauth2_redirect_urls = 'https://attribute.@@{EXTERNAL_DNS_ZONE}@@'
WHERE application_id = '2d6e9991-e551-458c-9e9c-0c70aeaea456'
  AND application_key = 'attribute';

UPDATE  public.application
SET   application_url = 'https://redact.@@{EXTERNAL_DNS_ZONE}@@',
      oauth2_redirect_urls = 'https://redact.@@{EXTERNAL_DNS_ZONE}@@'
WHERE application_id = '766e9916-9536-47e9-8dcb-dc225654bab3'
  AND application_key = 'redaction_2_0';

UPDATE  public.application
SET   application_url = 'https://automate.@@{EXTERNAL_DNS_ZONE}@@',
      oauth2_redirect_urls = 'https://automate.@@{EXTERNAL_DNS_ZONE}@@'
WHERE application_id = 'bdf9375e-1092-4233-8197-9ccbc11357c5'
  AND application_key = 'automate';

UPDATE  public.application
SET   application_url = 'https://illuminate.@@{EXTERNAL_DNS_ZONE}@@',
      oauth2_redirect_urls = 'https://illuminate.@@{EXTERNAL_DNS_ZONE}@@'
WHERE application_id = '8b3eac1c-5150-448e-8d99-fb7b860e7e41'
  AND application_key = 'illuminate';

