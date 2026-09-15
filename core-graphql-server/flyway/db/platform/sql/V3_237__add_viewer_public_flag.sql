-- Add column with default TRUE to backfill existing rows
ALTER TABLE job_new.viewer ADD COLUMN IF NOT EXISTS "is_public" BOOLEAN DEFAULT true NOT NULL;
-- Reset default to FALSE for future inserts
ALTER TABLE job_new.viewer ALTER COLUMN "is_public" SET DEFAULT false;
-- Add comment
COMMENT ON COLUMN job_new.viewer.is_public IS 
'A flag indicating whether the viewer is publicly accessible across all organizations';
