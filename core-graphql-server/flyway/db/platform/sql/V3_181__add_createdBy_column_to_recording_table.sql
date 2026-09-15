ALTER TABLE recording.recording ADD COLUMN IF NOT EXISTS created_by uuid NULL;
ALTER TABLE recording.recording ADD COLUMN IF NOT EXISTS modified_by uuid NULL;
