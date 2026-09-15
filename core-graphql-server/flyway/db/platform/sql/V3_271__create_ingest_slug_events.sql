DO $FLYWAY$
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
		'5f8c1a9b-3d4e-4a2f-8b6c-7e1d9f2c5a3b',
		'IngestSlugCreated',
		'ingest_slug',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message IngestSlugCreated {
			int64 media_source_id = 10;
			string file_uri = 11;
            string status = 12;
		}',
		'b4cae05762fdcd5aaaf59fd01c3f1722a22cf04304da0f262e42432203a4b44e',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'ingest slug created event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'IngestSlugCreated' AND event_type = 'ingest_slug' AND application_id = 'system'
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
		'6a9b2c8d-1e4f-5a3b-9c7e-2f1a8d6b4e5c',
		'IngestSlugUpdated',
		'ingest_slug',
		@@{ROOT_ORG_ID}@@,
		'system',
		'message IngestSlugUpdated {
			int64 media_source_id = 10;
			string file_uri = 11;
            string status = 12;
            string previous_status = 13;
		}',
		'2f8e9c7a1d5b3e6f9a2c4d7e1f5a8b3c6d9e2f1a5b8c1d4e7f0a3b6c9d2e5f',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'ingest slug updated event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'IngestSlugUpdated' AND event_type = 'ingest_slug' AND application_id = 'system'
	);

	-- Register IngestSlugCreated event to IngestionTopic
	INSERT INTO event_trigger.event_triggers (
		organization_id,
		event_name,
		consumer_directive,
		target_name,
		consumer_params,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		event_type
	) SELECT
		NULL,
		'ingest_slug_created',
		NULL,
		'IngestionTopic',
		NULL,
		now(),
		now(),
		'veritone',
		'veritone',
		NULL
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event_triggers 
		WHERE event_name = 'ingest_slug_created' 
		AND target_name = 'IngestionTopic'
	);

	-- Register IngestSlugUpdated event to IngestionTopic
	INSERT INTO event_trigger.event_triggers (
		organization_id,
		event_name,
		consumer_directive,
		target_name,
		consumer_params,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		event_type
	) SELECT
		NULL,
		'ingest_slug_updated',
		NULL,
		'IngestionTopic',
		NULL,
		now(),
		now(),
		'veritone',
		'veritone',
		NULL
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event_triggers 
		WHERE event_name = 'ingest_slug_updated' 
		AND target_name = 'IngestionTopic'
	);
END;
$FLYWAY$
