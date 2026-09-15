-- Alter Table

ALTER TABLE job_new.flow_revisions ADD COLUMN IF NOT EXISTS is_deployed bool;

-- Indexes

CREATE INDEX IF NOT EXISTS flow_revisions_is_deployed_idx ON job_new.flow_revisions USING btree (is_deployed);
-- Column comments

COMMENT ON COLUMN job_new.flow_revisions.is_deployed IS 'Indicates if associated build is deployed';
