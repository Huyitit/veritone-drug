-- Add the schedule for granting the aiWARE Desktop package to all organizations
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
) 

SELECT
    'migrate_aiware_desktop_package_grant',
    'system',
    null,
    null,
    '{}',
    '0 0 * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'migrate_aiware_desktop_package_grant'
);

-- Add the trigger event for granting the aiWARE Desktop package to all organizations
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
  'migrate_aiware_desktop_package_grant', 
  'System', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'migrate_aiware_desktop_package_grant' AND event_type = 'system'
);

-- Add the trigger event for granting the aiWARE Desktop package to all organizations
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
  'migrate-aiware-desktop-package-grant-by-organization', 
  'AiwareDesktopPackageGrantMigration', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'migrate-aiware-desktop-package-grant-by-organization' AND event_type = 'system'
);
