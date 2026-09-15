-- citests/tdo.js

WITH rows AS (
    INSERT INTO media (
        media_start_time,
        media_stop_time,
        status,
        transcode_source,
        transcode_percent_complete,
        transcribe_source,
        transcribe_percent_complete,
        media_source_id,
        date_created,
        date_modified,
        program_id,
        owner_application_id,
        is_public
    ) VALUES (
        '2020-01-05 14:49:42',
        '2020-01-05 14:52:42',
        'uploaded',
        'zencoder',
        0,
        'mavis',
        0,
        -1,
        '2020-01-07 14:49:42.671774',
        '2020-01-07 14:49:42.671774',
        -1,
        'ed075985-bc94-406b-8639-44d1da42c3fb',
        true
    ) ON CONFLICT DO NOTHING RETURNING media_id
)
INSERT INTO mention (
    mention_status_id,
    mention_snippets,
    organization_id,
    program_id,
    media_id,
    media_source_id,
    media_source_type_id,
    mention_date,
    is_match,
    hit_start_date,
    hit_end_date,
    mention_end_date,
    metadata,
    mention_hit_count,
    created_at,
    updated_at
) 
SELECT
    1,
    '[{"startTime":334.179,"endTime":390.179,"text":"Snippet 3"}]',
    7682,
    -1,
    media_id,
    -1,
    5,
    '2020-01-05 14:53:17.652+00',
    true,
    '2020-01-05 14:53:27.652+00',
    '2020-01-05 14:53:47.652+00',
    '2020-01-05 14:54:13.652+00',
    '{"veritonePermissions":{"isPublic":true,"acls":[{"groupId":"ea738f5b-9f52-45f3-8db8-3167bfd625fe","permission":"owner"}]},"addToIndex":true,"startDateTime":1578235782,"stopDateTime":1578235962,"security":{"global":true},"applicationId":"ed075985-bc94-406b-8639-44d1da42c3fb","status":"uploaded","createdDateTime":1578408582,"modifiedDateTime":1578408582,"recordingId":"830000293"}',
    1,
    '2020-01-07 14:49:42.735798',
    '2020-01-07 14:49:42.735798'
FROM rows ON CONFLICT DO NOTHING;
