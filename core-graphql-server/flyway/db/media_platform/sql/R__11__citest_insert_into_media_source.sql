-- citests/scheduledJob.js

INSERT INTO media_source (
    media_source_name,
    media_source_type_id,
    live_timezone,
    organization_id,
    kvp,
    date_created,
    date_modified,
    is_public
) VALUES (
    'core-graphql-server citests',
    17,
    'UTC',
    7682,
    '{"url":"https://www.youtube.com/watch?v=GZvHk83Hipk"}',
    current_timestamp,
    current_timestamp,
    false
)
ON CONFLICT DO NOTHING;
