-- Create enum type_gpu_tier
DROP TYPE IF EXISTS job_new.type_gpu_tier;
CREATE TYPE job_new.type_gpu_tier AS ENUM (
    'none',
    'small',
    'medium',
    'large'
);

-- Add gpu_tier column to engine (engine-level GPU resource tier, VE-26909).
-- NOT NULL DEFAULT 'none' to match gpu_supported: an engine with no declared
-- tier requires no GPU. Real tiers are backfilled onto GPU engines by VE-26901.
ALTER TABLE job_new.engine
    ADD COLUMN IF NOT EXISTS gpu_tier job_new.type_gpu_tier NOT NULL DEFAULT 'none';
