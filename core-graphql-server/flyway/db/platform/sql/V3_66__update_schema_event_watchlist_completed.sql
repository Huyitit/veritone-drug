-- Add core_id column to aiware.cluster table
ALTER TABLE aiware."cluster" ADD COLUMN IF NOT EXISTS core_id text NULL;

COMMENT ON COLUMN aiware."cluster".core_id IS 'The coreId associated with the cluster';