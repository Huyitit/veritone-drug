-- Add application audit events -> ApplicationAuditTopic trigger

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
  'organization_application_changed', 
  'application_audit',
  'ApplicationAuditTopic', 
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'organization_application_changed' AND target_name = 'ApplicationAuditTopic'
);

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
  'user_application_role_changed', 
  'application_audit',
  'ApplicationAuditTopic', 
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'user_application_role_changed' AND target_name = 'ApplicationAuditTopic'
);