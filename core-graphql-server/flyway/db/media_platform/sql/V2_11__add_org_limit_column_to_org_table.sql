-- COMMENT ON COLUMN public.organization.remaining_budget IS 'If set, this is how much is remaining for the period';

-- ALTER TABLE public.organization
--     ADD COLUMN IF NOT EXISTS is_limit_enforced BOOLEAN DEFAULT FALSE;
-- COMMENT ON COLUMN public.organization.is_limit_enforced IS 'If TRUE, this will enforce processing limits';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS billing_plan_id VARCHAR(7) DEFAULT NULL;
COMMENT ON COLUMN public.organization.billing_plan_id IS 'If set, this is the billing plan id';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS billing_dirty BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.organization.billing_dirty IS 'If TRUE, billing plan_id has been updated';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS billing_updated_datetime TIMESTAMP NOT NULL DEFAULT NOW();
COMMENT ON COLUMN public.organization.billing_updated_datetime IS 'Last time billing was updated';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_processing_hours_total NUMERIC(18, 10) DEFAULT 0.0;
COMMENT ON COLUMN public.organization.monthly_processing_hours_total IS 'How many hours processed per month';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_processing_bytes_total BIGINT DEFAULT 0;
COMMENT ON COLUMN public.organization.monthly_processing_bytes_total IS 'How many bytes processed per month';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS current_storage_bytes BIGINT DEFAULT 0;
COMMENT ON COLUMN public.organization.current_storage_bytes IS 'Storage for the month in bytes';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_gbhr_total BIGINT DEFAULT 0;
COMMENT ON COLUMN public.organization.monthly_gbhr_total IS 'Storage for the month in GB-HR';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_processing_lastran TIMESTAMP NOT NULL DEFAULT NOW();;
COMMENT ON COLUMN public.organization.monthly_processing_lastran IS 'Processing last ran at this time';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthy_storage_lastran TIMESTAMP NOT NULL DEFAULT NOW();
COMMENT ON COLUMN public.organization.monthy_storage_lastran IS 'Storage last ran';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_current_charge NUMERIC(18, 10) DEFAULT 0.0;
COMMENT ON COLUMN public.organization.monthly_current_charge IS 'Current Charge';

