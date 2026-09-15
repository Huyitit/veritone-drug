INSERT INTO event_trigger.event_triggers (organization_id,event_name,consumer_directive,target_name,consumer_params,created_at_utc,updated_at_utc,created_by,updated_by,event_type) VALUES
        (NULL,'asset_deleted',NULL,'AssetsTopic',NULL,NULL,NULL,'flyway','flyway','asset'),
        (NULL,'asset_updated',NULL,'AssetsTopic',NULL,NULL,NULL,'flyway','flyway','asset'),
        (NULL,'recording_updated',NULL,'RecordingsTopic',NULL,NULL,NULL,'flyway','flyway','recording');

INSERT INTO event_trigger.event ( event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'RecordingUpdated', 'recording', @@{ROOT_ORG_ID}@@, 'system',
'message RecordingUpdated {
     string recording_id = 10;
 }',
	'10ed7c60f5716fc3795f84cfbe776ac7b1e15bd4b90f0560064b8c76eea96e94', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'RecordingUpdated' AND event_type = 'recording' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'AssetDeleted', 'asset', @@{ROOT_ORG_ID}@@, 'system',
'message AssetDeleted  {
    string asset_id = 10;
    string recording_id = 11;
 }',
	'df2459933a415f0f7e1d64ef204f41c437fd60bafa6b5147c33f3ee6f84f7181', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'AssetDeleted' AND event_type = 'asset' AND application_id = 'system' );

INSERT INTO event_trigger.event ( event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
	SELECT 'AssetUpdated', 'asset', @@{ROOT_ORG_ID}@@, 'system',
'message AssetUpdated  {
    string asset_id = 10;
    string recording_id = 11;
 }',
	'b5f76433bca4df603ff04a54f685ecaa250c858c634dc927b9c62e8c9a4f77e0', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'AssetUpdated' AND event_type = 'asset' AND application_id = 'system' );

