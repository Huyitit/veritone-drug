-- citests/scheduledJob.js

INSERT INTO job_new.engine_category (
    engine_category_id,
    engine_category_name,
    engine_category_description,
    data_field,
    icon_class,
    editable,
    video_only,
    "order",
    created_date,
    updated_date,
    engine_class_id,
    engine_type_id
) VALUES (
    '0481ff76-00c5-4e2d-b73d-2e3aaeef79eb',
    'Content Classification',
    'Classifies text into particular categories based on what words the text contains',
    'concept',
    'class',
    false,
    false,
    26,
    1565039538,
    1565039538,
    '29fd494a-e1e9-4eea-82bf-b80b36adbd82',
    'fcc22feb-9184-4f53-be5e-7694927864d9'
)
ON CONFLICT DO NOTHING;

INSERT INTO job_new.engine (
    engine_id,
    engine_category_id,
    engine_name, 
    engine_description,
    engine_state,
    deployment_model,
    owner_organization_id,
    is_public,
    "order",
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    engine_currency,
    engine_alias_id,
    industries,
    engine_manifest
) VALUES (
    '270beec6-185b-4fd9-87f9-9699ff2af596',
    '0481ff76-00c5-4e2d-b73d-2e3aaeef79eb',
    'Engine Certification',
    'Performs engine certification checks on a given engine ID',
    'active',
    2,
    7682,
    false,
    100,
    false,
    false,
    1575097073,
    1575097073,
    false,
    'USD',
    '270beec6-185b-4fd9-87f9-9699ff2af596',
    '[
        "Other"
    ]',
    '{
        "engineMode": "chunk"
    }'
)
ON CONFLICT DO NOTHING;