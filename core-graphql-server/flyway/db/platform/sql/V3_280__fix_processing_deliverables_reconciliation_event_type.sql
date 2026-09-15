-- Fix event_type case mismatch introduced by V3_269__processing_deliverable_cron.sql.

UPDATE event_trigger.event_schedule
SET event_type = 'system',
    updated_by = 'flyway',
    updated_at_utc = now()
WHERE event_name = 'processing_deliverables_reconciliation'
  AND event_type IS DISTINCT FROM 'system';

UPDATE event_trigger.event_triggers
SET event_type = 'system',
    updated_by = 'flyway',
    updated_at_utc = now()
WHERE event_name = 'processing_deliverables_reconciliation'
  AND event_type IS DISTINCT FROM 'system';
