-- Add a new resource type for data registries to the package resource enum
ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'data_registry';
