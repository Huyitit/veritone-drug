-- Add the schedule for refreshing the existing default permission sets.
-- Run every day after 00:00.
INSERT INTO event_trigger.event_schedule (
    event_name,
    event_type,
    organization_id,
    application_id,
    payload,
    schedule,
    created_by,
    updated_by
) SELECT
    'refresh_default_permission_sets',
    'olp-organization',
    null,
    null,
    '{}',
    '0 0 * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'refresh_default_permission_sets'
);

-- Add the trigger event to assigning new permission to existing default permission sets.
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
  'refresh_default_permission_sets', 
  'OLPOrganizationTopic', 
  now(),
  now(),
  'flyway',
  'flyway',
  'olp-organization'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'refresh_default_permission_sets' AND event_type = 'olp-organization'
);

-- Add the trigger event to assigning new permission to an existing permission set.
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
  'assign_permission_to_permission_set', 
  'OLPOrganizationTopic', 
  now(),
  now(),
  'flyway',
  'flyway',
  'olp-organization'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'assign_permission_to_permission_set' AND event_type = 'olp-organization'
);
