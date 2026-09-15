-- .../core-graphql-server/citest/jobs.js
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
    'd619f3f5-a32d-4c09-ab12-d13a182867fd',
    '1169266e-6a45-421b-b257-c313c2931dce',
    2,
    'deployed',
    '1545169129',
    '1545169129',
    0,
    'docker.aws-prod.veritone.com/validated/d619f3f5-a32d-4c09-ab12-d13a182867fd:1169266e-6a45-421b-b257-c313c2931dce',
    '{
        "iron": {
            "cluster": "598ccf431df14a00095476b7",
            "priority": 0
        }
    }',
    false,
    283122205,
    '{
        "url": "Enter your engine URL",
        "user": "smalabarba+superadmin@veritone.com",
        "build": "1169266e-6a45-421b-b257-c313c2931dce",
        "oauth": "",
        "category": "67cd4dd0-2f75-445d-a6f0-2f297d6cd182",
        "engineId": "d619f3f5-a32d-4c09-ab12-d13a182867fd",
        "isPublic": true,
        "schedule": "",
        "schemaId": 0,
        "sourceId": 0,
        "ingestion": {
            "scanner": false,
            "supportsLiveStreams": false,
            "supportedSourceTypes": null
        },
        "libraries": null,
        "maxFileMb": 0,
        "categories": null,
        "engineMode": "",
        "clusterSize": "small",
        "gpuSupported": "",
        "inputOptions": null,
        "releaseNotes": "",
        "customProfile": "",
        "externalCalls": [],
        "inputEncoding": "",
        "outputFormats": [
            "application/json"
        ],
        "serverCountry": "",
        "maxConcurrency": 1,
        "isCJISCompliant": false,
        "trainableViaApi": false,
        "whitelistOrgIds": null,
        "maxMediaLengthMs": 0,
        "minMediaLengthMs": 0,
        "fedRampImpactLevel": 0,
        "initialConcurrency": 1,
        "sourceFileDeletion": false,
        "supportedLanguages": null,
        "preferredInputFormat": "application/json",
        "supportedInputFormats": null
    }'
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = '1169266e-6a45-421b-b257-c313c2931dce'
    OR (engine_id = 'd619f3f5-a32d-4c09-ab12-d13a182867fd' AND build_state = 'deployed'));

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
) VALUES (
    'd619f3f5-a32d-4c09-ab12-d13a182867fd',
    'c98f2f32-990b-438c-a322-258bf42a72c2',
    2,
    'approved',
    '1545169129',
    '1545169129',
    0,
    'docker.aws-prod.veritone.com/validated/d619f3f5-a32d-4c09-ab12-d13a182867fd:c98f2f32-990b-438c-a322-258bf42a72c2',
    '{
        "iron": {
            "cluster": "598ccf431df14a00095476b7",
            "priority": 0
        }
    }',
    false,
    283122205,
    '{
        "url": "Enter your engine URL",
        "user": "smalabarba+superadmin@veritone.com",
        "build": "1169266e-6a45-421b-b257-c313c2931dce",
        "oauth": "",
        "category": "67cd4dd0-2f75-445d-a6f0-2f297d6cd182",
        "engineId": "d619f3f5-a32d-4c09-ab12-d13a182867fd",
        "isPublic": true,
        "schedule": "",
        "schemaId": 0,
        "sourceId": 0,
        "ingestion": {
            "scanner": false,
            "supportsLiveStreams": false,
            "supportedSourceTypes": null
        },
        "libraries": null,
        "maxFileMb": 0,
        "categories": null,
        "engineMode": "",
        "clusterSize": "small",
        "gpuSupported": "",
        "inputOptions": null,
        "releaseNotes": "",
        "customProfile": "",
        "externalCalls": [],
        "inputEncoding": "",
        "outputFormats": [
            "application/json"
        ],
        "serverCountry": "",
        "maxConcurrency": 1,
        "isCJISCompliant": false,
        "trainableViaApi": false,
        "whitelistOrgIds": null,
        "maxMediaLengthMs": 0,
        "minMediaLengthMs": 0,
        "fedRampImpactLevel": 0,
        "initialConcurrency": 1,
        "sourceFileDeletion": false,
        "supportedLanguages": null,
        "preferredInputFormat": "application/json",
        "supportedInputFormats": null
    }'
)
ON CONFLICT DO NOTHING;