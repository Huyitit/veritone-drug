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
    'elasticsearch_lifecycle_policy_validations',
    'system',
    null,
    null,
    '{
      "requiredIndices": [
        "k8s-agent-logs",
        "edge-controller-logs",
        "edge-storage-server-logs",
        "engine-agent-logs",
        "engines-logs",
        "config-loader-logs",
        "core-services-logs",
        "aiware-apps-logs",
        "hub-agent-logs",
        "redis-logs",
        "postgres-logs",
        "cluster-autoscaler-logs",
        "vault-logs",
        "nsq-logs",
        "nfs-logs",
        "nginx-logs",
        "aiware-catchall-logs",
        "v3-cache",
        "events"
      ]
    }',
    '0 0 * * *',
    'flyway',
    'flyway'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_schedule WHERE 
  event_name = 'elasticsearch_lifecycle_policy_validations'
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
  'elasticsearch_lifecycle_policy_validations', 
  'System', 
  now(),
  now(),
  'flyway',
  'flyway',
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM event_trigger.event_triggers 
  WHERE event_name = 'elasticsearch_lifecycle_policy_validations' AND event_type = 'system'
);