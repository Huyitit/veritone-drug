-- Benchmark App Engine 2517dfe9-b70d-43b1-bc1b-800618190d92 with deployed build 863a9e36-0df5-4641-964d-267767158193:
INSERT INTO job_new.engine
("engine_id",
 "engine_category_id",
 "engine_name",
 "engine_description",
 "engine_state",
 "deployment_model",
 "owner_organization_id",
 "is_public",
 "price",
 "rating",
 "website",
 "logo_path",
 "order",
 "dependency",
 "core_job_data",
 "fields",
 "validation",
 "application_id",
 "asset",
 "creates_recording",
 "deleted",
 "created_date",
 "updated_date",
 "library_required",
 "icon_path",
 "engine_currency",
 "engine_alias_id",
 "engine_alias_name",
 "engine_alias_description",
 "engine_alias_logo_path",
 "jwt_rights",
 "use_cases",
 "industries",
 "engine_manifest",
 "edge_version",
 "single_engine_tdo_job_json",
 "single_engine_upload_job_json")
VALUES ('2517dfe9-b70d-43b1-bc1b-800618190d92',
        '67cd4dd0-2f75-445d-a6f0-2f297d6cd182',
        'Benchmark Engine',
        'Benchmarks the engines provided in the payload.',
        'active',
        1,
        7682,
        TRUE,
        NULL,
        NULL,
        NULL,
        'https://www.filepicker.io/api/file/6fyS0ZeTpGGRz5vBAkj6',
        100,
        NULL,
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
        NULL,
        NULL,
        '2517dfe9-b70d-43b1-bc1b-800618190d92',
        FALSE,
        FALSE,
        1542068487,
        1553648551,
        FALSE,
        NULL,
        'USD',
        '2517dfe9-b70d-43b1-bc1b-800618190d92',
        NULL,
        NULL,
        NULL,
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
        }',
        NULL,
        NULL,
        NULL,
        3,
        NULL,
        NULL)
ON CONFLICT ("engine_id")
    DO NOTHING;

UPDATE job_new.build
SET build_state = 'paused'
WHERE engine_id = '2517dfe9-b70d-43b1-bc1b-800618190d92'
  AND build_id != '863a9e36-0df5-4641-964d-267767158193'
  AND build_state = 'deployed';

INSERT INTO job_new.build
("engine_id",
 "build_id",
 "version",
 "build_state",
 "price",
 "created_date",
 "updated_date",
 "deployment_model",
 "docker_image",
 "task_runtime",
 "is_legacy",
 "vul_low_count",
 "vul_medium_count",
 "vul_high_count",
 "vul_critical_count",
 "build_size",
 "deploy_date",
 "manifest",
 "data_certified")
VALUES ('2517dfe9-b70d-43b1-bc1b-800618190d92',
        '863a9e36-0df5-4641-964d-267767158193',
        20,
        'deployed',
        NULL,
        1605255398,
        1605255398,
        0,
        '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:2517dfe9-b70d-43b1-bc1b-800618190d92-863a9e36-0df5-4641-964d-267767158193',
        '{
          "edge": {}
        }',
        FALSE,
        158,
        13,
        NULL,
        NULL,
        779835633,
        NULL,
        '{
          "url": "github.com/veritone/task-benchmark-engines",
          "user": "ldien@veritone.com",
          "build": "863a9e36-0df5-4641-964d-267767158193",
          "oauth": "",
          "runtime": "",
          "category": "conductor",
          "engineId": "2517dfe9-b70d-43b1-bc1b-800618190d92",
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
        }',
        NULL)
ON CONFLICT ("build_id")
    DO UPDATE SET "build_state" = 'deployed'
;
