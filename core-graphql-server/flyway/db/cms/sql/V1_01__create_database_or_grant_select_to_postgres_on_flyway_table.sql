DO $FLYWWAY$
BEGIN
    IF (EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'public' 
                    AND  TABLE_NAME = 'cms_user_job')) THEN
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
        -- Name: cms; Type: DATABASE; Schema: -; Owner: postgres
        --

        -- CREATE DATABASE cms WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8';


        ALTER DATABASE cms OWNER TO postgres;

        -- \connect cms

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
        -- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: 
        --

        CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


        --
        -- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
        --

        -- COMMENT ON EXTENSION pg_stat_statements IS 'track execution statistics of all SQL statements executed';


        --
        -- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: 
        --

        CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


        --
        -- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
        --

        -- COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


        --
        -- Name: sharing_request_status; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.sharing_request_status AS ENUM (
            'pending',
            'accepted',
            'rejected',
            'canceled'
        );


        ALTER TYPE public.sharing_request_status OWNER TO postgres;

        SET default_tablespace = '';

        SET default_with_oids = false;

        --
        -- Name: cms_user_job; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.cms_user_job (
            user_id uuid NOT NULL,
            job_id text NOT NULL
        );


        ALTER TABLE public.cms_user_job OWNER TO postgres;

        --
        -- Name: process_template; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.process_template (
            process_template_id integer NOT NULL,
            organization_id integer NOT NULL,
            process_template_name text NOT NULL,
            task_list json NOT NULL
        );


        ALTER TABLE public.process_template OWNER TO postgres;

        --
        -- Name: process_template_process_template_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
        --

        CREATE SEQUENCE public.process_template_process_template_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;


        ALTER TABLE public.process_template_process_template_id_seq OWNER TO postgres;

        --
        -- Name: process_template_process_template_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
        --

        ALTER SEQUENCE public.process_template_process_template_id_seq OWNED BY public.process_template.process_template_id;


        --
        -- Name: sharing_request; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sharing_request (
            sharing_request_id integer NOT NULL,
            media_id integer NOT NULL,
            sharing_by uuid NOT NULL,
            sharing_to_user uuid,
            sharing_to_email text,
            date_created timestamp without time zone DEFAULT now() NOT NULL,
            date_modified timestamp without time zone DEFAULT now() NOT NULL,
            message text,
            status public.sharing_request_status DEFAULT 'pending'::public.sharing_request_status NOT NULL,
            slug uuid DEFAULT public.uuid_generate_v4() NOT NULL
        );


        ALTER TABLE public.sharing_request OWNER TO postgres;

        --
        -- Name: sharing_request_sharing_request_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
        --

        CREATE SEQUENCE public.sharing_request_sharing_request_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;


        ALTER TABLE public.sharing_request_sharing_request_id_seq OWNER TO postgres;

        --
        -- Name: sharing_request_sharing_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
        --

        ALTER SEQUENCE public.sharing_request_sharing_request_id_seq OWNED BY public.sharing_request.sharing_request_id;


        --
        -- Name: process_template process_template_id; Type: DEFAULT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.process_template ALTER COLUMN process_template_id SET DEFAULT nextval('public.process_template_process_template_id_seq'::regclass);


        --
        -- Name: sharing_request sharing_request_id; Type: DEFAULT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sharing_request ALTER COLUMN sharing_request_id SET DEFAULT nextval('public.sharing_request_sharing_request_id_seq'::regclass);


        --
        -- Name: cms_user_job _pk_cms_user_job@user_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.cms_user_job
            ADD CONSTRAINT "_pk_cms_user_job@user_id" PRIMARY KEY (user_id);


        --
        -- Name: sharing_request _pk_sharing_request@sharing_request_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sharing_request
            ADD CONSTRAINT "_pk_sharing_request@sharing_request_id" PRIMARY KEY (sharing_request_id);


        --
        -- Name: _ix_sharing_request@slug; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_sharing_request@slug" ON public.sharing_request USING btree (slug);
    END IF;
END;
$FLYWWAY$
