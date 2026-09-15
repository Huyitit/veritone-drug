-- Add VIEW type for view only option to package grant
ALTER TYPE aiware.aiw_package_grant_enum ADD VALUE IF NOT EXISTS 'VIEW' AFTER 'GRANT';
