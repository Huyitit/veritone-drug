
ALTER TABLE job_new.dag_template OWNER TO postgres;
ALTER TABLE job_new.dag_template__organization OWNER TO postgres;

ALTER TABLE job_new.dag_template ADD COLUMN IF NOT EXISTS created_date integer DEFAULT date_part('epoch'::text, now());
ALTER TABLE job_new.dag_template ADD COLUMN IF NOT EXISTS updated_date integer DEFAULT date_part('epoch'::text, now());
ALTER TABLE job_new.dag_template ADD COLUMN IF NOT EXISTS deleted_date integer;


