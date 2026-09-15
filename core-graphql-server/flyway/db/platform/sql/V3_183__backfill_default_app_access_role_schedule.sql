-- Add the schedule to backfill "Default App Access" roles with their application ID.
-- Run every day after 00:00
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
    'backfill_default_app_access_roles',
    'system',
    null,
    null,
    '{}',
    '0 0 * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'backfill_default_app_access_roles'
);

-- Add a trigger event to find and backfill "Default App Access" roles whose id differs from the application ID.
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
  'backfill_default_app_access_roles', 
  'System', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'backfill_default_app_access_roles' AND event_type = 'system'
);

-- Add the trigger event to backfill an "Default App Access" role id and its associated tables 
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
  'backfill_default_app_access_role_id', 
  'System', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'backfill_default_app_access_role_id' AND event_type = 'system'
);
