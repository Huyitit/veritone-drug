-- AWT-7574
ALTER TYPE job_new.distribution_type ADD VALUE IF NOT EXISTS 'private';
ALTER TYPE job_new.distribution_type ADD VALUE IF NOT EXISTS 'sharable';
ALTER TYPE job_new.distribution_type ADD VALUE IF NOT EXISTS 'marketplace';
