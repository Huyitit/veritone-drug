DO $FLYWWAY$
BEGIN
  IF (EXISTS (SELECT * 
              FROM INFORMATION_SCHEMA.TABLES 
              WHERE TABLE_SCHEMA = 'job_new' 
              AND  TABLE_NAME = 'task_2020_07_30')) THEN
    CREATE INDEX IF NOT EXISTS idx_task__lookup2_2020_07_30 ON job_new.task_2020_07_30 USING btree (job_id, created_date_time DESC);
  END IF;
END;
$FLYWWAY$