ALTER TABLE aiware.package ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false NOT NULL;

COMMENT ON COLUMN aiware.package.auto_generated IS 'A flag that tells whether the package was created as a result of an automated process.';
