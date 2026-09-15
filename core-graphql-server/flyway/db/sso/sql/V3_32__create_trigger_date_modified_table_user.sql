CREATE OR REPLACE FUNCTION public.update_date_modified_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	NEW.date_modified = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$;

DO $$
BEGIN
   
   	ALTER FUNCTION public.update_date_modified_column() OWNER TO postgres;
   
   	IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_date_modified') THEN
        CREATE TRIGGER update_date_modified BEFORE UPDATE ON public.sso_user 
  			FOR EACH ROW EXECUTE PROCEDURE public.update_date_modified_column();
    END IF;
END;
$$;