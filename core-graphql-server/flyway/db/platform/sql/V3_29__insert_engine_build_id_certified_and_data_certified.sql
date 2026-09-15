ALTER TABLE job_new.engine_certification ADD COLUMN IF NOT EXISTS build_id_certified varchar NULL;
ALTER TABLE job_new.engine_certification ADD COLUMN IF NOT EXISTS data_certified jsonb NULL;
