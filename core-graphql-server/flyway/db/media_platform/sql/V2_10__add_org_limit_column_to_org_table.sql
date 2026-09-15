ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS remaining_budget numeric(18,10) DEFAULT 0;
ALTER TABLE public.organization ADD COLUMN IF NOT EXISTS is_limit_enforced BOOLEAN DEFAULT false;