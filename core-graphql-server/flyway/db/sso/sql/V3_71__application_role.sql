DO
$do$
BEGIN
        IF
        (SELECT is_nullable
                          FROM information_schema.columns
                          WHERE table_schema = 'public'
                            AND table_name = 'role'
                            AND column_name = 'application_id'
                            ) THEN
            ALTER TABLE public.role ALTER COLUMN application_id SET NOT NULL;
            RAISE NOTICE 'Migrated role.application_id';
        ELSE
            RAISE NOTICE 'Already not null';
        END IF;
END
$do$;