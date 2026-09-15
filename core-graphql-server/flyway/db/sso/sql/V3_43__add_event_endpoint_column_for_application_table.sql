-- add event_endpoint column to application table for supporting Application Event Scheduling
ALTER TABLE public.application
	ADD COLUMN IF NOT EXISTS event_endpoint TEXT DEFAULT NULL;
	