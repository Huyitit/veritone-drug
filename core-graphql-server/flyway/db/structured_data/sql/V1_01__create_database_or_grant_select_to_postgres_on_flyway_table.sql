DO $FLYWWAY$
BEGIN
    IF (EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'audit' 
                    AND  TABLE_NAME = 'database_history')) THEN
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
        -- Name: structured_data; Type: DATABASE; Schema: -; Owner: postgres
        --

        -- CREATE DATABASE structured_data WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8';


        ALTER DATABASE structured_data OWNER TO postgres;

        -- \connect structured_data

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
        -- Name: structured_data; Type: DATABASE PROPERTIES; Schema: -; Owner: postgres
        --

        ALTER DATABASE structured_data SET random_page_cost TO '1';


        -- \connect structured_data

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
        -- Name: audit; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA audit;


        ALTER SCHEMA audit OWNER TO postgres;

        --
        -- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: 
        --

        CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


        --
        -- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
        --

        -- COMMENT ON EXTENSION pg_stat_statements IS 'track execution statistics of all SQL statements executed';


        --
        -- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: 
        --

        CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


        --
        -- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
        --

        -- z EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


        --
        -- Name: enum_data_registries_status; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.enum_data_registries_status AS ENUM (
            'available',
            'published',
            'deleted',
            'draft',
            'inactive',
            'paused'
        );


        ALTER TYPE public.enum_data_registries_status OWNER TO postgres;

        --
        -- Name: sdo_partition_function(); Type: FUNCTION; Schema: public; Owner: postgres
        --

        CREATE FUNCTION public.sdo_partition_function() RETURNS trigger
            LANGUAGE plpgsql
            AS $_$
        DECLARE
            tableName text;
            startDate text;
            endDate   text;
        BEGIN
            startDate := to_char(NEW."createdAt", 'YYYY-MM-01');
            tableName := TG_TABLE_NAME || '_' || to_char(NEW."createdAt", 'YYYY_MM');

            Begin
            EXECUTE 'INSERT INTO ' || quote_ident(tableName) || ' VALUES ($1.*)' USING NEW;
            EXCEPTION  WHEN UNDEFINED_TABLE THEN

            PERFORM pg_advisory_lock(1);
            IF NOT EXISTS (SELECT 1
                FROM   pg_catalog.pg_class c
                JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE  c.relkind = 'r'
                AND    c.relname = tableName
                AND    n.nspname = 'public'
            ) THEN

                EXECUTE 'CREATE TABLE ' || quote_ident(tableName) || ' (LIKE '|| quote_ident(TG_TABLE_NAME) ||' INCLUDING ALL)';

                endDate := startDate::timestamp + INTERVAL '1 month';
                EXECUTE 'ALTER TABLE ' || quote_ident(tableName) || '
                ADD CONSTRAINT chk_rotation_check
                CHECK ( "createdAt" >= ' || quote_literal(startDate) || '::timestamp
                AND "createdAt" < ' || quote_literal(endDate) || '::timestamp )
                , INHERIT ' || quote_ident(TG_TABLE_NAME);

                EXECUTE 'INSERT INTO ' || quote_ident(tableName) || ' VALUES ($1.*)' USING NEW;

                EXECUTE 'GRANT ALL ON ' || quote_ident(tableName)  || ' TO postgres' USING NEW;

                PERFORM pg_advisory_unlock(1);
            ELSE
                PERFORM pg_advisory_unlock(1);
                RAISE EXCEPTION '%', SQLERRM;
            END IF;

            End;
            RETURN NULL;
        END;
        $_$;


        ALTER FUNCTION public.sdo_partition_function() OWNER TO postgres;

        SET default_tablespace = '';

        SET default_with_oids = false;

        --
        -- Name: database_history; Type: TABLE; Schema: audit; Owner: postgres
        --

        CREATE TABLE audit.database_history (
            id integer NOT NULL,
            script_file text,
            description text,
            status text,
            started_by_user text,
            script_output text,
            started_date timestamp without time zone DEFAULT now(),
            stop_date timestamp without time zone,
            execution_time_ms bigint,
            row_count bigint,
            errors text,
            database text
        );


        ALTER TABLE audit.database_history OWNER TO postgres;

        --
        -- Name: database_history_id_seq; Type: SEQUENCE; Schema: audit; Owner: postgres
        --

        CREATE SEQUENCE audit.database_history_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;


        ALTER TABLE audit.database_history_id_seq OWNER TO postgres;

        --
        -- Name: database_history_id_seq; Type: SEQUENCE OWNED BY; Schema: audit; Owner: postgres
        --

        ALTER SEQUENCE audit.database_history_id_seq OWNED BY audit.database_history.id;


        --
        -- Name: data_registries; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.data_registries (
            id uuid NOT NULL,
            schema jsonb,
            ui_component character varying(255),
            ttl_sec integer,
            description character varying(255),
            org_id integer,
            created_by character varying(3000),
            modified_by character varying(3000),
            "createdAt" timestamp without time zone NOT NULL,
            "updatedAt" timestamp without time zone NOT NULL,
            "deletedAt" timestamp without time zone,
            data_registry_metadata_id uuid DEFAULT '021b04de-addf-4754-b235-b4ce1c8e0051'::uuid NOT NULL,
            major_version integer DEFAULT 1 NOT NULL,
            minor_version integer DEFAULT 0 NOT NULL,
            status public.enum_data_registries_status DEFAULT 'draft'::public.enum_data_registries_status,
            storage_name character varying(255),
            indexing_flags bit varying(8) DEFAULT NULL::bit varying
        );


        ALTER TABLE public.data_registries OWNER TO postgres;

        --
        -- Name: data_registry__application; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.data_registry__application (
            data_registry_id uuid NOT NULL,
            application_id uuid NOT NULL,
            created_date_time timestamp with time zone DEFAULT timezone('utc'::text, now())
        );


        ALTER TABLE public.data_registry__application OWNER TO postgres;

        --
        -- Name: data_registry_metadata; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.data_registry_metadata (
            id uuid NOT NULL,
            name text NOT NULL,
            description text NOT NULL,
            source character varying(255),
            org_id integer,
            created_by character varying(3000),
            modified_by character varying(3000),
            created_at timestamp without time zone NOT NULL,
            updated_at timestamp without time zone NOT NULL,
            deleted_at timestamp without time zone,
            is_system boolean
        );


        ALTER TABLE public.data_registry_metadata OWNER TO postgres;

        --
        -- Name: data_registry_property; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.data_registry_property (
            data_registry_metadata_id uuid,
            major_version integer,
            storage_name character varying(255) NOT NULL,
            path text NOT NULL,
            type character varying(255),
            title text
        );


        ALTER TABLE public.data_registry_property OWNER TO postgres;

        --
        -- Name: nielsen_tv_data; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.nielsen_tv_data (
            id uuid NOT NULL,
            decorators jsonb,
            data_registry_id uuid NOT NULL,
            viewership_type character varying(255) NOT NULL,
            unique_code character varying(255),
            datetime_start timestamp without time zone NOT NULL,
            datetime_end timestamp without time zone NOT NULL,
            file_name character varying(255),
            program_name character varying(255),
            demographics jsonb NOT NULL,
            modified_by character varying(3000) NOT NULL,
            created_by character varying(3000) NOT NULL,
            "createdAt" timestamp without time zone NOT NULL,
            "updatedAt" timestamp without time zone NOT NULL,
            is_average boolean DEFAULT false,
            network_code character varying(10)
        );


        ALTER TABLE public.nielsen_tv_data OWNER TO postgres;

        --
        -- Name: database_history id; Type: DEFAULT; Schema: audit; Owner: postgres
        --

        ALTER TABLE ONLY audit.database_history ALTER COLUMN id SET DEFAULT nextval('audit.database_history_id_seq'::regclass);


        --
        -- Name: data_registries data_registries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.data_registries
            ADD CONSTRAINT data_registries_pkey PRIMARY KEY (id);


        --
        -- Name: data_registry_metadata data_registry_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.data_registry_metadata
            ADD CONSTRAINT data_registry_metadata_pkey PRIMARY KEY (id);


        --
        -- Name: data_registry_property data_registry_property_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.data_registry_property
            ADD CONSTRAINT data_registry_property_pkey PRIMARY KEY (storage_name, path);

        --
        -- Name: nielsen_tv_data nielsen_tv_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.nielsen_tv_data
            ADD CONSTRAINT nielsen_tv_data_pkey PRIMARY KEY (id);


        --
        -- Name: ix_database_history_started_date; Type: INDEX; Schema: audit; Owner: postgres
        --

        CREATE INDEX ix_database_history_started_date ON audit.database_history USING btree (started_date);


        --
        -- Name: ix_database_history_status; Type: INDEX; Schema: audit; Owner: postgres
        --

        CREATE INDEX ix_database_history_status ON audit.database_history USING btree (status);


        --
        -- Name: _ix_data_registry__application@application_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_data_registry__application@application_id" ON public.data_registry__application USING btree (application_id);


        --
        -- Name: _ix_data_registry__application@data_registry_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_data_registry__application@data_registry_id" ON public.data_registry__application USING btree (data_registry_id);


        --
        -- Name: _ix_data_registry_metadata@drm_id,major_version; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_data_registry_metadata@drm_id,major_version" ON public.data_registry_property USING btree (data_registry_metadata_id, major_version);


        --
        -- Name: _ix_data_registry_metadata@path; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_data_registry_metadata@path" ON public.data_registry_property USING gin (path public.gin_trgm_ops);


        --
        -- Name: _pk_data_registry__application@data_registry_id,application_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE UNIQUE INDEX "_pk_data_registry__application@data_registry_id,application_id" ON public.data_registry__application USING btree (data_registry_id, application_id);

        --
        -- Name: idx_data_registries__drmid; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX idx_data_registries__drmid ON public.data_registries USING btree (data_registry_metadata_id);


        --
        -- Name: nielsen_tv_data_data_registry_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_data_registry_id ON public.nielsen_tv_data USING btree (data_registry_id);


        --
        -- Name: nielsen_tv_data_datetime_end; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_datetime_end ON public.nielsen_tv_data USING btree (datetime_end);


        --
        -- Name: nielsen_tv_data_datetime_end_index; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_datetime_end_index ON public.nielsen_tv_data USING btree (datetime_end DESC);


        --
        -- Name: nielsen_tv_data_datetime_start; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_datetime_start ON public.nielsen_tv_data USING btree (datetime_start);


        --
        -- Name: nielsen_tv_data_file_name; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_file_name ON public.nielsen_tv_data USING btree (file_name);


        --
        -- Name: nielsen_tv_data_is_average_index; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_is_average_index ON public.nielsen_tv_data USING btree (is_average);


        --
        -- Name: nielsen_tv_data_network_code_index; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_network_code_index ON public.nielsen_tv_data USING btree (network_code);


        --
        -- Name: nielsen_tv_data_unique_code; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_unique_code ON public.nielsen_tv_data USING btree (unique_code);


        --
        -- Name: nielsen_tv_data_unique_code_datetime_start_viewership_type; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE UNIQUE INDEX nielsen_tv_data_unique_code_datetime_start_viewership_type ON public.nielsen_tv_data USING btree (unique_code, datetime_start, viewership_type, is_average);


        --
        -- Name: nielsen_tv_data_viewership_type; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX nielsen_tv_data_viewership_type ON public.nielsen_tv_data USING btree (viewership_type);


        --
        -- Name: data_registries data_registries_data_registry_metadata_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.data_registries
            ADD CONSTRAINT data_registries_data_registry_metadata_id_fk FOREIGN KEY (data_registry_metadata_id) REFERENCES public.data_registry_metadata(id);


        --
        -- Name: data_registry__application data_registry__application_data_registry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.data_registry__application
            ADD CONSTRAINT data_registry__application_data_registry_id_fkey FOREIGN KEY (data_registry_id) REFERENCES public.data_registry_metadata(id) ON DELETE CASCADE;

        -- From database repo.
        PERFORM extract(millennium from now());

        alter database structured_data set random_page_cost=1;


        create or replace function public.sdo_partition_function()

        returns trigger
        language plpgsql
        as $$
        DECLARE
        tableName text;
        startDate text;
        endDate   text;
        BEGIN
        startDate := to_char(NEW."createdAt", 'YYYY-MM-01');
        tableName := TG_TABLE_NAME || '_' || to_char(NEW."createdAt", 'YYYY_MM');

        Begin
            EXECUTE 'INSERT INTO ' || quote_ident(tableName) || ' VALUES ($1.*)' USING NEW;
        EXCEPTION  WHEN UNDEFINED_TABLE THEN

            PERFORM pg_advisory_lock(1);
            IF NOT EXISTS (SELECT 1
                FROM   pg_catalog.pg_class c
                JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE  c.relkind = 'r'
                AND    c.relname = tableName
                AND    n.nspname = 'public'
            ) THEN

            EXECUTE 'CREATE TABLE ' || quote_ident(tableName) || ' (LIKE '|| quote_ident(TG_TABLE_NAME) ||' INCLUDING ALL)';

            endDate := startDate::timestamp + INTERVAL '1 month';
            EXECUTE 'ALTER TABLE ' || quote_ident(tableName) || '
            ADD CONSTRAINT chk_rotation_check
            CHECK ( "createdAt" >= ' || quote_literal(startDate) || '::timestamp
            AND "createdAt" < ' || quote_literal(endDate) || '::timestamp )
            , INHERIT ' || quote_ident(TG_TABLE_NAME);

            EXECUTE 'INSERT INTO ' || quote_ident(tableName) || ' VALUES ($1.*)' USING NEW;

            EXECUTE 'GRANT ALL ON ' || quote_ident(tableName)  || ' TO postgres' USING NEW;

            PERFORM pg_advisory_unlock(1);
            ELSE
            PERFORM pg_advisory_unlock(1);
            RAISE EXCEPTION '%', SQLERRM;
        END IF;

        End;
        RETURN NULL;
        END;
        $$;


        CREATE TABLE IF NOT EXISTS public.data_registry_property
        (
            data_registry_metadata_id uuid,
            major_version integer,
            storage_name varchar(255) not null,
            path text not null,
            type varchar(255),
            title text,
            constraint data_registry_property_pkey
                primary key (storage_name, path)
        );

        CREATE INDEX IF NOT EXISTS "_ix_data_registry_metadata@path"
            on public.data_registry_property USING GIN(path public.gin_trgm_ops);

        CREATE INDEX IF NOT EXISTS "_ix_data_registry_metadata@drm_id,major_version"
            on public.data_registry_property (data_registry_metadata_id, major_version);

        ALTER TABLE public.data_registry_metadata ADD COLUMN IF NOT EXISTS is_system boolean;

        UPDATE public.data_registry_metadata SET is_system = TRUE WHERE deleted_at is null and name in (
        'Broadcast TV Source Schema',
        'Podcast Source Schema',
        'YouTube Source Schema',
        'Mobile Device Source Type Schema',
        'Web Stream Source Type Schema',
        'Radio Source Schema',
        'SIP Stream Source Type Schema',
        'Google Drive Source Type Schema',
        'Amazon Kinesis Video Source Type Schema',
        'YouTube Video Source Type Schema',
        'RSS Feed Source Type Schema',
        'Dropbox Source Type Schema',
        'FTP Source Type Schema',
        'YouTube Live Stream Source Type Schema',
        'Youtube Source Type Schema',
        'SFTP Source Type Schema',
        'Radio Source Type Schema',
        'Broadcast TV Source Type Schema',
        'Podcast Source Type Schema',
        'SRC Benchmark Source Type Schema',
        'Veritone Market Information',
        'Veritone Network Information',
        'Veritone Advertiser Information',
        'Veritone Brand Information',
        'Box Source Type Schema',
        'Radio Audience Files',
        'Lookup'
        );


        -- Join table to associate data registries with applications (supports app packages feature)
        -- Table Definition ----------------------------------------------
        CREATE TABLE IF NOT EXISTS public.data_registry__application (
        data_registry_id uuid NOT NULL REFERENCES data_registry_metadata(id) ON DELETE CASCADE,
        application_id uuid NOT NULL,
        created_date_time timestamp with time zone DEFAULT (now() at time zone 'utc')
        );

        -- Indices -------------------------------------------------------
        CREATE UNIQUE INDEX IF NOT EXISTS "_pk_data_registry__application@data_registry_id,application_id" ON public.data_registry__application(data_registry_id uuid_ops,application_id uuid_ops);
        CREATE INDEX IF NOT EXISTS "_ix_data_registry__application@data_registry_id" ON public.data_registry__application(data_registry_id uuid_ops);
        CREATE INDEX IF NOT EXISTS "_ix_data_registry__application@application_id" ON public.data_registry__application(application_id uuid_ops);

        ALTER TABLE public.data_registries
            ADD COLUMN IF NOT EXISTS indexing_flags varbit(8) NULL DEFAULT NULL::bit varying;

        
    END IF;
END;
$FLYWWAY$
