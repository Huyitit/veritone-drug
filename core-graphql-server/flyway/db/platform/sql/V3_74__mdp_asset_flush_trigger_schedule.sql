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
  'flush_mdp_asset_set',
  'AssetsTopic',
  now(),
  now(),
  'flyway',
  'flyway',
  'asset'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers WHERE event_name = 'flush_mdp_asset_set' AND event_type = 'asset'
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
    'flush_mdp_asset_set',
    'asset',
    null,
    null,
    '{}',
    '*/10 * * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
    event_name = 'flush_mdp_asset_set' AND event_type = 'asset'
);

