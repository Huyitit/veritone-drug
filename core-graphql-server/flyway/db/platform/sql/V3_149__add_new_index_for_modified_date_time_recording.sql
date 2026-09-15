CREATE INDEX CONCURRENTLY IF NOT EXISTS recording_modified_date_time_idx ON recording.recording USING btree (modified_date_time);
