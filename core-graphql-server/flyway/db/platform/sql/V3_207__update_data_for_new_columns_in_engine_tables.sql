

-- Note: As Kenvin bates' comment at: https://github.com/veritone/aiware-core/pull/2483#issuecomment-2299134745
-- We should only update gpu_required for now to ensure the GPU engines are working correctly in the ai13s clusters
UPDATE job_new.engine
SET gpu_required = TRUE
WHERE
    gpu_supported <> 'none';

/*
-- TODO: We might run the script later
-- All rows in job_new.engine where gpu_supported = 'none' should be updated to gpu_required = FALSE
UPDATE job_new.engine
SET gpu_required = FALSE
WHERE
    gpu_supported = 'none';

-- All rows in job_new.engine where gpu_supported = 'aws_p3' should be updated to gpu_required = TRUE and gpu_model = V100
UPDATE job_new.engine
SET gpu_required = TRUE,
    gpu_model = 'V100'::job_new.type_gpu_model
WHERE
    gpu_supported = 'aws_p3';

-- All rows in job_new.engine where gpu_supported = 'aws_p2' should be updated to gpu_required = TRUE and gpu_model = K80
UPDATE job_new.engine
SET gpu_required = TRUE,
    gpu_model = 'K80'::job_new.type_gpu_model
WHERE
    gpu_supported = 'aws_p2';
*/