-- add source_origin_id, aiware_version, and deleted fields to package table
ALTER TABLE aiware.package
ADD COLUMN IF NOT EXISTS source_origin_id uuid default NULL,
ADD COLUMN IF NOT EXISTS aiware_version TEXT default NULL,
ADD COLUMN IF NOT EXISTS deleted bool default false;

COMMENT ON COLUMN aiware.package.source_origin_id IS 'ID of the original package that this packages "lineage" is derived from.';
COMMENT ON COLUMN aiware.package.aiware_version IS 'Used as a way to indicate that package X depends on aiware_version 3.xx';