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

CREATE TABLE IF NOT EXISTS aiware.package
(
    package_id uuid NOT NULL PRIMARY KEY,
    organization_id INT NOT NULL,
    package_name TEXT NOT NULL,
    package_description TEXT NULL,
    package_version TEXT NOT NULL DEFAULT '1.0',
    source_package_id uuid NULL REFERENCES aiware.package (package_id),
    distribution_type job_new.distribution_type DEFAULT 'instance_locked'::job_new.distribution_type NOT NULL,
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
    created_by uuid NOT NULL,
    modified_by uuid NOT NULL,
    CONSTRAINT unq_orgid_name UNIQUE (organization_id,package_name,package_version)
);
ALTER TABLE aiware.package OWNER TO postgres;
GRANT SELECT ON TABLE aiware.package TO readaccess;

DROP TRIGGER IF EXISTS tr_packages ON aiware.package;
CREATE TRIGGER tr_packages
    BEFORE UPDATE
    ON aiware.package
    FOR EACH ROW
EXECUTE PROCEDURE aiware.trigger_set_timestamp_date_modified_aiware_package();

COMMENT ON TABLE aiware.package IS 'This table lists all the packages defined in aiWARE and the owner organization';
COMMENT ON COLUMN aiware.package.package_id IS 'ID. uuid';
COMMENT ON COLUMN aiware.package.organization_id IS 'Organization ID as Int';
COMMENT ON COLUMN aiware.package.package_name IS 'Package name';
COMMENT ON COLUMN aiware.package.package_description IS 'Description of the package.';
COMMENT ON COLUMN aiware.package.distribution_type IS 'Distribution or visibility type. Default is instance_locked';
COMMENT ON COLUMN aiware.package.package_version IS 'This is the version of the package';
COMMENT ON COLUMN aiware.package.source_package_id IS 'If a package is copied from another package, this field will be set to the source package this was based on.';
COMMENT ON COLUMN aiware.package.date_created IS 'Date Created';
COMMENT ON COLUMN aiware.package.date_modified IS 'Date Modified';
COMMENT ON COLUMN aiware.package.created_by IS 'Created by';
COMMENT ON COLUMN aiware.package.modified_by IS 'Modified by';

DROP TYPE IF EXISTS aiware.aiw_package_resource_enum CASCADE;
CREATE TYPE aiware.aiw_package_resource_enum AS ENUM (
    'application',
    'application_context_menu',
    'application_viewer',
    'dataset',
    'engine',
    'engine_build',
    'event_definition',
    'event_listener',
    'event_listener_mapping',
    'flow',
    'library',
    'library_type',
    'schema',
    'service',
    'package',
    'sdo',
    'tdo',
    'folder',
    'program',
    'dag_template'
);
ALTER TYPE aiware.aiw_package_resource_enum OWNER TO postgres;

-- the table needs to be dropped due to the CASCADE delete of the type
DROP TABLE IF EXISTS aiware.package__resource;
CREATE TABLE aiware.package__resource
(
    id BIGSERIAL NOT NULL PRIMARY KEY,
    package_id uuid NOT NULL REFERENCES aiware.package (package_id),
    resource_type aiware.aiw_package_resource_enum NOT NULL DEFAULT 'engine'::aiware.aiw_package_resource_enum,
    resource_id_bigint BIGINT NULL,
    resource_id_uuid BIGINT NULL,
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
    created_by uuid NOT NULL,
    modified_by uuid NOT NULL,
    CONSTRAINT unq_package_resource_id UNIQUE (package_id,resource_type,resource_id_bigint,resource_id_uuid)
);
ALTER TABLE aiware.package__resource OWNER TO postgres;
GRANT SELECT ON TABLE aiware.package__resource TO readaccess;

DROP TRIGGER IF EXISTS tr_package__resource ON aiware.package__resource;
CREATE TRIGGER tr_package__resource
    BEFORE UPDATE
    ON aiware.package__resource
    FOR EACH ROW
EXECUTE PROCEDURE aiware.trigger_set_timestamp_date_modified_aiware_package();

COMMENT ON TABLE aiware.package__resource IS 'This table lists all the packages defined in aiWARE and the owner organization';
COMMENT ON COLUMN aiware.package__resource.id IS 'ID. BigInt';
COMMENT ON COLUMN aiware.package__resource.package_id IS 'Package ID. BigInt';

CREATE INDEX IF NOT EXISTS "_ix_package__resouce@package__resource" ON aiware.package__resource (package_id, resource_type);

DROP TYPE IF EXISTS aiware.aiw_package_grant_enum CASCADE;
CREATE TYPE aiware.aiw_package_grant_enum AS ENUM (
    'GRANT',
    'DENY'
);
ALTER TYPE aiware.aiw_package_grant_enum OWNER TO postgres;

DROP TABLE IF EXISTS aiware.package__organization;
CREATE TABLE aiware.package__organization
(
    package_id uuid NOT NULL REFERENCES aiware.package(package_id),
    organization_id INT NOT NULL,
    grant_type aiware.aiw_package_grant_enum NOT NULL DEFAULT 'GRANT'::aiware.aiw_package_grant_enum,
    date_created TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
    created_by uuid NOT NULL,
    modified_by uuid NOT NULL,
    CONSTRAINT pk_package__organization PRIMARY KEY (package_id, organization_id)
);
ALTER TABLE aiware.package__organization OWNER TO postgres;
GRANT SELECT ON TABLE aiware.package__organization TO readaccess;

DROP TRIGGER IF EXISTS tr_package__organization ON aiware.package__organization;
CREATE TRIGGER tr_package__organization
    BEFORE UPDATE
    ON aiware.package__organization
    FOR EACH ROW
EXECUTE PROCEDURE aiware.trigger_set_timestamp_date_modified_aiware_package();

COMMENT ON TABLE aiware.package__organization IS 'Controls visibility of packages and their resources to other organizations';
COMMENT ON COLUMN aiware.package__organization.package_id IS 'Packge ID. uuid';
COMMENT ON COLUMN aiware.package__organization.organization_id IS 'Organization ID. Int';
COMMENT ON COLUMN aiware.package__organization.grant_type IS 'Grant Type. Default GRANT';
COMMENT ON COLUMN aiware.package__organization.date_created IS 'Date Created. Timestamp';
COMMENT ON COLUMN aiware.package__organization.date_modified IS 'Date Modified. Timestamp';
COMMENT ON COLUMN aiware.package__organization.created_by IS 'Created By. Timestamp';
COMMENT ON COLUMN aiware.package__organization.modified_by IS 'Modified By. Timestamp';
