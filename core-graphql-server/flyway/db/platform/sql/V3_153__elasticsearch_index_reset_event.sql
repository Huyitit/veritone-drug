INSERT INTO event_trigger.event_schedule (
    event_name,
    event_type,
    organization_id,
    application_id,
    payload,
    schedule,
    created_by,
    updated_by
) 
SELECT
    'elasticsearch_reset_write_blocked_indexes',
    'system',
    null,
    null,
    '{}',
    '5 * * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'elasticsearch_reset_write_blocked_indexes'
);

INSERT INTO event_trigger.event_triggers (
  organization_id, 
  event_name,
  target_name,
  created_at_utc,
  updated_at_utc,
  updated_by,
  created_by,
  event_type
) SELECT 
  -1, 
  'elasticsearch_reset_write_blocked_indexes', 
  'System', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'elasticsearch_reset_write_blocked_indexes' AND event_type = 'system'
);