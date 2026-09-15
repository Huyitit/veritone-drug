-- Create enum type_gpu_model
DROP TYPE IF EXISTS job_new.type_gpu_model;
CREATE TYPE job_new.type_gpu_model AS ENUM (
    'V100',
    'A100',
    'M60',
    'T4',
    'A10G',
    'L4',
    'K80'
);

-- Add a new columns: gpu_required, gpu_model, gpu_driver_version, kernel_version
ALTER TABLE job_new.engine 
    ADD COLUMN IF NOT EXISTS gpu_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS gpu_model job_new.type_gpu_model NULL,
    ADD COLUMN IF NOT EXISTS gpu_driver_version VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS kernel_version VARCHAR(30) NULL;

COMMENT ON COLUMN job_new.engine.gpu_driver_version IS 'The three-part (major, minor, revision), dot-separated, driver version. When provided, only the most significant portions are required.';
COMMENT ON COLUMN job_new.engine.kernel_version IS 'The three-part (major, minor, revision), dot-separated, driver version. When provided, only the most significant portions are required.';
