INSERT INTO job_new.job (
    job_id,
    application_id,
    created_date_time,
    modified_date_time,
    retries,
    is_template,
    job_pipeline_id,
    job_pipeline_stage
) VALUES (
    '3038b894-f1e1-4a84-ba19-f8c370bde8d4',
    'ed075985-bc94-406b-8639-44d1da42c3fb',
    1518926075,
    1518926075,
    0,
    true,
    'baf3f441-a35b-4332-99cf-111e1ac52572',
    1
)
ON CONFLICT DO NOTHING;