-- citests/exportRequest.js

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
    "order",
    core_job_data,
    fields,
    asset,
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    icon_path,
    engine_currency,
    engine_alias_id,
    engine_alias_name, 
    engine_alias_description
) SELECT
    'c0e55cde-340b-44d7-bb42-2e0d65e98141',
    '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
    'Speechmatics - English (US) - V2F',
    'Speechmatics Cloud ASR product in batch (pre-recorded audio or video files) and real-time.',
    'active',
    0,
    7682,
    false,
    125,
    1,
    '{
        "category": "transcribe",
        "dependencies": [
            "ingestion",
            "transcode"
        ]
    }',
    '[
        {
            "max": null,
            "min": null,
            "info": "diarise",
            "name": "diarise",
            "step": null,
            "type": "picklist",
            "label": "diarise",
            "value": null,
            "options": [
                {
                    "key": "true",
                    "value": "true"
                },
                {
                    "key": "false",
                    "value": "false"
                }
            ],
            "defaultValue": null
        },
        {
            "max": null,
            "min": null,
            "info": "keywords",
            "name": "keywords",
            "step": null,
            "type": "text",
            "label": "keywords",
            "value": null,
            "options": null,
            "defaultValue": null
        }
    ]',
    'c0e55cde-340b-44d7-bb42-2e0d65e98141',
    false,
    false,
    '1522199471',
    '1527015315',
    false,
    'https://www.filepicker.io/api/file/PYhnibSPSYGNLF2xFzGV',
    'USD',
    'c0e55cde-340b-44d7-bb42-2e0d65e98141',
    'Transcription - DI - English (US)',
    'This engine converts US English speech to text.'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;