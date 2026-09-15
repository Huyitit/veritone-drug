-- Add scheduler_app_org_5m event AppEvent trigger
INSERT INTO event_trigger.event_triggers (
  organization_id, 
  event_name,
  event_type,
  target_name,
  created_at_utc,
  updated_at_utc,
  updated_by,
  created_by
) SELECT 
  -1, 
  'scheduler_app_org_5m',
  'system',
  'AppEventTopic',
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers
  WHERE event_name = 'scheduler_app_org_5m' AND target_name = 'AppEventTopic'
);
