CREATE TABLE IF NOT EXISTS public.media_source_storage (
	storage_id uuid NOT NULL,
	media_source_id int4 NULL,
	bucket text NULL,
	region text NULL,
	key_prefix text NULL,
	signed_url_ttl integer NULL,
	details jsonb NULL,
	external_credential_id text NULL,
	CONSTRAINT media_source_storage_pk PRIMARY KEY (storage_id),
	CONSTRAINT media_source__media_storage_fk FOREIGN KEY (media_source_id) REFERENCES public.media_source(media_source_id) ON DELETE CASCADE
);
