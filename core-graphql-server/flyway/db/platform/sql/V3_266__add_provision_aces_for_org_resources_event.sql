DO $$
DECLARE
  CREATED_BY CONSTANT VARCHAR := 'flyway';
  EVENT_TYPE_OLP CONSTANT VARCHAR := 'olp-organization';
  EVENT_NAME_PROVISION_ACES CONSTANT VARCHAR := 'provision_aces_for_org_resources';
BEGIN

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
  EVENT_NAME_PROVISION_ACES, 
  'OLPOrganizationTopic', 
  now(),
  now(),
  CREATED_BY,
  CREATED_BY,
  EVENT_TYPE_OLP
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = EVENT_NAME_PROVISION_ACES AND event_type = EVENT_TYPE_OLP
);

END $$;
