-- Script for AWT-9822: Primary Resources should be unique for each Package Lineage

-- STEP 1:
-- Remove any existing duplicates from package__primary_resource,
-- preserving the primary resource association for only the oldest auto_generated lineage, if there's a conflict
WITH duplicate_primary_resources AS (
    -- find primary resources to remove that are associated with more than one source_origin_id
    SELECT
        resource_id, source_origin_id
    FROM
        (
            SELECT
                pr.resource_id,
                p.source_origin_id,
                ROW_NUMBER() OVER
                    (PARTITION BY resource_id, source_origin_id ORDER BY p.auto_generated DESC, pr.date_created)
                        AS unique_resource_origin_pair_row_num,
                ROW_NUMBER() OVER (PARTITION BY resource_id ORDER BY pr.date_created) AS resource_row_num
            FROM
                aiware.package p
                    JOIN
                aiware.package__primary_resource pr ON p.package_id = pr.package_id
        ) AS subquery
    WHERE unique_resource_origin_pair_row_num = 1 AND resource_row_num > 1
),
packages_associated_with_duplicates AS (
    -- get the packages to remove from the package__primary_resource
    SELECT
        package_id,
        resource_id
    FROM
        aiware.package p
    JOIN
        duplicate_primary_resources dup ON p.source_origin_id = dup.source_origin_id
)
DELETE FROM aiware.package__primary_resource
WHERE (package_id, resource_id) IN (SELECT package_id, resource_id FROM packages_associated_with_duplicates);


-- STEP 2:
-- Create exclusion constraint to ensure the uniqueness of primary resources for each package lineage,
-- while allowing the same pairing to be used more than once (due to a row being created for each package in its lineage)
CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP FUNCTION IF EXISTS get_source_origin_id(package_id_arg UUID);

CREATE FUNCTION get_source_origin_id(package_id_arg UUID)
    RETURNS UUID AS $$
        SELECT source_origin_id FROM aiware.package WHERE package_id = package_id_arg;
$$ LANGUAGE SQL IMMUTABLE;


ALTER TABLE IF EXISTS aiware.package__primary_resource
    DROP CONSTRAINT IF EXISTS excl_resource_lineage_combination CASCADE;

ALTER TABLE aiware.package__primary_resource
    ADD CONSTRAINT excl_resource_lineage_combination
        EXCLUDE USING GIST (resource_id WITH =, get_source_origin_id(package_id) WITH <>);
