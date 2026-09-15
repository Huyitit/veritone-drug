UPDATE public.application
SET 
  application_id = 'f48bcff0-fd73-4358-bb48-0957c62ec34d',
  application_key = 'identify',
  application_url = 'https://identify.uk.veritone.com',
  created_date = 1542059548,
  updated_date = 1542236780,
  oauth2_redirect_urls = 'https://identify.uk.veritone.com',
  oauth2_client_secret = '38nfmlx8BJOpbrJwIIK3CEkMlw5SuvOJL22qzmrF_cgsC-ioGIJpDw'
WHERE
  '@@{NODE_ENV}@@' = 'uk-prod' AND application_name = 'IDentify' 
  AND application_id != 'f48bcff0-fd73-4358-bb48-0957c62ec34d';
