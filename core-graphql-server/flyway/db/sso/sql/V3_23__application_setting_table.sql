DO $$
BEGIN
	ALTER TABLE public.user_setting ADD COLUMN IF NOT EXISTS application_id uuid DEFAULT NULL;

	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_fk_user_setting__application_id') then
		ALTER TABLE public.user_setting ADD CONSTRAINT _fk_user_setting__application_id 
			FOREIGN KEY (application_id) 
			REFERENCES public.application(application_id);
	END IF;
	
	CREATE TABLE IF NOT EXISTS public.application__organization_setting (
		application_id uuid NOT NULL,
	  organization_guid uuid NOT NULL,
		"key" text NOT NULL,
		"type" text NOT NULL,
		description text NULL,
		value text NULL,
		CONSTRAINT "_pk_application__organization_setting@application_id,@organization_guid,@key" PRIMARY KEY (application_id, organization_guid, key)
	);
	CREATE INDEX IF NOT EXISTS "_ix_application__organization_setting@organization_guid" ON public.application__organization_setting USING btree (organization_guid);
	CREATE INDEX IF NOT EXISTS "_ix_application__organization_setting@key" ON public.application__organization_setting USING btree (key);
	ALTER TABLE public.application__organization_setting OWNER TO postgres;
	GRANT SELECT ON TABLE public.application__organization_setting TO readaccess;
END;
$$;