DO $FLYWWAY$
BEGIN
    IF (EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'public' 
                    AND  TABLE_NAME = 'keyword_alias')) THEN
        GRANT SELECT ON TABLE public.flyway_schema_history TO postgres;
    ELSE
        SET statement_timeout = 0;
        SET lock_timeout = 0;
        SET idle_in_transaction_session_timeout = 0;
        SET client_encoding = 'UTF8';
        SET standard_conforming_strings = on;
        PERFORM pg_catalog.set_config('search_path', '', false);
        SET check_function_bodies = false;
        SET xmloption = content;
        SET client_min_messages = warning;
        SET row_security = off;

        --
        -- Name: keyword_aliasing; Type: DATABASE; Schema: -; Owner: postgres
        --

        -- CREATE DATABASE keyword_aliasing WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8';


        ALTER DATABASE keyword_aliasing OWNER TO postgres;

        --
        -- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: 
        --

        CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;
        SET default_tablespace = '';

        --
        -- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
        --

        -- COMMENT ON EXTENSION pg_stat_statements IS 'track execution statistics of all SQL statements executed';


        --
        -- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: 
        --

        CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

        CREATE TABLE public.keyword_alias (
            keyword_alias_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
            keyword text NOT NULL,
            aliases text NOT NULL
        );


        ALTER TABLE public.keyword_alias OWNER TO postgres;

        ALTER TABLE ONLY public.keyword_alias
            ADD CONSTRAINT "_pk_keyword_alias@keyword_alias_id" PRIMARY KEY (keyword_alias_id);

        GRANT ALL ON TABLE public.keyword_alias TO PUBLIC;
        -- GRANT SELECT ON TABLE public.keyword_alias TO readonly;
        -- GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.keyword_alias TO postgres;
    END IF;
END;
$FLYWWAY$
