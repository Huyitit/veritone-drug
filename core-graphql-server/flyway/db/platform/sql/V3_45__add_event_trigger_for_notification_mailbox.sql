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
  '*', 
  'NotificationMailbox', 
  now(),
  now(),
  'flyway',
  'flyway',
  'notification'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers WHERE event_name = '*' AND target_name = 'NotificationMailbox'
);