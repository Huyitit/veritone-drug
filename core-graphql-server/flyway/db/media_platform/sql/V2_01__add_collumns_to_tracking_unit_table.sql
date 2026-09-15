
-- add 2 collumns expiring_date_notified and enable_expiration_notification if not exists
ALTER TABLE public.tracking_unit ADD IF NOT exists expiring_date_notified timestamptz NULL;
ALTER TABLE public.tracking_unit ADD IF NOT exists enable_expiration_notification bool NULL DEFAULT true;

-- for the initial run only, there could be lots of messages sent for very old expired list.
-- So updating all existing watchlist, so it will not send
update tracking_unit set expiring_date_notified=tracking_unit_stop_date where  tracking_unit_stop_date < CURRENT_DATE;