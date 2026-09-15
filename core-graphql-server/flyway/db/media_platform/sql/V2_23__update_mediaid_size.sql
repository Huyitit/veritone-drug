DO
$do$
BEGIN
	IF ('@@{NODE_ENV}@@' NOT IN ('prod', 'stage', 'dev', 'local', 'uk-prod') 
	AND NOT '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%.veritone.com%'
	AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NOT NULL))
	THEN
		ALTER TABLE public.audience ALTER COLUMN media_id TYPE int8 USING media_id::int8;
		ALTER TABLE public.shared_search_result ALTER COLUMN media_id TYPE int8 USING media_id::int8;
		ALTER TABLE public.favorite ALTER COLUMN media_id TYPE int8 USING media_id::int8;
		ALTER TABLE public.media_metadata ALTER COLUMN media_id TYPE int8 USING media_id::int8;
		ALTER TABLE public.mention ALTER COLUMN media_id TYPE int8 USING media_id::int8;
		ALTER TABLE public.media ALTER COLUMN media_id TYPE int8 USING media_id::int8;
	END IF;
END;
$do$