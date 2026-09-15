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
    "order",
    core_job_data,
    asset,
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    engine_currency,
    engine_alias_id,
    use_cases,
    engine_manifest
) VALUES (
    '524c8084-3446-45de-a3c7-b02c6a2ee888',
    '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
    'Test 3rd dev Engine',
    'VERY IMPORTANT TEST',
    'active',
    2,
    7682,
    false,
    100,
    '{
        "category": "transcribe",
        "dependencies": [
            "ingestion",
            "transcode"
        ]
    }',
    '524c8084-3446-45de-a3c7-b02c6a2ee888',
    false,
    false,
    '1574797106',
    '1574797106',
    false,
    'USD',
    '524c8084-3446-45de-a3c7-b02c6a2ee888',
    '[
        "test"
    ]',
    '{
        "engineMode": "stream",
        "supportedInputTypes": [
            "audio/mp4",
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "video/mp4"
        ]
    }'
)
ON CONFLICT DO NOTHING;