-- citests/tdo.js

INSERT INTO program (
    program_id,
    program_name,
    program_description,
    program_format_id,
    media_source_type_id,
    organization_id,
    recording_status_id,
    date_created,
    date_modified,
    is_national,
    is_public,
    is_nationally_syndicated,
    program_sequence,
    is_active,
    run_mode,
    start_date_time,
    task_data
) VALUES (
    75191,
    'test_source_1578408561242-testjob1',
    'test_source_1578408561242-testjob1',
    121,
    5,
    7682,
    3,
    '2020-01-07 14:50:28.467596',
    '2020-01-07 14:50:28.488005',
    true,
    false,
    false,
    0,
    true,
    1,
    '2020-01-07 14:50:28.468',
    '{
        "engineIds": [],
        "clusterIds": [],
        "engineTypeIds": [],
        "jobPipelineIds": [],
        "jobTemplateIds": [],
        "engineTypeNames": [],
        "numJobTemplates": 0,
        "numTaskTemplates": 0,
        "allJobTemplateIds": [],
        "engineCategoryIds": []
    }'
)
ON CONFLICT DO NOTHING;
