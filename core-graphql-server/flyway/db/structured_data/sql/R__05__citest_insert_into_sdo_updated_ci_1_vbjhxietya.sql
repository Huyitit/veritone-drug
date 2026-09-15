INSERT INTO sdo_updated_ci_1_vbjhxietya (
    id,
    data_registry_id,
    data,
    created_by,
    modified_by,
    organization_id,
    application_id,
    "createdAt",
    "updatedAt"
)
SELECT
    '6a73b269-5180-426a-900b-465021011b57',
    '5692a64a-472b-4188-b349-30c2c7e06919',
    '{
        "foo": "bar"
    }',
    '79f58b9e-a00d-4e3a-b987-f0124aa372a2',
    '79f58b9e-a00d-4e3a-b987-f0124aa372a2',
    7682,
    'ed075985-bc94-406b-8639-44d1da42c3fb',
    '2019-01-02 22:29:05.87+00',
    '2019-01-02 22:29:05.87+00'
WHERE 
	NOT EXISTS (
        SELECT id FROM sdo_updated_ci_1_vbjhxietya WHERE id = '6a73b269-5180-426a-900b-465021011b57'
    )
ON CONFLICT DO NOTHING;