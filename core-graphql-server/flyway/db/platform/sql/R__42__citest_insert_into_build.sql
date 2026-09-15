-- citests/tdo.js

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
    vul_low_count,
    vul_medium_count,
    build_size,
    manifest
)
SELECT
    '9e611ad7-2d3b-48f6-a51b-0a1ba40feab4',
    '06f6ec98-b543-4003-89a0-d9ca5ad325d0',
    73,
    'deployed',
    '1575352502',
    '1575352502',
    0,
    '026972849384.dkr.ecr.us-east-1.amazonaws.com/dev-validated:9e611ad7-2d3b-48f6-a51b-0a1ba40feab4-06f6ec98-b543-4003-89a0-d9ca5ad325d0',
    '{
        "edge": {}
    }',
    false,
    66,
    44,
    525182125,
    '{
        "url": "https://github.com/veritone/webstream-adapter",
        "user": "qdang+superadmin@veritone.com",
        "build": "06f6ec98-b543-4003-89a0-d9ca5ad325d0",
        "oauth": "",
        "category": "ingestion",
        "engineId": "9e611ad7-2d3b-48f6-a51b-0a1ba40feab4",
        "isPublic": true,
        "schedule": "recurring",
        "schemaId": 0,
        "sourceId": 0,
        "ingestion": {
            "scanner": false,
            "supportsLiveStreams": false,
            "supportedSourceTypes": [
                "6"
            ]
        },
        "libraries": null,
        "maxFileMb": 0,
        "categories": null,
        "engineMode": "stream",
        "clusterSize": "custom",
        "gpuSupported": "",
        "inputOptions": null,
        "releaseNotes": "etversion=v0.3.0;builddate=2019-12-03_05:26:51;branch=update-engines;commit=170161eba97b0c55b3a5a8cd004031f82efb139b",
        "customProfile": "webstream-adapter",
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
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = '06f6ec98-b543-4003-89a0-d9ca5ad325d0'
    OR (engine_id = '9e611ad7-2d3b-48f6-a51b-0a1ba40feab4' AND build_state = 'deployed'));
