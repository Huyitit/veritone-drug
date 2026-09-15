CREATE TABLE IF NOT EXISTS public.retention_tdo__organization (
    organization_id BIGINT NOT NULL,
    last_run TIMESTAMP NOT NULL DEFAULT NOW(),
    last_success TIMESTAMP NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT NULL,
    CONSTRAINT pk_org_id PRIMARY KEY (organization_id)
);