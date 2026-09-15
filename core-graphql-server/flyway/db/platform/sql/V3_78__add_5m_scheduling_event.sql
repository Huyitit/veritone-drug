-- Add the schedule for scheduler_app_org_5m event

INSERT INTO event_trigger.event_schedule(
     event_name,
     event_type,
     organization_id,
     application_id,
     payload,
     schedule,
     created_by,
     updated_by)
SELECT 'scheduler_app_org_5m',
       'system',
       7682,
       'system',
       '{"id": "${uuid}", "sequenceNum": 0}',
       '*/5 * * * *',
       'flyway',
       'flyway'
WHERE NOT EXISTS(
        SELECT 1
        FROM event_trigger.event_schedule
        WHERE event_name = 'scheduler_app_org_5m'
          AND event_type = 'system'
    );
