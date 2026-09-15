INSERT INTO data_registry_metadata (
    id,
    name,
    description,
    source,
    org_id,
    created_by,
    modified_by,
    created_at,
    updated_at
) VALUES (
    '6a73b269-5180-426a-900b-465021011b57',
    'updated citest name',
    'updated citest description',
    'Some other url',
    7682,
    'f94d1303-6abd-49a5-9d98-fb93fb22d063',
    'f94d1303-6abd-49a5-9d98-fb93fb22d063',
    '2018-04-26 20:43:36.518',
    '2018-04-26 20:43:36.938'
)
ON CONFLICT DO NOTHING;