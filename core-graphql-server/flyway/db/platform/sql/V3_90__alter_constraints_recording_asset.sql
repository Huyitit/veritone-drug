DO
$do$
    DECLARE
        cname        varchar;
        cname2       varchar;
        cconstraint  varchar;
        cconstraint2 varchar;
        ctable       varchar;
        msg          varchar;
        msg2         varchar;
    BEGIN
        IF EXISTS(SELECT con.conname as cname, pg_get_expr(con.conbin, con.conrelid) as contraints, rel.relname as ctable
                  FROM pg_catalog.pg_constraint con
                           INNER JOIN pg_catalog.pg_class rel
                                      ON rel.oid = con.conrelid
                           INNER JOIN pg_catalog.pg_namespace nsp
                                      ON nsp.oid = connamespace
                  WHERE nsp.nspname = 'recording'
                    AND rel.relname like 'recording_asset_%'
                    AND con.conname ILIKE '%id_check%') THEN

            FOR cname, cconstraint, ctable IN SELECT con.conname as cname,
                                                     pg_get_expr(con.conbin, con.conrelid)  as contraints,
                                                     rel.relname as ctable
                                              FROM pg_catalog.pg_constraint con
                                                       INNER JOIN pg_catalog.pg_class rel
                                                                  ON rel.oid = con.conrelid
                                                       INNER JOIN pg_catalog.pg_namespace nsp
                                                                  ON nsp.oid = connamespace
                                              WHERE nsp.nspname = 'recording'
                                                AND rel.relname like 'recording_asset_%'
                                                AND con.conname ILIKE '%id_check%'
                LOOP
                    cname2 = replace(cname, 'id_check', 'id_bigint_check');
                    cconstraint2 = replace(cconstraint, '::integer', '::bigint');

                    msg = 'ALTER TABLE recording.' || ctable || ' ADD CONSTRAINT ' || cname2 || ' CHECK ' ||
                          cconstraint2;
                    msg2 = 'ALTER TABLE recording.' || ctable || ' DROP CONSTRAINT ' || cname;
                    RAISE NOTICE 'NOT: %', msg;
                    RAISE NOTICE 'NOT: %', msg2;
                    EXECUTE msg;
                    EXECUTE msg2;

                END LOOP;

        ELSE
            RAISE NOTICE 'Already migrated recording_asset constraints';
        END IF;

    END ;
$do$;
