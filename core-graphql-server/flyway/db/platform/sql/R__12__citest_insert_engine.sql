INSERT INTO job_new.engine_class (
    engine_class_id,
    engine_class_name,
    engine_class_description,
    icon_class
) VALUES (
    '29fd494a-e1e9-4eea-82bf-b80b36adbd82',
    'text',
    'The input to engines in the Text class can be structured or unstructured text. In some cases the text input is structured in a VTN standard format. Such is the case when the output from a Transcription (Speech) engine is fed into a Translation (Text) engine. Text engines may translate text from one language to another, summarize it, detect profane language or extract sentiment or entities, for example.  Text Analytics is often used as an umbrella term for combinations of Capabilities within the Text class.',
    'icon-translation'
)
ON CONFLICT DO NOTHING;

INSERT INTO job_new.engine_category (
    engine_category_id,
    engine_category_name,
    engine_category_description,
    data_field,
    icon_class,
    editable,
    video_only,
    "order",
    created_date,
    updated_date,
    library_identifier_types,
    dependencies,
    color,
    engine_class_id,
    engine_type_id,
    export_formats
  )
VALUES
  (
    '6c772d3b-6f40-4d85-a672-ddb75dbae0a4',
    'Keyword Extraction',
    'Identifies key terms and/or phrases that appear in one or more documents, based on parts of speech, salience, or other criteria',
    'keyword',
    'font_download',
    false,
    false,
    27,
    1565039538,
    1565039538,
    NULL,
    NULL,
    NULL,
    '29fd494a-e1e9-4eea-82bf-b80b36adbd82',
    'fcc22feb-9184-4f53-be5e-7694927864d9',
    '[]'
  )
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
    industries,
    engine_manifest
) VALUES (
	'82bca870-aa2f-4168-a61a-9d789dec5c9c',
	'6c772d3b-6f40-4d85-a672-ddb75dbae0a4',
	'Hello World',
	'Test',
	'disabled',
	'0',
	'7682',
	'false',
    100,
	'{}',
	'[]',
    false,
    false,
    1573156148,
    1573156148,
    true,
	'USD',
    '82bca870-aa2f-4168-a61a-9d789dec5c9c',
    '[
        "testing use case"
    ]',
    '[
        "Legal and compliance"
    ]',
    '{
        "engineMode": "chunk",
        "supportedInputTypes": [
            "text/plain; charset=utf-8",
            "text/plain",
            "text/html"
        ]
    }'
)
ON CONFLICT DO NOTHING;

