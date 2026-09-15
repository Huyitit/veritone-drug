
ALTER TABLE tracking_unit DROP COLUMN IF EXISTS mentions_deleted;
ALTER TABLE public.tracking_unit ADD IF NOT exists mentions_deleted bigint NOT NULL DEFAULT 0;
