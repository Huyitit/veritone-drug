INSERT INTO data_registries (
    id,
    schema,
    org_id,
    created_by,
    modified_by,
    "createdAt",
    "updatedAt",
    data_registry_metadata_id,
    major_version,
    minor_version,
    status,
    storage_name
) VALUES (
    '5692a64a-472b-4188-b349-30c2c7e06919',
    '{
        "test": "citest",
        "properties": {
            "nested": true,
            "numbers": 1
        }
    }',
    7682,
    'f94d1303-6abd-49a5-9d98-fb93fb22d063',
    'f94d1303-6abd-49a5-9d98-fb93fb22d063',
    '2018-04-26 20:43:38.022',
    '2018-04-26 20:43:42.624',
    '6a73b269-5180-426a-900b-465021011b57',
    1,
    0,
    'published',
    'sdo_updated_ci_1_vbjhxietya'
)
ON CONFLICT DO NOTHING;
