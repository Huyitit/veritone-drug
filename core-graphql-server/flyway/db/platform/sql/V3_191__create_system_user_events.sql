DO $FLYWWAY$
BEGIN
	INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'4c8faf89-068a-4173-a67d-e5aebd955484',
		'UserCreated',
		'user',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message UserCreated {
			string service_name = 10;
			string event = 11;
			string type = 12;
			int64 organizationId = 13;
            string applicationId = 14;
            string userName = 15;
		}',
		'7bc574f4afd5b62582e506953859125c0a6e9e9ee5e233f74f6ad626f060ffc3',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'UserCreated' AND event_type = 'user' AND application_id = 'system'
	);

	INSERT INTO event_trigger.event (
    		event_id,
    		event_name,
    		event_type,
    		organization_id,
    		application_id,
    		schema_data,
    		schema_hash,
    		public,
    		created_at_utc,
    		updated_at_utc,
    		created_by,
    		updated_by,
    		description
    	) SELECT
    		'8025af6f-7424-4489-9287-5f29af00e7c2',
    		'UserDeleted',
    		'user',
    		@@{ROOT_ORG_ID}@@,
    		'system',
    		'message UserDeleted {
    			string service_name = 10;
    			string event = 11;
    			string type = 12;
    			int64 organizationId = 13;
                string applicationId = 14;
                string userName = 15;
    		}',
    		'bbaf914be82829dc59c987dee4203a398440c7d8200506a2f96ae0ca7b7bd9cb',
    		true,
    		now(),
    		now(),
    		'veritone',
    		'veritone',
    		'veritone event'
    	WHERE NOT EXISTS (
    		SELECT 1 FROM event_trigger.event WHERE event_name = 'UserDeleted' AND event_type = 'user' AND application_id = 'system'
    	);
END;
$FLYWWAY$
