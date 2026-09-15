INSERT INTO event_trigger.event_schedule (
	event_name,
	event_type,
	payload,
	schedule,
	created_by,
	updated_by
)
SELECT 
	'subscription_cleanup',
	'system',
	'{"eventType": "job"}',
	'0 * * * *',
	'ndthang',
	'ndthang'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'subscription_cleanup'
);

INSERT INTO event_trigger.event_triggers (
	event_name,
	target_name,
	created_at_utc,
	updated_at_utc,
	created_by,
	updated_by,
	event_type
)
SELECT
	'subscription_cleanup',
	'System',
	NOW(),
	NOW(),
	'flyway',
	'flyway',
	'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers WHERE event_name = 'subscription_cleanup' AND target_name = 'System'
);