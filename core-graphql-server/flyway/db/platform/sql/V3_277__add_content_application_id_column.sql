ALTER TABLE job_new.job
    ADD COLUMN IF NOT EXISTS content_application_id TEXT;

COMMENT ON COLUMN job_new.job.content_application_id IS 'This is used to store the value of X-Veritone-Application header for the job.';
