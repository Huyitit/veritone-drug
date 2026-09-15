CREATE OR REPLACE FUNCTION pg_temp.updateAudioVideoChunkCreatorInputTypes(job_json jsonb, native_input_types_json jsonb)
    RETURNS jsonb AS $$
DECLARE
    inputTypesToSet  text[];
    nativeInputTypes text[];
    nativeInputType  text;
BEGIN
    IF
        job_json ->> 'template' LIKE '%8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440%' AND
        job_json ->> 'template' ~ '.*"ffmpegTemplate" *: *("video") *.*' AND
        job_json ->> 'template' !~ '.*"ffmpegTemplate" *: *("audio") *.*'
    THEN
        inputTypesToSet := ARRAY ['video/mp4', 'video/mpeg'];
    ELSEIF
        job_json ->> 'template' LIKE '%8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440%' AND
        job_json ->> 'template' ~ '.*"ffmpegTemplate" *: *("audio") *.*'
    THEN
        inputTypesToSet := ARRAY ['video/mp4', 'video/mpeg', 'audio/mp4', 'audio/mpeg'];
    ELSE
        RETURN job_json;
    END IF;

    IF native_input_types_json IS NOT NULL THEN
        SELECT array_agg(value)
        INTO nativeInputTypes
        FROM jsonb_array_elements_text(native_input_types_json) AS value;

        IF nativeInputTypes IS NOT NULL THEN
            FOREACH nativeInputType IN ARRAY nativeInputTypes LOOP
                    IF nativeInputType IS NOT NULL AND NOT nativeInputType = ANY (inputTypesToSet) THEN
                        inputTypesToSet := inputTypesToSet || nativeInputType;
                    END IF;
                END LOOP;
        END IF;
    END IF;

    RETURN jsonb_set(
            job_json,
            '{supportedInputTypes}',
            (SELECT jsonb_agg(inputType) FROM unnest(inputTypesToSet) AS inputType)::jsonb,
            TRUE
        );
END;

$$ LANGUAGE plpgsql;

UPDATE
    job_new.engine
SET
    single_engine_tdo_job_json =
        pg_temp.updateAudioVideoChunkCreatorInputTypes(single_engine_tdo_job_json, engine_manifest -> 'supportedInputTypes'),
    single_engine_upload_job_json =
        pg_temp.updateAudioVideoChunkCreatorInputTypes(single_engine_upload_job_json, engine_manifest -> 'supportedInputTypes')
WHERE
    single_engine_tdo_job_json ->> 'template' ~ '.*"ffmpegTemplate" *: *("audio"|"video") *.*' OR
    single_engine_upload_job_json ->> 'template' ~ '.*"ffmpegTemplate" *: *("audio"|"video") *.*';
