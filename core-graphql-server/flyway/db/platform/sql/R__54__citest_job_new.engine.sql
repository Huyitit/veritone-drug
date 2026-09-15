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
	'c3497af0-ac1c-421d-8b2e-618797093623',
	'088a31be-9bd6-4628-a6f0-e4004e362ea0',
	'Google - General Object Detection - V2F',
	'Easily detect broad sets of objects in your images, from flowers, animals, or transportation to thousands of other object categories commonly found within images.',
	'active',
	'1',
	'7682',
	'false',
	750,
  28,
  '{
    "category": "image-detection",
    "dependencies": [
        "ingestion",
        "transcode"
    ]
  }',
  false,
  false,
  1530763838,
  1540489204,
  false,
  'https://www.filepicker.io/api/file/1FreIxohT4yF53L5h9Ub',
  'USD',
  'c3497af0-ac1c-421d-8b2e-618797093623',
  'Object Detection - AC - V2F',
  'This premium engine labels visual content to describe the objects and concepts in the image or video, on V2F. '
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;
