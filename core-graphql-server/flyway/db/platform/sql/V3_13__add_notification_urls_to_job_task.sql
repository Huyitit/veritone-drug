ALTER TABLE job_new.job ADD IF NOT EXISTS notification_uris text ARRAY;
COMMENT ON COLUMN job_new.job.notification_uris IS 'this contains a list of URIs engine toolkit will send completed chunks.  This is for all tasks in job.';

ALTER TABLE job_new.task ADD IF NOT EXISTS notification_uris text ARRAY;
COMMENT ON COLUMN job_new.task.notification_uris IS 'this contains a list of URIs engine toolkit will send completed chunks';