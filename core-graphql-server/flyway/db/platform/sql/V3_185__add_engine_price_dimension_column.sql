ALTER TABLE job_new.engine
    ADD COLUMN IF NOT EXISTS price_dimension TEXT;

COMMENT ON COLUMN job_new.engine.price IS 'Number of US cents engine costs to run per unit specified in price_dimension';
COMMENT ON COLUMN job_new.engine.price_dimension IS 'Unit of measurement to use in price calculations';
