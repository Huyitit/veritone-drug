ALTER TABLE IF EXISTS aiware.package__resource
DROP COLUMN IF EXISTS resource_id_bigint;

ALTER TABLE IF EXISTS aiware.package__resource
DROP COLUMN IF EXISTS resource_id_uuid;
