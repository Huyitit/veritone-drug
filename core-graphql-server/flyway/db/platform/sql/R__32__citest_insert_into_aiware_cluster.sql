-- citests/scheduledJob.js

INSERT INTO aiware.cluster (
    cluster_id,
    organization_id,
    display_name,
    allowed_engines,
    secret_key,
    access_key,
    queue_credentials,
    docker_hub_credentials,
    paused,
    memory_size,
    cached_date,
    created_date,
    updated_date,
    storage_size,
    cluster_type,
    default_cluster,
    bypass_allowed_engines,
    is_public,
    is_group
) VALUES (
    'rt-deadbeef-0000-0001-0001-ba5eba111111',
    7682,
    'Default',
    '{9e611ad7-2d3b-48f6-a51b-0a1ba40feab4,c0e55cde-340b-44d7-bb42-2e0d65e98141,b88ca760-381a-471c-a089-e53894db881a,01e41442-758c-4602-9b85-e18b0fff7068}',
    '9AFB59B031F28B7ED5099D81F24BBF1416F1D55F',
    '5B94EF3CAB6FC4BD4F16',
    '{
        "clusterId": "59dd0df40e3986000d01fbf0",
        "clusterName": "E-prod-edge_-005962e9-4952-4251-8167-269859a4d26a",
        "clusterToken": "REDACTED_CLUSTER_TOKEN_VE23426"
    }',
    '{}',
    false,
    4294967300,
    1507660357,
    1507659252,
    1507659252,
    10737418240,
    'RT',
    true,
    true,
    true,
    false
)
ON CONFLICT DO NOTHING;