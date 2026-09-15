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
  'billing_rollup_calculation', 
  'System', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'billing_rollup_calculation' AND event_type = 'system'
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
) 
SELECT
    'billing_rollup_calculation',
    'system',
    null,
    null,
    '{}',
    '0 * * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'billing_rollup_calculation'
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
  'billing_calculate_storage', 
  'System', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'billing_calculate_storage' AND event_type = 'system'
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
) 
SELECT
    'billing_calculate_storage',
    'system',
    null,
    null,
    '{}',
    '0 * * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'billing_calculate_storage'
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
  'billing_calculate_storage_org', 
  'System', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'billing_calculate_storage_org' AND event_type = 'system'
);