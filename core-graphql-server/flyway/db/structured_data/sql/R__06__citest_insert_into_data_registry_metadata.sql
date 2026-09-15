-- citests/scheduledJob.js

INSERT INTO data_registry_metadata (
    id,
    name,
    description,
    source,
    org_id,
    created_at,
    updated_at
) VALUES (
    '7adfa472-2bad-4961-bd7d-2ec0ae8f4dab',
    'YouTube Source Schema',
    'YouTube Source Schema',
    'Internal',
    7682,
    current_timestamp,
    current_timestamp
)
ON CONFLICT DO NOTHING;

INSERT INTO data_registries (
    id,
    schema,
    org_id,
    "createdAt",
    "updatedAt",
    data_registry_metadata_id,
    major_version,
    minor_version,
    status,
    storage_name
) VALUES (
    'b926d3f1-7ecb-4b2f-bbea-38a3fcc88485',
    '{
        "type": "object",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "required": [
            "url"
        ],
        "properties": {
            "url": {
                "$id": "/properties/url",
                "type": "string",
                "title": "YouTube Channel URL",
                "pattern": "^((http|https)://)?(www.)?youtube.com/(channel/|user/)[a-zA-Z0-9-]{1,}"
            }
        }
    }',
    7682,
    current_timestamp,
    current_timestamp,
    '7adfa472-2bad-4961-bd7d-2ec0ae8f4dab',
    2,
    0,
    'published',
    'sdo_you_tube_so_1_5_gjj_389_qgf'
)
ON CONFLICT DO NOTHING;