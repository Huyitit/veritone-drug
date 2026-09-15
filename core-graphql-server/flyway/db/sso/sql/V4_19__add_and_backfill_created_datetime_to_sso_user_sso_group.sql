-- 1. Add created_date_time column
ALTER TABLE public.sso_user__sso_group
    ADD COLUMN IF NOT EXISTS created_date_time TIMESTAMP WITHOUT TIME ZONE;

-- 2. Backfill data
UPDATE public.sso_user__sso_group ug
SET created_date_time = GREATEST(u.date_created, g.date_created)
FROM public.sso_user u, public.sso_group g
WHERE u.user_id = ug.user_id
  AND g.group_id = ug.group_id
  AND ug.created_date_time IS NULL;

-- 3. Set default and NOT NULL
ALTER TABLE public.sso_user__sso_group
    ALTER COLUMN created_date_time SET DEFAULT now(),
    ALTER COLUMN created_date_time SET NOT NULL;
