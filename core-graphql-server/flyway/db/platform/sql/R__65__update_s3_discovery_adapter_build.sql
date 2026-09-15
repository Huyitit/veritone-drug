-- VE-18814 update the S3 Discovery Adapter (S3DAv2) engine build as necessary to the latest
-- version
--
-- This repeatable Flyway script will run frequently, but do nothing if the latest S3DAv2 engine
-- build is already present. If not present, it will insert a new build record for the engine
-- preset to a deployed state.
--
-- Note this could be done with a Versioned script instead of a Repeatable script, but since the
-- only thing that matters is the latest version, it seemed simpler to use a Repeatable script
-- that can be updated as necessary without needing to add new scripts for each update.

-- TO UPDATE TO A NEW RELEASE OF THE S3DAv2 ENGINE:
-- 1. Update v_build_id to match the build_id in stage that was used for testing
-- 2. Update v_docker_image to the docker_image in stage that was used for testing
-- -. Version will be incremented automatically.

DO $FLYWAY$
DECLARE
        v_build_id     text := '319244d3-d40e-4618-8903-57114818727e';
        v_docker_image text := 'registry.central.aiware.com/785a19e5-c2ef-4d0a-b40c-357f47eefa26:319244d3-d40e-4618-8903-57114818727e';

        c_engine_id    text := '785a19e5-c2ef-4d0a-b40c-357f47eefa26';
BEGIN

        IF NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = v_build_id) THEN
                -- pause existing builds
                UPDATE job_new.build
                        SET build_state = 'paused'::public.build_state
                        WHERE engine_id = c_engine_id
                                AND build_state = 'deployed'::public.build_state;

                -- add the new build
                INSERT INTO job_new.build (
                        engine_id,
                        build_id,
                        "version",
                        build_state,
                        docker_image,
                        created_date,
                        updated_date,
                        deployment_model,
                        task_runtime,
                        manifest
                ) VALUES (
                        c_engine_id,
                        v_build_id,
                        (SELECT COALESCE(MAX("version"), 0)+1 FROM job_new.build WHERE engine_id = c_engine_id),
                        'deployed'::public.build_state,
                        v_docker_image,
                        EXTRACT(EPOCH FROM NOW())::int4,
                        EXTRACT(EPOCH FROM NOW())::int4,
                        0,
                        '{"edge": {}}'::jsonb,
                        '{"engineMode": "batch", "supportedInputTypes": []}'::jsonb
                );

                -- ensure the engine is active
                UPDATE job_new.engine
                        SET engine_state = 'active'::public.engine_state
                        WHERE engine_id = c_engine_id;
        END IF;
END
$FLYWAY$;
