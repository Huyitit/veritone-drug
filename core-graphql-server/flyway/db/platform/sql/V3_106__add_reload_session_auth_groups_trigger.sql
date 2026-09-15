-- Add event reload_session_auth_groups trigger
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
  'reload_session_auth_groups', 
  'session',
  'SessionsTopic', 
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'reload_session_auth_groups' AND target_name = 'SessionsTopic'
);

-- Add event reload_session_users trigger
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
  'reload_session_users', 
  'session',
  'SessionsTopic', 
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'reload_session_users' AND target_name = 'SessionsTopic'
);
