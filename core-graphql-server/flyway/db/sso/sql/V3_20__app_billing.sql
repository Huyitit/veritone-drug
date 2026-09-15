ALTER TABLE public.application__organization
    ADD COLUMN IF NOT EXISTS billing_plan_id VARCHAR(7) DEFAULT NULL;
COMMENT ON COLUMN public.application__organization.billing_plan_id IS 'If set, this is the application billing plan id for the org';

ALTER TABLE public.application__organization
    ADD COLUMN IF NOT EXISTS billing_dirty BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.application__organization.billing_dirty IS 'If TRUE, the application billing plan_id had been updated';