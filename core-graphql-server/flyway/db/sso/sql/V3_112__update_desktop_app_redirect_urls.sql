UPDATE 	public.application
SET 	oauth2_redirect_urls = 'https://desktop.@@{EXTERNAL_DNS_ZONE}@@'
WHERE 	application_id = 'e4739d44-53d2-4153-b55f-5e246fc989b1';
