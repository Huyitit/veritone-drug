DO $FLYWWAY$
BEGIN
    IF (NOT EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'job_new' 
                    AND  TABLE_NAME = 'job_2019_12_50')) THEN
        CREATE TABLE job_new.job_2019_12_50
        (
            -- Inherited from table job_new.job: job_id text COLLATE pg_catalog."default" NOT NULL,
            -- Inherited from table job_new.job: application_id uuid NOT NULL,
            -- Inherited from table job_new.job: recording_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.job: created_date_time integer DEFAULT date_part('epoch'::text, now()),
            -- Inherited from table job_new.job: modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            -- Inherited from table job_new.job: retries integer DEFAULT 0,
            -- Inherited from table job_new.job: deleted_date_time integer,
            -- Inherited from table job_new.job: cluster_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.job: bundle_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.job: source_asset_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.job: client_application_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.job: is_template boolean DEFAULT false,
            -- Inherited from table job_new.job: job_pipeline_id uuid,
            -- Inherited from table job_new.job: job_pipeline_stage integer,
            -- Inherited from table job_new.job: correlation_id uuid,
            -- Inherited from table job_new.job: skip_decider boolean,
            -- Inherited from table job_new.job: job_template_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.job: scheduled_job_id text COLLATE pg_catalog."default",
            -- Inherited from table job_new.job: organization_id integer,
            -- Inherited from table job_new.job: job_config jsonb,
            -- Inherited from table job_new.job: job_status text COLLATE pg_catalog."default",
            CONSTRAINT job_2019_12_50_pkey PRIMARY KEY (job_id),
            CONSTRAINT job_2019_12_50_created_date_time_check CHECK (created_date_time >= 1575849600 AND created_date_time < 1576454400),
            CONSTRAINT is_template_not_null CHECK (is_template IS NOT NULL)
        )
            INHERITS (job_new.job)
        WITH (
            OIDS = FALSE
        )
        TABLESPACE pg_default;

        ALTER TABLE job_new.job_2019_12_50
            OWNER to postgres;

        -- Index: job_new.job_2019_12_50@_ix_job_cluster_id

        -- DROP INDEX job_new."job_new.job_2019_12_50@_ix_job_cluster_id";

        CREATE INDEX "job_new.job_2019_12_50@_ix_job_cluster_id"
            ON job_new.job_2019_12_50 USING btree
            (cluster_id COLLATE pg_catalog."default")
            TABLESPACE pg_default;

        -- Index: job_new.job_2019_12_50@application_id

        -- DROP INDEX job_new."job_new.job_2019_12_50@application_id";

        CREATE INDEX "job_new.job_2019_12_50@application_id"
            ON job_new.job_2019_12_50 USING btree
            (application_id)
            TABLESPACE pg_default;

        -- Index: job_new.job_2019_12_50@application_id,created_date_time

        -- DROP INDEX job_new."job_new.job_2019_12_50@application_id,created_date_time";

        CREATE INDEX "job_new.job_2019_12_50@application_id,created_date_time"
            ON job_new.job_2019_12_50 USING btree
            (application_id, created_date_time)
            TABLESPACE pg_default;

        -- Index: job_new.job_2019_12_50@bundle_id

        -- DROP INDEX job_new."job_new.job_2019_12_50@bundle_id";

        CREATE INDEX "job_new.job_2019_12_50@bundle_id"
            ON job_new.job_2019_12_50 USING btree
            (bundle_id COLLATE pg_catalog."default")
            TABLESPACE pg_default;

        -- Index: job_new.job_2019_12_50@created_date_time

        -- DROP INDEX job_new."job_new.job_2019_12_50@created_date_time";

        CREATE INDEX "job_new.job_2019_12_50@created_date_time"
            ON job_new.job_2019_12_50 USING btree
            (created_date_time DESC)
            TABLESPACE pg_default;

        -- Index: job_new.job_2019_12_50@job_pipeline_id

        -- DROP INDEX job_new."job_new.job_2019_12_50@job_pipeline_id";

        CREATE INDEX "job_new.job_2019_12_50@job_pipeline_id"
            ON job_new.job_2019_12_50 USING btree
            (job_pipeline_id)
            TABLESPACE pg_default;

        -- Index: job_new.job_2019_12_50@modified_date_time

        -- DROP INDEX job_new."job_new.job_2019_12_50@modified_date_time";

        CREATE INDEX "job_new.job_2019_12_50@modified_date_time"
            ON job_new.job_2019_12_50 USING btree
            (modified_date_time)
            TABLESPACE pg_default;

        -- Index: job_new.job_2019_12_50@recording_id

        -- DROP INDEX job_new."job_new.job_2019_12_50@recording_id";

        CREATE INDEX "job_new.job_2019_12_50@recording_id"
            ON job_new.job_2019_12_50 USING btree
            (recording_id COLLATE pg_catalog."default")
            TABLESPACE pg_default;

        -- Index: job_new.job_2019_12_50@scheduled_job_id

        -- DROP INDEX job_new."job_new.job_2019_12_50@scheduled_job_id";

        CREATE INDEX "job_new.job_2019_12_50@scheduled_job_id"
            ON job_new.job_2019_12_50 USING btree
            (scheduled_job_id COLLATE pg_catalog."default")
            TABLESPACE pg_default;
    END IF;
END;
$FLYWWAY$
