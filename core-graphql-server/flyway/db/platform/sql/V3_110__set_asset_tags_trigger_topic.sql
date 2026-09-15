-- Send set_asset_tags event to dedicated topic
UPDATE event_trigger.event_triggers 
SET target_name = 'StorageTaggingTopic'
WHERE event_name = 'set_asset_tags' AND target_name = 'AssetsTopic';
