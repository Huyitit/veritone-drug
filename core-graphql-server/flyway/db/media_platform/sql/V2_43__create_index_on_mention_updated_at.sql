DO
$do$
BEGIN
	IF ('@@{NODE_ENV}@@' NOT IN ('prod', 'stage', 'dev', 'local', 'uk-prod') 
	AND NOT '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%.veritone.com%'
	AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NOT NULL))
	THEN
		-- create index for public.mention.update_at
		-- can not create index concurrently inside transaction block with if statements
		CREATE INDEX IF NOT EXISTS "_ix_mention@updated_at" ON public.mention (updated_at);
	END IF;
END;
$do$
