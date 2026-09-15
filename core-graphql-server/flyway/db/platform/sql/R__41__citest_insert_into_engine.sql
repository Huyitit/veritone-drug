-- citests/tdo.js

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
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    engine_currency,
    engine_alias_id,
    jwt_rights
) VALUES (
    '9e611ad7-2d3b-48f6-a51b-0a1ba40feab4',
    '4b150c85-82d0-4a18-b7fb-63e4a58dfcce',
    'Webstream Adapter',
    'Real-time adapter for ingesting web streams from a URL',
    'active',
    1,
    7682,
    true,
    'https://www.filepicker.io/api/file/QFdep7moSTetadeYF3E7',
    true,
    false,
    1521659424,
    1526511257,
    false,
    'USD',
    '9e611ad7-2d3b-48f6-a51b-0a1ba40feab4',
    '{
        "roles": [
            {
                "roleName": "adapter",
                "taskRights": [
                    "job:create",
                    "cms.access",
                    "cms.sources.read",
                    "cms.sources.update"
                ],
                "assetRights": [
                    "recording:create",
                    "recording:update"
                ]
            }
        ]
    }'
)
ON CONFLICT DO NOTHING;