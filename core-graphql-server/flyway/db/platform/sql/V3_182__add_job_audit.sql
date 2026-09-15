-- create enum type for the action column of job_audit table
DROP TYPE IF EXISTS job_new.job_audit_action_enum CASCADE;
CREATE TYPE job_new.job_audit_action_enum AS ENUM ('create', 'update');
ALTER TYPE job_new.job_audit_action_enum OWNER TO postgres;

CREATE TABLE IF NOT EXISTS job_new.job_audit (
  job_id TEXT NOT NULL,
  action job_new.job_audit_action_enum NOT NULL,
  action_params jsonb,
  actor UUID NOT NULL,
  organization_id INTEGER NOT NULL,
  timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT unq_job_audit_id UNIQUE (job_id, timestamp)
);
ALTER TABLE job_new.job_audit OWNER TO postgres;

CREATE INDEX IF NOT EXISTS "_ix_job_audit@job_id" ON job_new.job_audit USING btree (job_id);
