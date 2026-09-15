UPDATE event_trigger.event_schedule
SET schedule = '/5 * * * *'
WHERE event_name = 'elasticsearch_reset_write_blocked_indexes';
