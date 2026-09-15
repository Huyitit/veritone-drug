CREATE OR REPLACE FUNCTION pg_temp.updateAudioVideoChunkCreatorSupportedInputTypes(field jsonb)
RETURNS jsonb AS $$
DECLARE
    inputTypesToAdd jsonb;
BEGIN
    IF
        field ->> 'template' LIKE '%8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440%' AND
        field ->> 'template' LIKE '%ffmpegTemplate":"video%' AND
        NOT field ->> 'template' LIKE '%ffmpegTemplate":"audio%'
    THEN
        inputTypesToAdd := '["audio/mp4", "audio/mpeg"]';
    ELSEIF
        field ->> 'template' LIKE '%8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440%' AND
        field ->> 'template' LIKE '%ffmpegTemplate":"audio%'
    THEN
        inputTypesToAdd := '["audio/mp4", "video/mp4", "audio/mpeg", "video/mpeg"]';
    ELSE
        RETURN field;
    END IF;

    RETURN jsonb_set(
        field,
        '{supportedInputTypes}',
        (
            SELECT
                jsonb_agg(DISTINCT inputType::text)
            FROM
            (
                SELECT jsonb_array_elements_text(field -> 'supportedInputTypes') AS inputType
                UNION ALL
                SELECT jsonb_array_elements_text(inputTypesToAdd)
            ) AS subquery
        ),
        true
    );
END;
$$ LANGUAGE plpgsql;

UPDATE
    job_new.engine
SET
    single_engine_tdo_job_json = pg_temp.updateAudioVideoChunkCreatorSupportedInputTypes(single_engine_tdo_job_json),
    single_engine_upload_job_json = pg_temp.updateAudioVideoChunkCreatorSupportedInputTypes(single_engine_upload_job_json)
WHERE
    single_engine_tdo_job_json ->> 'template' LIKE '%"ffmpegTemplate":"audio"%' OR
    single_engine_tdo_job_json ->> 'template' LIKE '%"ffmpegTemplate":"video"%' OR
    single_engine_upload_job_json ->> 'template' LIKE '%"ffmpegTemplate":"audio"%' OR
    single_engine_upload_job_json ->> 'template' LIKE '%"ffmpegTemplate":"video"%';