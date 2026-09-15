ALTER TABLE job_new.flow_executions
ADD COLUMN IF NOT EXISTS run_mode TEXT default NULL;

COMMENT ON COLUMN job_new.flow_executions.run_mode IS 'Run Mode context of where this flow was ran(Studio, Engine, Service, AUF, etc)';