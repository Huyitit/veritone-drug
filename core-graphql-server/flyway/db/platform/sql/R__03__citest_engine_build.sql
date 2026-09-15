INSERT INTO job_new.build (
    engine_id,
    build_id,
    version,
    build_state,
    created_date,
    updated_date,
    deployment_model,
    docker_image,
    task_runtime,
    is_legacy,
    build_size,
    manifest
) 
SELECT
    'd1bc57fe-675d-435d-9f4d-2f074485ec55',
    '48e4df33-6d4c-474d-902d-4bd0960603a0',
    8,
    'deployed',
    1541895565,
    1541895565,
    0,
    '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:d1bc57fe-675d-435d-9f4d-2f074485ec55-48e4df33-6d4c-474d-902d-4bd0960603a0',
    '{
        "edge": {}
    }',
    false,
    28663854,
    '{
        "url": "https://github.com/veritone/passthrough-adapter/",
        "user": "dnguyen+customersuccess@veritone.com",
        "build": "48e4df33-6d4c-474d-902d-4bd0960603a0",
        "oauth": "",
        "category": "push",
        "engineId": "d1bc57fe-675d-435d-9f4d-2f074485ec55",
        "isPublic": true,
        "schedule": "recurring",
        "schemaId": 0,
        "sourceId": 0,
        "ingestion": {
            "scanner": false,
            "supportsLiveStreams": false,
            "supportedSourceTypes": [
                "10"
            ]
        },
        "libraries": null,
        "maxFileMb": 0,
        "categories": null,
        "engineMode": "stream",
        "clusterSize": "small",
        "gpuSupported": "",
        "inputOptions": null,
        "releaseNotes": "",
        "customProfile": "",
        "externalCalls": [],
        "inputEncoding": "",
        "outputFormats": [
            "video/webm"
        ],
        "serverCountry": "",
        "maxConcurrency": 50,
        "isCJISCompliant": false,
        "trainableViaApi": false,
        "whitelistOrgIds": null,
        "maxMediaLengthMs": 0,
        "minMediaLengthMs": 0,
        "fedRampImpactLevel": 0,
        "initialConcurrency": 50,
        "sourceFileDeletion": false,
        "supportedLanguages": null,
        "preferredInputFormat": "application/json",
        "supportedInputFormats": null
    }'
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = '48e4df33-6d4c-474d-902d-4bd0960603a0'
    OR (engine_id = 'd1bc57fe-675d-435d-9f4d-2f074485ec55' AND build_state = 'deployed'));
