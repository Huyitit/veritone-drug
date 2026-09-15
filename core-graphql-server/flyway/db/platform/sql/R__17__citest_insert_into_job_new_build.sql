INSERT INTO job_new.build (
    engine_id,
    build_id,
    price,
    version,
    is_legacy,
    task_runtime,
    build_state,
    deployment_model,
    created_date,
    updated_date
)
SELECT
    's3-scanner',
    '0196ab1c-6792-40e6-b682-709a86519d02',
    0,
    1,
    true,
    '{
        "iron": {
            "cluster": "58547f7a3053fe0007d769d3",
            "priority": 0
        }
    }',
    'deployed',
    0,
    1505273899,
    1505273899
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = '0196ab1c-6792-40e6-b682-709a86519d02'
    OR (engine_id = 's3-scanner' AND build_state = 'deployed'));
    