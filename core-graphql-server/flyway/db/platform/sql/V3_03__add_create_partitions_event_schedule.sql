-- Add the schedule for create_partitions event
INSERT INTO event_trigger.event_schedule (
    event_name,
    event_type,
    organization_id,
    application_id,
    payload,
    schedule,
    created_by,
    updated_by
) values (
    'create_partitions',
    'system',
    null,
    null,
    '{}',
    '0 * * * *',
    'ndthang',
    'ndthang'
);