-- add is_app_event column to roles table for supporting Application Event Scheduling
ALTER TABLE public.role
    ADD COLUMN IF NOT EXISTS is_app_event_role boolean DEFAULT FALSE;

-- set is_app_evet_column to TRUE in the two existing App Event roles
UPDATE public.role
SET is_app_event_role = true
WHERE role_id = '13634222-b879-4677-be03-d4ecad8fb2c2' OR role_id = '5e9cfff9-4652-4755-ae49-796615079375';
