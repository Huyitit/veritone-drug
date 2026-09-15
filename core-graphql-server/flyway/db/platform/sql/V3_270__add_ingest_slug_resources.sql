-- Denormalized table partitioned by sourceId
-- This schema combines file metadata and processing status in a single table
-- Partitioned by sourceId for bucket-level isolation and performance

-- Drop existing objects if they exist
DROP TABLE IF EXISTS recording.ingest_slug CASCADE;
DROP TABLE IF EXISTS recording.ingest_slug__recording CASCADE;
DROP TABLE IF EXISTS recording.ingest_slug__status CASCADE;   -- deprecated, may still exist from testing
DROP TYPE IF EXISTS recording.ingest_slug_status_enum CASCADE;

CREATE TYPE recording.ingest_slug_status_enum AS ENUM (
    'ineligible',
    'pending',
    'ingesting',
    'ingested',
    'uploaded',
    'deferred',
    'absent',
    'failed'
);
COMMENT ON TYPE recording.ingest_slug_status_enum IS
    'Represents the possible states of an ingest process:
    - pending: The ingest process is awaiting initiation.
    - ineligible: The item does not meet criteria for ingest.
    - ingesting: The ingest process is currently in progress.
    - failed: The ingest process has encountered an error and did not complete successfully.
    - uploaded: The item has been uploaded and is ready for further processing.
    - deferred: The ingest process has been postponed and will be retried or resumed later.
    - absent: The item is missing and cannot be ingested.
    - ingested: The ingest process has completed successfully.';

-- Denormalized file records table (partitioned by sourceId)
CREATE TABLE recording.ingest_slug (
    media_source_id INT4 NOT NULL,
    file_uri TEXT NOT NULL,
    status recording.ingest_slug_status_enum NOT NULL DEFAULT 'pending',
    status_message TEXT,
    bundle_key TEXT NULL,
    organization_id INT4,
    content_type TEXT NOT NULL,
    file_size_bytes BIGINT,
    file_created_at TIMESTAMP,
    file_modified_at TIMESTAMP,
    file_accessed_at TIMESTAMP,
    application_id UUID,
    engine_id UUID,
    batch_file_uri TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by TEXT,
    PRIMARY KEY (media_source_id, file_uri)
) PARTITION BY HASH (media_source_id);

-- table and column documentation
COMMENT ON TABLE recording.ingest_slug IS 'Stores information about ingested files for each media source.';
COMMENT ON COLUMN recording.ingest_slug.media_source_id IS 'Unique identifier for the media source.';
COMMENT ON COLUMN recording.ingest_slug.file_uri IS 'URI of the ingested file.';
COMMENT ON COLUMN recording.ingest_slug.organization_id IS 'Unique identifier for the organization (must match media source).';
COMMENT ON COLUMN recording.ingest_slug.bundle_key IS 'Key representing the bundle this file belongs to.';
COMMENT ON COLUMN recording.ingest_slug.status IS 'Status of the ingest process.';
COMMENT ON COLUMN recording.ingest_slug.status_message IS 'Error, warning, or information about the ingestion of this file.';
COMMENT ON COLUMN recording.ingest_slug.content_type IS 'Media type of the file (if known).';
COMMENT ON COLUMN recording.ingest_slug.file_size_bytes IS 'Size of file in bytes (if known).';
COMMENT ON COLUMN recording.ingest_slug.file_created_at IS 'Timestamp when the file was uploaded to the CDN (S3, Azure, Dropbox, etc).';
COMMENT ON COLUMN recording.ingest_slug.application_id IS 'UUID of the application or service that discovered or uploaded this file.';
COMMENT ON COLUMN recording.ingest_slug.engine_id IS 'UUID of the adapter engine that discovered this file.';
COMMENT ON COLUMN recording.ingest_slug.batch_file_uri IS 'URI of a batch file (CSV, Excel, XML, etc) that references this file.';
COMMENT ON COLUMN recording.ingest_slug.created_at IS 'Timestamp when the slug was created. This is when aiWARE first discovered or uploaded this file.';
COMMENT ON COLUMN recording.ingest_slug.updated_at IS 'Timestamp when the record was last updated.';


-- Create partitions for file_records (64 partitions for hash distribution)
DO
$$
  BEGIN
    FOR i IN 0..63
      LOOP
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS recording.ingest_slug_p%s PARTITION OF recording.ingest_slug FOR VALUES WITH (MODULUS %s, REMAINDER %s)',
          lpad(i::text, 2, '0'), 64, i);
      END LOOP;
  END
$$;

-- Create unique index to enforce only one file per bundle can be ingesting at a time.
-- This is used to enforce locking for parallel thread processing at the database level.
CREATE UNIQUE INDEX uidx_ingest_slug_bundle_ingest ON recording.ingest_slug (media_source_id, bundle_key) WHERE status = 'ingesting' and bundle_key IS NOT NULL;

-- Indexes on recording.ingest_slug partitions
CREATE INDEX idx_ingest_slug_bundle_key ON recording.ingest_slug(media_source_id, bundle_key);
CREATE INDEX idx_ingest_slug_created_at ON recording.ingest_slug(media_source_id, created_at);
CREATE INDEX idx_ingest_slug__status_status ON recording.ingest_slug(status);
CREATE INDEX idx_ingest_slug__status_updated_at ON recording.ingest_slug(updated_at);

-- Composite indexes for common query patterns
CREATE INDEX idx_file_processing_composite_status ON recording.ingest_slug(media_source_id, status, updated_at);

-- Update trigger for updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_file_records_updated_at BEFORE UPDATE ON recording.ingest_slug
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE recording.ingest_slug__recording (
    media_source_id INT4 NOT NULL,
    file_uri TEXT NOT NULL,
    recording_id TEXT NOT NULL,
    asset_id TEXT,
    PRIMARY KEY (media_source_id, file_uri),
    CONSTRAINT fk_ingest_slug_recording FOREIGN KEY (recording_id) REFERENCES recording.recording(recording_id) ON DELETE CASCADE,
    CONSTRAINT fk_ingest_slug_ingest FOREIGN KEY (media_source_id, file_uri) REFERENCES recording.ingest_slug(media_source_id, file_uri) ON DELETE CASCADE
);