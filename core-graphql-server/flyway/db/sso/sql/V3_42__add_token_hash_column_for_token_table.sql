-- Add the hash column to sso_token table
-- ALTER TABLE public.sso_token 
-- 	ADD COLUMN IF NOT EXISTS token_hash TEXT GENERATED ALWAYS AS (encode(sha256(token_id::bytea), 'hex')) STORED;

-- The GENERATED column only be supported from postgres 12+, but current version of PostgresSQL is 11 on dev/stage/us-prod
-- Even though built-in generated columns are new to version 12 of PostgreSQL. 
-- The functionally can still be achieved in earlier versions, it just needs a bit more setup with stored procedures and triggers.
DO $$
BEGIN
	ALTER TABLE public.sso_token 
		ADD COLUMN IF NOT EXISTS token_hash TEXT NULL;

	UPDATE public.sso_token
	SET token_hash = (encode(sha256(token_id::bytea), 'hex'));


	CREATE OR REPLACE FUNCTION public.generated_token_hash_function()
	RETURNS trigger
	LANGUAGE plpgsql
	IMMUTABLE
	AS $function$
	BEGIN
			-- This statement mimics the ERROR on built in pg12+ GENERATED columns to refuse INSERTS on the column and return an ERROR.
			IF (TG_OP = 'INSERT') THEN
					IF (NEW.token_hash IS NOT NULL) THEN
							RAISE EXCEPTION 'ERROR:  cannot insert into column "token_hash"' USING DETAIL = 'Column "token_hash" is a generated column.';
					END IF;
			END IF;
	
			-- This statement mimics the ERROR on built in pg12+ GENERATED columns to refuse UPDATES on the column and return an ERROR.
			IF (TG_OP = 'UPDATE') THEN
					-- Below, IS DISTINCT FROM is used because it treats nulls like an ordinary value. 
					IF (NEW.token_hash::TEXT IS DISTINCT FROM OLD.token_hash::TEXT) THEN
							RAISE EXCEPTION 'ERROR:  cannot update column "token_hash"' USING DETAIL = 'Column "token_hash" is a generated column.';
					END IF;
			END IF;
	
			NEW.token_hash := (encode(sha256(NEW.token_id::bytea), 'hex'));
			RETURN NEW;
	END;
	$function$;
	
	CREATE TRIGGER generated_token_hash_trigger BEFORE INSERT OR UPDATE ON public.sso_token FOR EACH ROW EXECUTE PROCEDURE public.generated_token_hash_function();
END;
$$;
