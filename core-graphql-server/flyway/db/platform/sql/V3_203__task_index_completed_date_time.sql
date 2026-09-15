CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_completed_date_time ON ONLY job_new.task USING btree (completed_date_time) WHERE completed_date_time IS NOT NULL;
