ALTER TABLE job_new.engine
    ADD COLUMN IF NOT EXISTS input_types text ARRAY;

UPDATE job_new.engine
SET input_types =
        (SELECT array_agg(value)
         FROM jsonb_array_elements_text(engine_manifest->'supportedInputTypes') AS value)
WHERE input_types IS NULL;

COMMENT ON COLUMN job_new.engine.input_types IS 'This is the list of input types supported by the engine';
