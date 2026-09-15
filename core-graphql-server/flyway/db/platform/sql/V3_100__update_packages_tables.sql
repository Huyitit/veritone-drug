-- update package__resource columns
ALTER TABLE aiware.package__resource
ADD COLUMN IF NOT EXISTS resource_id TEXT default NULL;

UPDATE aiware.package__resource
SET
  resource_id = resource_id_uuid::text
where resource_id_uuid is not null;

UPDATE aiware.package__resource
SET
  resource_id = resource_id_bigint::text
where resource_id_bigint is not null;

-- update package__resource table to delete rows when associated package is deleted
ALTER TABLE IF EXISTS aiware.package__resource DROP CONSTRAINT IF EXISTS package__resource_package_id_fkey CASCADE;

ALTER TABLE IF EXISTS aiware.package__resource ADD CONSTRAINT package__resource_package_id_fkey
    FOREIGN KEY (package_id) REFERENCES aiware.package(package_id)
        ON DELETE CASCADE;
