
-- AWT-9781 cleanup headerbar options

ALTER TABLE public.app_headerbar
    DROP COLUMN IF EXISTS element_id,
    DROP COLUMN IF EXISTS title,
    DROP COLUMN IF EXISTS z_index,
    DROP COLUMN IF EXISTS display_support_chat,
    DROP COLUMN IF EXISTS hide_password_reset;
