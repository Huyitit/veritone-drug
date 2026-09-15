-- Add the trigger event to export audit logs
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
    'audit_log_export_request',
    'AuditLogExport',
    now(),
    now(),
    'flyway',
    'flyway',
    'export'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers
  WHERE event_name = 'audit_log_export_request' AND event_type = 'export'
);
