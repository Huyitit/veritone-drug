-- Add event set_asset_tags trigger
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
  'set_asset_tags', 
  'asset',
  'AssetsTopic', 
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'set_asset_tags' AND target_name = 'AssetsTopic'
);
