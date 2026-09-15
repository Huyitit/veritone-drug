ALTER TABLE job_new.engine_replacement__organization owner TO postgres;

DO
$do$
    BEGIN
        IF EXISTS (
            SELECT FROM pg_catalog.pg_roles
            WHERE  rolname = 'core_graphql_server') THEN

            RAISE NOTICE 'Role "core_graphql_server" already exists. Skipping.';
        ELSE
            CREATE ROLE core_graphql_server;
        END IF;
    END
$do$;

DO
$do$
    BEGIN
        IF EXISTS (
            SELECT FROM pg_catalog.pg_roles
            WHERE  rolname = 'postgres') THEN

            RAISE NOTICE 'Role "postgres" already exists. Skipping.';
        ELSE
            CREATE ROLE postgres;
        END IF;
    END
$do$;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA job_new TO core_graphql_server;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA job_new TO postgres;
