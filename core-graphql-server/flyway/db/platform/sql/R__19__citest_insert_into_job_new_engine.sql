-- .../core-graphql-server/citest/jobs.js
INSERT INTO job_new.engine (
    engine_id,
    engine_category_id,
    engine_name,
    engine_description,
    engine_state,
    deployment_model,
    owner_organization_id,
    is_public,
    logo_path,
    core_job_data,
    asset,
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    engine_currency,
    engine_alias_id
) VALUES (
    'd619f3f5-a32d-4c09-ab12-d13a182867fd',
    '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
    'CITest Engine 05242018',
    'Internal-only engine for end-to-end testing',
    'active',
    0,
    7682,
    false,
    'https://www.filepicker.io/api/file/ZETAscRESVa206hvACca',
    '{
        "category": "transcribe",
        "dependencies": [
            "ingestion",
            "transcode"
        ]
    }',
    'd619f3f5-a32d-4c09-ab12-d13a182867fd',
    false,
    false,
    '1527799074',
    '1527799074',
    false,
    'USD',
    'd619f3f5-a32d-4c09-ab12-d13a182867fd'
)
ON CONFLICT DO NOTHING;