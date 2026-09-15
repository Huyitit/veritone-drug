DO
$do$
    BEGIN
        IF EXISTS(SELECT data_type
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'audience'
                    AND column_name = 'media_id'
                    AND data_type = 'integer') THEN
            ALTER TABLE public.audience
                ALTER COLUMN media_id TYPE int8 USING media_id::int8;
            RAISE NOTICE 'Migrated audience.media_id';
        ELSE
            RAISE NOTICE 'Already migrated';
        END IF;

        IF EXISTS(SELECT data_type
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'shared_search_result'
                    AND column_name = 'media_id'
                    AND data_type = 'integer') THEN
            ALTER TABLE public.shared_search_result
                ALTER COLUMN media_id TYPE int8 USING media_id::int8;
            RAISE NOTICE 'Migrated shared_search_result';
        ELSE
            RAISE NOTICE 'Already migrated shared_search_result';
        END IF;

        IF EXISTS(SELECT data_type
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'favorite'
                    AND column_name = 'media_id'
                    AND data_type = 'integer') THEN
            ALTER TABLE public.favorite
                ALTER COLUMN media_id TYPE int8 USING media_id::int8;
            RAISE NOTICE 'Migrated favorite';
        ELSE
            RAISE NOTICE 'Already migrated favorite';
        END IF;


        IF EXISTS(SELECT data_type
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'media_metadata'
                    AND column_name = 'media_id'
                    AND data_type = 'integer') THEN
            ALTER TABLE public.media_metadata
                ALTER COLUMN media_id TYPE int8 USING media_id::int8;
            RAISE NOTICE 'Migrated media_metadata';
        ELSE
            RAISE NOTICE 'Already migrated media_metadata';
        END IF;

        IF EXISTS(SELECT data_type
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'mention'
                    AND column_name = 'media_id'
                    AND data_type = 'integer') THEN
            ALTER TABLE public.mention
                ALTER COLUMN media_id TYPE int8 USING media_id::int8;
            RAISE NOTICE 'Migrated mention';
        ELSE
            RAISE NOTICE 'Already migrated mention';
        END IF;

        IF EXISTS(SELECT data_type
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'media'
                    AND column_name = 'media_id'
                    AND data_type = 'integer') THEN
            ALTER TABLE public.media
                ALTER COLUMN media_id TYPE int8 USING media_id::int8;
            RAISE NOTICE 'Migrated media';
        ELSE
            RAISE NOTICE 'Already migrated media';
        END IF;
    END;
$do$;
