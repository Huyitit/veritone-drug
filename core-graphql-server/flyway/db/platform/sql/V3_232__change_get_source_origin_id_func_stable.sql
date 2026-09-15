-- replace the current get_source_origin_id function with a stable version
-- by replacing it with a new column source_origin_id to the package__primary_resource table that tracks package.source_origin_id
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE IF EXISTS aiware.package__primary_resource
    DROP CONSTRAINT IF EXISTS excl_resource_lineage_combination CASCADE;

DROP FUNCTION IF EXISTS get_source_origin_id(package_id_arg UUID);

-- add a column that duplicates the package.source_origin_id
ALTER TABLE aiware.package__primary_resource
ADD COLUMN source_origin_id UUID;

-- populate the new column with the package.source_origin_id
UPDATE aiware.package__primary_resource ppr
SET source_origin_id = (SELECT source_origin_id FROM aiware.package p WHERE p.package_id = ppr.package_id);

-- create constraint using the new column instead of IMMUTABLE function
ALTER TABLE aiware.package__primary_resource
ADD CONSTRAINT excl_resource_lineage_combination
EXCLUDE USING GIST (resource_id WITH =, source_origin_id WITH <>);


-- create a trigger to populate the new column on insert/update
CREATE OR REPLACE FUNCTION populate_source_origin_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Set source_origin_id based on the package_id
    NEW.source_origin_id := (SELECT source_origin_id FROM aiware.package WHERE package_id = NEW.package_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_populate_source_origin_id
BEFORE INSERT OR UPDATE OF package_id ON aiware.package__primary_resource
FOR EACH ROW
EXECUTE FUNCTION populate_source_origin_id();

-- create a trigger to update the new column is package.source_origin_id changes
CREATE OR REPLACE FUNCTION update_source_origin_in_resources()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE aiware.package__primary_resource
    SET source_origin_id = NEW.source_origin_id
    WHERE package_id = NEW.package_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_source_origin
AFTER UPDATE OF source_origin_id ON aiware.package
FOR EACH ROW
EXECUTE FUNCTION update_source_origin_in_resources();
