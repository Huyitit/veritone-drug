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
	'd1bc57fe-675d-435d-9f4d-2f074485ec55',
	'0b10da6b-3485-496c-a2cb-aabf59a6352d',
	'WebRTC Push Adapter',
	'Real-time adapter that receives WebRTC streams',
	'active',
	'0',
	'7682',
	'false',
	NULL,
	'https://s3.amazonaws.com/static.veritone.com/veritone-ui/ingestion/adapter-webRTC.png',
	NULL,
	'[
        {
            "max": null,
            "min": null,
            "info": "Kurento webRTC endpoint",
            "name": "source",
            "step": null,
            "type": "Text",
            "label": "Source",
            "options": null,
            "defaultValue": null
        }
    ]',
    true,
    false,
    1522774417,
    1528873567,
    false,
	'USD',
    'd1bc57fe-675d-435d-9f4d-2f074485ec55'
)
ON CONFLICT DO NOTHING;

