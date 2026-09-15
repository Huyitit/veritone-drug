-- add various columns and entries to support Application Event Scheduling

DO $$
    BEGIN
        ALTER TABLE public.application__organization
            ADD COLUMN IF NOT EXISTS event_handler_user_id uuid DEFAULT NULL;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='_fk_application__organization__event_handler_user_id') THEN
            ALTER TABLE public.application__organization
                ADD CONSTRAINT _fk_application__organization__event_handler_user_id FOREIGN KEY (event_handler_user_id) REFERENCES public.sso_user(user_id)
                    ON DELETE SET NULL
                    ON UPDATE RESTRICT;
        END IF;

        ALTER TABLE public.sso_user
            ADD COLUMN IF NOT EXISTS "system_user" boolean DEFAULT FALSE;
    END;
$$;
