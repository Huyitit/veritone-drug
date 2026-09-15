-- AWT-9573
ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'application_content_menu_extension' AFTER 'application_context_menu';
ALTER TYPE aiware.aiw_package_resource_enum ADD VALUE IF NOT EXISTS 'scheduled_job' AFTER 'folder';