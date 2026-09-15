-- Add engine_build_upload -> EngineTopic trigger

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
  'engine_build_upload', 
  'EngineTopic', 
  now(),
  now(),
  'flyway',
  'flyway',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'engine_build_upload' AND target_name = 'EngineTopic'
);