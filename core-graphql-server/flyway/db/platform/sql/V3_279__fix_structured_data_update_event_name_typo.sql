UPDATE event_trigger.event_triggers
SET event_name = 'structured_data_update'
WHERE event_trigger_id = 5
  AND event_name IS DISTINCT FROM 'structured_data_update';
