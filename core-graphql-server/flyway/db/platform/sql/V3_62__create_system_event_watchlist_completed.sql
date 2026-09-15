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
		'bd0b168b-d1e6-4cad-923c-c535bf8e6886',
		'MentionGenerateWatchlistCompleted',
		'watchlist',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message MentionGenerateWatchlistCompleted {
			int64 watchlist_id = 10;
			uint32 mention_count = 16;
		}',
		'5189393cf72198b62884b17969a2f2faae6a0239f19687e71f7190e519204e49',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'MentionGenerateWatchlistCompleted' AND event_type = 'watchlist' AND application_id = 'system'
	);
END;
$FLYWWAY$