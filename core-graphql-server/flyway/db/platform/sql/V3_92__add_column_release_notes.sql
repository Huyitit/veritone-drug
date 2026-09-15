-- AWT-5557
ALTER TABLE job_new.build
ADD COLUMN IF NOT EXISTS release_notes TEXT;

COMMENT ON COLUMN job_new.build.release_notes IS 'This column stores markdown language text for the engine build release notes';
