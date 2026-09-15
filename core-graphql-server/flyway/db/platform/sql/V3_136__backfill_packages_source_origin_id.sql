-- AWT-8967
UPDATE aiware.package p
SET source_origin_id = p.package_id
WHERE p.source_origin_id IS NULL
AND p.package_version = '1.0'
