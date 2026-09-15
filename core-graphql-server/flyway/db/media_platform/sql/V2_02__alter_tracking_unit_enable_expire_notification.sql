
-- alter column enable_expiration_notification in table tracking_unit set default to false
ALTER TABLE public.tracking_unit ALTER COLUMN enable_expiration_notification SET DEFAULT false;