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
    'benchmark_engine_statistic',
    'benchmark',
    null,
    null,
    '{}',
    '0 * * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'benchmark_engine_statistic'
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
  'benchmark_engine_statistic', 
  'Benchmark', 
  now(),
  now(),
  'flyway',
  'flyway',
  'benchmark'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers WHERE event_name = 'benchmark_engine_statistic' AND event_type = 'benchmark'
);
