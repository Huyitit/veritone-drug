DO $$
BEGIN
	ALTER TABLE public.sso_user_role ADD COLUMN IF NOT EXISTS application_id uuid;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_fk_sso_user_role@application_id') THEN
        ALTER TABLE public.sso_user_role ADD CONSTRAINT "_fk_sso_user_role@application_id"
		  FOREIGN KEY (application_id) 
		  REFERENCES public.sso_application (application_id);
    END IF;
END;
$$;
