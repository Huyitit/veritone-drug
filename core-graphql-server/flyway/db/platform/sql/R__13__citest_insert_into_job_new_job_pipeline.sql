INSERT INTO job_new.job_pipeline (
    job_pipeline_id,
    created_date_time,
    modified_date_time,
    owner_organization_id,
    is_public
) VALUES (
    'baf3f441-a35b-4332-99cf-111e1ac52572',
    1518926070,
    1518926070,
    7682,
    true
)
ON CONFLICT DO NOTHING;