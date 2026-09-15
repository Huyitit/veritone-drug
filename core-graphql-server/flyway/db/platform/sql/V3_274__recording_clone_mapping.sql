CREATE TABLE IF NOT EXISTS recording.recording_clone__tdo (
  clone_id text NOT NULL,
  original_recording_id text NOT NULL,
  cloned_recording_id text NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  PRIMARY KEY (clone_id, original_recording_id),
  FOREIGN KEY (clone_id) REFERENCES recording.recording_clone(clone_id)
    ON DELETE CASCADE
);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION recording.update_recording_clone__tdo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recording_clone__tdo_updated_at
  BEFORE UPDATE ON recording.recording_clone__tdo
  FOR EACH ROW EXECUTE FUNCTION recording.update_recording_clone__tdo_updated_at();

CREATE INDEX IF NOT EXISTS "_ix_recording.recording_clone__tdo@clone_id" 
ON recording.recording_clone__tdo USING btree (clone_id);

CREATE INDEX IF NOT EXISTS "_ix_recording.recording_clone__tdo@cloned_recording_id" 
ON recording.recording_clone__tdo USING btree (cloned_recording_id);

CREATE INDEX IF NOT EXISTS "_ix_recording.recording_clone__tdo@original_recording_id" 
ON recording.recording_clone__tdo USING btree (original_recording_id);

CREATE INDEX IF NOT EXISTS "_ix_recording.recording_clone@created_date_time" ON recording.recording_clone(created_date_time DESC);