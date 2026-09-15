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
    'update_legacy_encryption_for_open_id_providers',
    'system',
    null,
    null,
    '{}',
    '0 0 * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE
    event_name = 'update_legacy_encryption_for_open_id_providers' AND event_type = 'system'
);

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
  'update_legacy_encryption_for_open_id_providers',
  'System',
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers WHERE event_name = 'update_legacy_encryption_for_open_id_providers' AND event_type = 'system'
);
