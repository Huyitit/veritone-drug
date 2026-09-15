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
        -- Name: sso; Type: DATABASE; Schema: -; Owner: postgres
        --

        -- CREATE DATABASE sso WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8';


        ALTER DATABASE sso OWNER TO postgres;

        -- \connect sso

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
        -- Name: sso; Type: DATABASE PROPERTIES; Schema: -; Owner: postgres
        --

        ALTER DATABASE sso SET random_page_cost TO '1';


        -- \connect sso

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
        -- Name: rate_limit; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA rate_limit;


        ALTER SCHEMA rate_limit OWNER TO postgres;

        --
        -- Name: pg_buffercache; Type: EXTENSION; Schema: -; Owner: 
        --

        CREATE EXTENSION IF NOT EXISTS pg_buffercache WITH SCHEMA public;


        --
        -- Name: EXTENSION pg_buffercache; Type: COMMENT; Schema: -; Owner: 
        --

        -- COMMENT ON EXTENSION pg_buffercache IS 'examine the shared buffer cache';


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
        -- Name: application_status; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.application_status AS ENUM (
            'draft',
            'active',
            'disabled',
            'deleted',
            'pending',
            'approved',
            'rejected'
        );


        ALTER TYPE public.application_status OWNER TO postgres;

        --
        -- Name: contextmenutype; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.contextmenutype AS ENUM (
            'mention',
            'tdo',
            'watchlist',
            'collection'
        );


        ALTER TYPE public.contextmenutype OWNER TO postgres;

        --
        -- Name: service_type; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.service_type AS ENUM (
            's3',
            'okta'
        );


        ALTER TYPE public.service_type OWNER TO postgres;

        --
        -- Name: user_status; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.user_status AS ENUM (
            'active',
            'suspended',
            'deleted'
        );


        ALTER TYPE public.user_status OWNER TO postgres;

        --
        -- Name: json_object_update_key(json, text, anyelement); Type: FUNCTION; Schema: public; Owner: postgres
        --

        CREATE FUNCTION public.json_object_update_key("json" json, key_to_set text, value_to_set anyelement) RETURNS json
            LANGUAGE sql IMMUTABLE STRICT
            AS $$
        SELECT CASE
            WHEN ("json" -> "key_to_set") IS NULL THEN "json"
            ELSE (SELECT concat('{', string_agg(to_json("key") || ':' || "value", ','), '}')
                    FROM (SELECT *
                            FROM json_each("json")
                        WHERE "key" <> "key_to_set"
                        UNION ALL
                        SELECT "key_to_set", to_json("value_to_set")) AS "fields")::json
        END
        $$;


        ALTER FUNCTION public.json_object_update_key("json" json, key_to_set text, value_to_set anyelement) OWNER TO postgres;

        --
        -- Name: update_rate_limit_config(); Type: FUNCTION; Schema: public; Owner: postgres
        --

        CREATE FUNCTION public.update_rate_limit_config() RETURNS trigger
            LANGUAGE plpgsql
            AS $$
        BEGIN
            NEW.modified_date_time = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$;


        ALTER FUNCTION public.update_rate_limit_config() OWNER TO postgres;

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
        -- Name: application; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.application (
            application_id uuid NOT NULL,
            application_name text NOT NULL,
            application_key text NOT NULL,
            application_status public.application_status DEFAULT 'draft'::public.application_status NOT NULL,
            application_description text,
            application_icon_url text DEFAULT ''::text NOT NULL,
            application_icon_svg text,
            application_url text DEFAULT ''::text NOT NULL,
            application_check_permissions boolean DEFAULT false NOT NULL,
            application_order integer DEFAULT 0 NOT NULL,
            owner_organization_id integer NOT NULL,
            deployment_model integer DEFAULT 0 NOT NULL,
            created_date integer DEFAULT date_part('epoch'::text, now()),
            updated_date integer DEFAULT date_part('epoch'::text, now()),
            oauth2_redirect_urls text,
            oauth2_client_secret text,
            permissions_required text
        );


        ALTER TABLE public.application OWNER TO postgres;

        --
        -- Name: application__application_category; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.application__application_category (
            application_id uuid NOT NULL,
            application_category_id uuid NOT NULL
        );


        ALTER TABLE public.application__application_category OWNER TO postgres;

        --
        -- Name: application__organization; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.application__organization (
            application_id uuid NOT NULL,
            organization_id integer NOT NULL
        );


        ALTER TABLE public.application__organization OWNER TO postgres;

        --
        -- Name: application_category; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.application_category (
            application_category_id uuid NOT NULL,
            application_category_name text NOT NULL
        );


        ALTER TABLE public.application_category OWNER TO postgres;

        --
        -- Name: application_context_menu; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.application_context_menu (
            application_context_menu_id uuid NOT NULL,
            application_id uuid NOT NULL,
            type public.contextmenutype NOT NULL,
            label character varying(255) NOT NULL,
            url character varying(255)
        );


        ALTER TABLE public.application_context_menu OWNER TO postgres;

        --
        -- Name: external_credential; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.external_credential (
            external_credential_id text NOT NULL,
            credential_name text,
            organization_id text NOT NULL,
            created_by text NOT NULL,
            service_type public.service_type DEFAULT 's3'::public.service_type NOT NULL,
            credentials_ciphertext text,
            encryption_key_id text,
            session_expiration integer,
            created_date integer DEFAULT date_part('epoch'::text, now()),
            updated_date integer DEFAULT date_part('epoch'::text, now()),
            deleted_date integer
        );


        ALTER TABLE public.external_credential OWNER TO postgres;

        --
        -- Name: oauth2_refresh_token; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.oauth2_refresh_token (
            refresh_token character varying(255) NOT NULL,
            application_id uuid NOT NULL,
            user_id uuid NOT NULL,
            expires integer NOT NULL
        );


        ALTER TABLE public.oauth2_refresh_token OWNER TO postgres;

        --
        -- Name: permission; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.permission (
            permission_id integer NOT NULL,
            permission_name text NOT NULL,
            permission_description text NOT NULL
        );


        ALTER TABLE public.permission OWNER TO postgres;

        --
        -- Name: role; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.role (
            role_id uuid NOT NULL,
            role_name text NOT NULL,
            role_description text NOT NULL,
            app_name text,
            permissions integer[] DEFAULT '{}'::integer[] NOT NULL,
            organization_id integer,
            is_private boolean DEFAULT false NOT NULL
        );


        ALTER TABLE public.role OWNER TO postgres;

        --
        -- Name: sso_acl; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl (
            application_id uuid NOT NULL,
            user_id uuid,
            group_id uuid,
            object_type text NOT NULL,
            object_id text NOT NULL,
            access json NOT NULL
        );


        ALTER TABLE public.sso_acl OWNER TO postgres;

        --
        -- Name: sso_acl_0331; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_0331 (
            application_id uuid NOT NULL,
            user_id uuid,
            group_id uuid,
            object_type text NOT NULL,
            object_id text NOT NULL,
            access json NOT NULL
        );


        ALTER TABLE public.sso_acl_0331 OWNER TO postgres;

        --
        -- Name: sso_acl_07192016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_07192016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_07192016 OWNER TO postgres;

        --
        -- Name: sso_acl_07202016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_07202016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_07202016 OWNER TO postgres;

        --
        -- Name: sso_acl_07212016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_07212016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_07212016 OWNER TO postgres;

        --
        -- Name: sso_acl_07272016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_07272016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_07272016 OWNER TO postgres;

        --
        -- Name: sso_acl_08032016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_08032016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_08032016 OWNER TO postgres;

        --
        -- Name: sso_acl_08042016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_08042016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_08042016 OWNER TO postgres;

        --
        -- Name: sso_acl_08082016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_08082016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_08082016 OWNER TO postgres;

        --
        -- Name: sso_acl_08102016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_08102016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_08102016 OWNER TO postgres;

        --
        -- Name: sso_acl_08122016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_08122016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_08122016 OWNER TO postgres;

        --
        -- Name: sso_acl_08172016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_08172016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_08172016 OWNER TO postgres;

        --
        -- Name: sso_acl_08292016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_08292016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_08292016 OWNER TO postgres;

        --
        -- Name: sso_acl_08312016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_08312016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_08312016 OWNER TO postgres;

        --
        -- Name: sso_acl_09012016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_09012016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_09012016 OWNER TO postgres;

        --
        -- Name: sso_acl_09082016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_09082016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_09082016 OWNER TO postgres;

        --
        -- Name: sso_acl_09092016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_09092016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_09092016 OWNER TO postgres;

        --
        -- Name: sso_acl_09152016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_09152016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_09152016 OWNER TO postgres;

        --
        -- Name: sso_acl_09202016; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_acl_09202016 (
            application_id uuid,
            user_id uuid,
            group_id uuid,
            object_type text,
            object_id text,
            access json
        );


        ALTER TABLE public.sso_acl_09202016 OWNER TO postgres;

        --
        -- Name: sso_application; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_application (
            application_id uuid NOT NULL,
            application_name text NOT NULL,
            date_created timestamp without time zone DEFAULT now() NOT NULL,
            kvp json DEFAULT '{}'::json NOT NULL,
            is_platform boolean DEFAULT true,
            organization_type_id integer
        );


        ALTER TABLE public.sso_application OWNER TO postgres;

        --
        -- Name: sso_external_oauth; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_external_oauth (
            user_id uuid NOT NULL,
            external_id text NOT NULL,
            external_user_id text NOT NULL,
            screen_name text NOT NULL,
            token text NOT NULL,
            secret text NOT NULL
        );


        ALTER TABLE public.sso_external_oauth OWNER TO postgres;

        --
        -- Name: sso_group; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_group (
            group_id uuid NOT NULL,
            group_name text NOT NULL,
            application_id uuid NOT NULL,
            kvp json,
            date_created timestamp without time zone DEFAULT now() NOT NULL,
            date_modified timestamp without time zone NOT NULL,
            modified_by uuid NOT NULL,
            permissions json DEFAULT '{}'::json
        );


        ALTER TABLE public.sso_group OWNER TO postgres;

        --
        -- Name: sso_token; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_token (
            token_id text NOT NULL,
            application_id uuid,
            group_id uuid,
            "json" json NOT NULL,
            CONSTRAINT token_check CHECK (((char_length(token_id) > 36) AND (strpos(token_id, ':'::text) > 0)))
        );


        ALTER TABLE public.sso_token OWNER TO postgres;

        --
        -- Name: sso_user; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_user (
            user_id uuid NOT NULL,
            user_name text NOT NULL,
            password text NOT NULL,
            kvp json,
            date_created timestamp without time zone DEFAULT now() NOT NULL,
            date_modified timestamp without time zone NOT NULL,
            modified_by uuid NOT NULL,
            last_logged_in timestamp without time zone,
            password_reset_token text,
            password_change_required boolean DEFAULT false NOT NULL,
            activation_token text,
            user_settings json DEFAULT '{}'::json,
            status public.user_status DEFAULT 'active'::public.user_status,
            trial_token text,
            mfa_shared_secret text,
            mfa_phone_number text,
            mfa_verified_date timestamp(6) without time zone,
            date_password_last_updated timestamp(6) without time zone DEFAULT now() NOT NULL,
            mfa_default_option text,
            mfa_ga_shared_secret text,
            mfa_ga_verified_date timestamp(6) without time zone,
            mfa_pending_registration text
        );


        ALTER TABLE public.sso_user OWNER TO postgres;

        --
        -- Name: sso_user__sso_group; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_user__sso_group (
            user_id uuid NOT NULL,
            group_id uuid NOT NULL
        );


        ALTER TABLE public.sso_user__sso_group OWNER TO postgres;

        --
        -- Name: sso_user_role; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.sso_user_role (
            user_id uuid NOT NULL,
            role_id uuid NOT NULL,
            date_created timestamp(3) without time zone DEFAULT now() NOT NULL,
            created_by uuid NOT NULL
        );


        ALTER TABLE public.sso_user_role OWNER TO postgres;

        --
        -- Name: temp_common_application_ids_counts; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.temp_common_application_ids_counts (
            application_id uuid,
            id_count bigint
        );


        ALTER TABLE public.temp_common_application_ids_counts OWNER TO postgres;

        --
        -- Name: temp_speechpad; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.temp_speechpad (
            recording_id character varying,
            metadata_assets character varying,
            transcript_uri character varying,
            media_uri character varying,
            application_id character varying,
            type character varying,
            content character varying
        );


        ALTER TABLE public.temp_speechpad OWNER TO postgres;

        --
        -- Name: trial; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.trial (
            date_activated timestamp(6) without time zone,
            date_end timestamp(6) without time zone,
            trial_duration integer NOT NULL,
            user_id uuid NOT NULL,
            trial_id uuid NOT NULL
        );


        ALTER TABLE public.trial OWNER TO postgres;

        --
        -- Name: user_setting; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.user_setting (
            user_id uuid NOT NULL,
            key text NOT NULL,
            value text
        );


        ALTER TABLE public.user_setting OWNER TO postgres;

        --
        -- Name: config_organization; Type: TABLE; Schema: rate_limit; Owner: postgres
        --

        CREATE TABLE rate_limit.config_organization (
            organization_id text NOT NULL,
            created_date_time timestamp with time zone DEFAULT now(),
            modified_date_time timestamp with time zone DEFAULT now(),
            interval_limit integer NOT NULL
        );


        ALTER TABLE rate_limit.config_organization OWNER TO postgres;

        --
        -- Name: config_organization_engine; Type: TABLE; Schema: rate_limit; Owner: postgres
        --

        CREATE TABLE rate_limit.config_organization_engine (
            organization_id text NOT NULL,
            created_date_time timestamp with time zone DEFAULT now(),
            modified_date_time timestamp with time zone DEFAULT now(),
            interval_limit integer NOT NULL
        );


        ALTER TABLE rate_limit.config_organization_engine OWNER TO postgres;

        --
        -- Name: config_settings; Type: TABLE; Schema: rate_limit; Owner: postgres
        --

        CREATE TABLE rate_limit.config_settings (
            setting_key text NOT NULL,
            created_date_time timestamp with time zone DEFAULT now(),
            modified_date_time timestamp with time zone DEFAULT now(),
            interval_limit integer NOT NULL
        );


        ALTER TABLE rate_limit.config_settings OWNER TO postgres;

        --
        -- Name: config_token; Type: TABLE; Schema: rate_limit; Owner: postgres
        --

        CREATE TABLE rate_limit.config_token (
            token_id text NOT NULL,
            created_date_time timestamp with time zone DEFAULT now(),
            modified_date_time timestamp with time zone DEFAULT now(),
            interval_limit integer NOT NULL
        );


        ALTER TABLE rate_limit.config_token OWNER TO postgres;

        --
        -- Name: config_token_type; Type: TABLE; Schema: rate_limit; Owner: postgres
        --

        CREATE TABLE rate_limit.config_token_type (
            token_type text NOT NULL,
            created_date_time timestamp with time zone DEFAULT now(),
            modified_date_time timestamp with time zone DEFAULT now(),
            interval_limit integer NOT NULL
        );


        ALTER TABLE rate_limit.config_token_type OWNER TO postgres;

        --
        -- Name: database_history id; Type: DEFAULT; Schema: audit; Owner: postgres
        --

        ALTER TABLE ONLY audit.database_history ALTER COLUMN id SET DEFAULT nextval('audit.database_history_id_seq'::regclass);


        --
        -- Name: application _ix_application@application_key; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application
            ADD CONSTRAINT "_ix_application@application_key" UNIQUE (application_key);


        --
        -- Name: application _ix_application@application_name; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application
            ADD CONSTRAINT "_ix_application@application_name" UNIQUE (application_name);


        --
        -- Name: permission _ix_permission@permission_name; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.permission
            ADD CONSTRAINT "_ix_permission@permission_name" UNIQUE (permission_name);


        --
        -- Name: role _ix_role@role_name,app_name; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.role
            ADD CONSTRAINT "_ix_role@role_name,app_name" UNIQUE (role_name, app_name);


        --
        -- Name: sso_acl _ix_sso_acl@application_id,user_id,group_id,object_type,object_; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_acl
            ADD CONSTRAINT "_ix_sso_acl@application_id,user_id,group_id,object_type,object_" UNIQUE (application_id, user_id, group_id, object_type, object_id);


        --
        -- Name: sso_acl_0331 _ix_sso_acl_0331@application_id,user_id,group_id,object_type,ob; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_acl_0331
            ADD CONSTRAINT "_ix_sso_acl_0331@application_id,user_id,group_id,object_type,ob" UNIQUE (application_id, user_id, group_id, object_type, object_id);


        --
        -- Name: sso_application _ix_sso_application@application_name; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_application
            ADD CONSTRAINT "_ix_sso_application@application_name" UNIQUE (application_name);


        --
        -- Name: sso_external_oauth _ix_sso_external_oath@external_id,external_user_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_external_oauth
            ADD CONSTRAINT "_ix_sso_external_oath@external_id,external_user_id" UNIQUE (external_id, external_user_id);


        --
        -- Name: sso_group _ix_sso_group@application_id,group_name; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_group
            ADD CONSTRAINT "_ix_sso_group@application_id,group_name" UNIQUE (application_id, group_name);


        --
        -- Name: sso_user _ix_sso_user@user_name; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user
            ADD CONSTRAINT "_ix_sso_user@user_name" UNIQUE (user_name);

        ALTER TABLE public.sso_user CLUSTER ON "_ix_sso_user@user_name";


        --
        -- Name: application _pk_application@application_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application
            ADD CONSTRAINT "_pk_application@application_id" PRIMARY KEY (application_id);


        --
        -- Name: application__application_category _pk_application__application_category@application_id,applicatio; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application__application_category
            ADD CONSTRAINT "_pk_application__application_category@application_id,applicatio" PRIMARY KEY (application_id, application_category_id);


        --
        -- Name: application__organization _pk_application__organization@application_id,organization_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application__organization
            ADD CONSTRAINT "_pk_application__organization@application_id,organization_id" PRIMARY KEY (application_id, organization_id);


        --
        -- Name: application_category _pk_application_category@application_category_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application_category
            ADD CONSTRAINT "_pk_application_category@application_category_id" PRIMARY KEY (application_category_id);


        --
        -- Name: application_context_menu _pk_application_context_menu; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application_context_menu
            ADD CONSTRAINT _pk_application_context_menu PRIMARY KEY (application_context_menu_id);


        --
        -- Name: external_credential _pk_external_credential@external_credential_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.external_credential
            ADD CONSTRAINT "_pk_external_credential@external_credential_id" PRIMARY KEY (external_credential_id);


        --
        -- Name: oauth2_refresh_token _pk_oauth2_refresh_token@refresh_token; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.oauth2_refresh_token
            ADD CONSTRAINT "_pk_oauth2_refresh_token@refresh_token" PRIMARY KEY (refresh_token);


        --
        -- Name: permission _pk_permission@permission_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.permission
            ADD CONSTRAINT "_pk_permission@permission_id" PRIMARY KEY (permission_id);


        --
        -- Name: role _pk_role@role_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.role
            ADD CONSTRAINT "_pk_role@role_id" PRIMARY KEY (role_id);


        --
        -- Name: sso_application _pk_sso_application@application_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_application
            ADD CONSTRAINT "_pk_sso_application@application_id" PRIMARY KEY (application_id);


        --
        -- Name: sso_external_oauth _pk_sso_external; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_external_oauth
            ADD CONSTRAINT _pk_sso_external PRIMARY KEY (user_id, external_id);


        --
        -- Name: sso_group _pk_sso_group@group_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_group
            ADD CONSTRAINT "_pk_sso_group@group_id" PRIMARY KEY (group_id);


        --
        -- Name: sso_token _pk_sso_token; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_token
            ADD CONSTRAINT _pk_sso_token PRIMARY KEY (token_id);


        --
        -- Name: sso_user _pk_sso_user@user_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user
            ADD CONSTRAINT "_pk_sso_user@user_id" PRIMARY KEY (user_id);


        --
        -- Name: sso_user__sso_group _pk_sso_user__sso_group@user_id,@group_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user__sso_group
            ADD CONSTRAINT "_pk_sso_user__sso_group@user_id,@group_id" PRIMARY KEY (user_id, group_id);


        --
        -- Name: sso_user_role _pk_sso_user_role@user_id,role_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user_role
            ADD CONSTRAINT "_pk_sso_user_role@user_id,role_id" PRIMARY KEY (user_id, role_id);


        --
        -- Name: user_setting _pk_user_setting@user_id,@key; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.user_setting
            ADD CONSTRAINT "_pk_user_setting@user_id,@key" PRIMARY KEY (user_id, key);


        --
        -- Name: config_organization_engine config_organization_engine_pkey; Type: CONSTRAINT; Schema: rate_limit; Owner: postgres
        --

        ALTER TABLE ONLY rate_limit.config_organization_engine
            ADD CONSTRAINT config_organization_engine_pkey PRIMARY KEY (organization_id);


        --
        -- Name: config_organization config_organization_pkey; Type: CONSTRAINT; Schema: rate_limit; Owner: postgres
        --

        ALTER TABLE ONLY rate_limit.config_organization
            ADD CONSTRAINT config_organization_pkey PRIMARY KEY (organization_id);


        --
        -- Name: config_settings config_settings_pkey; Type: CONSTRAINT; Schema: rate_limit; Owner: postgres
        --

        ALTER TABLE ONLY rate_limit.config_settings
            ADD CONSTRAINT config_settings_pkey PRIMARY KEY (setting_key);


        --
        -- Name: config_token config_token_pkey; Type: CONSTRAINT; Schema: rate_limit; Owner: postgres
        --

        ALTER TABLE ONLY rate_limit.config_token
            ADD CONSTRAINT config_token_pkey PRIMARY KEY (token_id);


        --
        -- Name: config_token_type config_token_type_pkey; Type: CONSTRAINT; Schema: rate_limit; Owner: postgres
        --

        ALTER TABLE ONLY rate_limit.config_token_type
            ADD CONSTRAINT config_token_type_pkey PRIMARY KEY (token_type);


        --
        -- Name: ix_database_history_started_date; Type: INDEX; Schema: audit; Owner: postgres
        --

        CREATE INDEX ix_database_history_started_date ON audit.database_history USING btree (started_date);


        --
        -- Name: ix_database_history_status; Type: INDEX; Schema: audit; Owner: postgres
        --

        CREATE INDEX ix_database_history_status ON audit.database_history USING btree (status);


        --
        -- Name: _ix_application__application_category@application_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_application__application_category@application_id" ON public.application__application_category USING btree (application_id);


        --
        -- Name: _ix_application__organization@organization_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_application__organization@organization_id" ON public.application__organization USING btree (organization_id);


        --
        -- Name: _ix_application_context_menu_application_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX _ix_application_context_menu_application_id ON public.application_context_menu USING btree (application_id);


        --
        -- Name: _ix_oauth2_refresh_token@user_id_application_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_oauth2_refresh_token@user_id_application_id" ON public.oauth2_refresh_token USING btree (user_id, application_id);


        --
        -- Name: _ix_role_organization_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX _ix_role_organization_id ON public.role USING btree (organization_id);


        --
        -- Name: _ix_sso_acl@application_id,object_type,object_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_sso_acl@application_id,object_type,object_id" ON public.sso_acl USING btree (application_id, object_type, object_id);


        --
        -- Name: _ix_sso_acl@user_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_sso_acl@user_id" ON public.sso_acl USING btree (user_id);


        --
        -- Name: _ix_sso_acl_0331@application_id,object_type,object_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_sso_acl_0331@application_id,object_type,object_id" ON public.sso_acl_0331 USING btree (application_id, object_type, object_id);


        --
        -- Name: _ix_sso_acl_0331@user_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_sso_acl_0331@user_id" ON public.sso_acl_0331 USING btree (user_id);


        --
        -- Name: _ix_sso_group@kvp->>organizationId; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_sso_group@kvp->>organizationId" ON public.sso_group USING btree (((kvp ->> 'organizationId'::text)));


        --
        -- Name: _ix_sso_token@application_id,group_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_sso_token@application_id,group_id" ON public.sso_token USING btree (application_id, group_id);


        --
        -- Name: _ix_sso_user@activation_token; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_sso_user@activation_token" ON public.sso_user USING btree (activation_token);


        --
        -- Name: _ix_sso_user@lower(user_name); Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_sso_user@lower(user_name)" ON public.sso_user USING btree (lower(user_name));


        --
        -- Name: _ix_sso_user__sso_group@group_id,user_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_sso_user__sso_group@group_id,user_id" ON public.sso_user__sso_group USING btree (group_id, user_id);


        --
        -- Name: _ix_user_setting@key; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_user_setting@key" ON public.user_setting USING btree (key);


        --
        -- Name: idx_role_private; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX idx_role_private ON public.role USING btree (is_private);


        --
        -- Name: idx_sso_user_role_roleid; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX idx_sso_user_role_roleid ON public.sso_user_role USING btree (role_id) WHERE (user_id IS NOT NULL);


        --
        -- Name: idx_sso_user_role_userid; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX idx_sso_user_role_userid ON public.sso_user_role USING btree (user_id);


        --
        -- Name: config_organization_engine rate_limit_config_organization_engine_modify; Type: TRIGGER; Schema: rate_limit; Owner: postgres
        --

        CREATE TRIGGER rate_limit_config_organization_engine_modify BEFORE UPDATE ON rate_limit.config_organization_engine FOR EACH ROW EXECUTE PROCEDURE public.update_rate_limit_config();


        --
        -- Name: config_organization rate_limit_config_organization_modify; Type: TRIGGER; Schema: rate_limit; Owner: postgres
        --

        CREATE TRIGGER rate_limit_config_organization_modify BEFORE UPDATE ON rate_limit.config_organization FOR EACH ROW EXECUTE PROCEDURE public.update_rate_limit_config();


        --
        -- Name: config_settings rate_limit_config_settings_modify; Type: TRIGGER; Schema: rate_limit; Owner: postgres
        --

        CREATE TRIGGER rate_limit_config_settings_modify BEFORE UPDATE ON rate_limit.config_settings FOR EACH ROW EXECUTE PROCEDURE public.update_rate_limit_config();


        --
        -- Name: config_token rate_limit_config_token_modify; Type: TRIGGER; Schema: rate_limit; Owner: postgres
        --

        CREATE TRIGGER rate_limit_config_token_modify BEFORE UPDATE ON rate_limit.config_token FOR EACH ROW EXECUTE PROCEDURE public.update_rate_limit_config();


        --
        -- Name: config_token_type rate_limit_config_token_type_modify; Type: TRIGGER; Schema: rate_limit; Owner: postgres
        --

        CREATE TRIGGER rate_limit_config_token_type_modify BEFORE UPDATE ON rate_limit.config_token_type FOR EACH ROW EXECUTE PROCEDURE public.update_rate_limit_config();


        --
        -- Name: application__application_category _fk_application__application_category__application_category_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application__application_category
            ADD CONSTRAINT _fk_application__application_category__application_category_id FOREIGN KEY (application_category_id) REFERENCES public.application_category(application_category_id);


        --
        -- Name: application__application_category _fk_application__application_category__application_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application__application_category
            ADD CONSTRAINT _fk_application__application_category__application_id FOREIGN KEY (application_id) REFERENCES public.application(application_id);


        --
        -- Name: application__organization _fk_application__organization__application_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application__organization
            ADD CONSTRAINT _fk_application__organization__application_id FOREIGN KEY (application_id) REFERENCES public.application(application_id);


        --
        -- Name: application_context_menu _fk_application_context_menu__application; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.application_context_menu
            ADD CONSTRAINT _fk_application_context_menu__application FOREIGN KEY (application_id) REFERENCES public.application(application_id) ON DELETE CASCADE;


        --
        -- Name: oauth2_refresh_token _fk_oauth2_refresh_token__application_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.oauth2_refresh_token
            ADD CONSTRAINT _fk_oauth2_refresh_token__application_id FOREIGN KEY (application_id) REFERENCES public.application(application_id);


        --
        -- Name: oauth2_refresh_token _fk_oauth2_refresh_token__user_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.oauth2_refresh_token
            ADD CONSTRAINT _fk_oauth2_refresh_token__user_id FOREIGN KEY (user_id) REFERENCES public.sso_user(user_id);


        --
        -- Name: sso_acl_0331 _fk_sso_acl_0331__sso_group; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_acl_0331
            ADD CONSTRAINT _fk_sso_acl_0331__sso_group FOREIGN KEY (group_id) REFERENCES public.sso_group(group_id) ON DELETE CASCADE;


        --
        -- Name: sso_acl_0331 _fk_sso_acl_0331__sso_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_acl_0331
            ADD CONSTRAINT _fk_sso_acl_0331__sso_user FOREIGN KEY (user_id) REFERENCES public.sso_user(user_id) ON DELETE CASCADE;


        --
        -- Name: sso_acl _fk_sso_acl__sso_application; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_acl
            ADD CONSTRAINT _fk_sso_acl__sso_application FOREIGN KEY (application_id) REFERENCES public.sso_application(application_id);


        --
        -- Name: sso_acl _fk_sso_acl__sso_group; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_acl
            ADD CONSTRAINT _fk_sso_acl__sso_group FOREIGN KEY (group_id) REFERENCES public.sso_group(group_id) ON DELETE CASCADE;


        --
        -- Name: sso_acl _fk_sso_acl__sso_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_acl
            ADD CONSTRAINT _fk_sso_acl__sso_user FOREIGN KEY (user_id) REFERENCES public.sso_user(user_id) ON DELETE CASCADE;


        --
        -- Name: sso_external_oauth _fk_sso_external_oauth__sso_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_external_oauth
            ADD CONSTRAINT _fk_sso_external_oauth__sso_user FOREIGN KEY (user_id) REFERENCES public.sso_user(user_id) ON DELETE CASCADE;


        --
        -- Name: sso_group _fk_sso_group__sso_application; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_group
            ADD CONSTRAINT _fk_sso_group__sso_application FOREIGN KEY (application_id) REFERENCES public.sso_application(application_id);


        --
        -- Name: sso_token _fk_sso_token__sso_application; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_token
            ADD CONSTRAINT _fk_sso_token__sso_application FOREIGN KEY (application_id) REFERENCES public.sso_application(application_id);


        --
        -- Name: sso_token _fk_sso_token__sso_group; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_token
            ADD CONSTRAINT _fk_sso_token__sso_group FOREIGN KEY (group_id) REFERENCES public.sso_group(group_id) ON DELETE CASCADE;


        --
        -- Name: sso_user__sso_group _fk_sso_user__sso_group__sso_group; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user__sso_group
            ADD CONSTRAINT _fk_sso_user__sso_group__sso_group FOREIGN KEY (group_id) REFERENCES public.sso_group(group_id) ON DELETE CASCADE;


        --
        -- Name: sso_user__sso_group _fk_sso_user__sso_group__sso_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user__sso_group
            ADD CONSTRAINT _fk_sso_user__sso_group__sso_user FOREIGN KEY (user_id) REFERENCES public.sso_user(user_id);


        --
        -- Name: sso_user_role _fk_sso_user_role@role_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user_role
            ADD CONSTRAINT "_fk_sso_user_role@role_id" FOREIGN KEY (role_id) REFERENCES public.role(role_id);


        --
        -- Name: sso_user_role _fk_sso_user_role@user_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user_role
            ADD CONSTRAINT "_fk_sso_user_role@user_id" FOREIGN KEY (user_id) REFERENCES public.sso_user(user_id);


        --
        -- Name: sso_user__sso_group sso_user__sso_group_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user__sso_group
            ADD CONSTRAINT sso_user__sso_group_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.sso_group(group_id) ON DELETE CASCADE;


        --
        -- Name: sso_user__sso_group sso_user__sso_group_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.sso_user__sso_group
            ADD CONSTRAINT sso_user__sso_group_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.sso_user(user_id) ON DELETE CASCADE;



        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            'ddca9b68-d775-4934-8ffd-7aecc779b652',
            'Admin',
            'Access to all features for organization management',
            'admin',
            '{8188}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            '7dcdbe59-b8a5-41e1-b345-76b29765a64a',
            'Analytics Editor',
            '',
            'analytics',
            '{0,0,256}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            'd1491325-cc45-4810-9d15-99cbf4761d66',
            'Collections Viewer',
            '',
            'collections',
            '{0,1280,36}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            '3577dfc6-f441-41f9-8dab-ef9079530450',
            'Discovery Editor',
            '',
            'discovery',
            '{0,268427264}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
            'CMS Editor',
            '',
            'cms',
            '{-8192,255}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            '555033d1-508c-49c0-8127-66c2dc129828',
            'CMS Viewer',
            '',
            'cms',
            '{-2004312064,136}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            '5b195546-95ff-438b-81d7-c8505bf75bee',
            'Discovery Viewer',
            '',
            'discovery',
            '{0,8544256}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions)  VALUES (
            'dcaa3330-2534-41bf-abcd-86a457f0b210',
            'Analytics Viewer',
            '',
            'analytics',
            '{0,536870912}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id) VALUES (
            '3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
            'Super Admin',
            'Full access to all Veritone features',
            'admin',
            '{8190}',
            1
        );

        INSERT INTO	 public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            'e9c2c71a-80dd-4a35-af68-cbc256bb23a6',
            'Collections Editor',
            '',
            'collections',
            '{0,7936,255}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            '912e377e-f4a4-4184-8db1-baa9670d8081',
            'Developer Editor',
            '',
            'developer',
            '{0,0,1073741824,5189619}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions) VALUES (
            '40c94f70-39d7-4340-bd15-acdf44ca34c5',
            'Developer Sandbox Editor',
            '',
            'developer_sandbox',
            '{0,0,1073741824}'
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id) VALUES (
            '8806a4e3-6486-47b6-aeb8-833a425bdfb8',
            'Developer Docker Admin',
            '',
            'developer',
            '{0,0,-1073741824,3200016}',
            1
        );

        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id) VALUES (
            '1fa5da82-841b-4efa-b998-45e03fbb3b03',
            'Developer Admin',
            '',
            'developer',
            '{0,0,1073741824,8335347}',
            1
        );

        -- Create Enterprise/Discovery SSO application
        -- Not exactly sure why this application is so sacred that it needs a spot in the sso_application table along with the
        -- application table, but in any case, this is required to make a subsequent foreign reference work.
        INSERT INTO public.sso_application (
            application_id,
            application_name,
            kvp,
            is_platform
        ) VALUES (
            '32babe30-fb42-11e4-89bc-27b69865858a',
            'Enterprise',
            '{
                "platformType": "enterprise",
                "platformName": "Enterprise",
                "platformUrl": "enterprise",
                "image": "https://static.veritone.com/veritone-enterprise.png",
                "lightImage": "https://static.veritone.com/veritone-enterprise-light.png",
                "darkImage": "https://static.veritone.com/veritone-enterprise-dark@3x.png"
            }',
            TRUE
        );

        -- Create Root Admin Org
        -- Mimics business logic in core-admin-server/bll/organization.js createOrganization
        -- https://github.com/veritone/core-admin-server/blob/2b2889f94da238fec13637407ab46fbb57fb68af/bll/organization.js#L135
        -- TODO: De-duplicate hard-coded UUIDs so they can be defined once at the top of the script

        INSERT INTO public.sso_application (application_id, application_name) VALUES (
            '7f936a87-8e59-4206-9999-938b0e3c62ab',
            'Root Admin'
        );

        INSERT INTO public.sso_group (group_id, group_name, application_id, date_modified, modified_by, permissions, kvp) VALUES (
            '77e53e23-d600-4bbf-ae09-dde5a0c88c5f',  -- TODO: Thought this would get auto-created for me
            'Root Admin',
            '7f936a87-8e59-4206-9999-938b0e3c62ab',
            current_timestamp,
            '00000000-0000-0000-0000-000000000000',  -- TODO: Not really sure what this is meant to be
            '{"cms":{"access":"true"}}',
            '{
                "groupType": "organization",
                "organizationId": "1",
                "organizationName": "Root Admin"
            }'  -- TODO: Assumes the script that runs in media_platform generates organization_id=1
        );

        INSERT INTO	public.sso_token (token_id, application_id, group_id, json) VALUES (
            'root:2035f315-3bf9-44ea-9c33-71fc3d82ac04-17aa22ff-dbdd-40f5-ada1-a694c20c1719',
            '7f936a87-8e59-4206-9999-938b0e3c62ab',
            '77e53e23-d600-4bbf-ae09-dde5a0c88c5f',
            '{
                "applicationId": "7f936a87-8e59-4206-9999-938b0e3c62ab",
                "isRevoked": false,
                "rights": [
                    "asset:uri",
                    "job:create",
                    "job:read",
                    "job:update",
                    "job:delete",
                    "task:update",
                    "recording:create",
                    "recording:read",
                    "recording:update",
                    "recording:delete",
                    "report:create",
                    "analytics:usage"
                ],
                "tokenId": "root:2035f315-3bf9-44ea-9c33-71fc3d82ac04-17aa22ff-dbdd-40f5-ada1-a694c20c1719",
                "internal": true,
                "tokenLabel": "Master token"
            }'
        );

        -- Create Root Admin User
        -- Mimics business logic in core-admin-server/bll/user.js createUser
        -- https://github.com/veritone/core-admin-server/blob/dacca7a8f9eb491b545d3185a0c6a5c6cd6504a6/bll/user.js#L209

        INSERT INTO public.sso_user (user_id, user_name, password, kvp, date_modified, modified_by) VALUES (
            '9c5e4b53-25b8-44c6-91a5-1e46497c9903',
            'dev+superadmin@veritone.com',
            '$2a$10$/qtiMBEoWez9tZvdFDHsveOfILuoOaYavqBFCHhB.S7nIWoqCZc.O',  -- TODO: Figure out how to do this securely.  For now, this is the hash on prod that was generated for the well-known blythe+espn@veritone.com password
            '{"firstName": "Root Admin", "lastName": "Veritone"}',
            current_timestamp,
            '00000000-0000-0000-0000-000000000000'  -- TODO: Not really sure what this is meant to be
        );

        -- createAclsForUser
        INSERT INTO public.sso_acl (application_id, user_id, group_id, object_type, object_id, access)
        VALUES (
            '32babe30-fb42-11e4-89bc-27b69865858a',
            '9c5e4b53-25b8-44c6-91a5-1e46497c9903',
            '77e53e23-d600-4bbf-ae09-dde5a0c88c5f',
            'obj-access-grant',
            'organization/1',
            '{"owner":true}'
        );

        -- createUserGroups
        INSERT INTO public.sso_user__sso_group (user_id, group_id) VALUES (
            '9c5e4b53-25b8-44c6-91a5-1e46497c9903',
            '77e53e23-d600-4bbf-ae09-dde5a0c88c5f'
        );

        -- createRolesForUser
        INSERT INTO public.sso_user_role (user_id, role_id, created_by) VALUES (
            '9c5e4b53-25b8-44c6-91a5-1e46497c9903',
            '3459c3de-493f-443a-8ad0-ddb9f3f6c76d',
            '00000000-0000-0000-0000-000000000000'
        );

        INSERT INTO public.application (
            application_id,
            application_name,
            application_key,
            application_status,
            application_description,
            application_icon_url,
            application_icon_svg,
            application_url,
            application_check_permissions,
            application_order,
            owner_organization_id
        ) VALUES (
            'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
            'Admin',
            'admin',
            'active',
            'Manage your organization''s information, users and permissions',
            'https://static.veritone.com/veritone-ui/appicons-2/admin.png',
            'https://static.veritone.com/veritone-ui/app-icons-svg/admin-app.svg',
            'https://admin.@@{EXTERNAL_DNS_ZONE}@@',
            TRUE,
            10,
            1
        );

        INSERT INTO public.application (
            application_id,
            application_name,
            application_key,
            application_status,
            application_description,
            application_icon_url,
            application_icon_svg,
            application_url,
            application_check_permissions,
            application_order,
            owner_organization_id
        ) VALUES (
            'bc519e7f-7953-408d-8991-57f217286d6c',
            'Analytics',
            'analytics',
            'active',
            'Create, configure and distribute reports based on Veritone and integrated 3rd party data sources.',
            'https://static.veritone.com/veritone-ui/appicons-2/analytics.png',
            '',
            'https://analytics.@@{EXTERNAL_DNS_ZONE}@@',
            TRUE,
            10,
            1
        );

        INSERT INTO public.application (
            application_id,
            application_name,
            application_key,
            application_status,
            application_description,
            application_icon_url,
            application_icon_svg,
            application_url,
            application_check_permissions,
            application_order,
            owner_organization_id
        ) VALUES (
            'cc4e0e89-3420-49c2-b06d-8d9a929c941c',
            'Collections',
            'collections',
            'active',
            'Easily syndicate your Veritone Collections to your website and share an interactive narrative with your viewers.',
            'https://static.veritone.com/veritone-ui/appicons-2/collections.png',
            'https://static.veritone.com/veritone-ui/app-icons-svg/collections-app.svg',
            'https://collections.@@{EXTERNAL_DNS_ZONE}@@',
            TRUE,
            8,
            1
        );

        INSERT INTO public.application (
            application_id,
            application_name,
            application_key,
            application_status,
            application_description,
            application_icon_url,
            application_icon_svg,
            application_url,
            application_check_permissions,
            application_order,
            owner_organization_id
        ) VALUES (
            '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
            'CMS',
            'cms',
            'active',
            'With Veritone CMS, you can create, share, run cognitive engines, and keep all your files together to share with your organization.',
            'https://static.veritone.com/veritone-ui/appicons-2/cms.png',
            'https://static.veritone.com/veritone-ui/app-icons-svg/cms-app.svg',
            'https://cms.@@{EXTERNAL_DNS_ZONE}@@',
            TRUE,
            6,
            1
        );

        INSERT INTO public.application (
            application_id,
            application_name,
            application_key,
            application_status,
            application_description,
            application_icon_url,
            application_icon_svg,
            application_url,
            application_check_permissions,
            application_order,
            owner_organization_id
        ) VALUES (
            '32babe30-fb42-11e4-89bc-27b69865858a',
            'Discovery',
            'discovery',
            'active',
            'Transform the way audio and vido is captured, accessed and leveraged throughout an organization.',
            'https://static.veritone.com/veritone-ui/appicons-2/discovery.png',
            'https://static.veritone.com/veritone-ui/app-icons-svg/discovery-app.svg',
            'https://enterprise.@@{EXTERNAL_DNS_ZONE}@@',
            TRUE,
            4,
            1
        );

        INSERT INTO public.application (
            application_id,
            application_name,
            application_key,
            application_status,
            application_description,
            application_icon_url,
            application_icon_svg,
            application_url,
            application_check_permissions,
            application_order,
            owner_organization_id
        ) VALUES (
            'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
            'Developer',
            'developer',
            'active',
            'Create engines and applications.',
            'https://static.veritone.com/developer-app.png',
            'https://static.veritone.com/veritone-ui/app-icons-svg/developer-app.svg',
            'https://developer.@@{EXTERNAL_DNS_ZONE}@@',
            TRUE,
            10,
            1
        );

        INSERT INTO public.application (
            application_id,
            application_name,
            application_key,
            application_status,
            application_description,
            application_icon_url,
            application_icon_svg,
            application_url,
            application_check_permissions,
            application_order,
            owner_organization_id
        ) VALUES (
            '732c697a-0eb1-4c92-9c40-5d6f5dab8baa',
            'Developer Sandbox',
            'developer_sandbox',
            'active',
            'Create engines and applications in a sandbox environment.',
            'https://static.veritone.com/developer-app.png',
            'https://static.veritone.com/veritone-ui/app-icons-svg/developer-app.svg',
            '',
            TRUE,
            10,
            1
        );

        INSERT INTO public.application (
            application_id,
            application_name,
            application_key,
            application_status,
            application_description,
            application_icon_url,
            application_icon_svg,
            application_url,
            application_check_permissions,
            application_order,
            owner_organization_id
        ) VALUES (
            'cf05552b-52e0-46fa-8f7f-4c9eee135c51',
            'Library',
            'library',
            'active',
            'Create training models for cognitive engines to find what’s important in your media quickly, easily, and more accurately.',
            'https://static.veritone.com/veritone-ui/appicons-2/library.png',
            'https://static.veritone.com/veritone-ui/app-icons-svg/library-app.svg',
            'https://library.@@{EXTERNAL_DNS_ZONE}@@',
            FALSE,
            999,
            1
        );

        INSERT INTO public.sso_token (
            token_id,
            json
        ) VALUES (
            'task-iron-server:b1cef23d2b804f609f4ffd43173808a1b293c2b086984b48b20ded48aa7c5db5',
            '{
                "token_id": "task-iron-server:b1cef23d2b804f609f4ffd43173808a1b293c2b086984b48b20ded48aa7c5db5",
                "rights": [
                    "task_type:internal"
                ],
                "internal": true,
                "tokenLabel": "task-iron-server",
                "isRevoked": false
            }'
        );

        -- transcode-ffmpeg
        INSERT INTO sso.public.sso_token (
            token_id,
            json
        ) VALUES (
            'task-transcode-ffmpeg:6caf2e161cbe4848973907f53e56c9314e31c9f74b0549e3b4eab66c88ad3372',
            '{
                "tokenId": "task-transcode-ffmpeg:6caf2e161cbe4848973907f53e56c9314e31c9f74b0549e3b4eab66c88ad3372",
                "rights": [
                    "asset:uri",
                    "recording:read",
                    "recording:update",
                    "task:update"
                ],
                "internal": true,
                "tokenLabel": "task-transcode-ffmpeg",
                "isRevoked": false
            }'
        );

        -- mention-generate
        INSERT INTO sso.public.sso_token (
            token_id,
            json
        ) VALUES (
            'task-mention-generate:3d04f256f42b4fefbb00e5aa07016e5707e8a2a3cd0c4d0fa61d444e1fe65582',
            '{
                "tokenId": "task-mention-generate:3d04f256f42b4fefbb00e5aa07016e5707e8a2a3cd0c4d0fa61d444e1fe65582",
                "rights": [
                    "asset:uri",
                    "recording:read",
                    "task:update"
                ],
                "internal": true,
                "tokenLabel": "task-mention-generate",
                "isRevoked": false
            }'
        );

        -- download-file
        INSERT INTO sso.public.sso_token (
            token_id,
            json
        ) VALUES (
            'task-download-file:511e2ed81321449798a285e216267226674fe97ea380496ca59dbb275b92d3e0',
            '{
                "tokenId": "task-download-file:511e2ed81321449798a285e216267226674fe97ea380496ca59dbb275b92d3e0",
                "rights": [
                    "asset:uri",
                    "recording:read",
                    "recording:create",
                    "recording:update",
                    "task:update"
                ],
                "internal": true,
                "tokenLabel": "task-download-file",
                "isRevoked": false
            }'
        );


        -- bulk-edit-transcribe
        INSERT INTO sso.public.sso_token (
            token_id,
            json
        ) VALUES (
            'task-bulk-edit-transcript:44c18364af594719a9d48e865afb9025bfba3b0642de4528a04774e3fbde52bb',
            '{
                "tokenId": "task-bulk-edit-transcript:44c18364af594719a9d48e865afb9025bfba3b0642de4528a04774e3fbde52bb",
                "rights": [
                    "asset:uri",
                    "recording:read",
                    "recording:update",
                    "task:update",
                    "asset:all"
                ],
                "internal": true,
                "tokenLabel": "task-bulk-edit-transcript",
                "isRevoked": false
            }'
        );


        INSERT INTO public.permission (
            permission_id,
            permission_name,
            permission_description
        ) VALUES (
            121,
            'veritone.financeadmin',
            'access to internal billing functions'
        );

        -- curl -X POST "http://local.veritone.com:9000/api/admin/roles/37b18322-74bf-4ae4-a46f-2cc407a9966c/permissions"
        -- -H "Authorization: bearer c57d0900-b864-4328-88f1-7e8691c4d45f"
        -- -H "content-type: application/json" -d '{"permissions": ["financeadmin"]}'

        INSERT INTO public.role (
            role_id,
            role_name,
            role_description,
            app_name,
            permissions,
            organization_id
        ) VALUES (
            '37b18322-74bf-4ae4-a46f-2cc407a9966c',
            'Finance Admin',
            'Access to Billing features',
            NULL,
            '{0,0,0,33554432}',
            NULL
        );


        INSERT INTO public.sso_user_role (
            user_id,
            role_id,
            date_created,
            created_by
        )
            SELECT
                user_id,
                role_id,
                NOW(),
                user_id
            FROM
                public.sso_user, public.role
            WHERE
                user_name = 'dev+superadmin@veritone.com'
                    AND role_name = 'Finance Admin'
        ;


        INSERT INTO public.sso_token (
            token_id,
            json
        ) VALUES (
            'core-job-server:7278774dce7e49ccb228d2a4513049494700e70f7f4c4c8baca66d0d29ba1d9d',
            '{
                "tokenId": "core-job-server:7278774dce7e49ccb228d2a4513049494700e70f7f4c4c8baca66d0d29ba1d9d",
                "rights": [
                    "recording:read",
                    "token:create",
                    "token:revoke",
                    "token:user",
                    "token:organization",
                    "token:read"
                ],
                "internal": true,
                "tokenLabel": "core-job-server",
                "isRevoked": false
            }'
        );


        INSERT INTO public.sso_token (
            token_id,
            json
        ) VALUES (
            'core-recording-clone:47df04a392694bc0b686de518a35b56c07719ab62fcc474da580b475e739a6f1',
            '{
                "tokenId":"core-recording-clone:47df04a392694bc0b686de518a35b56c07719ab62fcc474da580b475e739a6f1",
                "rights":["job:create", "job:read"],
                "internal":true,
                "tokenLabel":"core-recording-clone",
                "isRevoked":false
            }'
        );


        INSERT INTO public.sso_token (
            token_id,
            json
        ) VALUES (
            'core-job-server-prod:50f2240721f24248992adff859bb0ceda2ec0fd29ce9499b9af66021eab1eeae',
            '{
                "rights": [
                    "organization:read", 
                    "recording:read", 
                    "token:create", 
                    "token:revoke", 
                    "token:user", 
                    "token:organization", 
                    "token:read"
                ], 
                "tokenId": "core-job-server-prod:50f2240721f24248992adff859bb0ceda2ec0fd29ce9499b9af66021eab1eeae", 
                "internal": true, 
                "isRevoked": false, 
                "tokenLabel": "core-job-server-prod"
            }'
        );


        INSERT INTO public.sso_token (
            token_id,
            json
        ) VALUES (
            'task-conductor:06f339d286e54b9ebf5676b8f277bb52e4aeddbab20d41cb822e17bc2df87c80',
            '{
                "tokenId": "task-conductor:06f339d286e54b9ebf5676b8f277bb52e4aeddbab20d41cb822e17bc2df87c80",
                "rights":["asset:uri","job:create","job:read","task:update"],
                "internal":true,
                "tokenLabel":"task-conductor",
                "isRevoked":false
            }'
        );


        INSERT INTO public.sso_token (
            token_id,
            json
        ) VALUES (
            'task-insert-into-index:6b2559ad0aee4804a1ec9de975533e4eb06ba331acff4639a438bdb6d8615e95',
            '{
                "rights": [
                    "asset:uri", "master", "recording:read", "recording:update", 
                    "asset:all", "task:update", "job:read", "job:create", 
                    "task_type:internal", "cms:sources:read", "cms:sources:update",
                    "admin.org:read"
                ], 
                "tokenId": "task-insert-into-index:6b2559ad0aee4804a1ec9de975533e4eb06ba331acff4639a438bdb6d8615e95", 
                "internal": true, 
                "isRevoked": false, 
                "tokenLabel": "task-insert-into-index"
            }'
        );

        INSERT into public.sso_token (token_id, json) VALUES ('media-streamer:Ov7I806o43072g2M0G2i8eS44q7uzC0Z90im21w4t8b1E4ZJ48bcnx4918830P9f', '{"rights":["recording:read","asset:uri","asset:all", "task_type:internal"],"isRevoked":false}');


        -- Form database repo:
        PERFORM extract(millennium from now());

        INSERT INTO public.sso_token
        ("token_id", "application_id", "group_id", "json")
        VALUES (
        'kurento-bls:4fa4d6fd3e0142a6b55231338b854baf453fdb17919f421f8fcfabd0891bbc57',
        NULL,
        NULL,
        '{"rights": ["job:create", "task:read"], "tokenId": "kurento-bls:4fa4d6fd3e0142a6b55231338b854baf453fdb17919f421f8fcfabd0891bbc57", "internal": true, "isRevoked": false, "tokenLabel": "kurento-bls"}'
        )
        ON CONFLICT (token_id) DO UPDATE SET ("token_id", "application_id", "group_id", "json") = (EXCLUDED.token_id, EXCLUDED.application_id, EXCLUDED.group_id, EXCLUDED.json);

        INSERT INTO public.sso_token ("token_id", "application_id", "group_id", "json")
        VALUES (
            'edge-coordinator:683d27514559403baebfb08d452917a66bc6960446bc4a5d9fd1ae99fde052bb', 
            NULL, 
            NULL, 
            '{ "tokenId": "edge-coordinator:683d27514559403baebfb08d452917a66bc6960446bc4a5d9fd1ae99fde052bb", "rights": [ "developer:engine:read", "developer:build:read", "task_type:internal", "job:create", "job:read", "job:update", "task:read", "task:update", "recording:create", "recording:read", "recording:update", "admin:org:read" ], "internal": true, "tokenLabel": "edge-coordinator", "isRevoked": false }')
        ON CONFLICT (token_id) DO UPDATE 
        SET ("token_id", "application_id", "group_id", "json") = (EXCLUDED.token_id, EXCLUDED.application_id, EXCLUDED.group_id, EXCLUDED.json);

        ALTER TABLE public.role ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT FALSE;

        INSERT INTO public.permission("permission_id","permission_name","permission_description")
        VALUES (
        125,
        'cms.customerservice',
        'access to provision org sources and programs'
        )
        ON CONFLICT (permission_id) DO UPDATE
        SET ("permission_id", "permission_name", "permission_description") = (
        EXCLUDED.permission_id,
        EXCLUDED.permission_name,
        EXCLUDED.permission_description
        );

        INSERT INTO public.permission("permission_id","permission_name","permission_description")
        VALUES (
        126,
        'source.update',
        'update a source entity'
        )
        ON CONFLICT (permission_id) DO UPDATE
        SET ("permission_id", "permission_name", "permission_description") = (
        EXCLUDED.permission_id,
        EXCLUDED.permission_name,
        EXCLUDED.permission_description
        );

        INSERT INTO public.role("role_id","role_name","role_description","app_name","permissions","organization_id","is_private")
        VALUES (
        '6d982ee9-ff07-499f-a182-03457a6187f6',
        'CMS Customer Service',
        'Access to provisioning Sources and Programs for this users organization',
        'cms',
        '{-8184,255,0,1610612736}',
        NULL,
        TRUE
        )
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description","app_name","permissions","organization_id","is_private") = (
        EXCLUDED.role_id,
        EXCLUDED.role_name,
        EXCLUDED.role_description,
        EXCLUDED.app_name,
        EXCLUDED.permissions,
        EXCLUDED.organization_id,
        EXCLUDED.is_private
        );

        INSERT INTO public.sso_token ("token_id", "application_id", "group_id", "json")
        VALUES (
            'crontab-generator:24876e58fa0b42259d0c3dfd7d0c3227', 
            NULL, 
            NULL, 
            '{ "tokenId": "crontab-generator:24876e58fa0b42259d0c3dfd7d0c3227", "rights": ["job:create", "job:read", "cms.sources.read"], "internal": true, "tokenLabel": "crontab-generator", "isRevoked": false }')
        ON CONFLICT (token_id) DO UPDATE 
        SET ("token_id", "application_id", "group_id", "json") = (EXCLUDED.token_id, EXCLUDED.application_id, EXCLUDED.group_id, EXCLUDED.json);

        INSERT INTO public.permission("permission_id", "permission_name", "permission_description")
        VALUES (
        127,
        'mentions.create',
        'create mentions'
        ),
        (
        128,
        'mentions.read',
        'read mentions'
        ),
        (
        129,
        'mentions.update',
        'read mentions'
        ),
        (
        130,
        'mentions.delete',
        'read mentions'
        ),
        (
        131,
        'mentions.share',
        'read mentions'
        ),
        (
        132,
        'mentions.download',
        'read mentions'
        );

        alter database sso set random_page_cost=1;

        INSERT INTO public.application (
        "application_id",
        "application_name",
        "application_key",
        "application_status",
        "application_description",
        "application_icon_url",
        "application_icon_svg",
        "application_url",
        "owner_organization_id",
        "deployment_model",
        "created_date",
        "updated_date",
        "oauth2_redirect_urls",
        "oauth2_client_secret")
        VALUES (
        '2d6e9991-e551-458c-9e9c-0c70aeaea456',
        'Attribute',
        'attribute',
        'active',
        'Attribute Google Analytics visits to advertisements',
        'https://www.filepicker.io/api/file/GE6EmJ6fT3ac31vzvufD',
        NULL,
        'https://attribute.veritone.com',
        @@{ROOT_ORG_ID}@@,
        0,
        1539621862,
        1539622018,
        'https://attribute.veritone.com',
        'kvNm2xtQDWmIntvwLi-rx_p8NbIEQaYNkul2G-f4ArO35x_e4-RQmw')
        ON CONFLICT (application_id) DO UPDATE SET
        application_id='2d6e9991-e551-458c-9e9c-0c70aeaea456',
        application_name='Attribute',
        application_key='attribute',
        application_status='active',
        application_description='Attribute Google Analytics visits to advertisements',
        owner_organization_id=@@{ROOT_ORG_ID}@@,
        deployment_model=0;

        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            '94e0ed56-0b23-4517-bcae-96d44689fd20',
            'Attribute Editor',
            'Access to all features for this application',
            'attribute',
            '{1006632960,63111680,262144}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            '94e0ed56-0b23-4517-bcae-96d44689fd20',
            'Attribute Editor',
            'Access to all features for this application',
            'attribute',
            '{1006632960,63111680,262144}',
            NULL,
            FALSE);

        INSERT INTO public.application (
        "application_id",
        "application_name",
        "application_key",
        "application_status",
        "application_description",
        "application_icon_url",
        "application_icon_svg",
        "application_url",
        "owner_organization_id",
        "deployment_model",
        "created_date",
        "updated_date",
        "oauth2_redirect_urls",
        "oauth2_client_secret")
        VALUES (
        '766e9916-9536-47e9-8dcb-dc225654bab3',
        'Redact',
        'redaction_2_0',
        'active',
        'Detect in-frame objects,like faces, and quickly redact them.',
        'https://www.filepicker.io/api/file/J72TVeCRzyA9bspEsFGg',
        'https://static.veritone.com/veritone-ui/app-icons-svg/redact-app.svg',
        'https://redact.veritone.com',
        @@{ROOT_ORG_ID}@@,
        0,
        1531527937,
        1536280178,
        'https://redact.veritone.com',
        'KMkThx58GCHd86uOnqCU48M-6_ncKWN5ph5kAqCA1Yxz3FN8DY6yZg')
        ON CONFLICT (application_name) DO UPDATE SET
        application_id='766e9916-9536-47e9-8dcb-dc225654bab3',
        application_name='Redact',
        application_key='redaction_2_0',
        application_status='active',
        application_description='Detect in-frame objects,like faces, and quickly redact them.',
        owner_organization_id=@@{ROOT_ORG_ID}@@,
        deployment_model=0;

        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            'd0136963-c244-452d-9539-d27447a60f47',
            'Redact Editor',
            'Access to all features for this application',
            'redaction_2_0',
            '{-67108864,63,0,1275068416}',
            @@{ROOT_ORG_ID}@@,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            'd0136963-c244-452d-9539-d27447a60f47',
            'Redact Editor',
            'Access to all features for this application',
            'redaction_2_0',
            '{-67108864,63,0,1275068416}',
            @@{ROOT_ORG_ID}@@,
            FALSE);

        ALTER TABLE public.application_context_menu ALTER COLUMN "url" DROP NOT NULL;


        CREATE SCHEMA IF NOT EXISTS rate_limit;

        CREATE TABLE IF NOT EXISTS rate_limit.config_organization (
        organization_id TEXT NOT NULL PRIMARY KEY,
        created_date_time TIMESTAMPTZ DEFAULT now(),
        modified_date_time TIMESTAMPTZ DEFAULT now(),
        interval_limit INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rate_limit.config_token (
        token_id TEXT NOT NULL PRIMARY KEY,
        created_date_time TIMESTAMPTZ DEFAULT now(),
        modified_date_time TIMESTAMPTZ DEFAULT now(),
        interval_limit INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rate_limit.config_token_type (
        token_type TEXT NOT NULL PRIMARY KEY,
        created_date_time TIMESTAMPTZ DEFAULT now(),
        modified_date_time TIMESTAMPTZ DEFAULT now(),
        interval_limit INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rate_limit.config_settings (
        setting_key TEXT NOT NULL PRIMARY KEY,
        created_date_time TIMESTAMPTZ DEFAULT now(),
        modified_date_time TIMESTAMPTZ DEFAULT now(),
        interval_limit INTEGER NOT NULL
        );

        CREATE OR REPLACE FUNCTION public.update_rate_limit_config()
        returns trigger
        language plpgsql
        as $$
        BEGIN
        NEW.modified_date_time = CURRENT_TIMESTAMP;
        RETURN NEW;
        END;
        $$;

        DROP TRIGGER IF EXISTS rate_limit_config_token_type_modify ON rate_limit.config_token_type;

        CREATE TRIGGER rate_limit_config_token_type_modify
        BEFORE UPDATE
        ON rate_limit.config_token_type
        FOR EACH ROW
        EXECUTE PROCEDURE public.update_rate_limit_config();

        DROP TRIGGER IF EXISTS rate_limit_config_organization_modify ON rate_limit.config_organization;

        CREATE TRIGGER rate_limit_config_organization_modify
        BEFORE UPDATE
        ON rate_limit.config_organization
        FOR EACH ROW
        EXECUTE PROCEDURE public.update_rate_limit_config();

        DROP TRIGGER IF EXISTS rate_limit_config_token_modify ON rate_limit.config_token;

        CREATE TRIGGER rate_limit_config_token_modify
        BEFORE UPDATE
        ON rate_limit.config_token
        FOR EACH ROW
        EXECUTE PROCEDURE public.update_rate_limit_config();

        DROP TRIGGER IF EXISTS rate_limit_config_settings_modify ON rate_limit.config_settings;

        CREATE TRIGGER rate_limit_config_settings_modify
        BEFORE UPDATE
        ON rate_limit.config_settings
        FOR EACH ROW
        EXECUTE PROCEDURE public.update_rate_limit_config();

        INSERT INTO rate_limit.config_token_type (
        token_type,
        interval_limit
        ) VALUES (
        'default',
        1000
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO rate_limit.config_token_type (
        token_type,
        interval_limit
        ) VALUES (
        'apikey',
        1000
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO rate_limit.config_token_type (
        token_type,
        interval_limit
        ) VALUES (
        'internal',
        3000
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO rate_limit.config_token_type (
        token_type,
        interval_limit
        ) VALUES (
        'engineJWT',
        1000
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO rate_limit.config_token_type (
        token_type,
        interval_limit
        ) VALUES (
        'user',
        500
        )
        ON CONFLICT DO NOTHING;

        -- description: creates new crontab token and removes job:create from old one
        -- add new token for crontab
        INSERT INTO public.sso_token ("token_id", "application_id", "group_id", "json")
        VALUES (
            'crontab-generator-new:df0cbac65a5a650dd2b84bb8d9515399dd239201a16414f9f51aa569e0f96c3f176058e1bc9ebcc0', 
            NULL, 
            NULL, 
            '{ "tokenId": "crontab-generator-new:df0cbac65a5a650dd2b84bb8d9515399dd239201a16414f9f51aa569e0f96c3f176058e1bc9ebcc0", "rights": ["job:create", "job:read", "cms.sources.read"], "internal": true, "tokenLabel": "crontab-generator-new", "isRevoked": false }'::JSONB)
        ON CONFLICT (token_id) DO UPDATE 
        SET ("token_id", "application_id", "group_id", "json") = (EXCLUDED.token_id, EXCLUDED.application_id, EXCLUDED.group_id, EXCLUDED.json);

        -- update old token to not have job:create
        UPDATE public.sso_token SET "json" = '{ "tokenId": "crontab-generator:24876e58fa0b42259d0c3dfd7d0c3227", "rights": ["job:read", "cms.sources.read"], "internal": true, "tokenLabel": "crontab-generator", "isRevoked": false }'::JSONB where token_id = 'crontab-generator:24876e58fa0b42259d0c3dfd7d0c3227';

        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            'bd6458ec-d240-4eae-bdc1-d22740c6bd33',
            'Attribute Admin',
            'The user will have organization permissions and access to all features for this application attribute',
            'attribute',
            '{1006632960,63111680,262144}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            'bd6458ec-d240-4eae-bdc1-d22740c6bd33',
            'Attribute Admin',
            'The user will have organization permissions and access to all features for this application attribute',
            'attribute',
            '{1006632960,63111680,262144}',
            NULL,
            FALSE);

        
        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            'bffb26ad-e89f-4a76-8af6-69dc95cdb23d',
            'Surveillance Partner',
            'Surveillance Partner',
            'surveillance',
            '{}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            'bffb26ad-e89f-4a76-8af6-69dc95cdb23d',
            'Surveillance Partner',
            'Surveillance Partner',
            'surveillance',
            '{}',
            NULL,
            FALSE);


        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            '319aee08-9aa4-4389-af1b-2e07f37aaade',
            'Surveillance Admin',
            'Surveillance Admin',
            'surveillance',
            '{}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            '319aee08-9aa4-4389-af1b-2e07f37aaade',
            'Surveillance Admin',
            'Surveillance Admin',
            'surveillance',
            '{}',
            NULL,
            FALSE);


        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            '743423c6-5e04-48e9-9daa-951fc2a71fab',
            'Surveillance User',
            'Surveillance User',
            'surveillance',
            '{}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            '743423c6-5e04-48e9-9daa-951fc2a71fab',
            'Surveillance User',
            'Surveillance User',
            'surveillance',
            '{}',
            NULL,
            FALSE);


        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            '8ae73164-44b8-42b7-8df6-494740594e33',
            'Surveillance Operator',
            'Surveillance Operator',
            'surveillance',
            '{}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            '8ae73164-44b8-42b7-8df6-494740594e33',
            'Surveillance Operator',
            'Surveillance Operator',
            'surveillance',
            '{}',
            NULL,
            FALSE);


        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            'bffb26ad-e89f-4a76-8af6-69dc95cdb23d',
            'Surveillance Partner',
            'Surveillance Partner',
            'wi_zr',
            '{}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            'bffb26ad-e89f-4a76-8af6-69dc95cdb23d',
            'Surveillance Partner',
            'Surveillance Partner',
            'wi_zr',
            '{}',
            NULL,
            FALSE);


        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            '319aee08-9aa4-4389-af1b-2e07f37aaade',
            'Surveillance Admin',
            'Surveillance Admin',
            'wi_zr',
            '{}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            '319aee08-9aa4-4389-af1b-2e07f37aaade',
            'Surveillance Admin',
            'Surveillance Admin',
            'wi_zr',
            '{}',
            NULL,
            FALSE);


        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            '743423c6-5e04-48e9-9daa-951fc2a71fab',
            'Surveillance User',
            'Surveillance User',
            'wi_zr',
            '{}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            '743423c6-5e04-48e9-9daa-951fc2a71fab',
            'Surveillance User',
            'Surveillance User',
            'wi_zr',
            '{}',
            NULL,
            FALSE);


        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            '8ae73164-44b8-42b7-8df6-494740594e33',
            'Surveillance Operator',
            'Surveillance Operator',
            'wi_zr',
            '{}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            '8ae73164-44b8-42b7-8df6-494740594e33',
            'Surveillance Operator',
            'Surveillance Operator',
            'wi_zr',
            '{}',
            NULL,
            FALSE);


        -- update Attribute Admin permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            'bd6458ec-d240-4eae-bdc1-d22740c6bd33',
            'Attribute Admin',
            'The user will have organization permissions and access to all features for this application attribute',
            'attribute',
            '{1006878720,63118848,262144}',
            NULL,
            FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET permissions = '{1006878720,63118848,262144}';

        -- update Attribute Editor permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            '94e0ed56-0b23-4517-bcae-96d44689fd20',
            'Attribute Editor',
            'Access to all features for this application',
            'attribute',
            '{1006878720,63118848,262144}',
            NULL,
            FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET permissions = '{1006878720,63118848,262144}';

        update public.role
        set organization_id = null
        where role_id = 'd0136963-c244-452d-9539-d27447a60f47'; --Redact Editor

        -- add an internal API key for job creation --
        DO $$
        DECLARE
            keyId TEXT := 'attribute-job:3dfdbdcb7ee14920bf5f9f4fdd28676a30470ebf2b144b04b31e737dbddd27bc';
            keyData JSON := '{
                "tokenLabel":"Start Attribute Job API Key",
                "isRevoked":false,
                "rights":["job:create"],
                "internal":true,
                "tokenId":"attribute-job:3dfdbdcb7ee14920bf5f9f4fdd28676a30470ebf2b144b04b31e737dbddd27bc"
            }';

        BEGIN
            INSERT INTO public.sso_token (token_id, json)
            VALUES (keyId, keyData)
            ON CONFLICT (token_id) DO UPDATE
            SET (application_id, group_id, json) = (NULL, NULL, keyData);
        END
        $$;

        -- update Attribute Admin permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            'bd6458ec-d240-4eae-bdc1-d22740c6bd33',
            'Attribute Admin',
            'The user will have organization permissions and access to all features for this application attribute',
            'attribute',
            '{1006879744,63118848,262144}',
            NULL,
            FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET permissions = '{1006879744,63118848,262144}';

        -- update Attribute Editor permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            '94e0ed56-0b23-4517-bcae-96d44689fd20',
            'Attribute Editor',
            'Access to all features for this application',
            'attribute',
            '{1006879744,63118848,262144}',
            NULL,
            FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET permissions = '{1006879744,63118848,262144}';

        -- Update Redact Editor role permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            'd0136963-c244-452d-9539-d27447a60f47',
            'Redact Editor',
            'Access to all features for this application',
            'redaction_2_0',
            '{-67100672,63,0,1275068416}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET permissions='{-67100672,63,0,1275068416}';

        -- change existing application "flow" to "automate"
        update public.application set application_key='automate' where application_id='bdf9375e-1092-4233-8197-9ccbc11357c5';


        INSERT INTO public.role ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private")
        VALUES (
            'a5f72287-10b2-47d5-8b68-bd97b0a31f16',
            'Automate Editor',
            'Access to the Automate Studio application',
            'automate',
            '{1006632960,536870912}',
            NULL,
            FALSE)
        ON CONFLICT (role_id) DO UPDATE
        SET ("role_id", "role_name", "role_description", "app_name", "permissions", "organization_id", "is_private") = (
            'a5f72287-10b2-47d5-8b68-bd97b0a31f16',
            'Automate Editor',
            'Access to the Automate Studio application',
            'automate',
            '{1006632960,536870912}',
            NULL,
            FALSE);

        -- Update token rights for bls
        UPDATE public.sso_token
        SET "json" = '{"rights": [ "developer:engine:read", "developer.build.read", "task_type.internal", "job:create", "job:read", "job:update", "task:read", "task:update", "recording:create", "recording:read", "recording:update" ], "tokenId": "kurento-bls:4fa4d6fd3e0142a6b55231338b854baf453fdb17919f421f8fcfabd0891bbc57", "internal": true, "isRevoked": false, "tokenLabel": "kurento-bls"}'
        WHERE token_id='kurento-bls:4fa4d6fd3e0142a6b55231338b854baf453fdb17919f421f8fcfabd0891bbc57';

        -- remove constraint requiring an application to have a value for the description column
        ALTER TABLE public.application ALTER COLUMN application_description DROP NOT NULL;
        ALTER TABLE public.application ALTER COLUMN application_description DROP DEFAULT;

        -- add an internal API key for job creation --
        DO $$
        DECLARE
            keyId TEXT := 'attribute-job:3dfdbdcb7ee14920bf5f9f4fdd28676a30470ebf2b144b04b31e737dbddd27bc';
            keyData JSON := '{
                "tokenLabel":"Start Attribute Job API Key",
                "isRevoked":false,
                "rights":["job:create", "admin:org:read", "admin:user:read"],
                "internal":true,
                "tokenId":"attribute-job:3dfdbdcb7ee14920bf5f9f4fdd28676a30470ebf2b144b04b31e737dbddd27bc"
            }';

        BEGIN
            INSERT INTO public.sso_token (token_id, json)
            VALUES (keyId, keyData)
            ON CONFLICT (token_id) DO UPDATE
            SET (application_id, group_id, json) = (NULL, NULL, keyData);
        END
        $$;

        update public.sso_token set "json" = '{"rights":["recording:read","asset:uri","asset:all", "task_type:internal","cms.sources.read"],"isRevoked":false}'::JSON where token_id = 'media-streamer:Ov7I806o43072g2M0G2i8eS44q7uzC0Z90im21w4t8b1E4ZJ48bcnx4918830P9f';

        -- description: upserts SEM token
        INSERT INTO public.sso_token("token_id","application_id","group_id","json")
        VALUES (
            'edge-sem:8742bf9b-0337-4585-bd04-884af982961b',
            NULL,
            NULL,
            '{"rights": ["asset:all", "developer:engine:read", "developer.build.read", "task_type:internal", "asset:uri", "job:create", "job:read", "job:update", "job:delete", "task:update", "recording:create", "recording:read", "recording:update", "recording:delete", "report:create", "analytics:usage"], "tokenId": "edge-sem:8742bf9b-0337-4585-bd04-884af982961b", "internal": true, "isRevoked": false, "tokenLabel": "task-rt"}'
        )
        ON CONFLICT (token_id) DO UPDATE
        SET("token_id","application_id","group_id","json") = (EXCLUDED.token_ID, EXCLUDED.application_id, EXCLUDED.group_id, EXCLUDED.json);

        insert into public.external_credential (
        organization_id,
        external_credential_id,
        credential_name,
        service_type,
        created_by,
        credentials_ciphertext
        ) values (
        0,
        '7145412b-07e4-4cda-972d-5c8d3ec605f0',
        'core-graphql-server',
        's3',
        'system',
        'a6f181243a325da373e637888dd833fd29f9ed2839987ff4da11d0420b32049ec8d5802d281ab8d350c0d72615afaa3a84466619d049269f1233ca6aa001151eee61289f021597e89bdef986d849bd1a15547b462998d3869f817e8f800a6044'
        ) on conflict do nothing;

        -- inserts an encrypted credential that is only used on dev for the API test
        insert into public.external_credential (
        external_credential_id,
        credential_name,
        service_type,
        credentials_ciphertext,
        organization_id,
        created_by,
        encryption_key_id
        ) values (
        '5f56e4ea-1cad-4ea4-84b6-f6b9c7a5370e',
        'core-graphql-server-citest',
        's3',
        '8db9d4c49604b932b932952a29378b9371af2224263c1915ab47ce8c64ce2f92672d702285ec77261849802e26db57287b3c18ad257d02b449a5a2258bd1169607a1ae93c101e3fa34f547d465246a9abeacd86b5609dfadc8e2eb2f4f35f55e',
        0,
        'system',
        'jun4-dev:6c9'
        ) on conflict do nothing;

        -- description: add admin.group:read permission to task-insert token
        UPDATE 
        public.sso_token
        SET 
        "json"=jsonb_set(
            "json"::jsonb,
            ARRAY['rights'],
            ("json"->'rights')::jsonb || '["admin.group:read"]'::jsonb)
        WHERE 
        token_id='task-insert-into-index:6b2559ad0aee4804a1ec9de975533e4eb06ba331acff4639a438bdb6d8615e95'
        AND NOT 
        ("json"->'rights')::jsonb ? 'admin.group:read';

        UPDATE 
        public.sso_token
        SET 
        "json"=jsonb_set(
            "json"::jsonb,
            ARRAY['rights'],
            ("json"->'rights')::jsonb || '["admin.org:read"]'::jsonb)
        WHERE 
        token_id='task-insert-into-index:6b2559ad0aee4804a1ec9de975533e4eb06ba331acff4639a438bdb6d8615e95'
        AND NOT 
        ("json"->'rights')::jsonb ? 'admin.org:read';

        INSERT INTO public.application (
        application_id, 
        application_name, 
        application_key,
        application_status, 
        application_description, 
        application_icon_url, 
        application_icon_svg, 
        application_url, 
        application_check_permissions, 
        application_order, 
        owner_organization_id, 
        deployment_model,  
        oauth2_redirect_urls, 
        oauth2_client_secret, 
        permissions_required)
        VALUES(
        '8b3eac1c-5150-448e-8d99-fb7b860e7e41',
        'Illuminate',
        'illuminate',
        'active',
        'Uncover what''s relevant in your data with the power of AI',
        'https://www.filepicker.io/api/file/73x3jMmqQDernKJGl0mE',
        NULL,
        'https://illuminate.veritone.com',
        false,
        0,
        1,
        0,
        'https://illuminate.veritone.com',
        'L97J1sZTgEhz50E4VaPTU-aFvOpgHByvIVR2TDbx6tC2JsXdcw8Dxg',
        NULL)
        ON CONFLICT (application_id) DO UPDATE SET
        application_id='8b3eac1c-5150-448e-8d99-fb7b860e7e41',
        application_name='Illuminate',
        application_key='illuminate',
        application_status='active',
        application_description='Uncover what''s relevant in your data with the power of AI',
        deployment_model=0;

        INSERT INTO public.application (
        application_id, 
        application_name, 
        application_key, 
        application_status, 
        application_description, 
        application_icon_url, 
        application_icon_svg, 
        application_url, 
        application_check_permissions, 
        application_order, 
        owner_organization_id, 
        deployment_model,  
        oauth2_redirect_urls, 
        oauth2_client_secret, 
        permissions_required)
        VALUES(
        'bdf9375e-1092-4233-8197-9ccbc11357c5',
        'Automate Studio (Beta)',
        'automate',
        'active',
        'Automate Studio is the application that provides a transformative tool for non-engineering users to blend their data sources with Veritone cognition and inform business logic in aiWARE logic or their own third party systems',
        'https://www.filepicker.io/api/file/y423tLATS7YpNUl9M4gH',
        NULL,
        'https://workflow.veritone.com',
        false,
        0,
        1,
        0,
        'https://workflow.veritone.com',
        'm6ZjHAQZ6K4lUkOJHCXS8HwCuRZtmY-719QhnX58K_zUpqLBQRKvRQ',
        NULL)
        ON CONFLICT (application_id) DO UPDATE SET
        application_id='bdf9375e-1092-4233-8197-9ccbc11357c5',
        application_name='Automate Studio (Beta)',
        application_key='automate',
        application_status='active',
        application_description='Automate Studio is the application that provides a transformative tool for non-engineering users to blend their data sources with Veritone cognition and inform business logic in aiWARE logic or their own third party systems',
        deployment_model=0;

        update public.application 
        set application_url = replace(application_url, 'workflow', 'automate'),
        oauth2_redirect_urls = replace(oauth2_redirect_urls, 'workflow', 'automate')
        where application_id='bdf9375e-1092-4233-8197-9ccbc11357c5';

        -- APPLICATION > Disable Illuminate App to validate permission in App Swicher
        update public.application 
        set application_check_permissions = 'false'
        where application_key = 'illuminate';

        DELETE FROM public."permission"  
        WHERE permission_id = 254;

        DELETE FROM public."role"
        WHERE role_id = '87914bb0-a1fe-5825-aa65-8e2ce4467b57';

        update public.sso_token
        set "json" = '
        {
        "rights":[
            "asset:uri",
            "job:create",
            "job:read",
            "job:update",
            "job:delete",
            "task:read",
            "task:update",
            "task:create",
            "task_type:internal",
            "recording:create",
            "recording:read",
            "recording:update",
            "recording:delete",
            "report:create",
            "analytics:usage",
            "ami-node:create",
            "developer:build:read",
            "developer.build.deploy",
            "developer.build.update",
            "developer:engine:read",
            "cms:access",
            "discovery:access",
            "devops:querymonitor"
        ],
        "tokenId":"jenkins:e22e4df1beb2f7625cddc453862a9ae337b8d1becf68988dd97901268de5c558d803552e28ba4b95",
        "internal":true,
        "isRevoked":false,
        "approverId":"f94d1303-6abd-49a5-9d98-fb93fb22d063",
        "tokenLabel":"jenkins build pipeline",
        "requestorId":"f94d1303-6abd-49a5-9d98-fb93fb22d063",
        "createdDateTime":"2018-08-01T20:19:08Z",
        "approvedDateTime":"2018-08-01T20:20:06Z",
        "modifiedDateTime":"2019-08-07T20:20:06Z"
        }'::jsonb
        where token_id = 'jenkins:e22e4df1beb2f7625cddc453862a9ae337b8d1becf68988dd97901268de5c558d803552e28ba4b95' OR token_id = 'graphql_test:3d11062eab179dad954305df5e424c5aef87d804ea83876f9e600d7c27d4eb56d6d57a67bb817588';

        UPDATE public.role SET role_name = 'Automate Editor' WHERE role_id = 'a5f72287-10b2-47d5-8b68-bd97b0a31f16';

        -- description: add task:read permission to task-insert token
        UPDATE 
        public.sso_token
        SET 
        "json"=jsonb_set(
            "json"::jsonb,
            ARRAY['rights'],
            ("json"->'rights')::jsonb || '["task:read"]'::jsonb)
        WHERE 
        token_id='task-insert-into-index:6b2559ad0aee4804a1ec9de975533e4eb06ba331acff4639a438bdb6d8615e95'
        AND NOT 
        ("json"->'rights')::jsonb ? 'task:read';

        CREATE TABLE IF NOT EXISTS rate_limit.config_organization_engine (
        organization_id TEXT NOT NULL PRIMARY KEY,
        created_date_time TIMESTAMPTZ DEFAULT now(),
        modified_date_time TIMESTAMPTZ DEFAULT now(),
        interval_limit INTEGER NOT NULL
        );

        DROP TRIGGER IF EXISTS rate_limit_config_organization_engine_modify ON rate_limit.config_organization_engine;

        CREATE TRIGGER rate_limit_config_organization_engine_modify
        BEFORE UPDATE
        ON rate_limit.config_organization_engine
        FOR EACH ROW
        EXECUTE PROCEDURE public.update_rate_limit_config();

        -- add an internal API key for core-eventing-mentions --
        DO $$
        DECLARE
            keyId TEXT := 'core-eventing-mentions:aa1185a5b9504bfb83f94e581aaa889b5c59d61e624046a387b5d43d96efb722';
            keyData JSON := '{
                "rights": ["asset:uri", "master", "recording:read", "recording:update", "asset:all", "task:read",
                    "task:update", "job:read", "job:create", "task_type:internal", "cms:sources:read",
                    "cms:sources:update", "admin.org:read", "admin.group:read"],
                "internal": true,
                "isRevoked": false,
                "tokenId": "core-eventing-mentions:aa1185a5b9504bfb83f94e581aaa889b5c59d61e624046a387b5d43d96efb722",
                "tokenLabel": "core-eventing-mentions"
            }';

        BEGIN
            INSERT INTO public.sso_token (token_id, json)
            VALUES (keyId, keyData)
            ON CONFLICT (token_id) DO UPDATE
            SET (application_id, group_id, json) = (NULL, NULL, keyData);
        END
        $$;

        -- add an internal API key for core-eventing-service --
        DO $$
        DECLARE
            keyId TEXT := 'core-eventing-service:0341b51370274e3c97a69bc60e57cfe3e8722dcf465c4876affc4e2d09c564ec';
            keyData JSON := '{
                "rights": ["asset:uri", "master", "recording:read", "recording:update", "asset:all", "task:read",
                    "task:update", "job:read", "job:create", "task_type:internal", "cms:sources:read",
                    "cms:sources:update", "admin.org:read", "admin.group:read"],
                "internal": true,
                "isRevoked": false,
                "tokenId": "core-eventing-service:0341b51370274e3c97a69bc60e57cfe3e8722dcf465c4876affc4e2d09c564ec",
                "tokenLabel": "core-eventing-service"
            }';

        BEGIN
            INSERT INTO public.sso_token (token_id, json)
            VALUES (keyId, keyData)
            ON CONFLICT (token_id) DO UPDATE
            SET (application_id, group_id, json) = (NULL, NULL, keyData);
        END
        $$;

        -- add pay-app --
        INSERT INTO public.application (application_id,application_name,application_key,application_status,application_description,application_url,application_check_permissions,owner_organization_id,deployment_model,created_date,updated_date)
        VALUES ('4a30782e-2808-487b-a359-bc50247af31d','Pay','pay','active','Application for processing online payments to Veritone','https://pay.veritone.com',false,@@{ROOT_ORG_ID}@@,0,1571078657,1571078776)
        ON CONFLICT DO NOTHING;

        -- add pay-app role 
        INSERT INTO public."role" (role_id,role_name,role_description,app_name,permissions,is_private)
        VALUES ('1b6084bb-66c9-4ca5-b1f3-1ba4ca0fdf45','Payment Authorizer','Access to initiate payments to Veritone','pay','{}',false)
        ON CONFLICT DO NOTHING;

        -- add an internal key for illuminate-export-engine --
        DO $$
        DECLARE
            keyId TEXT := 'illuminate-export-engine:632521160cc5414db7eb3d2d062b2269dfa1238c15614edb8d94c98f739abb82';
            keyData JSON := '{
                "rights": ["admin.org:read"],
                "internal": true,
                "isRevoked": false,
                "tokenId": "illuminate-export-engine:632521160cc5414db7eb3d2d062b2269dfa1238c15614edb8d94c98f739abb82",
                "tokenLabel": "illuminate-export-engine"
            }';

        BEGIN
            INSERT INTO public.sso_token (token_id, json)
            VALUES (keyId, keyData)
            ON CONFLICT (token_id) DO UPDATE
            SET (application_id, group_id, json) = (NULL, NULL, keyData);
        END
        $$;

        -- add an internal token for task-insert-server-es7 --
        DO $$
        DECLARE
            keyId TEXT := 'task-insert-into-index-v7:a2817dfc62934cdeb60ee40f66d50b2c33d3a51822544bcfb88c19a76771eda1';
            keyData JSON := '{
                "rights": ["asset:uri", "master", "recording:read", "recording:update", "asset:all", "task:update", "job:read", "job:create", "task_type:internal", "cms:sources:read", "cms:sources:update", "admin.org:read", "admin.group:read", "task:read"],
                "internal": true,
                "isRevoked": false,
                "tokenId": "task-insert-into-index-v7:a2817dfc62934cdeb60ee40f66d50b2c33d3a51822544bcfb88c19a76771eda1",
                "tokenLabel": "task-insert-server-es7"
            }';

        BEGIN
            INSERT INTO public.sso_token (token_id, json)
            VALUES (keyId, keyData)
            ON CONFLICT (token_id) DO UPDATE
            SET (application_id, group_id, json) = (NULL, NULL, keyData);
        END
        $$;

        -- Add right "developer:build:read" for token of core-eventing-service
        UPDATE public.sso_token
        SET "json"='{
                "rights": ["asset:uri", "master", "recording:read", "recording:update", "asset:all", "task:read",
                    "task:update", "job:read", "job:create", "task_type:internal", "cms:sources:read",
                    "cms:sources:update", "admin.org:read", "admin.group:read", "developer:build:read"],
                "internal": true,
                "isRevoked": false,
                "tokenId": "core-eventing-service:0341b51370274e3c97a69bc60e57cfe3e8722dcf465c4876affc4e2d09c564ec",
                "tokenLabel": "core-eventing-service"
            }'
        WHERE token_id='core-eventing-service:0341b51370274e3c97a69bc60e57cfe3e8722dcf465c4876affc4e2d09c564ec';

        update public.sso_token 
        set "json" = '{"rights": ["engine:read","build:read","build:create", "build:invalidate", "build:upload", "asset:uri", "recording:read", "recording:update", "task:update", "job:create", "organization:read", "developer:build:create", "developer:build:update", "developer:build:upload",  "developer:build:invalidate"], "internal": true, "token_id": "vdh-docker-prod:8dd6c48866e7eb473b2c7849348863d0a8038bd7eed7a1d9f79af8cf491c8071", "isRevoked": false, "tokenLabel": "vdh-docker-prod"}' 
        where token_id = 'vdh-docker-prod:8dd6c48866e7eb473b2c7849348863d0a8038bd7eed7a1d9f79af8cf491c8071';

        update public.sso_token 
        set "json" = '{"rights": ["engine:read","build:read","build:create", "build:invalidate", "build:upload", "asset:uri", "recording:read", "recording:update", "task:update", "job:create", "organization:read", "developer:build:create", "developer:build:update", "developer:build:upload",  "developer:build:invalidate"], "internal": true, "token_id": "vdh-docker-prod:8dd6c48866e7eb473b2c7849348863d0a8038bd7eed7a1d9f79af8cf491c8071", "isRevoked": false, "tokenLabel": "vdh-docker-prod"}' 
        where token_id = 'vdh-docker-prod:8dd6c48866e7eb473b2c7849348863d0a8038bd7eed7a1d9f79af8cf491c8071';

        -- Update Attribute Editor Role's Name, Description & Permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            '94e0ed56-0b23-4517-bcae-96d44689fd20',
            'Editor',
            'The user has permission to access basic capabilities and features.',
            'attribute',
            '{1006879808,63118848,262144}',
            NULL,
            FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET 
        role_name = EXCLUDED.role_name,
        role_description = EXCLUDED.role_description,
        permissions = EXCLUDED.permissions;

        -- Update Attribute Admin Role's Name, Description & Permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            'bd6458ec-d240-4eae-bdc1-d22740c6bd33',
            'Admin',
            'The user inherits all ‘Manager’ permissions along with organization rights to all features.',
            'attribute',
            '{1006879808,63118848,262144}',
            NULL,
            FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET 
        role_name = EXCLUDED.role_name,
        role_description = EXCLUDED.role_description,
        permissions = EXCLUDED.permissions;

        -- Add Attribute Manager Role
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            '39f8ba2b-1e48-440c-9e8e-874865bfec08',
            'Manager',
            'The user inherits all ''Editor'' permissions along with full access to other users'' advertisers and campaigns by way of “Teams.”',
            'attribute',
            '{1006879808,63118848,262144}',
            NULL,
            FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET 
        role_name = EXCLUDED.role_name,
        role_description = EXCLUDED.role_description,
        permissions = EXCLUDED.permissions;


        -- Add Attribute All Access Role
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
            '6505c553-4f08-4c61-9862-d6d102946104',
            'All Access',
            'The user inherits all ''Admin'' permissions and cross-organizational access. Cross-organizational access is supported only with Veritone managed “org linking” to approved accounts.',
            'attribute',
            '{1006879808,63118908,262144}',
            NULL,
            FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET 
        role_name = EXCLUDED.role_name,
        role_description = EXCLUDED.role_description,
        permissions = EXCLUDED.permissions;


        -- update Automate Editor permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
        'a5f72287-10b2-47d5-8b68-bd97b0a31f16',
        'Automate Editor',
        'Access to the Automate Studio application',
        'automate',
        '{1006632960,536870912,0,4096}',
        NULL,
        FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET permissions = '{1006632960,536870912,0,4096}';


        -- update Developer Admin permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
        '1fa5da82-841b-4efa-b998-45e03fbb3b03',
        'Developer Admin',
        '',
        'developer',
        '{0,0,1073741824,8339443}',
        @@{ROOT_ORG_ID}@@,
        FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET permissions = '{0,0,1073741824,8339443}';

        -- update Developer Editor permissions
        INSERT INTO public.role (role_id, role_name, role_description, app_name, permissions, organization_id, is_private)
        VALUES (
        '912e377e-f4a4-4184-8db1-baa9670d8081',
        'Developer Editor',
        '',
        'developer',
        '{0,0,1073741824,5193715}',
        NULL,
        FALSE
        ) ON CONFLICT (role_id) DO UPDATE
        SET permissions = '{0,0,1073741824,5193715}';

    END IF;
END;
$FLYWWAY$

