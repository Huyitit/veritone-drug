ALTER TABLE aiware.package ADD COLUMN IF NOT EXISTS package_created_date TIMESTAMP DEFAULT NOW() NOT NULL;

UPDATE aiware.package SET package_created_date = date_created;

COMMENT ON COLUMN aiware.package.package_created_date IS 'The date that the package was originally created. If package is duplicated by Hub, this field should match the date_created field of the original package.';
