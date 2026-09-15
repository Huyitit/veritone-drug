-- Add a new column to replace the media_storage_bytes column for storing int8 data.
ALTER TABLE job_new.task ADD COLUMN IF NOT EXISTS media_storage_bytes_new BIGINT;
COMMENT ON COLUMN job_new.task.media_storage_bytes_new IS 'this replaces the media_storage_bytes column for storing int8 data';
