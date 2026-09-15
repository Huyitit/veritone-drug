CREATE TABLE IF NOT EXISTS job_new.job_dag_template (
    job_id text NOT NULL,
    dag_template_id text NOT NULL,
    created_date_time int4 NULL DEFAULT date_part('epoch'::text, now()),
    modified_date_time int4 NULL DEFAULT date_part('epoch'::text, now())
);

ALTER TABLE job_new.job_dag_template
    ADD CONSTRAINT job_dag_template_pkey PRIMARY KEY (job_id, dag_template_id);

-- Add a unique constraint for job_id
ALTER TABLE job_new.job_dag_template
    ADD CONSTRAINT job_dag_template_job_id_unique UNIQUE (job_id);
