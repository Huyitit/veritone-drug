-- AWT-11582

-- drop original primary key constraint, if exists
ALTER TABLE IF EXISTS aiware.package__primary_resource
    DROP CONSTRAINT IF EXISTS package_primary_resource_pk;

-- delete any duplicates from the table to prevent conflicts
DELETE FROM aiware.package__primary_resource T1
    USING aiware.package__primary_resource T2
WHERE T1.date_created < T2.date_created    -- keep only the newest entry
  AND T1.package_id = T2.package_id;

-- add new primary key constraint
ALTER TABLE IF EXISTS aiware.package__primary_resource
    ADD CONSTRAINT package_primary_resource_pk PRIMARY KEY (package_id);
