UPDATE job_new.engine
SET distribution_type = 'private'::job_new.distribution_type 
WHERE is_public = false AND distribution_type = 'instance_locked'::job_new.distribution_type;