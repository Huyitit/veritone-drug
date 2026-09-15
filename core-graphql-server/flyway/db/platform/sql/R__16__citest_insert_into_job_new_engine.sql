INSERT INTO job_new.engine (
    engine_id,
    engine_category_id,
    engine_name,
    engine_description,
    engine_state,
    deployment_model,
    owner_organization_id,
    is_public,
    price,
    core_job_data,
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    engine_currency,
    engine_alias_id
) VALUES (
    's3-scanner',
    '4b150c85-82d0-4a18-b7fb-63e4a58dfcce',
    'S3 Scanner',
    'Scans s3 bucket for files to ingest',
    'ready',
    1,
    7682,
    true,
    0,
    '{
        "category": "ingestion"
    }',
    true,
    false,
    1502309150,
    1502309150,
    false,
    'USD',
    'a0475c7d-b550-c083-dd4f-d64b73478977'
)
ON CONFLICT DO NOTHING;