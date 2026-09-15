-- Add back resource type for the node modules to the package resource enum
ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'application_config_definition';