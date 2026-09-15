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
		'1262f98c-6f71-47f1-aca6-764830de7f56',
		'NewVersionAvailable',
		'platformEvent',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message NewVersionAvailable {
			string version = 10;
			string version_id = 11;
			string installed_at = 12;
			string created_at = 13;
			string created_by = 14;
		}',
		'04403dc064ce24ff938a3cd8b68cdb730c513637fd61c07c11c3736c08a274ce',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'NewVersionAvailable' AND event_type = 'platformEvent' AND application_id = 'system'
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
		'6c0c3d89-50f5-4736-a522-bcbc13bd7e79',
		'NewVersionInstalled',
		'platformEvent',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message NewVersionInstalled {
			string version = 10;
			string version_id = 11;
			string installed_at = 12;
			string installed_by = 13;
		}',
		'183940488f2531c30c8947aceabd5daab2075d41a01d2753efb4765f7a656377',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'NewVersionInstalled' AND event_type = 'platformEvent' AND application_id = 'system'
	);
END;
$FLYWWAY$