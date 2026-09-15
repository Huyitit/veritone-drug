-- Define constants to avoid duplication
DO $$
DECLARE
  CREATED_BY CONSTANT VARCHAR := 'flyway';
  EVENT_TYPE_STRUCTURED_DATA CONSTANT VARCHAR := 'structuredData';
  EVENT_TYPE_SYSTEM CONSTANT VARCHAR := 'system';
  EVENT_BACKFILL_SDO_RBAC CONSTANT VARCHAR := 'backfill_sdo_rbac_groups';
BEGIN

-- Add the trigger event for updating OLP permissions on SDO elasticsearch documents when ACEs change
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
  'sdo_acl_changed', 
  'StructuredDataTopic', 
  now(),
  now(),
  CREATED_BY,
  CREATED_BY,
  EVENT_TYPE_STRUCTURED_DATA
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'sdo_acl_changed' AND event_type = EVENT_TYPE_STRUCTURED_DATA
);

-- Add the schedule to backfill all ES documents that are not OLP stamped
-- Run once a day
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
    EVENT_BACKFILL_SDO_RBAC,
    EVENT_TYPE_SYSTEM,
    null,
    null,
    '{}',
    '0 0 * * *',  -- At 00:00 on every day
    CREATED_BY,
    CREATED_BY
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = EVENT_BACKFILL_SDO_RBAC
);

-- Add a trigger event to backfill all ES documents that are not OLP stamped
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
  EVENT_BACKFILL_SDO_RBAC,
  'System', 
  now(),
  now(),
  CREATED_BY,
  CREATED_BY,
  EVENT_TYPE_SYSTEM
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = EVENT_BACKFILL_SDO_RBAC AND event_type = EVENT_TYPE_SYSTEM
);

END $$;