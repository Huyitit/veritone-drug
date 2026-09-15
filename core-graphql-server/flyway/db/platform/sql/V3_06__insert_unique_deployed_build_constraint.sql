CREATE UNIQUE INDEX IF NOT EXISTS _ix_one_deployed_build_per_engine ON job_new.build (engine_id, build_state) WHERE build_state = 'deployed';
