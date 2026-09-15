-- Send mdp_asset_deleted events to dedicated topic
UPDATE event_trigger.event_triggers 
SET target_name = 'StorageCleanupTopic'
WHERE event_name = 'mdp_asset_deleted' AND target_name = 'AssetsTopic'
