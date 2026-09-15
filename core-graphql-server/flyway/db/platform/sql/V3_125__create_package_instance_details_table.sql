-- Create enum type for the status column of package
DROP TYPE IF EXISTS aiware.package_status_enum CASCADE;
CREATE TYPE aiware.package_status_enum AS ENUM ('draft', 'approved', 'published', 'deactivated', 'pending');
ALTER TYPE aiware.package_status_enum OWNER TO postgres;

-- add column status to package table with default value 'draft'
ALTER TABLE aiware.package ADD COLUMN IF NOT EXISTS status aiware.package_status_enum DEFAULT 'draft'::aiware.package_status_enum NOT NULL;

-- add column package_icon to package table
ALTER TABLE aiware.package ADD COLUMN IF NOT EXISTS package_icon TEXT;

-- add column distribution_date and install_date to package table
ALTER TABLE aiware.package ADD COLUMN IF NOT EXISTS distribution_date TIMESTAMP;
ALTER TABLE aiware.package ADD COLUMN IF NOT EXISTS install_date TIMESTAMP DEFAULT NOW() NOT NULL;

COMMENT ON COLUMN aiware.package.status IS 'Current status of the package';
COMMENT ON COLUMN aiware.package.package_icon IS 'Icon for the package';
COMMENT ON COLUMN aiware.package.distribution_date IS 'The date hub can see your package. This can be generated based on the package_status_enum and the distribution_type';
COMMENT ON COLUMN aiware.package.install_date IS 'set when the package is created on the instance with the createPackage mutation. Hub agent will also need to set this when the package is copied to and created on another instance.';

