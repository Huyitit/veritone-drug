-- basicJob.js

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
	"order",
	core_job_data,
  fields,
  creates_recording,
  deleted,
  created_date,
  updated_date,
  library_required,
	engine_currency,
  engine_alias_id
) SELECT
  '3f03e804-cab6-413f-805c-ec36b6e33f5b',
  '088a31be-9bd6-4628-a6f0-e4004e362ea0',
  'Veritone - Object Tracker - V2F',
  'input user-defined bounding boxes to track forward and backward in video. ',
  'active',
  0,
  7682,
  false,
  'https://www.filepicker.io/api/file/Txk0D8ksQtqLXtGRN440',
  100,
  '{
    "category": "image-detection",
    "dependencies": [
        "ingestion",
        "transcode"
    ]
  }',
  '[
    {
        "min": 0,
        "info": "Maximum number of frames to track backwards in time. If only tracking forward in time, set to 0.",
        "name": "Backwards tracking frame limit",
        "type": "number",
        "label": "backTrackFrameLimit",
        "value": 200,
        "defaultValue": "200"
    }
  ]',
  false,
  false,
  1551732914,
  1551732914,
  false,
  'USD',
  '3f03e804-cab6-413f-805c-ec36b6e33f5b'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

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
	"order",
  fields,
  creates_recording,
  deleted,
  created_date,
  updated_date,
  library_required,
	engine_currency,
  engine_alias_id
) SELECT
  '8e0f4cc4-9ff4-4814-8cae-91f0a81879d1',
  '4b150c85-82d0-4a18-b7fb-63e4a58dfcce',
  'SFTP Adapter',
  'Engine for ingesting content from an SFTP source',
  'active',
  1,
  7682,
  false,
  'https://www.filepicker.io/api/file/4sHYWStpSSaDggEtq7Dg',
  100,
  '[]',
  true,
  false,
  1550128661,
  1578508954,
  false,
  'USD',
  '8e0f4cc4-9ff4-4814-8cae-91f0a81879d1'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

-- citest/engineResults.js
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
	"order",
	core_job_data,
  fields,
  creates_recording,
  deleted,
  created_date,
  updated_date,
  library_required,
  icon_path,
	engine_currency,
  engine_alias_id,
  engine_alias_name,
  engine_alias_description,
  engine_alias_logo_path
) SELECT
  'dcef5300-5cc1-4fe3-bd8f-5c4d3a09b281',
  '6faad6b7-0837-45f9-b161-2f6bf31b7a07',
  'Machine Box - Facebox Recognize - V2F',
  'Teachable face detection and recognition.',
  'active',
  0,
  7682,
  false,
  'https://www.filepicker.io/api/file/m1Gc3HiQQnSLwH6JSemb',
  7,
  '{
    "category": "image-detection",
    "dependencies": [
        "ingestion",
        "transcode"
    ]
  }',
  '[
    {
        "max": 1,
        "min": 0,
        "info": "The minimum confidence of recognized faces to include. Zero skips the check.",
        "name": "minConfidence",
        "step": 0.05,
        "type": "number",
        "label": "Minimum confidence",
        "value": 0,
        "options": null,
        "defaultValue": "0"
    },
    {
        "info": "Level of jittering (higher is slower but can be more accurate)",
        "name": "jitters",
        "type": "picklist",
        "label": "Jitters",
        "value": "3",
        "options": [
            {
                "key": "Off (fastest)",
                "value": "0"
            },
            {
                "key": "Low",
                "value": "3"
            },
            {
                "key": "Medium",
                "value": "5"
            },
            {
                "key": "High (slowest)",
                "value": "10"
            }
        ],
        "defaultValue": "3"
    },
    {
        "info": "The face detector technology to use when looking for faces",
        "name": "detector",
        "type": "picklist",
        "label": "Face detector technology",
        "value": "std",
        "options": [
            {
                "key": "Standard",
                "value": "std"
            },
            {
                "key": "CNN (slower)",
                "value": "cnn"
            }
        ],
        "defaultValue": "std"
    }
  ]',
  false,
  false,
  1542379157,
  1554117017,
  true,
  'https://www.filepicker.io/api/file/DKE2yt6vTsqMXmCi9wnp',
  'USD',
  'dcef5300-5cc1-4fe3-bd8f-5c4d3a09b281',
  'Face Recognition - I - V2F',
  'This engine recognizes people''s faces in visual content, on V2F.',
  'https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/face-recognition-I.png'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

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
  rating,
	"order",
	core_job_data,
  fields,
  asset,
  creates_recording,
  deleted,
  created_date,
  updated_date,
  library_required,
	engine_currency,
  engine_alias_id,
  engine_alias_name,
  engine_alias_description
) SELECT
  'transcribe-speechmatics-container-en-us',
  '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
  'Speechmatics Transcription - English (US)',
  'Speechmatics English (USA) is the network isolated version of one of our most popular and accurate transcription engines, with robust language capabilities.',
  'active',
  0,
  7682,
  false,
  125,
  5,
  0,
  '{
    "category": "transcribe",
    "dependencies": [
        "ingestion",
        "transcode"
    ]
  }',
  '[
    {
        "name": "diarise",
        "type": "picklist",
        "options": [
            {
                "key": "false",
                "value": "false"
            },
            {
                "key": "true",
                "value": "true"
            }
        ],
        "description": ""
    },
    {
        "name": "keywords",
        "type": "text",
        "description": "Keywords are separated by commas"
    }
  ]',
  'speechmatics-container-en-us',
  false,
  false,
  1502998419,
  1502998419,
  false,
  'USD',
  '2b06ec74-2e70-5f1a-f834-2bd7d6fdfdf2',
  'Transcription - A - English (US)',
  'Network isolated version of one of our most popular and accurate transcription engines, supporting Speaker Separation.'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

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
  creates_recording,
  deleted,
  created_date,
  updated_date,
  library_required,
	engine_currency,
  engine_alias_id,
  engine_alias_name,
  engine_alias_description
) SELECT
  'c20ddcce-d52a-433f-81a9-32e56f34e062',
  '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923',
  'Google - Translate - V2F',
  'Google - Translate - V2F',
  'active',
  2,
  7682,
  false,
  300,
  100,
  '{
    "category": "translation",
    "dependencies": [
        "transcribe",
        "bulk-edit-transcript"
    ]
  }',
  '[
    {
        "max": null,
        "min": null,
        "info": null,
        "name": "target",
        "step": null,
        "type": "picklist",
        "label": "",
        "value": "",
        "options": [
            {
                "key": "English",
                "value": "English:en"
            },
            {
                "key": "Afrikaans",
                "value": "Afrikaans:af"
            },
            {
                "key": "Albanian",
                "value": "Albanian:sq"
            },
            {
                "key": "Amharic",
                "value": "Amharic:am"
            },
            {
                "key": "Arabic",
                "value": "Arabic:ar"
            },
            {
                "key": "Armenian",
                "value": "Armenian:hy"
            },
            {
                "key": "Azerbaijani",
                "value": "Azerbaijani:az"
            },
            {
                "key": "Basque",
                "value": "Basque:eu"
            },
            {
                "key": "Belarusian",
                "value": "Belarusian:be"
            },
            {
                "key": "Bengali",
                "value": "Bengali:bn"
            },
            {
                "key": "Bosnian",
                "value": "Bosnian:bs"
            },
            {
                "key": "Bulgarian",
                "value": "Bulgarian:bg"
            },
            {
                "key": "Burmese",
                "value": "Burmese:my"
            },
            {
                "key": "Catalan",
                "value": "Catalan:ca"
            },
            {
                "key": "Cebuano",
                "value": "Cebuano:ceb"
            },
            {
                "key": "Chichewa",
                "value": "Chichewa:ny"
            },
            {
                "key": "Chinese Simplified",
                "value": "Chinese Simplified:zh-CN"
            },
            {
                "key": "Chinese Traditional",
                "value": "Chinese Traditional:zh-TW"
            },
            {
                "key": "Corsican",
                "value": "Corsican:co"
            },
            {
                "key": "Croatian",
                "value": "Croatian:hr"
            },
            {
                "key": "Czech",
                "value": "Czech:cs"
            },
            {
                "key": "Danish:da",
                "value": "Danish:da"
            },
            {
                "key": "Dutch:nl",
                "value": "Dutch:nl"
            },
            {
                "key": "English",
                "value": "English:en"
            },
            {
                "key": "Esperanto",
                "value": "Esperanto:eo"
            },
            {
                "key": "Estonian",
                "value": "Estonian:et"
            },
            {
                "key": "Filipino",
                "value": "Filipino:tl"
            },
            {
                "key": "Finnish",
                "value": "Finnish:fi"
            },
            {
                "key": "French",
                "value": "French:fr"
            },
            {
                "key": "Frisian",
                "value": "Frisian:fy"
            },
            {
                "key": "Galician",
                "value": "Galician:gl"
            },
            {
                "key": "Georgian",
                "value": "Georgian:ka"
            },
            {
                "key": "German",
                "value": "German:de"
            },
            {
                "key": "Greek",
                "value": "Greek:el"
            },
            {
                "key": "Gujarati",
                "value": "Gujarati:gu"
            },
            {
                "key": "Haitian Creole",
                "value": "Haitian Creole:ht"
            },
            {
                "key": "Hausa",
                "value": "Hausa:ha"
            },
            {
                "key": "Hawaiian",
                "value": "Hawaiian:haw"
            },
            {
                "key": "Hebrew",
                "value": "Hebrew:iw"
            },
            {
                "key": "Hindi",
                "value": "Hindi:hi"
            },
            {
                "key": "Homong",
                "value": "Homong:hmn"
            },
            {
                "key": "Hungarian",
                "value": "Hungarian:hu"
            },
            {
                "key": "Icelandic",
                "value": "Icelandic:is"
            },
            {
                "key": "Indonesian",
                "value": "Indonesian:id"
            },
            {
                "key": "Irish",
                "value": "Irish:ga"
            },
            {
                "key": "Italian",
                "value": "Italian:it"
            },
            {
                "key": "Japanese",
                "value": "Japanese:ja"
            },
            {
                "key": "Javanese",
                "value": "Javanese:jw"
            },
            {
                "key": "Kannada",
                "value": "Kannada:kn"
            },
            {
                "key": "Kazakh",
                "value": "Kazakh:kk"
            },
            {
                "key": "Khmer",
                "value": "Khmer:km"
            },
            {
                "key": "Korean",
                "value": "Korean:ko"
            },
            {
                "key": "Kurdish",
                "value": "Kurdish:ku"
            },
            {
                "key": "Kyrgyz",
                "value": "Kyrgyz:ky"
            },
            {
                "key": "Lao",
                "value": "Lao:lo"
            },
            {
                "key": "Latin",
                "value": "Latin:la"
            },
            {
                "key": "Latvian",
                "value": "Latvian:lv"
            },
            {
                "key": "Lithuanian",
                "value": "Lithuanian:lt"
            },
            {
                "key": "Luxembourgish",
                "value": "Luxembourgish:lb"
            },
            {
                "key": "Macedonian",
                "value": "Macedonian:mk"
            },
            {
                "key": "Malagasy",
                "value": "Malagasy:mg"
            },
            {
                "key": "Malay",
                "value": "Malay:ms"
            },
            {
                "key": "Malayalam",
                "value": "Malayalam:ml"
            },
            {
                "key": "Maltese",
                "value": "Maltese:mt"
            },
            {
                "key": "Maori",
                "value": "Maori:mi"
            },
            {
                "key": "Marathi",
                "value": "Marathi:mr"
            },
            {
                "key": "Mongolian",
                "value": "Mongolian:mn"
            },
            {
                "key": "Nepali",
                "value": "Nepali:ne"
            },
            {
                "key": "Norwegian",
                "value": "Norwegian:no"
            },
            {
                "key": "Pashto",
                "value": "Pashto:ps"
            },
            {
                "key": "Persian",
                "value": "Persian:fa"
            },
            {
                "key": "Polish",
                "value": "Polish:pl"
            },
            {
                "key": "Portuguese",
                "value": "Portuguese:pt"
            },
            {
                "key": "Romanian",
                "value": "Romanian:ro"
            },
            {
                "key": "Russian",
                "value": "Russian:ru"
            },
            {
                "key": "Samoan",
                "value": "Samoan:sm"
            },
            {
                "key": "Scots Gaelic",
                "value": "Scots Gaelic:gd"
            },
            {
                "key": "Serbian",
                "value": "Serbian:sr"
            },
            {
                "key": "Sesotho",
                "value": "Sesotho:st"
            },
            {
                "key": "Shona",
                "value": "Shona:sn"
            },
            {
                "key": "Sindhi",
                "value": "Sindhi:sd"
            },
            {
                "key": "Sinhala",
                "value": "Sinhala:si"
            },
            {
                "key": "Slovak",
                "value": "Slovak:sk"
            },
            {
                "key": "Slovenian",
                "value": "Slovenian:sl"
            },
            {
                "key": "Somali",
                "value": "Somali:so"
            },
            {
                "key": "Spanish",
                "value": "Spanish:es"
            },
            {
                "key": "Sundanese",
                "value": "Sundanese:su"
            },
            {
                "key": "Swahili",
                "value": "Swahili:sw"
            },
            {
                "key": "Swedish",
                "value": "Swedish:sv"
            },
            {
                "key": "Tajik",
                "value": "Tajik:tg"
            },
            {
                "key": "Tamil",
                "value": "Tamil:ta"
            },
            {
                "key": "Telugu",
                "value": "Telugu:te"
            },
            {
                "key": "Thai",
                "value": "Thai:th"
            },
            {
                "key": "Turkish",
                "value": "Turkish:tr"
            },
            {
                "key": "Ukrainian",
                "value": "Ukrainian:uk"
            },
            {
                "key": "Urdu",
                "value": "Urdu:ur"
            },
            {
                "key": "Uzbek",
                "value": "Uzbek:uz"
            },
            {
                "key": "Vietnamese",
                "value": "Vietnamese:vi"
            },
            {
                "key": "Welsh",
                "value": "Welsh:cy"
            },
            {
                "key": "Xhosa",
                "value": "Xhosa:xh"
            },
            {
                "key": "Yiddish",
                "value": "Yiddish:yi"
            },
            {
                "key": "Yoruba",
                "value": "Yoruba:yo"
            },
            {
                "key": "Zulu",
                "value": "Zulu:zu"
            }
        ],
        "defaultValue": ""
    }
  ]',
  false,
  false,
  1545979104,
  1550039593,
  false,
  'USD',
  'c20ddcce-d52a-433f-81a9-32e56f34e062',
  'Translate - AO - V2F',
  'This V2F translation engine supports many, many input and output languages and is very accurate. Accepts transcripts and plain text as input.'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

-- citest/disney.js
INSERT INTO job_new.build (
    engine_id,
    build_id,
    version,
    build_state,
    price,
    created_date,
    updated_date,
    deployment_model,
    docker_image,
    task_runtime,
    is_legacy,
    vul_low_count,
    vul_medium_count,
    vul_high_count,
    build_size,
    manifest
)
SELECT
    'transcribe-speechmatics-container-en-us',
    '772f0867-5606-4111-8b84-5caa832d703a',
    31,
    'deployed',
    125,
    1570125997,
    1570125997,
    0,
    'docker.aws-prod.veritone.com/validated/transcribe-speechmatics-container-en-us:772f0867-5606-4111-8b84-5caa832d703a',
    '{
        "iron": {
            "cluster": "59a5d97ef62d8500093813bc",
            "priority": 0
        }
    }',
    false,
    185,
    33,
    3,
    2908820497,
   '{
        "url": "https://www.veritone.com",
        "user": "nam.nguyen+success@setacinq.vn",
        "build": "772f0867-5606-4111-8b84-5caa832d703a",
        "oauth": "",
        "runtime": "",
        "category": "transcription",
        "engineId": "transcribe-speechmatics-container-en-us",
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
        "clusterSize": "large",
        "isBenchmark": false,
        "isConductor": false,
        "gpuSupported": "",
        "inputOptions": null,
        "releaseNotes": "Speechmatics Version: 6.1.1",
        "customProfile": "",
        "externalCalls": [],
        "inputEncoding": "",
        "outputFormats": [
            "application/json",
            "application/ttml+xml"
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
        "preferredInputFormat": "audio/x-wav",
        "supportedInputFormats": null
    }'
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = '772f0867-5606-4111-8b84-5caa832d703a'
    OR (engine_id = 'transcribe-speechmatics-container-en-us' AND build_state = 'deployed'))
    AND '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '');


-- citest/benchmark.js
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
	"order",
	core_job_data,
  fields,
  asset,
  creates_recording,
  deleted,
  created_date,
  updated_date,
  library_required,
	engine_currency,
  engine_alias_id,
  jwt_rights
) SELECT
  '6181fd6e-c6e1-44e8-afd3-75b1a8babd08',
  '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
  'Benchmark Engines RT',
  'Benchmarks the engines provided in the payload.',
  'active',
  1,
  7682,
  false,
  'https://www.filepicker.io/api/file/6fyS0ZeTpGGRz5vBAkj6',
  100,
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
        "info": "The list of engines to benchmark",
        "name": "engines",
        "step": null,
        "type": "multi-picklist",
        "label": "Engines*",
        "value": "",
        "options": [
            {
                "key": "Cielo (Ground Truth)",
                "value": "8ab12d01-6ad5-444f-8fc3-a73489aa6e08"
            },
            {
                "key": "Smart Router Conductor",
                "value": "9203cf30-68d1-4978-a5a4-7f2f3a945ccb"
            },
            {
                "key": "Voicebase",
                "value": "b396fa74-83ff-4052-88a7-c37808a25673"
            },
            {
                "key": "Speechmatics",
                "value": "c0e55cde-340b-44d7-bb42-2e0d65e98141"
            },
            {
                "key": "Google STT - Broadcast Multi Speaker",
                "value": "1cbb5ddc-d945-4d4b-8a42-971b33e6c9bf"
            },
            {
                "key": "Google STT - Telephony",
                "value": "fbc105fc-8069-42ef-8769-0e86d9b2d251"
            },
            {
                "key": "Google STT - Broadcast One Speaker",
                "value": "0daa45ab-9b3a-4e7f-80bc-20417412a951"
            },
            {
                "key": "Amazon Transcribe",
                "value": "1e235b57-9ada-411a-ba9c-1324205b9e40"
            },
            {
                "key": "RevSpeech",
                "value": "fe7c500b-9881-4367-87e2-4c1f3a786939"
            },
            {
                "key": "Transcription-K-English US",
                "value": "ed9bbb45-0327-4283-83c2-cdac2d550778"
            },
            {
                "key": "Mod9 (Remeeting)",
                "value": "a8e2fd67-db09-4f2d-afda-64939cb9af29"
            },
            {
                "key": "Speechmatics (Global)",
                "value": "54525249-da68-4dbf-b6fe-aea9a1aefd4d"
            },
            {
                "key": "Maxim Aggregator",
                "value": "531c5be2-5f53-4e94-84d6-07c0fcaa9fba"
            }
        ],
        "defaultValue": ""
    },
    {
        "max": null,
        "min": null,
        "info": "Provide a URI to a text of the ground truth of the media if available.",
        "name": "groundTruth",
        "step": null,
        "type": "text",
        "label": "User Ground Truth (URI)",
        "value": null,
        "options": null,
        "defaultValue": null
    },
    {
        "max": null,
        "min": null,
        "info": "If desired, specify the language that SRC should use for transcription.",
        "name": " language",
        "step": null,
        "type": "picklist",
        "label": "Language",
        "value": "english",
        "options": [
            {
                "key": "English",
                "value": "english"
            },
            {
                "key": "Spanish",
                "value": "spanish"
            }
        ],
        "defaultValue": "english"
    },
    {
        "max": null,
        "min": null,
        "info": "Specify the engine ID of the engine you would like to anchor with. (default is Rev)",
        "name": "requiredEngines",
        "step": null,
        "type": "picklist",
        "label": "Anchor Engine",
        "value": "fe7c500b-9881-4367-87e2-4c1f3a786939",
        "options": [
            {
                "key": "RevSpeech",
                "value": "fe7c500b-9881-4367-87e2-4c1f3a786939"
            },
            {
                "key": "Speechmatics (Global)",
                "value": "54525249-da68-4dbf-b6fe-aea9a1aefd4d"
            },
            {
                "key": "Speechmatics (US)",
                "value": "c0e55cde-340b-44d7-bb42-2e0d65e98141"
            }
        ],
        "defaultValue": "fe7c500b-9881-4367-87e2-4c1f3a786939"
    },
    {
        "info": "Optionally provide an engine ID for an engine we want to use as the ground truth instead of Cielo24 or a ground truth link.",
        "name": "baselineEngine",
        "type": "text",
        "label": "Baseline Engine ID"
    }
  ]',
  '6181fd6e-c6e1-44e8-afd3-75b1a8babd08',
  false,
  false,
  1542068487,
  1553648551,
  false,
  'USD',
  '6181fd6e-c6e1-44e8-afd3-75b1a8babd08',
  '{
    "roles": [
        {
            "roleName": "conductor",
            "taskRights": [
                "developer.engine.read",
                "job:create",
                "job.read",
                "cms.access",
                "cms.sources.read",
                "cms.sources.update",
                "task:read"
            ],
            "assetRights": [
                "recording:create",
                "recording:update"
            ]
        }
    ]
  }'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
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
    '6181fd6e-c6e1-44e8-afd3-75b1a8babd08',
    'e17bad9f-510a-4b7e-854b-cb86e1461a6a',
    101,
    'deployed',
    1582513714,
    1582513714,
    0,
    '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:6181fd6e-c6e1-44e8-afd3-75b1a8babd08-e17bad9f-510a-4b7e-854b-cb86e1461a6a',
    '{
    "edge": {}
    }',
    false,
    161,
    12,
    729763018,
   '{
        "url": "github.com/veritone/task-benchmark-engines",
        "user": "adam+success@setacinq.vn",
        "build": "e17bad9f-510a-4b7e-854b-cb86e1461a6a",
        "oauth": "",
        "runtime": "",
        "category": "conductor",
        "engineId": "6181fd6e-c6e1-44e8-afd3-75b1a8babd08",
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
        "engineMode": "batch",
        "clusterSize": "large",
        "isBenchmark": true,
        "isConductor": false,
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
        "preferredInputFormat": "audio/mp4",
        "supportedInputFormats": [
            "video/mp4",
            "audio/flac",
            "audio/wav",
            "audio/mp4",
            "video/mpeg",
            "video/quicktime",
            "audio/mpeg"
        ]
    }'
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = 'e17bad9f-510a-4b7e-854b-cb86e1461a6a'
    OR (engine_id = '6181fd6e-c6e1-44e8-afd3-75b1a8babd08' AND build_state = 'deployed'))
    AND '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '');


-- citest/engines.js
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
    rating,
	"order",
    dependency,
	core_job_data,
    fields,
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    engine_currency,
    engine_alias_id,
    engine_alias_name,
    engine_alias_description
) SELECT
  'translate-microsoft',
  '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923',
  'Microsoft Cognitive Services - Translator Text',
  'Microsoft translation engine.',
  'active',
  2,
  7682,
  false,
  200,
  2,
  1,
  '{
    "engine": "transcription"
  }',
  '{
    "category": "translation",
    "dependencies": [
        "transcribe",
        "bulk-edit-transcript"
    ]
  }',
  '[
    {
        "name": "target",
        "type": "picklist",
        "options": [
            {
                "key": "English",
                "value": "en"
            },
            {
                "key": "Afrikaans",
                "value": "af"
            },
            {
                "key": "Arabic",
                "value": "ar"
            },
            {
                "key": "Bosnian (Latin)",
                "value": "bs-Latn"
            },
            {
                "key": "Bulgarian",
                "value": "bg"
            },
            {
                "key": "Catalan",
                "value": "ca"
            },
            {
                "key": "Chinese Simplified",
                "value": "zh-CHS"
            },
            {
                "key": "Chinese Traditional",
                "value": "zh-CHT"
            },
            {
                "key": "Croatian",
                "value": "hr"
            },
            {
                "key": "Czech",
                "value": "cs"
            },
            {
                "key": "Danish",
                "value": "da"
            },
            {
                "key": "Dutch",
                "value": "nl"
            },
            {
                "key": "Estonian",
                "value": "et"
            },
            {
                "key": "Finnish",
                "value": "fi"
            },
            {
                "key": "French",
                "value": "fr"
            },
            {
                "key": "German",
                "value": "de"
            },
            {
                "key": "Greek",
                "value": "el"
            },
            {
                "key": "Haitian Creole",
                "value": "ht"
            },
            {
                "key": "Hebrew",
                "value": "he"
            },
            {
                "key": "Hindi",
                "value": "hi"
            },
            {
                "key": "Hmong Daw",
                "value": "mww"
            },
            {
                "key": "Hungarian",
                "value": "hu"
            },
            {
                "key": "Indonesian",
                "value": "id"
            },
            {
                "key": "Italian",
                "value": "it"
            },
            {
                "key": "Japanese",
                "value": "ja"
            },
            {
                "key": "Kiswahili",
                "value": "sw"
            },
            {
                "key": "Klingon",
                "value": "tlh"
            },
            {
                "key": "Klingon (plqaD)",
                "value": "tlh-Qaak"
            },
            {
                "key": "Korean",
                "value": "ko"
            },
            {
                "key": "Latvian",
                "value": "lv"
            },
            {
                "key": "Lithuanian",
                "value": "lt"
            },
            {
                "key": "Malay",
                "value": "ms"
            },
            {
                "key": "Maltese",
                "value": "mt"
            },
            {
                "key": "Norwegian",
                "value": "no"
            },
            {
                "key": "Persian",
                "value": "fa"
            },
            {
                "key": "Polish",
                "value": "pl"
            },
            {
                "key": "Portuguese",
                "value": "pt"
            },
            {
                "key": "Querétaro Otomi",
                "value": "otq"
            },
            {
                "key": "Romanian",
                "value": "ro"
            },
            {
                "key": "Russian",
                "value": "ru"
            },
            {
                "key": "Serbian (Cyrillic)",
                "value": "sr-Cyrl"
            },
            {
                "key": "Serbian (Latin)",
                "value": "sr-Latn"
            },
            {
                "key": "Slovak",
                "value": "sk"
            },
            {
                "key": "Slovenian",
                "value": "sl"
            },
            {
                "key": "Spanish",
                "value": "es"
            },
            {
                "key": "Swedish",
                "value": "sv"
            },
            {
                "key": "Thai",
                "value": "th"
            },
            {
                "key": "Turkish",
                "value": "tr"
            },
            {
                "key": "Ukrainian",
                "value": "uk"
            },
            {
                "key": "Urdu",
                "value": "ur"
            },
            {
                "key": "Vietnamese",
                "value": "vi"
            },
            {
                "key": "Welsh",
                "value": "cy"
            },
            {
                "key": "Yucatec Maya",
                "value": "yua"
            }
        ]
    }
  ]',
  false,
  false,
  1504131764,
  1504131764,
  false,
  'USD',
  '388d951e-c90c-f001-9d6b-8bb70b9e6267',
  'Translate - B',
  'Machine translation engine from a leading technology provider.'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

INSERT INTO job_new.build (
    engine_id,
    build_id,
    version,
    build_state,
    price,
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
    'translate-microsoft',
    '40bfd5c9-9e70-4f1d-b28a-ceb1cb1d2ebb',
    14,
    'deployed',
    200,
    1547112186,
    1547112186,
    0,
    'docker.aws-prod.veritone.com/validated/translate-microsoft:40bfd5c9-9e70-4f1d-b28a-ceb1cb1d2ebb',
    '{
        "iron": {
            "cluster": "598ccf431df14a00095476b7",
            "priority": 0
        }
    }',
    false,
    20,
    4,
    154528636,
   '{
        "url": "https://github.com/veritone/task-microsoft-translate",
        "user": "nam.nguyen+success@setacinq.vn",
        "build": "40bfd5c9-9e70-4f1d-b28a-ceb1cb1d2ebb",
        "oauth": "",
        "category": "Translate",
        "engineId": "translate-microsoft",
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
        "isBenchmark": false,
        "isConductor": false,
        "gpuSupported": "",
        "inputOptions": null,
        "releaseNotes": "",
        "customProfile": "",
        "externalCalls": [
            "https://api.microsofttranslator.com"
        ],
        "inputEncoding": "",
        "outputFormats": [
            "application/json"
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
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = '40bfd5c9-9e70-4f1d-b28a-ceb1cb1d2ebb'
    OR (engine_id = 'translate-microsoft' AND build_state = 'deployed'))
    AND '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '');


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
    rating,
	"order",
    dependency,
	core_job_data,
    fields,
    asset,
    creates_recording,
    deleted,
    created_date,
    updated_date,
    library_required,
    engine_currency,
    engine_alias_id,
    engine_alias_name,
    engine_alias_description
) SELECT
  'transcribe-speechmatics-container-v3-en-us',
  '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
  'Speechmatics Transcription - English (US)  v3',
  'Speechmatics English (USA) v3 is the network isolated version of one of our most popular and accurate transcription engines, with robust language capabilities.',
  'ready',
  0,
  7682,
  false,
  125,
  5,
  61,
  '{}',
  '{
    "category": "transcribe",
    "dependencies": [
        "ingestion",
        "transcode"
    ]
  }',
  '[
        {
            "name": "diarise",
            "type": "picklist",
            "options": [
                {
                    "key": "false",
                    "value": "false"
                },
                {
                    "key": "true",
                    "value": "true"
                }
            ],
            "description": ""
        },
        {
            "name": "keywords",
            "type": "text",
            "description": "Keywords are separated by commas"
        }
  ]',
  'transcribe-speechmatics-container-v3-en-us',
  false,
  false,
  1518563225,
  1518563225,
  false,
  'USD',
  '1379a425-67ac-4546-89b6-034b2b18ff1a',
  'Transcription - BJ - English (US)',
  'Network isolated version of one of our most popular and accurate transcription engines, with robust language capabilities.'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

