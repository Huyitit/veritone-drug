CREATE INDEX IF NOT EXISTS idx_recurring_schedule__scheduled_job_id ON recurring_schedule (scheduled_job_id);
COMMENT ON INDEX idx_recurring_schedule__scheduled_job_id IS 'Index used for retrieving the recurring schedule by the program or scheduled job';

CREATE INDEX IF NOT EXISTS idx_mention__exists_by_media ON mention (tracking_unit_id,media_id)
    WHERE media_source_type_id = 5;
COMMENT ON INDEX idx_mention__exists_by_media IS 'Used for if mention exists';