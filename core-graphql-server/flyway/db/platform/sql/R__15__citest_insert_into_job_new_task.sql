INSERT INTO job_new.task (
    task_id,
    job_id,
    application_id,
    created_date_time,
    modified_date_time,
    task_order,
    task_payload,
    is_clone,
    engine_id,
    is_template,
    job_pipeline_id
) VALUES (
    'ba7048f5-d830-4e26-a3bd-b581bf868ae0-3038b894-f1e1-4a84-ba19-f8c370bde8d4',
    '3038b894-f1e1-4a84-ba19-f8c370bde8d4',
    'ed075985-bc94-406b-8639-44d1da42c3fb',
    1518926080,
    1518926080,
    1,
    '{
        "scanSource": "##SCAN_SOURCE##"
    }',
    false,
    's3-scanner',
    true,
    'baf3f441-a35b-4332-99cf-111e1ac52572'
)
ON CONFLICT DO NOTHING;