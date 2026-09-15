DO $FLYWAY$
BEGIN

    INSERT INTO event_trigger.event_triggers (event_name, target_name, created_by, updated_by, event_type)
    SELECT 'create_or_check_public_engine_package', 'System', 'flyway', 'flyway', 'system'
    WHERE NOT EXISTS(SELECT * FROM event_trigger.event_triggers WHERE event_name = 'create_or_check_public_engine_package');

    INSERT INTO event_trigger.event_schedule (event_name, event_type, payload, schedule, created_by, updated_by)
    SELECT 'create_or_check_public_engine_package', 'system', '{"name":"publicEngine","version":"1.0","organizationId":@@{ROOT_ORG_ID}@@}'::jsonb, '0 0 0 * *', 'flyway', 'flyway'
    WHERE NOT EXISTS(SELECT * FROM event_trigger.event_schedule WHERE event_name = 'create_or_check_public_engine_package');


    -- Give environmental routing rules
    UPDATE event_trigger.event_triggers SET 
        consumer_params = jsonb_set((CASE WHEN consumer_params IS NULL THEN '{}'::json ELSE consumer_params END)::jsonb, '{name}', '"publicEngine"'::jsonb)::json
    WHERE event_name = 'engine_build_deploy_success';

    UPDATE event_trigger.event_triggers SET 
        consumer_params = jsonb_set((CASE WHEN consumer_params IS NULL THEN '{}'::json ELSE consumer_params END)::jsonb, '{organizationId}', '@@{ROOT_ORG_ID}@@'::jsonb)::json
    WHERE event_name = 'engine_build_deploy_success';

END;
$FLYWAY$
