
-- add event_trigger sendEmail
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
	event_type) 
VALUES (
	-1,
	'send_email',
	NULL,
	'SendEmail',
	NULL,
	now(),
	now(),
	'ndthang',
	'ndthang',
	NULL
)
ON CONFLICT(event_trigger_id) DO NOTHING;