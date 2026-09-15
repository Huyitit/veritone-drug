-- Add a new resource type for the automate dependency palette to the package resource enum
ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'automate_dependency_palette' AFTER 'automate_template';
