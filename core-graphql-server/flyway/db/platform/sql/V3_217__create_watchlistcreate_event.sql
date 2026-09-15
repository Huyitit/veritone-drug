DO $FLYWWAY$
BEGIN
    INSERT INTO event_trigger.event ( event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description )
        SELECT '79ff1372-7001-4f9c-aba1-fbcd9e3dc51a', 'WatchListCreated', 'watchlist', @@{ROOT_ORG_ID}@@, 'system',
    'message WatchListCreated {
       string tracking_unit_id = 10;
       int64 organization_id = 11;
    }',
	'9b197e0625a7fe0df9e3e038d43f119277ad6fc7c25dccbbd1d1911662a34de4', true, now(), now(), 'veritone', 'veritone', 'veritone event'
	WHERE NOT EXISTS ( SELECT 1 FROM event_trigger.event WHERE event_name = 'WatchListCreated' AND event_type = 'watchlist' AND application_id = 'system' );

END;
$FLYWWAY$
