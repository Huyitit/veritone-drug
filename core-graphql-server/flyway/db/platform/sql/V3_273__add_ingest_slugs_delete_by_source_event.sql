-- Add the trigger event for ingest slugs deletion by source
INSERT INTO event_trigger.event_triggers (
  organization_id,
  event_name,
  target_name,
  created_at_utc,
  updated_at_utc,
  updated_by,
  created_by,
  event_type
)
SELECT
  -1,
  'ingest_slugs_delete_by_source',
  'System',
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers
  WHERE event_name = 'ingest_slugs_delete_by_source' AND event_type = 'system'
);
