DO $FLYWAY$
BEGIN
  IF (NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'job_new' AND  TABLE_NAME = 'job_template'))
  THEN
    CREATE TABLE IF NOT EXISTS job_new.job_template (
      template_id text NOT NULL,
      application_id uuid NOT NULL,
      created_date_time int4 NULL DEFAULT date_part('epoch'::text, now()),
      modified_date_time int4 NULL DEFAULT date_part('epoch'::text, now()),
      deleted_date_time int4 NULL,
      cluster_id text NULL,
      client_application_id text NULL,
      correlation_id uuid NULL,
      scheduled_job_id text NULL,
      organization_id int4 NULL,
      job_config jsonb NULL,
      notification_uris _text NULL,
      CONSTRAINT "_pk_job_new@job_template_template_id" PRIMARY KEY (template_id)
    );
    ALTER TABLE job_new.job_template OWNER TO postgres;
    GRANT SELECT ON TABLE job_new.job_template TO readaccess;

    -- copy job templates from the job partitions

    INSERT INTO job_new.job_template (
      template_id,
      application_id,
      created_date_time,
      modified_date_time,
      deleted_date_time,
      cluster_id,
      client_application_id,
      correlation_id,
      scheduled_job_id,
      organization_id,
      job_config,
      notification_uris)
    SELECT
      job_id AS template_id,
      application_id,
      created_date_time,
      modified_date_time,
      deleted_date_time,
      cluster_id,
      client_application_id,
      correlation_id,
      scheduled_job_id,
      organization_id,
      job_config,
      notification_uris
    FROM
      job_new.job jj
    WHERE
      jj.is_template = true;    

    CREATE INDEX IF NOT EXISTS "_ix_job_new.job_template@application_id" ON job_new.job_template USING btree (application_id);
    CREATE INDEX IF NOT EXISTS "_ix_job_new.job_template@cluster_id" ON job_new.job_template USING btree (cluster_id);
    CREATE INDEX IF NOT EXISTS "_ix_job_new.job_template@created_date_time" ON job_new.job_template USING btree (created_date_time DESC);
    CREATE INDEX IF NOT EXISTS "_ix_job_new.job_template@modified_date_time" ON job_new.job_template USING btree (modified_date_time DESC);

  END IF;

  IF (NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'job_new' AND  TABLE_NAME = 'task_template')) 
  THEN
    CREATE TABLE IF NOT EXISTS job_new.task_template (
      task_template_id text NOT NULL,
      job_template_id text NOT NULL,
      application_id uuid NOT NULL,
      created_date_time int4 NULL DEFAULT date_part('epoch'::text, now()),
      modified_date_time int4 NULL DEFAULT date_part('epoch'::text, now()),
      task_payload jsonb NULL,
      engine_id text NULL,
      notification_uris _text NULL,
      CONSTRAINT "_pk_job_new.task_template@task_template_id" PRIMARY KEY (task_template_id)
    );
    
    ALTER TABLE job_new.task_template OWNER TO postgres;
    GRANT SELECT ON TABLE job_new.task_template TO readaccess;

    -- move task templates from the task partitions
    INSERT INTO job_new.task_template (
      task_template_id,
      job_template_id,
      application_id,
      created_date_time,
      modified_date_time,
      task_payload,
      engine_id,
      notification_uris)
    SELECT
      task_id AS task_template_id,
      job_id AS job_template_id,
      application_id,
      created_date_time,
      modified_date_time,
      task_payload ,
      engine_id,
      notification_uris
    FROM
      job_new.task jt
    WHERE
      jt.is_template = true;

    CREATE INDEX IF NOT EXISTS idx_task_template_created_date_time ON job_new.task_template USING btree (created_date_time DESC);
    CREATE INDEX IF NOT EXISTS idx_task_template_job_template_id ON job_new.task_template USING btree (job_template_id);
    CREATE INDEX IF NOT EXISTS idx_task_template_modified_date_time ON job_new.task_template USING btree (modified_date_time DESC);

  END IF;

END;
$FLYWAY$
