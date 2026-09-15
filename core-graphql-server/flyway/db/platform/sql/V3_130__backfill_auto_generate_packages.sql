-- AWT-8858
UPDATE aiware.package p
SET auto_generated = true
WHERE auto_generated = false
AND package_name ~ '^\S*\s-\s\d+\s-\s\d+\s-\s\S*\spackage\s\d+.0'
