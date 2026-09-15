ALTER TABLE IF EXISTS aiware.package__primary_resource DROP CONSTRAINT IF EXISTS package_primary_resource_pk CASCADE;
ALTER TABLE IF EXISTS aiware.package__primary_resource DROP CONSTRAINT IF EXISTS package_primary_resource_fk CASCADE;

-- rename foreign key
ALTER TABLE IF EXISTS aiware.package__primary_resource
    ADD CONSTRAINT package_primary_resource_fk
        FOREIGN KEY (package_id, resource_id) REFERENCES aiware.package__resource (package_id, resource_id) ON DELETE CASCADE;

-- need to set the replica identity else the delete will fail due to the existing subscriptions
ALTER TABLE IF EXISTS aiware.package__primary_resource REPLICA IDENTITY FULL;

-- delete any duplicates from the table to prevent conflicts
DELETE FROM aiware.package__primary_resource T1 
      USING aiware.package__primary_resource T2
WHERE T1.date_created < T2.date_created    -- delete the "older" entry of the two
  AND T1.package_id = T2.package_id
  AND T1.resource_id = T2.resource_id;

-- add primary key
ALTER TABLE IF EXISTS aiware.package__primary_resource  ADD CONSTRAINT package_primary_resource_pk PRIMARY KEY (package_id, resource_id);
