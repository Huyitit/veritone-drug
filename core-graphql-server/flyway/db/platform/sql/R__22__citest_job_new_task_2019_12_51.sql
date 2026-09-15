DO $FLYWWAY$
BEGIN
    IF (NOT EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'job_new' 
                    AND  TABLE_NAME = 'task_2019_12_51')) THEN
        CREATE TABLE job_new.task_2019_12_51
        (
            -- Inherited from table job_new.task: task_id text COLLATE pg_catalog."default" NOT NULL,
            -- Inherited from table job_new.task: job_id text COLLATE pg_catalog."default" NOT NULL,
            -- Inherited from table job_new.task: application_id uuid NOT NULL,
            -- Inherited from table job_new.task: created_date_time integer DEFAULT date_part('epoch'::text, now()),
            -- Inherited from table job_new.task: queued_date_time integer,
            -- Inherited from table job_new.task: modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            -- Inherited from table job_new.task: completed_date_time integer,
            -- Inherited from table job_new.task: task_order integer,
            -- Inherited from table job_new.task: task_executor text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: task_executor_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: task_status text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: task_payload jsonb,
            -- Inherited from table job_new.task: task_output jsonb,
            -- Inherited from table job_new.task: recording_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: is_clone boolean NOT NULL DEFAULT false,
            -- Inherited from table job_new.task: engine_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: failure_type text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: task_log text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: source_asset_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: engine_price integer,
            -- Inherited from table job_new.task: customer_price integer,
            -- Inherited from table job_new.task: media_length_secs integer,
            -- Inherited from table job_new.task: media_storage_bytes integer,
            -- Inherited from table job_new.task: media_file_name text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: business_unit character varying(50) COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: build_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: rate_card_price integer,
            -- Inherited from table job_new.task: payload jsonb,
            -- Inherited from table job_new.task: test_task boolean,
            -- Inherited from table job_new.task: started_date_time integer,
            -- Inherited from table job_new.task: cancelled_date_time integer,
            -- Inherited from table job_new.task: asset_selector jsonb,
            -- Inherited from table job_new.task: is_template boolean DEFAULT false,
            -- Inherited from table job_new.task: job_pipeline_id uuid,
            -- Inherited from table job_new.task: correlation_id uuid,
            -- Inherited from table job_new.task: standby_for_task_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: parent_task_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.task: ended_date_time integer,
            -- Inherited from table job_new.task: task_executor_data jsonb,
            CONSTRAINT task_2019_12_51_pkey PRIMARY KEY (task_id),
            CONSTRAINT task_2019_12_51_created_date_time_check CHECK (created_date_time >= 1576454400 AND created_date_time < 1577059200),
            CONSTRAINT engine_id_not_null_check CHECK (engine_id IS NOT NULL)
        )
            INHERITS (job_new.task)
        WITH (
            OIDS = FALSE
        )
        TABLESPACE pg_default;

        ALTER TABLE job_new.task_2019_12_51
            OWNER to postgres;

        -- GRANT ALL ON TABLE job_new.task_2019_12_51 TO andymc;

        -- GRANT SELECT ON TABLE job_new.task_2019_12_51 TO yzhao;

        -- GRANT ALL ON TABLE job_new.task_2019_12_51 TO jtruong;

        -- GRANT SELECT ON TABLE job_new.task_2019_12_51 TO frobison;

        GRANT ALL ON TABLE job_new.task_2019_12_51 TO postgres;

        -- GRANT SELECT ON TABLE job_new.task_2019_12_51 TO readaccess;

        -- GRANT ALL ON TABLE job_new.task_2019_12_51 TO craths;

        -- GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE job_new.task_2019_12_51 TO readwrite;

        -- GRANT ALL ON TABLE job_new.task_2019_12_51 TO avershinin;

        -- GRANT ALL ON TABLE job_new.task_2019_12_51 TO piyengar;

        -- GRANT SELECT ON TABLE job_new.task_2019_12_51 TO external_users;

        -- GRANT SELECT ON TABLE job_new.task_2019_12_51 TO readonly;

        -- Index: job_new.task_2019_12_51@application_id,created_date_time,task_s

        -- DROP INDEX job_new."job_new.task_2019_12_51@application_id,created_date_time,task_s";

        CREATE INDEX "job_new.task_2019_12_51@application_id,created_date_time,task_s"
            ON job_new.task_2019_12_51 USING btree
            (application_id ASC NULLS LAST, created_date_time ASC NULLS LAST, task_status COLLATE pg_catalog."default" ASC NULLS LAST)
            TABLESPACE pg_default;


        -- Index: job_new.task_2019_12_51@created_date_time

        -- DROP INDEX job_new."job_new.task_2019_12_51@created_date_time";

        CREATE INDEX "job_new.task_2019_12_51@created_date_time"
            ON job_new.task_2019_12_51 USING btree
            (created_date_time ASC NULLS LAST)
            TABLESPACE pg_default;


        -- Index: job_new.task_2019_12_51@job_id

        -- DROP INDEX job_new."job_new.task_2019_12_51@job_id";

        CREATE INDEX "job_new.task_2019_12_51@job_id"
            ON job_new.task_2019_12_51 USING btree
            (job_id COLLATE pg_catalog."default" ASC NULLS LAST)
            TABLESPACE pg_default;


        -- Index: job_new.task_2019_12_51@modified_date_time

        -- DROP INDEX job_new."job_new.task_2019_12_51@modified_date_time";

        CREATE INDEX "job_new.task_2019_12_51@modified_date_time"
            ON job_new.task_2019_12_51 USING btree
            (modified_date_time ASC NULLS LAST)
            TABLESPACE pg_default;


        -- Index: job_new.task_2019_12_51@recording_id

        -- DROP INDEX job_new."job_new.task_2019_12_51@recording_id";

        CREATE INDEX "job_new.task_2019_12_51@recording_id"
            ON job_new.task_2019_12_51 USING btree
            (recording_id COLLATE pg_catalog."default" ASC NULLS LAST)
            TABLESPACE pg_default;
    END IF;
END;
$FLYWWAY$