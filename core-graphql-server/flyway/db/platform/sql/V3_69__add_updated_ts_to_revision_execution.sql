-- Alter Table

ALTER TABLE job_new.flow_revisions ADD COLUMN IF NOT EXISTS updated_date_time timestamptz NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE job_new.flow_executions ADD COLUMN IF NOT EXISTS updated_date_time timestamptz NULL DEFAULT CURRENT_TIMESTAMP;

-- Column comments

COMMENT ON COLUMN job_new.flow_revisions.updated_date_time IS 'Indicates last updated timestamp';
COMMENT ON COLUMN job_new.flow_executions.updated_date_time IS 'Indicates last updated timestamp';