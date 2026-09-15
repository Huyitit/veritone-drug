
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task__lookup2 ON job_new.task USING btree (job_id, created_date_time DESC);