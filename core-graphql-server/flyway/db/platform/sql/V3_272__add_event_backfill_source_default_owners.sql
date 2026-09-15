DO $$
DECLARE
    CREATED_BY CONSTANT VARCHAR := 'flyway';
    EVENT_NAME_SCHEDULE CONSTANT VARCHAR := 'backfill_source_default_owners';
    EVENT_NAME_PROCESS_ORG CONSTANT VARCHAR := 'backfill_source_default_owners_for_org';
    EVENT_TYPE_SYSTEM CONSTANT VARCHAR := 'system';
    TARGET_TOPIC CONSTANT VARCHAR := 'System';
BEGIN
    INSERT INTO event_trigger.event_schedule (
        event_name,
        event_type,
        organization_id,
        application_id,
        payload,
        schedule,
        created_by,
        updated_by
    )
    SELECT
        EVENT_NAME_SCHEDULE,
        EVENT_TYPE_SYSTEM,
        null,
        null,
        '{}',
        '0 * * * *',
        CREATED_BY,
        CREATED_BY
    WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_schedule
        WHERE event_name = EVENT_NAME_SCHEDULE
    );

    INSERT INTO event_trigger.event_triggers (
        organization_id,
        event_name,
        target_name,
        created_at_utc,
        updated_at_utc,
        updated_by,
        created_by,
        event_type
    ) SELECT
          -1,
          EVENT_NAME_SCHEDULE,
          TARGET_TOPIC,
          now(),
          now(),
          CREATED_BY,
          CREATED_BY,
          EVENT_TYPE_SYSTEM
    WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers
        WHERE event_name = EVENT_NAME_SCHEDULE AND event_type = EVENT_TYPE_SYSTEM
    );

    INSERT INTO event_trigger.event_triggers (
        organization_id,
        event_name,
        target_name,
        created_at_utc,
        updated_at_utc,
        updated_by,
        created_by,
        event_type
    ) SELECT
          -1,
          EVENT_NAME_PROCESS_ORG,
          TARGET_TOPIC,
          now(),
          now(),
          CREATED_BY,
          CREATED_BY,
          EVENT_TYPE_SYSTEM
    WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers
        WHERE event_name = EVENT_NAME_PROCESS_ORG AND event_type = EVENT_TYPE_SYSTEM
    );
END $$;