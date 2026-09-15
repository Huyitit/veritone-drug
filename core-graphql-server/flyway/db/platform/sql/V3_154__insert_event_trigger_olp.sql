-- Add the trigger event to process some tasks when OLP feature is enabled in the existing organization.
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
  'olp_enabled_in_organization', 
  'OLPOrganizationTopic', 
  now(),
  now(),
  'flyway',
  'flyway',
  'olp-organization'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'olp_enabled_in_organization' AND event_type = 'olp-organization'
);

-- Add the trigger event to process some tasks when OLP feature is disabled in the existing organization.
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
  'olp_disabled_in_organization', 
  'OLPOrganizationTopic', 
  now(),
  now(),
  'flyway',
  'flyway',
  'olp-organization'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'olp_disabled_in_organization' AND event_type = 'olp-organization'
);

-- Add the trigger event to create user roles when an application is enabled in the OLP organization.
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
  'application_enabled_in_olp_organization', 
  'OLPOrganizationTopic', 
  now(),
  now(),
  'flyway',
  'flyway',
  'olp-organization'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'application_enabled_in_olp_organization' AND event_type = 'olp-organization'
);
