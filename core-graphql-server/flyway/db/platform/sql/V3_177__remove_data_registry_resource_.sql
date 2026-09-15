-- AWT-11389

-- Create new type that contains all enum values excluding data_registry
DROP TYPE IF EXISTS aiware.aiw_package_resource_enum_new CASCADE;
CREATE TYPE aiware.aiw_package_resource_enum_new AS enum (
    'application',
    'application_context_menu',
    'application_content_menu_extension',
    'application_viewer',
    'dataset',
    'engine',
    'engine_build',
    'event_definition',
    'event_listener',
    'event_listener_mapping',
    'automate_flow_revision',
    'library',
    'library_type',
    'node_red_palette',
    'automate_node',
    'automate_template',
    'automate_palette',
    'schema',
    'service',
    'package',
    'sdo',
    'tdo',
    'folder',
    'scheduled_job',
    'program',
    'dag_template'
    );

-- Remove existing 'data_registry' resources
DELETE FROM aiware.package__resource WHERE resource_type = 'data_registry';

-- DROP existing default of resource_type column to prevent type cast errors
ALTER TABLE IF EXISTS aiware.package__resource
    ALTER COLUMN resource_type DROP DEFAULT;

-- Convert to new type, casting via text representation
ALTER TABLE IF EXISTS aiware.package__resource
    ALTER COLUMN resource_type TYPE aiware.aiw_package_resource_enum_new
        USING resource_type::text::aiware.aiw_package_resource_enum_new;

-- Drop old type and rename new type to old type
DROP TYPE IF EXISTS aiware.aiw_package_resource_enum CASCADE;
ALTER TYPE aiware.aiw_package_resource_enum_new RENAME TO aiw_package_resource_enum;

ALTER TYPE aiware.aiw_package_resource_enum OWNER TO postgres;

-- Set default value for resource_type back to what it originally was
ALTER TABLE IF EXISTS aiware.package__resource
    ALTER COLUMN resource_type SET DEFAULT 'engine'::aiware.aiw_package_resource_enum;
