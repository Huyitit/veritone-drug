-- Add a new resource type for the automate nodes to the package resource enum
ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'automate_node' AFTER 'node_red_palette';
-- Add a new resource type for the automate templates to the package resource enum
ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'automate_template' AFTER 'automate_node';
