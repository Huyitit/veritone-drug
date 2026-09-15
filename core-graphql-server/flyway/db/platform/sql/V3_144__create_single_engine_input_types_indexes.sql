-- AWT-9344
-- Create the updated index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engine__single_engine_upload_template_input_types
ON job_new.engine USING gin ((single_engine_upload_job_json->'supportedInputTypes'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engine__single_engine_tdo_template_input_types
ON job_new.engine USING gin ((single_engine_tdo_job_json->'supportedInputTypes'));
