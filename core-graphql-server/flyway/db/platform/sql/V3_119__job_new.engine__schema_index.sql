CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engine__schema_engine_id ON job_new.engine__schema (engine_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engine__schema_schema_id ON job_new.engine__schema (schema_id);
