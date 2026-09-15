-- AWT-6760
CREATE OR REPLACE FUNCTION aiware.trigger_set_timestamp_date_modified_aiware_package() RETURNS TRIGGER
  LANGUAGE plpgsql
AS
$$
BEGIN
  new.date_modified = NOW();
  RETURN new;
END;
$$;
ALTER FUNCTION aiware.trigger_set_timestamp_date_modified_aiware_package() OWNER TO postgres;
COMMENT ON FUNCTION aiware.trigger_set_timestamp_date_modified_aiware_package IS 'updates date_modified field';

-- Create a new table for the package/primary resource association
CREATE TABLE IF NOT EXISTS aiware.package__primary_resource (
  package_id UUID NOT NULL,
  resource_id TEXT NOT NULL,
  date_created TIMESTAMP DEFAULT NOW() NOT NULL,
  date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
  created_by UUID NOT NULL,
  modified_by UUID NOT NULL,
  CONSTRAINT package_primary_resource_pk FOREIGN KEY (package_id, resource_id) REFERENCES aiware.package__resource (package_id, resource_id)
);

ALTER TABLE aiware.package__primary_resource OWNER TO postgres;
GRANT SELECT ON TABLE aiware.package__primary_resource TO readaccess;

DROP TRIGGER IF EXISTS tr_package__primary_resource ON aiware.package__primary_resource;
CREATE TRIGGER tr_package__primary_resource
  BEFORE UPDATE
  ON aiware.package__primary_resource
  FOR EACH ROW
EXECUTE PROCEDURE aiware.trigger_set_timestamp_date_modified_aiware_package();

COMMENT ON TABLE aiware.package__primary_resource IS 'This table lists all the node modules for palette integration defined in aiWARE and the owner organization';
COMMENT ON COLUMN aiware.package__primary_resource.package_id IS 'ID. Refers to the package that will have a primary resource associated with it.';
COMMENT ON COLUMN aiware.package__primary_resource.resource_id IS 'ID. Refers to the resource that will be associated as the primary resource (typically an entity like an engine or application).';
