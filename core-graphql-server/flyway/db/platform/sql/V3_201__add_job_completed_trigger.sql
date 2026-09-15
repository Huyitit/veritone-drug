
INSERT INTO event_trigger.event_triggers (
  organization_id,
  event_name,
  target_name,
  created_at_utc,
  updated_at_utc,
  updated_by,
  created_by,
  event_type
)
SELECT
  -1,
  'job_completed',
  'JobTopic',
  now(),
  now(),
  'flyway',
  'flyway',
  'job'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers WHERE event_name = 'job_completed' AND event_type = 'job' AND target_name = 'JobTopic'
);