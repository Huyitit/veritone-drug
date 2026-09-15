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
        -- Name: subscription; Type: DATABASE; Schema: -; Owner: postgres
        --

        -- CREATE DATABASE subscription WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8';


        ALTER DATABASE subscription OWNER TO postgres;

        -- \connect subscription

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
        -- Name: digest; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.digest (
            digest_id integer NOT NULL,
            subscription_id integer NOT NULL,
            date_created timestamp without time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            message json NOT NULL
        );


        ALTER TABLE public.digest OWNER TO postgres;

        --
        -- Name: digest_digest_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
        --

        CREATE SEQUENCE public.digest_digest_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;


        ALTER TABLE public.digest_digest_id_seq OWNER TO postgres;

        --
        -- Name: digest_digest_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
        --

        ALTER SEQUENCE public.digest_digest_id_seq OWNED BY public.digest.digest_id;

        --
        -- Name: frequency; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.frequency (
            frequency_id integer NOT NULL,
            frequency_name text NOT NULL
        );


        ALTER TABLE public.frequency OWNER TO postgres;

        --
        -- Name: object_type; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.object_type (
            object_type_id integer NOT NULL,
            object_type_name text NOT NULL
        );


        ALTER TABLE public.object_type OWNER TO postgres;

        --
        -- Name: subscription; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.subscription (
            subscription_id integer NOT NULL,
            organization_id integer NOT NULL,
            user_id uuid NOT NULL,
            email_address text,
            mobile_number text,
            web_hook_url text,
            object_type_id integer NOT NULL,
            frequency_id integer NOT NULL,
            subscription_data json NOT NULL,
            is_active boolean DEFAULT true NOT NULL,
            date_created timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
            date_modified timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
            scheduled_time time without time zone,
            scheduled_time_zone text,
            application_id text DEFAULT '10abcbcf-59bc-4054-9f56-9b3baf3f0935'::text NOT NULL,
            next_send_date timestamp without time zone,
            scheduled_day integer
        );


        ALTER TABLE public.subscription OWNER TO postgres;

        --
        -- Name: subscription_subscription_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
        --

        CREATE SEQUENCE public.subscription_subscription_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;


        ALTER TABLE public.subscription_subscription_id_seq OWNER TO postgres;

        --
        -- Name: subscription_subscription_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
        --

        ALTER SEQUENCE public.subscription_subscription_id_seq OWNED BY public.subscription.subscription_id;


        --
        -- Name: database_history id; Type: DEFAULT; Schema: audit; Owner: postgres
        --

        ALTER TABLE ONLY audit.database_history ALTER COLUMN id SET DEFAULT nextval('audit.database_history_id_seq'::regclass);


        --
        -- Name: digest digest_id; Type: DEFAULT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.digest ALTER COLUMN digest_id SET DEFAULT nextval('public.digest_digest_id_seq'::regclass);


        --
        -- Name: subscription subscription_id; Type: DEFAULT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.subscription ALTER COLUMN subscription_id SET DEFAULT nextval('public.subscription_subscription_id_seq'::regclass);


        --
        -- Name: frequency _pk_frequency@frequency_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.frequency
            ADD CONSTRAINT "_pk_frequency@frequency_id" PRIMARY KEY (frequency_id);


        --
        -- Name: object_type _pk_object_type@object_type_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.object_type
            ADD CONSTRAINT "_pk_object_type@object_type_id" PRIMARY KEY (object_type_id);


        --
        -- Name: subscription _pk_subscription@subscription_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.subscription
            ADD CONSTRAINT "_pk_subscription@subscription_id" PRIMARY KEY (subscription_id);


        --
        -- Name: digest digest_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.digest
            ADD CONSTRAINT digest_pkey PRIMARY KEY (digest_id);


        --
        -- Name: ix_database_history_started_date; Type: INDEX; Schema: audit; Owner: postgres
        --

        CREATE INDEX ix_database_history_started_date ON audit.database_history USING btree (started_date);


        --
        -- Name: ix_database_history_status; Type: INDEX; Schema: audit; Owner: postgres
        --

        CREATE INDEX ix_database_history_status ON audit.database_history USING btree (status);


        --
        -- Name: subscription_organization_id_expr_idx; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX subscription_organization_id_expr_idx ON public.subscription USING btree (organization_id, ((subscription_data ->> 'tracking_unit_id'::text)));


        --
        -- Name: subscription _fk_subscription__frequency; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.subscription
            ADD CONSTRAINT _fk_subscription__frequency FOREIGN KEY (frequency_id) REFERENCES public.frequency(frequency_id);


        --
        -- Name: subscription _fk_subscription__object_type; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.subscription
            ADD CONSTRAINT _fk_subscription__object_type FOREIGN KEY (object_type_id) REFERENCES public.object_type(object_type_id);

        -- From database repo.
        -- adds a new subscription object type for cluster.
        insert into public.object_type (object_type_id, object_type_name)
            values (2, 'cluster')
            on conflict do nothing;
    END IF;
END;
$FLYWWAY$
