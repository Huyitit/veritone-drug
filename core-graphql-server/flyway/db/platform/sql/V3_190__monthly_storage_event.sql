INSERT INTO event_trigger.event_triggers (
  organization_id,
  event_name,
  target_name,
  created_at_utc,
  updated_at_utc,
  updated_by,
  created_by,
  event_type
)
SELECT
  -1,
  'monthly_storage_lastrun_weekly_calc',
  'System',
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers WHERE event_name = 'monthly_storage_lastrun_weekly_calc' AND event_type = 'system'
);

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
    'monthly_storage_lastrun_weekly_calc',
    'system',
    null,
    null,
    '{}',
    '0 8 * * 6',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE event_name = 'monthly_storage_lastrun_weekly_calc' AND event_type = 'system'
);
