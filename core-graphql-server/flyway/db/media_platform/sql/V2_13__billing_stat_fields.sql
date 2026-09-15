ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_processing_hours_total NUMERIC(18, 10) DEFAULT 0.0;
COMMENT ON COLUMN public.organization.monthly_processing_hours_total IS 'How many hours are ingested per month';


ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS last_month_gbhr_total BIGINT DEFAULT 0;
COMMENT ON COLUMN public.organization.last_month_gbhr_total IS 'Storage for the previous month in GB-HR';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_processing_media_hours NUMERIC(18, 10) DEFAULT 0.0;
COMMENT ON COLUMN public.organization.monthly_processing_media_hours IS 'How many media hours are processed per month';


ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_processing_tasks BIGINT DEFAULT 0;
COMMENT ON COLUMN public.organization.monthly_processing_tasks IS 'How many tasks are processed per month';


ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS monthly_processing_bytes BIGINT DEFAULT 0;
COMMENT ON COLUMN public.organization.monthly_processing_bytes IS 'How many bytes are processed per month';

ALTER TABLE public.organization
    ADD COLUMN IF NOT EXISTS storage_last_updated_timestamp TIMESTAMP NOT NULL DEFAULT NOW();
COMMENT ON COLUMN public.organization.storage_last_updated_timestamp IS 'When the last storage update was';