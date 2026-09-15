DO $FLYWAY$
BEGIN

    INSERT INTO event_trigger.event_triggers (event_name, target_name, created_at_utc, updated_at_utc, created_by, updated_by, event_type)
    SELECT 'check_api_token_user_assignment', 'System', NOW(), NOW(), 'flyway', 'flyway', 'system'
    WHERE NOT EXISTS(SELECT * FROM event_trigger.event_triggers WHERE event_name = 'check_api_token_user_assignment');

    INSERT INTO event_trigger.event_schedule (event_name, event_type, payload, schedule, created_by, updated_by)
    SELECT 'check_api_token_user_assignment', 'system', '{}'::jsonb, '0 0 0 * *', 'flyway', 'flyway'
    WHERE NOT EXISTS(SELECT * FROM event_trigger.event_schedule WHERE event_name = 'check_api_token_user_assignment');

END;
$FLYWAY$
