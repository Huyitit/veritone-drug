-- update package__resource table to ensure each package_id, resource_id pair is unique
ALTER TABLE IF EXISTS aiware.package__resource DROP CONSTRAINT IF EXISTS unq_package_resource_id CASCADE;

TRUNCATE aiware.package CASCADE;

ALTER TABLE aiware.package__resource
    ADD CONSTRAINT unq_package_resource_id UNIQUE (package_id, resource_id);
