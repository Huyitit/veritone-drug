ALTER TABLE job_new.engine 
ADD COLUMN IF NOT exists single_engine_tdo_job_json JSONB NULL,
ADD COLUMN IF NOT exists single_engine_upload_job_json JSONB NULL;