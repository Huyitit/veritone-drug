INSERT INTO event_trigger.event_triggers (event_name,consumer_directive,target_name,consumer_params,created_at_utc,updated_at_utc,created_by,updated_by,event_type) VALUES
('asset_metadata_updated',NULL,'AssetsTopic', null, now(), now(),'flyway','flyway','asset')
ON CONFLICT DO NOTHING;
