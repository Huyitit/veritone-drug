INSERT INTO job_new.engine (
	engine_id,
	engine_category_id,
	engine_name,
	engine_description,
	engine_state,
	deployment_model,
	owner_organization_id,
	is_public,
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
    use_cases,
    engine_manifest
) VALUES (
	'cc34d1cd-1369-4141-a60c-e51cda00d4ec',
	'6faad6b7-0837-45f9-b161-2f6bf31b7a07',
	'Redact Head Detection - CPU',
	'Chunk engine to detect heads in CCTV, Bodycam, or Broadcast video. (Runs on CPU only)',
	'active',
	'0',
	'7682',
	'false',
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
            "max": 30,
            "min": 1,
            "info": "Step over this many video frames between running head detection ( >1 will track heads between frames)",
            "name": "stepSizeDetection",
            "type": "number",
            "label": "Step Size Detection",
            "value": 3,
            "required": false,
            "defaultValue": "3"
        },
        {
            "max": 1,
            "min": 0.1,
            "info": "Confidence threshold for returning head detections",
            "name": "confidenceThreshold",
            "type": "number",
            "label": "Confidence Threshold",
            "value": 0.7,
            "required": false,
            "defaultValue": "0.7"
        },
        {
            "info": "Type of video passed to engine",
            "name": "videoType",
            "type": "picklist",
            "label": "Video Type",
            "value": "Broadcast",
            "options": [
                {
                    "key": "Broadcast",
                    "value": "Broadcast"
                },
                {
                    "key": "Bodycam",
                    "value": "Bodycam"
                },
                {
                    "key": "CCTV",
                    "value": "CCTV"
                }
            ],
            "required": false,
            "defaultValue": "Broadcast"
        },
        {
            "max": 1,
            "min": 0,
            "info": "Max Cosine Distance for head clustering. Lower values will result in more head labels. ",
            "name": "maxCosineDistance",
            "type": "number",
            "label": "Max Cosine Distance",
            "value": 0.3,
            "required": false,
            "defaultValue": "0.3"
        }
    ]',
    false,
    false,
    1570489934,
    1570489934,
    false,
	'USD',
    'cc34d1cd-1369-4141-a60c-e51cda00d4ec',
    '[
        "Redact Heads from videos"
    ]',
    '{
        "engineMode": "chunk",
        "supportedInputTypes": [
            "video/3gpp",
            "video/mp4",
            "video/ogg",
            "video/mpeg",
            "video/quicktime",
            "video/webm",
            "video/x-m4v",
            "video/x-ms-wmv",
            "video/x-msvideo"
        ]
    }'
)
ON CONFLICT DO NOTHING;

