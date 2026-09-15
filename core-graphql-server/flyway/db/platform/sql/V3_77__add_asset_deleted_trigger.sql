-- Add event asset_metadata_deleted trigger
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
  'asset_metadata_deleted', 
  'asset',
  'AssetsTopic', 
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'asset_metadata_deleted' AND target_name = 'AssetsTopic'
);

-- Add event mdp_asset_deleted trigger
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
  'mdp_asset_deleted', 
  'asset',
  'AssetsTopic', 
  now(),
  now(),
  'flyway',
  'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers
  WHERE event_name = 'mdp_asset_deleted' AND target_name = 'AssetsTopic'
);
