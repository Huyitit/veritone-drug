ALTER TABLE job_new.engine_certification 
ADD COLUMN IF NOT EXISTS is_certified BOOLEAN NOT NULL DEFAULT false;