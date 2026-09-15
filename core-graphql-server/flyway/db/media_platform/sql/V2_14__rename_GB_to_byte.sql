ALTER TABLE public.organization 
  RENAME last_month_gbhr_total TO last_month_bytehrs_total;
COMMENT ON COLUMN public.organization.last_month_bytehrs_total IS 'Storage for the previous month in ByteHrs';

ALTER TABLE public.organization
    RENAME monthly_gbhr_total TO monthly_bytehrs_total;
COMMENT ON COLUMN public.organization.monthly_bytehrs_total IS 'Storage for the month in ByteHrs';
