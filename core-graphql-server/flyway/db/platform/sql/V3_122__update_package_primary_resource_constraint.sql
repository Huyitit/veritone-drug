ALTER TABLE IF EXISTS aiware.package__primary_resource DROP CONSTRAINT IF EXISTS package_primary_resource_pk CASCADE;

ALTER TABLE aiware.package__primary_resource
    ADD CONSTRAINT package_primary_resource_pk
        FOREIGN KEY (package_id, resource_id) REFERENCES aiware.package__resource (package_id, resource_id) ON DELETE CASCADE;
