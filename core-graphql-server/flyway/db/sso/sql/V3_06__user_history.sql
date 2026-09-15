DO $FLYWAY$
BEGIN
    IF (NOT EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'public' 
                    AND  TABLE_NAME = 'user_history')) THEN
      CREATE TABLE public.user_history
      (
          user_id uuid NOT NULL,
          key text COLLATE pg_catalog."default" NOT NULL,
          value text COLLATE pg_catalog."default",
          CONSTRAINT "_pk_user_history@user_id,@key" PRIMARY KEY (user_id, key),
          CONSTRAINT user_history_user_id_fkey FOREIGN KEY (user_id)
              REFERENCES public.sso_user (user_id) MATCH SIMPLE
              ON UPDATE NO ACTION
              ON DELETE NO ACTION
      )
      WITH (
          OIDS = FALSE
      )
      TABLESPACE pg_default;

      ALTER TABLE public.user_history
          OWNER to postgres;
    END IF;
END;
$FLYWAY$


