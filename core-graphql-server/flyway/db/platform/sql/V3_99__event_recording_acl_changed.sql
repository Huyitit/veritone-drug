-- Add recording_folder_changed -> RecordingsTopic trigger
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
  'recording_acl_changed',
  NULL,
  'RecordingsTopic',
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers
  WHERE event_name = 'recording_acl_changed' AND target_name = 'RecordingsTopic'
);
