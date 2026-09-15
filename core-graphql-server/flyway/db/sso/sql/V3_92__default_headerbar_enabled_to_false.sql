UPDATE public.application
SET headerbar_enabled = FALSE
WHERE TRUE;

ALTER TABLE public.application
ALTER COLUMN headerbar_enabled SET DEFAULT FALSE;