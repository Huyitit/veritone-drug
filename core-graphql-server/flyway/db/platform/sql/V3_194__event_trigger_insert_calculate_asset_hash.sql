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
  'calculate_asset_hash',
  'AssetsTopic',
  now(),
  now(),
  'flyway',
  'flyway',
  'asset'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers WHERE event_name = 'calculate_asset_hash' AND event_type = 'asset'
);