UPDATE 	public.application 
SET 	oauth2_redirect_urls = concat('https://', application_key, '.@@{EXTERNAL_DNS_ZONE}@@')
WHERE 	oauth2_redirect_urls IS NULL
	AND application_status = 'active';

