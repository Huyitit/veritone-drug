DO $$
DECLARE
  CREATED_BY CONSTANT VARCHAR := 'flyway';
  EVENT_TYPE_OLP CONSTANT VARCHAR := 'olp-organization';
  EVENT_NAME_SCHEDULE CONSTANT VARCHAR := 'backfill_user_root_default_aces';
  EVENT_NAME_PROCESS_ORG CONSTANT VARCHAR := 'backfill_user_root_aces_for_org';
BEGIN

-- Add the schedule to populate rbac folders hourly
-- Run every hour at minute 0 to process small batches
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
    EVENT_NAME_SCHEDULE,
    EVENT_TYPE_OLP,
    null,
    null,
    '{}',
    '0 * * * *',
    CREATED_BY,
    CREATED_BY
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = EVENT_NAME_SCHEDULE
);

-- Add a trigger event for the scheduler (main event)
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
  EVENT_NAME_SCHEDULE, 
  'OLPOrganizationTopic', 
  now(),
  now(),
  CREATED_BY,
  CREATED_BY,
  EVENT_TYPE_OLP
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = EVENT_NAME_SCHEDULE AND event_type = EVENT_TYPE_OLP
);

-- Add the trigger event to process folders for an org
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
  EVENT_NAME_PROCESS_ORG, 
  'OLPOrganizationTopic', 
  now(),
  now(),
  CREATED_BY,
  CREATED_BY,
  EVENT_TYPE_OLP
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = EVENT_NAME_PROCESS_ORG AND event_type = EVENT_TYPE_OLP
);

END $$;