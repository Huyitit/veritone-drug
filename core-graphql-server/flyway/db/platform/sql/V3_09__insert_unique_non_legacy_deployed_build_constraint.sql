CREATE UNIQUE INDEX IF NOT EXISTS _ix_one_non_legacy_deployed_build_per_engine
  ON job_new.build (engine_id, build_state, is_legacy) 
  WHERE build_state = 'deployed' AND is_legacy = false;
