DO $FLYWWAY$
BEGIN
    IF (NOT EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'share' 
                    AND  TABLE_NAME = 'shared_url_2020_01_01')) THEN
      CREATE TABLE share.shared_url_2020_01_01
      (
          -- Inherited from table public.shared_url: id text COLLATE pg_catalog."default" NOT NULL,
          -- Inherited from table public.shared_url: source_id text COLLATE pg_catalog."default" NOT NULL DEFAULT ''::text,
          -- Inherited from table public.shared_url: tdo_id text COLLATE pg_catalog."default" NOT NULL DEFAULT ''::text,
          -- Inherited from table public.shared_url: start_date_time timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone,
          -- Inherited from table public.shared_url: stop_date_time timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone,
          -- Inherited from table public.shared_url: start_offset_ms integer NOT NULL DEFAULT 0,
          -- Inherited from table public.shared_url: stop_offset_ms integer NOT NULL DEFAULT 0,
          -- Inherited from table public.shared_url: settings jsonb NOT NULL DEFAULT '{}'::jsonb,
          -- Inherited from table public.shared_url: service_name text COLLATE pg_catalog."default" NOT NULL,
          -- Inherited from table public.shared_url: media_type text COLLATE pg_catalog."default" NOT NULL,
          -- Inherited from table public.shared_url: scheduled_job_id text COLLATE pg_catalog."default" NOT NULL DEFAULT ''::text,
          -- Inherited from table public.shared_url: expire_date_time timestamp with time zone,
          -- Inherited from table public.shared_url: created_date_time timestamp with time zone NOT NULL DEFAULT now(),
          -- Inherited from table public.shared_url: modified_date_time timestamp with time zone NOT NULL DEFAULT now(),
          CONSTRAINT shared_url_2020_01_01_pkey PRIMARY KEY (id),
          CONSTRAINT shared_url_2020_01_01_no_duplicates UNIQUE (source_id, tdo_id, scheduled_job_id, start_date_time, stop_date_time, start_offset_ms, stop_offset_ms, settings, service_name, media_type)
      )
          INHERITS (public.shared_url)
      WITH (
          OIDS = FALSE
      )
      TABLESPACE pg_default;

      ALTER TABLE share.shared_url_2020_01_01
          OWNER to postgres;

      -- Index: idx_shared_url_2020_01_01_created_date_time

      -- DROP INDEX share.idx_shared_url_2020_01_01_created_date_time;

      CREATE INDEX idx_shared_url_2020_01_01_created_date_time
          ON share.shared_url_2020_01_01 USING btree
          (created_date_time ASC NULLS LAST)
          TABLESPACE pg_default;


      -- Trigger: update_date_modified

      -- DROP TRIGGER update_date_modified ON share.shared_url_2020_01_01;

      CREATE TRIGGER update_date_modified
          BEFORE UPDATE 
          ON share.shared_url_2020_01_01
          FOR EACH ROW
          EXECUTE PROCEDURE public.modified_date_time_modified_column();
    END IF;
END;
$FLYWWAY$