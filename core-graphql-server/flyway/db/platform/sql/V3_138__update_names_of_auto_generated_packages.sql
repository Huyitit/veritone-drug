-- AWT-9087
ALTER TABLE aiware.package DROP CONSTRAINT IF EXISTS unq_orgid_name CASCADE;

ALTER TABLE aiware.package
    ADD CONSTRAINT unq_orgid_name UNIQUE (organization_id, package_name, package_version, source_origin_id);

WITH engine_name_mapping AS (
	SELECT
        pr.package_id,
        COALESCE(e.engine_name, CAST(p.package_id AS TEXT), 'NoPrimaryResource') AS new_package_name,
        p.source_origin_id,
        p.organization_id,
		p.package_version
    FROM
        aiware.package__primary_resource AS pr
    JOIN
        job_new.engine AS e    ON pr.resource_id = e.engine_id
    JOIN aiware.package p ON p.package_id = pr.package_id
    WHERE p.auto_generated = true
),
unique_engine_name_mapping AS (
	SELECT 
		MAX(engine_name_mapping.package_id::TEXT)::uuid AS package_id, 
		new_package_name FROM engine_name_mapping
	GROUP BY (organization_id, new_package_name, package_version, source_origin_id)
)
UPDATE
    aiware.package AS pkg
SET
    package_name = unique_engine_name_mapping.new_package_name
FROM
    unique_engine_name_mapping
WHERE
    pkg.auto_generated = true
AND pkg.package_id = unique_engine_name_mapping.package_id
