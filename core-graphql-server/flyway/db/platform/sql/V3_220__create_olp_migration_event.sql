DO $FLYWWAY$
BEGIN
    INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
        SELECT '6953b4c4-6eb6-4130-a04d-a10cce3f6f59', 'olpMigration', 'organization', @@{ROOT_ORG_ID}@@, 'system',
    'message OlpMigration {
       int64 organization_id = 10;
       bool olp_migration = 11;
    }',
	'2116a43c5d9d72459ed56d74107eae8dda1fe9dfa5a699e9b963c2a880118413', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'olpMigration' AND event_type = 'organization' AND application_id = 'system' );

END;
$FLYWWAY$
