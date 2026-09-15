
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
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    engine_currency,
    engine_alias_id
) 
SELECT
    '352556c7-de07-4d55-b33f-74b1cf237f25',
    '4be1a1b2-653d-4eaa-ba18-747a265305d8',
    'SI2 Playback segment creator',
    'Engine used for creating playback segments from an input stream into the TDO.  Should be for initial ingestion only',
    'active',
    0,
    7682,
    true,
    'https://www.filepicker.io/api/file/p2bLdy4nRrOwv34yoEhg',
    '{
        "category": "ingestion"
    }',
    true,
    false,
    1571251687,
    1571251687,
    false,
    'USD',
    '352556c7-de07-4d55-b33f-74b1cf237f25'
WHERE NOT EXISTS (SELECT 1 FROM job_new.engine WHERE engine_id = '352556c7-de07-4d55-b33f-74b1cf237f25');
