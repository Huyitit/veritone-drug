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
	logo_path,
	core_job_data,
	fields,
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
	engine_currency,
    engine_alias_id
) VALUES (
	'ea0ada2a-7571-4aa5-9172-b5a7d989b041',
	'925e8039-5246-4ced-9f2b-b456d0b57ea1',
	'Stream Ingestor',
	'Engine used for ingesting a stream, transcoding and generating media assets, and producing media chunks',
	'active',
	'0',
	'7682',
	'true',
	NULL,
	'https://www.filepicker.io/api/file/p2bLdy4nRrOwv34yoEhg',
	'{
        "category": "ingestion"
    }',
	NULL,
    true,
    false,
    1528493221,
    1528493221,
    false,
	'USD',
    'ea0ada2a-7571-4aa5-9172-b5a7d989b041'
)
ON CONFLICT DO NOTHING;



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
    'ea0ada2a-7571-4aa5-9172-b5a7d989b041',
    '8acad3cf-52fd-4042-af19-4e9c16f27c9b',
    176,
    'deployed',
    1574719890,
    1574719890,
    0,
    '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:ea0ada2a-7571-4aa5-9172-b5a7d989b041-8acad3cf-52fd-4042-af19-4e9c16f27c9b',
    '{
        "edge": {}
    }',
    false,
    29,
    12,
    248592189,
    '{
        "url": "https://github.com/veritone/edge-stream-ingestor",
        "user": "wlan+superadmin@veritone.com",
        "build": "8acad3cf-52fd-4042-af19-4e9c16f27c9b",
        "oauth": "",
        "runtime": "",
        "category": "ingestion",
        "engineId": "ea0ada2a-7571-4aa5-9172-b5a7d989b041",
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
        "engineMode": "stream",
        "clusterSize": "custom",
        "isBenchmark": false,
        "isConductor": false,
        "gpuSupported": "",
        "inputOptions": null,
        "releaseNotes": "Mon Nov 25 19:25:35 UTC 2019;user=weilanveritone;repo=edge-stream-ingestor;branch=master;commit=b44dbfacb4051b35adae636dd944d54c1b4c683b",
        "customProfile": "stream-ingestor",
        "externalCalls": [],
        "inputEncoding": "",
        "outputFormats": [
            "video/mp4"
        ],
        "serverCountry": "",
        "volumeProfile": "",
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
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = '8acad3cf-52fd-4042-af19-4e9c16f27c9b'
    OR (engine_id = 'ea0ada2a-7571-4aa5-9172-b5a7d989b041' AND build_state = 'deployed'));
