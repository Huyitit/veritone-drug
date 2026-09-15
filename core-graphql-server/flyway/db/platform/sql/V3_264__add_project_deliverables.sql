CREATE TABLE IF NOT EXISTS recording.processing_project (
  processing_project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  application_id UUID,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(organization_id, name)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS "idx_recording__processing_project__organization_id" ON recording.processing_project(organization_id);
CREATE INDEX IF NOT EXISTS "idx_recording__processing_project__orgid_application_id" ON recording.processing_project(organization_id, application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_recording__processing_project__organization_id_name" ON recording.processing_project(organization_id, name);
CREATE INDEX IF NOT EXISTS "idx_processing_project__updated_at" ON recording.processing_project(updated_at);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION recording.update_processing_project_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row update
DROP TRIGGER IF EXISTS trigger_update_processing_project_updated_at ON recording.processing_project;
CREATE TRIGGER trigger_update_processing_project_updated_at
  BEFORE UPDATE ON recording.processing_project
  FOR EACH ROW
  EXECUTE FUNCTION recording.update_processing_project_updated_at();

-- Create enum type for deliverable status
DO $$ BEGIN
  CREATE TYPE recording.deliverable_status AS ENUM ('incomplete', 'failed', 'complete', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS recording.processing_deliverable__tdo (
  processing_deliverable_id UUID DEFAULT gen_random_uuid(),
  processing_project_id UUID NOT NULL REFERENCES recording.processing_project(processing_project_id) ON DELETE CASCADE,
  recording_id BIGINT NOT NULL, -- changed from TEXT
  asset_type TEXT,
  engine_id UUID,
  schema_id UUID,
  engine_category_id UUID,
  status recording.deliverable_status NOT NULL DEFAULT 'incomplete',
  status_message TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  PRIMARY KEY (processing_deliverable_id, processing_project_id)
) PARTITION BY HASH (processing_project_id);

-- Create 100 hash partitions
-- Note: PostgreSQL hash partitioning uses modulo operation, so we create partitions numbered 0-99
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 0..99 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS recording.processing_deliverable__tdo_p%s PARTITION OF recording.processing_deliverable__tdo FOR VALUES WITH (MODULUS 100, REMAINDER %s)', i, i);
  END LOOP;
END $$;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS "idx_processing_deliverable__tdo_project" ON recording.processing_deliverable__tdo(processing_project_id);
CREATE INDEX IF NOT EXISTS "idx_processing_deliverable__tdo_recording_id" ON recording.processing_deliverable__tdo(recording_id);
CREATE INDEX IF NOT EXISTS "idx_processing_deliverable__tdo_created_at" ON recording.processing_deliverable__tdo(created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_processing_deliverable__tdo_status" ON recording.processing_deliverable__tdo(status);
CREATE INDEX IF NOT EXISTS "idx_processing_deliverable__tdo_asset_type" ON recording.processing_deliverable__tdo(asset_type);
CREATE INDEX IF NOT EXISTS "idx_processing_deliverable__tdo_engine_id" ON recording.processing_deliverable__tdo(engine_id);
CREATE INDEX IF NOT EXISTS "idx_processing_deliverable__tdo_schema_id" ON recording.processing_deliverable__tdo(schema_id);
CREATE INDEX IF NOT EXISTS "idx_processing_deliverable__tdo_engine_category_id" ON recording.processing_deliverable__tdo(engine_category_id);

CREATE INDEX IF NOT EXISTS "ix_processing_deliverable_tdo__totals" ON recording.processing_deliverable__tdo (processing_project_id, status);
CREATE INDEX IF NOT EXISTS "ix_processing_deliverable_tdo__totals_incomplete" ON recording.processing_deliverable__tdo (processing_project_id, status) WHERE status = 'incomplete';
CREATE INDEX IF NOT EXISTS "ix_processing_deliverable_tdo__totals_complete" ON recording.processing_deliverable__tdo (processing_project_id, status) WHERE status = 'complete';
CREATE INDEX IF NOT EXISTS "ix_processing_deliverable_tdo__totals_failed" ON recording.processing_deliverable__tdo (processing_project_id, status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS "ix_processing_deliverable_tdo__totals_canceled" ON recording.processing_deliverable__tdo (processing_project_id, status) WHERE status = 'canceled';

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION recording.update_processing_deliverable_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row update
DROP TRIGGER IF EXISTS trigger_update_processing_deliverable_updated_at ON recording.processing_deliverable__tdo;
CREATE TRIGGER trigger_update_processing_deliverable_updated_at
  BEFORE UPDATE ON recording.processing_deliverable__tdo
  FOR EACH ROW
  EXECUTE FUNCTION recording.update_processing_deliverable_updated_at();