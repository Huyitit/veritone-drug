-- citest/structureddata.js

INSERT INTO data_registry_metadata (
    id,
    name,
    description,
    org_id,
    created_by,
    modified_by,
    created_at, 
    updated_at
) VALUES (
    '0c4769aa-adb1-4a33-afdd-b9d5caa99ae0',
    'test schema',
    'a test schema',
    14630,
    'a1449a30-2067-4e3e-abc7-49e9c147dd3d',
    'a1449a30-2067-4e3e-abc7-49e9c147dd3d',
    '2017-11-23 00:36:34.003',
    '2017-11-23 00:36:34.003'
)
ON CONFLICT DO NOTHING;

INSERT INTO data_registries (
    id,
    schema,
    ui_component,
    ttl_sec,
    description,
    org_id,
    created_by,
    modified_by,
    "createdAt",
    "updatedAt",
    data_registry_metadata_id,
    major_version,
    minor_version,
    status
) VALUES (
    '0c4769aa-adb1-4a33-afdd-b9d5caa99ae0',
    '{
        "$schema": "http://json-schema.org/draft-04/schema#"
    }',
    'test',
    30,
    'a test schema',
    14630,
    'a1449a30-2067-4e3e-abc7-49e9c147dd3d',
    'a1449a30-2067-4e3e-abc7-49e9c147dd3d',
    '2017-11-23 00:36:34.003',
    '2017-11-23 00:36:34.003',
    '0c4769aa-adb1-4a33-afdd-b9d5caa99ae0',
    1,
    0,
    'published'
)
ON CONFLICT DO NOTHING;
