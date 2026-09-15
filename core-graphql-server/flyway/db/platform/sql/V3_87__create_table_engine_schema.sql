-- AWT-5378, AWT-5377
DROP TYPE IF EXISTS job_new.input_output CASCADE;
CREATE TYPE job_new.input_output AS ENUM ('input','output','both');

CREATE TABLE IF NOT EXISTS job_new.engine__schema (
   engine_id text NOT NULL,
   schema_id text NOT NULL,
   io_type job_new.input_output NOT NULL DEFAULT 'both'
);
COMMENT ON TABLE job_new.engine__schema IS 'Table for engine and schema relationship';

DROP TYPE IF EXISTS job_new.distribution_type CASCADE;
CREATE TYPE job_new.distribution_type AS ENUM ('public','instance_locked','org_locked');

ALTER TABLE job_new.engine
ADD COLUMN IF NOT EXISTS distribution_type job_new.distribution_type NOT NULL DEFAULT 'instance_locked';

UPDATE job_new.engine
SET distribution_type = 'public'  where
is_public = true AND distribution_type <> 'public';

UPDATE job_new.engine
SET distribution_type = 'instance_locked' where
is_public = false AND distribution_type <> 'instance_locked';
