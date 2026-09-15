-- production hub clusters became unresponsive when the daily
-- migrate_aiware_desktop_package_grant scheduler emitted the entire backlog
-- in one burst, exhausting GQL platform-DB connections. The handler now
-- caps events per run via orgLimit; switch the schedule to every 30 minutes
-- so each small per-run budget finishes draining before the next run fires.
DO $$
DECLARE
  V_UPDATED_BY CONSTANT VARCHAR := 'flyway';
  V_EVENT_NAME CONSTANT VARCHAR := 'migrate_aiware_desktop_package_grant';
BEGIN

UPDATE event_trigger.event_schedule
SET schedule = '*/30 * * * *',
    updated_by = V_UPDATED_BY,
    updated_at_utc = now()
WHERE event_name = V_EVENT_NAME;

END $$;
