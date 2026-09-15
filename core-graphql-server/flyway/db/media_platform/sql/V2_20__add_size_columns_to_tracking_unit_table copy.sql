
ALTER TABLE public.tracking_unit ADD IF NOT exists mentions_count integer NULL;
COMMENT ON COLUMN public.tracking_unit.mentions_count IS 'Count of mentions in the watchlist. Updated by watchlist_size_limit_cleanup scheduled event.';

CREATE INDEX IF NOT EXISTS idx_mentions_count ON public.tracking_unit (mentions_count);

ALTER TABLE public.tracking_unit ADD IF NOT exists mentions_deleted bigint NULL DEFAULT 0;
COMMENT ON COLUMN public.tracking_unit.mentions_deleted IS 'Count of mentions deleted by watchlist_size_limit_cleanup scheduled event.';
