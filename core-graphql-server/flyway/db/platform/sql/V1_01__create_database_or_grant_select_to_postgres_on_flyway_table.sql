DO $FLYWWAY$
BEGIN
    IF (EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'aiware' 
                    AND  TABLE_NAME = 'cluster')) THEN
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
        -- Name: platform; Type: DATABASE; Schema: -; Owner: postgres
        --

        -- CREATE DATABASE platform WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8';


        ALTER DATABASE platform OWNER TO postgres;

        -- \connect platform

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
        -- Name: platform; Type: DATABASE PROPERTIES; Schema: -; Owner: postgres
        --

        ALTER DATABASE platform SET random_page_cost TO '1';


        -- \connect platform

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
        -- Name: aiware; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA aiware;


        ALTER SCHEMA aiware OWNER TO postgres;

        --
        -- Name: audit; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA audit;


        ALTER SCHEMA audit OWNER TO postgres;

        --
        -- Name: billing; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA billing;


        ALTER SCHEMA billing OWNER TO postgres;

        --
        -- Name: engine; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA engine;


        ALTER SCHEMA engine OWNER TO postgres;

        --
        -- Name: event_trigger; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA event_trigger;


        ALTER SCHEMA event_trigger OWNER TO postgres;

        --
        -- Name: job; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA job;


        ALTER SCHEMA job OWNER TO postgres;

        --
        -- Name: job_new; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA job_new;


        ALTER SCHEMA job_new OWNER TO postgres;

        --
        -- Name: libraries; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA libraries;


        ALTER SCHEMA libraries OWNER TO postgres;

        --
        -- Name: pacman; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA pacman;


        ALTER SCHEMA pacman OWNER TO postgres;

        --
        -- Name: recording; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA recording;


        ALTER SCHEMA recording OWNER TO postgres;

        --
        -- Name: watchers; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA watchers;


        ALTER SCHEMA watchers OWNER TO postgres;

        --
        -- Name: workflow; Type: SCHEMA; Schema: -; Owner: postgres
        --

        CREATE SCHEMA workflow;


        ALTER SCHEMA workflow OWNER TO postgres;

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
        -- Name: cluster_type; Type: TYPE; Schema: aiware; Owner: postgres
        --

        CREATE TYPE aiware.cluster_type AS ENUM (
            'ami',
            'RT',
            'OnPrem'
        );


        ALTER TYPE aiware.cluster_type OWNER TO postgres;

        --
        -- Name: build_state; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.build_state AS ENUM (
            'fetching',
            'invalid',
            'uploaded',
            'pending',
            'approved',
            'disapproved',
            'deployed',
            'paused',
            'deleted',
            'deploying',
            'available',
            'deploy-failed'
        );


        ALTER TYPE public.build_state OWNER TO postgres;

        --
        -- Name: bundle_file_status; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.bundle_file_status AS ENUM (
            'queued',
            'pending',
            'running',
            'complete',
            'failed'
        );


        ALTER TYPE public.bundle_file_status OWNER TO postgres;

        --
        -- Name: cluster_preference_type; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.cluster_preference_type AS ENUM (
            'default',
            'business_unit',
            'organization'
        );


        ALTER TYPE public.cluster_preference_type OWNER TO postgres;

        --
        -- Name: currency; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.currency AS ENUM (
            'USD'
        );


        ALTER TYPE public.currency OWNER TO postgres;

        --
        -- Name: engine_state; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.engine_state AS ENUM (
            'draft',
            'pending',
            'ready',
            'active',
            'disabled',
            'deleted'
        );


        ALTER TYPE public.engine_state OWNER TO postgres;

        --
        -- Name: node_role; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.node_role AS ENUM (
            'ingestor',
            'taskrunner',
            'dual',
            'ami'
        );


        ALTER TYPE public.node_role OWNER TO postgres;

        --
        -- Name: rule_status_type; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.rule_status_type AS ENUM (
            'active',
            'inactive'
        );


        ALTER TYPE public.rule_status_type OWNER TO postgres;

        --
        -- Name: select_category; Type: TYPE; Schema: public; Owner: postgres
        --

        CREATE TYPE public.select_category AS ENUM (
            'category',
            'extension',
            'file'
        );


        ALTER TYPE public.select_category OWNER TO postgres;

        --
        -- Name: json_type; Type: TYPE; Schema: recording; Owner: postgres
        --

        CREATE TYPE recording.json_type AS (
            assetid text,
            assettype text,
            contenttype text,
            _uri text,
            metadata json
        );


        ALTER TYPE recording.json_type OWNER TO postgres;

        --
        -- Name: insert_job_status_table(); Type: FUNCTION; Schema: job; Owner: postgres
        --

        CREATE FUNCTION job.insert_job_status_table() RETURNS trigger
            LANGUAGE plpgsql
            AS $$
        BEGIN
            INSERT INTO job.job_status_history (job_id,application_id,recording_id,task_type_category_id,task_type,complete,error,queued,running,modified_date,previous_modified_date)
            WITH newtasks AS
            (
            SELECT NEW.job_id,NEW.application_id,NEW.recording_id,jsonb_array_elements(NEW.json->'tasks') task
            )
            SELECT nt.job_id,nt.application_id,nt.recording_id,tt.task_type_category_id
            ,nt.task->>'taskType'
            ,CASE WHEN nt.task->>'taskStatus' = 'complete' THEN 1 ELSE 0 END completed
            ,CASE WHEN nt.task->>'taskStatus' = 'failed' THEN 1 ELSE 0 END error
            ,CASE WHEN nt.task->>'taskStatus' IN ('queued','accepted','pending') THEN 1 ELSE 0 END queued
            ,CASE WHEN nt.task->>'taskStatus' = 'running' THEN 1 ELSE 0 END running
            ,NOW(),NOW()
            FROM 
            newtasks nt
            JOIN 
            job.task_type tt 
            ON 
            tt.task_type_id=nt.task->>'taskType';
            RETURN NEW;
        END;
        $$;


        ALTER FUNCTION job.insert_job_status_table() OWNER TO postgres;

        --
        -- Name: update_job_status_table(); Type: FUNCTION; Schema: job; Owner: postgres
        --

        CREATE FUNCTION job.update_job_status_table() RETURNS trigger
            LANGUAGE plpgsql
            AS $$
        BEGIN
            INSERT INTO job.job_status_history (job_id,application_id,recording_id,task_type_category_id,task_type,complete,error,queued,running,modified_date,previous_modified_date)
            WITH newtasks AS
            (
            SELECT NEW.job_id,NEW.application_id,NEW.recording_id,jsonb_array_elements(NEW.json->'tasks') task
            )
            ,oldtasks AS
            (
            SELECT OLD.modified_date,jsonb_array_elements(OLD.json->'tasks') task
            )
            SELECT nt.job_id,nt.application_id,nt.recording_id,tt.task_type_category_id
            ,nt.task->>'taskType'
            ,CASE WHEN ot.task->>'taskStatus' = 'complete' THEN -1 WHEN nt.task->>'taskStatus' = 'complete' THEN 1 ELSE 0 END completed
            ,CASE WHEN ot.task->>'taskStatus' = 'failed' THEN -1 WHEN nt.task->>'taskStatus' = 'failed' THEN 1 ELSE 0 END error
            ,CASE WHEN ot.task->>'taskStatus' IN ('queued','accepted','pending') AND nt.task->>'taskStatus' NOT IN ('queued','accepted','pending') THEN -1 WHEN nt.task->>'taskStatus' IN ('queued','accepted','pending') AND ((ot.task->>'taskStatus')::text NOT IN ('queued','accepted','pending') OR (ot.task->>'taskStatus')::text IS NULL)  THEN 1 ELSE 0 END queued
            ,CASE WHEN ot.task->>'taskStatus' = 'running' THEN -1 WHEN nt.task->>'taskStatus' = 'running' THEN 1 ELSE 0 END running
            ,NOW(),ot.modified_date
            FROM 
            newtasks nt
            LEFT JOIN 
            oldtasks ot 
            ON 
            ot.task->>'taskId' = nt.task->>'taskId'
            JOIN 
            job.task_type tt 
            ON 
            tt.task_type_id=nt.task->>'taskType'
            WHERE 
            ((ot.task->>'taskStatus')::text <> (nt.task->>'taskStatus')::text);
            RETURN NEW;
        END;
        $$;


        ALTER FUNCTION job.update_job_status_table() OWNER TO postgres;

        --
        -- Name: update_modified_date_column(); Type: FUNCTION; Schema: job; Owner: postgres
        --

        CREATE FUNCTION job.update_modified_date_column() RETURNS trigger
            LANGUAGE plpgsql
            AS $$
        BEGIN
            NEW.modified_date = NOW() AT TIME ZONE 'utc';
            RETURN NEW;
        END;
        $$;


        ALTER FUNCTION job.update_modified_date_column() OWNER TO postgres;

        --
        -- Name: jsonb_update(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
        --

        CREATE FUNCTION public.jsonb_update(data jsonb, update_data jsonb) RETURNS jsonb
            LANGUAGE sql IMMUTABLE
            AS $$
            SELECT json_object_agg(key, value)::jsonb
            FROM (
                WITH old_data AS (
                    SELECT * FROM jsonb_each(data)
                ), to_update AS (
                    SELECT * FROM jsonb_each(update_data)
                    WHERE key IN (SELECT key FROM old_data)
                )
            SELECT * FROM old_data
            WHERE key NOT IN (SELECT key FROM to_update)
            UNION ALL
            SELECT * FROM to_update
        ) t;
        $$;


        ALTER FUNCTION public.jsonb_update(data jsonb, update_data jsonb) OWNER TO postgres;

        --
        -- Name: jsonb_update(jsonb, jsonb); Type: FUNCTION; Schema: recording; Owner: postgres
        --

        CREATE FUNCTION recording.jsonb_update(val1 jsonb, val2 jsonb) RETURNS jsonb
            LANGUAGE plpgsql
            AS $$
        DECLARE
            result JSONB;
            v RECORD;
        BEGIN
            IF jsonb_typeof(val2) = 'null'
            THEN 
                RETURN val1;
            END IF;

            result = val1;

            FOR v IN SELECT key, value FROM jsonb_each(val2) LOOP

                IF jsonb_typeof(val2->v.key) = 'object'
                    THEN
                        result = result || jsonb_build_object(v.key, jsonb_update(val1->v.key, val2->v.key));
                    ELSE
                        result = result || jsonb_build_object(v.key, v.value);
                END IF;
            END LOOP;

            RETURN result;
        END;
        $$;


        ALTER FUNCTION recording.jsonb_update(val1 jsonb, val2 jsonb) OWNER TO postgres;

        SET default_tablespace = '';

        SET default_with_oids = false;

        --
        -- Name: cluster; Type: TABLE; Schema: aiware; Owner: postgres
        --

        CREATE TABLE aiware.cluster (
            cluster_id text NOT NULL,
            organization_id integer NOT NULL,
            display_name text NOT NULL,
            allowed_engines text[] NOT NULL,
            secret_key text NOT NULL,
            access_key text NOT NULL,
            container_tag text,
            queue_credentials jsonb NOT NULL,
            docker_hub_credentials jsonb NOT NULL,
            paused boolean DEFAULT false NOT NULL,
            memory_size bigint,
            cached_veritone_api_key text,
            cached_date integer,
            deleted_date integer,
            created_date integer DEFAULT date_part('epoch'::text, now()),
            updated_date integer DEFAULT date_part('epoch'::text, now()),
            storage_size bigint,
            cluster_type aiware.cluster_type,
            default_cluster boolean DEFAULT false,
            is_public boolean DEFAULT false,
            bypass_allowed_engines boolean,
            cluster_config jsonb,
            status text,
            target_status text,
            tags text[],
            cluster_state jsonb,
            cluster_history jsonb,
            state_last_updated_date_time integer,
            is_group boolean DEFAULT false,
            in_group text,
            controller_url text
        );


        ALTER TABLE aiware.cluster OWNER TO postgres;

        --
        -- Name: cluster__preference; Type: TABLE; Schema: aiware; Owner: postgres
        --

        CREATE TABLE aiware.cluster__preference (
            preference_key text NOT NULL,
            preference_type public.cluster_preference_type NOT NULL,
            cluster_id text NOT NULL
        );


        ALTER TABLE aiware.cluster__preference OWNER TO postgres;

        --
        -- Name: job_bundle; Type: TABLE; Schema: aiware; Owner: postgres
        --

        CREATE TABLE aiware.job_bundle (
            bundle_id text NOT NULL,
            cluster_id text NOT NULL,
            node_id text,
            display_name text NOT NULL,
            test_run boolean DEFAULT true,
            select_detail jsonb,
            select_category public.select_category DEFAULT 'extension'::public.select_category NOT NULL,
            bundle_started integer,
            bundle_completed integer,
            bundle_results jsonb,
            deleted_date integer,
            created_date integer DEFAULT date_part('epoch'::text, now()),
            updated_date integer DEFAULT date_part('epoch'::text, now()),
            external_credential_id text,
            schedule_definition jsonb,
            next_scheduled_time integer
        );


        ALTER TABLE aiware.job_bundle OWNER TO postgres;

        --
        -- Name: node; Type: TABLE; Schema: aiware; Owner: postgres
        --

        CREATE TABLE aiware.node (
            node_id text NOT NULL,
            cluster_id text,
            display_name text NOT NULL,
            role public.node_role,
            metrics jsonb,
            last_ping integer,
            container_tag text,
            paused boolean DEFAULT false NOT NULL,
            storage_present boolean DEFAULT false,
            offline_browsing boolean DEFAULT false,
            directory_oid integer,
            directory_patch_oid integer,
            directory_cache_date integer,
            directory_patch_cache_date integer,
            registered_date integer,
            deleted_date integer,
            created_date integer DEFAULT date_part('epoch'::text, now()),
            updated_date integer DEFAULT date_part('epoch'::text, now()),
            node_config jsonb
        );


        ALTER TABLE aiware.node OWNER TO postgres;

        --
        -- Name: organization__cluster; Type: TABLE; Schema: aiware; Owner: postgres
        --

        CREATE TABLE aiware.organization__cluster (
            organization_id integer NOT NULL,
            cluster_id text NOT NULL
        );


        ALTER TABLE aiware.organization__cluster OWNER TO postgres;

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
        -- Name: task_pricing; Type: TABLE; Schema: billing; Owner: postgres
        --

        CREATE TABLE billing.task_pricing (
            task_id text NOT NULL,
            engine_price integer,
            customer_price integer,
            rate_card_price integer
        );


        ALTER TABLE billing.task_pricing OWNER TO postgres;

        --
        -- Name: callback_handler; Type: TABLE; Schema: engine; Owner: postgres
        --

        CREATE TABLE engine.callback_handler (
            callback_handler_id text NOT NULL,
            engine_id text NOT NULL,
            application_id text NOT NULL,
            recording_id text NOT NULL,
            job_id text NOT NULL,
            task_id text NOT NULL,
            status text DEFAULT 'pending'::text NOT NULL,
            "json" jsonb NOT NULL
        );


        ALTER TABLE engine.callback_handler OWNER TO postgres;

        --
        -- Name: engine; Type: TABLE; Schema: engine; Owner: postgres
        --

        CREATE TABLE engine.engine (
            engine_id text NOT NULL,
            "json" jsonb NOT NULL
        );


        ALTER TABLE engine.engine OWNER TO postgres;

        --
        -- Name: event; Type: TABLE; Schema: event_trigger; Owner: postgres
        --

        CREATE TABLE event_trigger.event (
            event_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
            event_name text DEFAULT ''::text NOT NULL,
            event_type text DEFAULT ''::text NOT NULL,
            organization_id integer,
            application_id text DEFAULT ''::text NOT NULL,
            schema_data text DEFAULT ''::text NOT NULL,
            schema_hash text DEFAULT ''::text NOT NULL,
            public boolean DEFAULT false NOT NULL,
            created_at_utc timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            updated_at_utc timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            created_by text,
            updated_by text,
            description text DEFAULT ''::text NOT NULL
        );


        ALTER TABLE event_trigger.event OWNER TO postgres;

        --
        -- Name: event_action_template; Type: TABLE; Schema: event_trigger; Owner: postgres
        --

        CREATE TABLE event_trigger.event_action_template (
            template_id text DEFAULT public.uuid_generate_v4() NOT NULL,
            template_status integer DEFAULT 0,
            template_name text DEFAULT ''::text,
            organization_id integer DEFAULT '-1'::integer,
            application_id text DEFAULT ''::text,
            input_type text DEFAULT ''::text,
            input_validation jsonb,
            input_attributes jsonb,
            action_type text DEFAULT ''::text,
            action_validation jsonb,
            action_destination text DEFAULT ''::text,
            action_attributes jsonb,
            created_at_utc timestamp with time zone DEFAULT now() NOT NULL,
            updated_at_utc timestamp with time zone DEFAULT now() NOT NULL,
            created_by text DEFAULT ''::text,
            updated_by text DEFAULT ''::text
        );


        ALTER TABLE event_trigger.event_action_template OWNER TO postgres;

        --
        -- Name: event_custom_rules; Type: TABLE; Schema: event_trigger; Owner: postgres
        --

        CREATE TABLE event_trigger.event_custom_rules (
            rule_id text DEFAULT public.uuid_generate_v4() NOT NULL,
            rule_status public.rule_status_type NOT NULL,
            rule_name text DEFAULT ''::text,
            rule_description text DEFAULT ''::text,
            rule_params jsonb,
            organization_id integer NOT NULL,
            event_type text NOT NULL,
            event_name text NOT NULL,
            event_actions jsonb,
            created_at_utc timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            updated_at_utc timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            created_by text DEFAULT ''::text,
            updated_by text DEFAULT ''::text
        );


        ALTER TABLE event_trigger.event_custom_rules OWNER TO postgres;

        --
        -- Name: event_schedule; Type: TABLE; Schema: event_trigger; Owner: postgres
        --

        CREATE TABLE event_trigger.event_schedule (
            event_schedule_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
            event_name text NOT NULL,
            event_type text NOT NULL,
            organization_id integer DEFAULT '-1'::integer,
            application_id text DEFAULT ''::text,
            payload text NOT NULL,
            schedule text NOT NULL,
            created_at_utc timestamp with time zone DEFAULT now() NOT NULL,
            updated_at_utc timestamp with time zone DEFAULT now() NOT NULL,
            created_by text DEFAULT ''::text,
            updated_by text DEFAULT ''::text
        );


        ALTER TABLE event_trigger.event_schedule OWNER TO postgres;

        --
        -- Name: event_subscription; Type: TABLE; Schema: event_trigger; Owner: postgres
        --

        CREATE TABLE event_trigger.event_subscription (
            event_subscription_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
            event_name text DEFAULT ''::text,
            event_type text DEFAULT ''::text,
            organization_id integer DEFAULT '-1'::integer,
            application_id text DEFAULT ''::text,
            target_name text DEFAULT ''::text,
            consumer_params jsonb,
            created_at_utc timestamp with time zone DEFAULT now() NOT NULL,
            updated_at_utc timestamp with time zone DEFAULT now() NOT NULL,
            created_by text DEFAULT ''::text,
            updated_by text DEFAULT ''::text,
            subscription_hash text DEFAULT ''::text NOT NULL,
            conditions jsonb,
            event_action_template_id text
        );


        ALTER TABLE event_trigger.event_subscription OWNER TO postgres;

        --
        -- Name: event_triggers; Type: TABLE; Schema: event_trigger; Owner: postgres
        --

        CREATE TABLE event_trigger.event_triggers (
            event_trigger_id integer NOT NULL,
            organization_id integer DEFAULT '-1'::integer,
            event_name character varying(255) NOT NULL,
            consumer_directive json,
            target_name character varying(255) NOT NULL,
            consumer_params json,
            created_at_utc timestamp with time zone,
            updated_at_utc timestamp with time zone,
            created_by character varying(255),
            updated_by character varying(255),
            event_type text DEFAULT ''::text
        );


        ALTER TABLE event_trigger.event_triggers OWNER TO postgres;

        --
        -- Name: event_triggers_event_trigger_id_seq; Type: SEQUENCE; Schema: event_trigger; Owner: postgres
        --

        CREATE SEQUENCE event_trigger.event_triggers_event_trigger_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;


        ALTER TABLE event_trigger.event_triggers_event_trigger_id_seq OWNER TO postgres;

        --
        -- Name: event_triggers_event_trigger_id_seq; Type: SEQUENCE OWNED BY; Schema: event_trigger; Owner: postgres
        --

        ALTER SEQUENCE event_trigger.event_triggers_event_trigger_id_seq OWNED BY event_trigger.event_triggers.event_trigger_id;


        --
        -- Name: job; Type: TABLE; Schema: job; Owner: postgres
        --

        CREATE TABLE job.job (
            job_id text NOT NULL,
            application_id text NOT NULL,
            recording_id text,
            "json" jsonb NOT NULL,
            modified_date timestamp without time zone DEFAULT timezone('utc'::text, now())
        );


        ALTER TABLE job.job OWNER TO postgres;

        --
        -- Name: job_status_history; Type: TABLE; Schema: job; Owner: postgres
        --

        CREATE TABLE job.job_status_history (
            job_id text,
            application_id text,
            recording_id text,
            task_type_category_id text,
            task_type text,
            complete smallint,
            error smallint,
            queued smallint,
            running smallint,
            modified_date timestamp without time zone,
            previous_modified_date timestamp without time zone
        );


        ALTER TABLE job.job_status_history OWNER TO postgres;

        --
        -- Name: organization__task_type; Type: TABLE; Schema: job; Owner: postgres
        --

        CREATE TABLE job.organization__task_type (
            organization_id integer NOT NULL,
            task_type_id text NOT NULL
        );


        ALTER TABLE job.organization__task_type OWNER TO postgres;

        --
        -- Name: organization__task_type_blacklist; Type: TABLE; Schema: job; Owner: postgres
        --

        CREATE TABLE job.organization__task_type_blacklist (
            organization_id integer NOT NULL,
            task_type_id text NOT NULL
        );


        ALTER TABLE job.organization__task_type_blacklist OWNER TO postgres;

        --
        -- Name: organization__task_type_category_blacklist; Type: TABLE; Schema: job; Owner: postgres
        --

        CREATE TABLE job.organization__task_type_category_blacklist (
            organization_id integer NOT NULL,
            task_type_category_id text NOT NULL
        );


        ALTER TABLE job.organization__task_type_category_blacklist OWNER TO postgres;

        --
        -- Name: recording; Type: TABLE; Schema: job; Owner: postgres
        --

        CREATE TABLE job.recording (
            recording_id text NOT NULL,
            application_id text,
            "json" jsonb
        );


        ALTER TABLE job.recording OWNER TO postgres;

        --
        -- Name: task_type; Type: TABLE; Schema: job; Owner: postgres
        --

        CREATE TABLE job.task_type (
            task_type_id text NOT NULL,
            task_type_category_id text NOT NULL,
            "json" jsonb NOT NULL,
            owner_organization_id integer DEFAULT @@{ROOT_ORG_ID}@@ NOT NULL,
            is_public boolean DEFAULT false NOT NULL
        );


        ALTER TABLE job.task_type OWNER TO postgres;

        --
        -- Name: task_type_category; Type: TABLE; Schema: job; Owner: postgres
        --

        CREATE TABLE job.task_type_category (
            task_type_category_id text NOT NULL,
            task_type_category_name text NOT NULL,
            "json" jsonb NOT NULL
        );


        ALTER TABLE job.task_type_category OWNER TO postgres;

        --
        -- Name: benchmark; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.benchmark (
            benchmark_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
            created_at_utc timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            created_by text,
            baseline_engine_id text NOT NULL,
            engine_ids text[],
            engine_category_id text NOT NULL,
            organization_id integer DEFAULT '-1'::integer
        );


        ALTER TABLE job_new.benchmark OWNER TO postgres;

        --
        -- Name: benchmark__job; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.benchmark__job (
            benchmark_job_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
            benchmark_id uuid NOT NULL,
            job_id text NOT NULL
        );


        ALTER TABLE job_new.benchmark__job OWNER TO postgres;

        --
        -- Name: build; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.build (
            engine_id text NOT NULL,
            build_id text NOT NULL,
            version integer NOT NULL,
            build_state public.build_state NOT NULL,
            price integer,
            created_date integer DEFAULT date_part('epoch'::text, now()),
            updated_date integer DEFAULT date_part('epoch'::text, now()),
            deployment_model integer DEFAULT 0 NOT NULL,
            docker_image text DEFAULT ''::text NOT NULL,
            task_runtime jsonb,
            is_legacy boolean DEFAULT false,
            vul_low_count integer,
            vul_medium_count integer,
            vul_high_count integer,
            vul_critical_count integer,
            build_size bigint,
            deploy_date integer,
            manifest jsonb
        );


        ALTER TABLE job_new.build OWNER TO postgres;

        --
        -- Name: build__build_capability; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.build__build_capability (
            build_id text NOT NULL,
            build_capability_id uuid NOT NULL
        );


        ALTER TABLE job_new.build__build_capability OWNER TO postgres;

        --
        -- Name: build__engine_category; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.build__engine_category (
            build_id text NOT NULL,
            engine_category_id text NOT NULL
        );


        ALTER TABLE job_new.build__engine_category OWNER TO postgres;

        --
        -- Name: build_capability; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.build_capability (
            build_capability_id uuid NOT NULL,
            build_capability_key text NOT NULL,
            build_capability_value text NOT NULL
        );


        ALTER TABLE job_new.build_capability OWNER TO postgres;

        --
        -- Name: engine; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.engine (
            engine_id text NOT NULL,
            engine_category_id text NOT NULL,
            engine_name text,
            engine_description text,
            engine_state public.engine_state NOT NULL,
            deployment_model integer DEFAULT 0 NOT NULL,
            owner_organization_id integer DEFAULT @@{ROOT_ORG_ID}@@ NOT NULL,
            is_public boolean DEFAULT false NOT NULL,
            price integer,
            rating integer,
            website text,
            logo_path text,
            "order" integer DEFAULT 100,
            dependency jsonb,
            core_job_data jsonb,
            fields jsonb,
            validation jsonb,
            application_id jsonb,
            asset text,
            creates_recording boolean DEFAULT false NOT NULL,
            deleted boolean DEFAULT false NOT NULL,
            created_date integer DEFAULT date_part('epoch'::text, now()),
            updated_date integer DEFAULT date_part('epoch'::text, now()),
            library_required boolean DEFAULT false,
            icon_path text,
            engine_currency public.currency DEFAULT 'USD'::public.currency NOT NULL,
            engine_alias_id text,
            engine_alias_name text,
            engine_alias_description text,
            engine_alias_logo_path text,
            jwt_rights jsonb,
            use_cases jsonb,
            industries jsonb,
            engine_manifest jsonb
        );


        ALTER TABLE job_new.engine OWNER TO postgres;

        --
        -- Name: engine__application; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.engine__application (
            engine_id text NOT NULL,
            application_id uuid NOT NULL,
            created_date_time timestamp with time zone DEFAULT timezone('utc'::text, now())
        );


        ALTER TABLE job_new.engine__application OWNER TO postgres;

        --
        -- Name: engine_category; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.engine_category (
            engine_category_id text NOT NULL,
            engine_category_name text NOT NULL,
            engine_category_description text,
            search jsonb,
            elastic jsonb,
            data_field text,
            icon_class text,
            editable boolean DEFAULT false NOT NULL,
            video_only boolean DEFAULT false NOT NULL,
            "order" integer,
            created_date integer DEFAULT date_part('epoch'::text, now()),
            updated_date integer DEFAULT date_part('epoch'::text, now()),
            library_identifier_types text[],
            dependencies jsonb,
            color text,
            engine_class_id uuid,
            engine_type_id uuid,
            export_formats jsonb DEFAULT '[]'::jsonb NOT NULL,
            validation_contract text,
            doc_link character varying
        );


        ALTER TABLE job_new.engine_category OWNER TO postgres;

        --
        -- Name: engine_certification; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.engine_certification (
            engine_id text NOT NULL,
            email text NOT NULL,
            media_file_uri text NOT NULL,
            custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
            created_at_utc timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            updated_at_utc timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            created_by text DEFAULT ''::text NOT NULL,
            updated_by text DEFAULT ''::text
        );


        ALTER TABLE job_new.engine_certification OWNER TO postgres;

        --
        -- Name: engine_class; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.engine_class (
            engine_class_id uuid NOT NULL,
            engine_class_name text NOT NULL,
            engine_class_description text,
            icon_class text
        );


        ALTER TABLE job_new.engine_class OWNER TO postgres;

        --
        -- Name: engine_type; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.engine_type (
            engine_type_id uuid NOT NULL,
            engine_type_name text NOT NULL,
            engine_type_description text
        );


        ALTER TABLE job_new.engine_type OWNER TO postgres;

        --
        -- Name: export_request; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.export_request (
            id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
            organization_id integer NOT NULL,
            status text NOT NULL,
            requestor_id text NOT NULL,
            asset_uri text,
            created_date_time timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            modified_date_time timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            event_payload jsonb
        );


        ALTER TABLE job_new.export_request OWNER TO postgres;

        --
        -- Name: job; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.job (
            job_id text NOT NULL,
            application_id uuid NOT NULL,
            recording_id text,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            retries integer DEFAULT 0,
            deleted_date_time integer,
            cluster_id text,
            bundle_id text,
            source_asset_id text,
            client_application_id text,
            is_template boolean DEFAULT false,
            job_pipeline_id uuid,
            job_pipeline_stage integer,
            correlation_id uuid,
            skip_decider boolean,
            job_template_id text,
            scheduled_job_id text,
            organization_id integer,
            job_config jsonb,
            job_status text,
            CONSTRAINT is_template_not_null CHECK ((is_template IS NOT NULL))
        )
        WITH (autovacuum_enabled='true', toast.autovacuum_enabled='true');


        ALTER TABLE job_new.job OWNER TO postgres;

        --
        -- Name: job_pipeline; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.job_pipeline (
            job_pipeline_id uuid NOT NULL,
            created_date_time integer DEFAULT ((date_part('epoch'::text, now()))::numeric)::integer NOT NULL,
            modified_date_time integer DEFAULT ((date_part('epoch'::text, now()))::numeric)::integer NOT NULL,
            owner_organization_id integer NOT NULL,
            is_public boolean DEFAULT true NOT NULL
        );


        ALTER TABLE job_new.job_pipeline OWNER TO postgres;

        --
        -- Name: organization__engine; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.organization__engine (
            organization_id integer NOT NULL,
            engine_id text NOT NULL
        );


        ALTER TABLE job_new.organization__engine OWNER TO postgres;

        --
        -- Name: organization__engine_blacklist; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.organization__engine_blacklist (
            organization_id integer NOT NULL,
            engine_id text NOT NULL
        );


        ALTER TABLE job_new.organization__engine_blacklist OWNER TO postgres;

        --
        -- Name: organization__engine_category_blacklist; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.organization__engine_category_blacklist (
            organization_id integer NOT NULL,
            engine_category_id text NOT NULL
        );


        ALTER TABLE job_new.organization__engine_category_blacklist OWNER TO postgres;

        --
        -- Name: organization__job_pipeline; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.organization__job_pipeline (
            organization_id integer NOT NULL,
            job_pipeline_id uuid NOT NULL
        );


        ALTER TABLE job_new.organization__job_pipeline OWNER TO postgres;

        --
        -- Name: scheduled_job__job_pipeline; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.scheduled_job__job_pipeline (
            scheduled_job_id text NOT NULL,
            job_pipeline_id uuid NOT NULL
        );


        ALTER TABLE job_new.scheduled_job__job_pipeline OWNER TO postgres;

        --
        -- Name: scheduled_job__job_template; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.scheduled_job__job_template (
            scheduled_job_id text NOT NULL,
            job_template_id text NOT NULL
        );


        ALTER TABLE job_new.scheduled_job__job_template OWNER TO postgres;

        --
        -- Name: task; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.task (
            task_id text NOT NULL,
            job_id text NOT NULL,
            application_id uuid NOT NULL,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            queued_date_time integer,
            modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            completed_date_time integer,
            task_order integer,
            task_executor text,
            task_executor_id text,
            task_status text,
            task_payload jsonb,
            task_output jsonb,
            recording_id text,
            is_clone boolean DEFAULT false NOT NULL,
            engine_id text,
            failure_type text,
            task_log text,
            source_asset_id text,
            engine_price integer,
            customer_price integer,
            media_length_secs integer,
            media_storage_bytes integer,
            media_file_name text,
            business_unit character varying(50),
            build_id text,
            rate_card_price integer,
            payload jsonb,
            test_task boolean,
            started_date_time integer,
            cancelled_date_time integer,
            asset_selector jsonb,
            is_template boolean DEFAULT false,
            job_pipeline_id uuid,
            correlation_id uuid,
            standby_for_task_id text,
            parent_task_id text,
            ended_date_time integer,
            task_executor_data jsonb,
            CONSTRAINT engine_id_not_null_check CHECK ((engine_id IS NOT NULL))
        )
        WITH (autovacuum_enabled='false', toast.autovacuum_enabled='false');


        ALTER TABLE job_new.task OWNER TO postgres;

        --
        -- Name: tmp_task_1; Type: TABLE; Schema: job_new; Owner: postgres
        --

        CREATE TABLE job_new.tmp_task_1 (
            task_id text,
            engine_id text,
            build_id text,
            media_length_secs integer,
            queued_date_time integer,
            started_date_time integer,
            completed_date_time integer
        );


        ALTER TABLE job_new.tmp_task_1 OWNER TO postgres;

        --
        -- Name: dataset_configurations; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.dataset_configurations (
            configuration_id uuid NOT NULL,
            ranked_source_engine_ids text[],
            min_confidence real DEFAULT 0,
            max_confidence real DEFAULT 100,
            allow_null_confidence boolean DEFAULT true
        );


        ALTER TABLE libraries.dataset_configurations OWNER TO postgres;

        --
        -- Name: entity; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.entity (
            entity_id uuid NOT NULL,
            library_id uuid NOT NULL,
            name text NOT NULL,
            is_published boolean DEFAULT false NOT NULL,
            profile_image_url text,
            metadata jsonb,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            deleted_date_time integer,
            description text
        );


        ALTER TABLE libraries.entity OWNER TO postgres;

        --
        -- Name: entity_identifier; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.entity_identifier (
            entity_identifier_id uuid NOT NULL,
            entity_id uuid NOT NULL,
            entity_identifier_type_id text NOT NULL,
            priority boolean DEFAULT false NOT NULL,
            data_url text NOT NULL,
            metadata jsonb,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            deleted_date_time integer
        );


        ALTER TABLE libraries.entity_identifier OWNER TO postgres;

        --
        -- Name: entity_identifier_type; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.entity_identifier_type (
            entity_identifier_type_id text NOT NULL,
            label text NOT NULL,
            icon_class text,
            data_type text NOT NULL,
            label_plural text,
            description text
        );


        ALTER TABLE libraries.entity_identifier_type OWNER TO postgres;

        --
        -- Name: library; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.library (
            library_id uuid NOT NULL,
            name text NOT NULL,
            version integer DEFAULT 0 NOT NULL,
            owner_org_id integer NOT NULL,
            library_type_id text NOT NULL,
            cover_image_url text,
            description text,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            deleted_date_time integer
        );


        ALTER TABLE libraries.library OWNER TO postgres;

        --
        -- Name: library__recording; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.library__recording (
            library_id uuid NOT NULL,
            recording_id text NOT NULL
        );


        ALTER TABLE libraries.library__recording OWNER TO postgres;

        --
        -- Name: library_collaborator; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.library_collaborator (
            library_id uuid NOT NULL,
            collaborator_org_id integer NOT NULL,
            permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
            status text DEFAULT 'active'::text NOT NULL,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            deleted_date_time integer
        );


        ALTER TABLE libraries.library_collaborator OWNER TO postgres;

        --
        -- Name: library_engine_model; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.library_engine_model (
            library_engine_model_id uuid NOT NULL,
            library_id uuid NOT NULL,
            library_version integer NOT NULL,
            engine_id text NOT NULL,
            train_job_id text,
            train_status text,
            data_url text,
            metadata jsonb,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            modified_date_time integer DEFAULT date_part('epoch'::text, now()),
            deleted_date_time integer,
            accuracy integer,
            configuration_id uuid
        );


        ALTER TABLE libraries.library_engine_model OWNER TO postgres;

        --
        -- Name: library_type; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.library_type (
            library_type_id text NOT NULL,
            label text NOT NULL,
            icon_class text,
            entity_type_name_plural text,
            entity_type_name text,
            entity_type_schema jsonb DEFAULT '{}'::jsonb NOT NULL
        );


        ALTER TABLE libraries.library_type OWNER TO postgres;

        --
        -- Name: library_type__entity_identifier_type; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.library_type__entity_identifier_type (
            library_type_id text NOT NULL,
            entity_identifier_type_id text NOT NULL,
            min_items integer,
            max_items integer
        );


        ALTER TABLE libraries.library_type__entity_identifier_type OWNER TO postgres;

        --
        -- Name: model_configurations; Type: TABLE; Schema: libraries; Owner: postgres
        --

        CREATE TABLE libraries.model_configurations (
            configuration_id uuid NOT NULL,
            library_id uuid NOT NULL,
            engine_category_id text NOT NULL,
            target_engine_ids text[],
            created_date_time integer DEFAULT date_part('epoch'::text, now())
        );


        ALTER TABLE libraries.model_configurations OWNER TO postgres;

        --
        -- Name: ingestion; Type: TABLE; Schema: pacman; Owner: postgres
        --

        CREATE TABLE pacman.ingestion (
            ingestion_id text NOT NULL,
            application_id text NOT NULL,
            ingestion_type text NOT NULL,
            "json" jsonb NOT NULL,
            last_executed_job_id text DEFAULT ''::text NOT NULL,
            runs integer
        );


        ALTER TABLE pacman.ingestion OWNER TO postgres;

        --
        -- Name: ingestion_archive; Type: TABLE; Schema: pacman; Owner: postgres
        --

        CREATE TABLE pacman.ingestion_archive (
            ingestion_id text NOT NULL,
            application_id text NOT NULL,
            ingestion_type text NOT NULL,
            "json" jsonb NOT NULL,
            archived_created_date_time integer NOT NULL
        );


        ALTER TABLE pacman.ingestion_archive OWNER TO postgres;

        --
        -- Name: temp_missing_jobs2; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.temp_missing_jobs2 (
            job_id text
        );


        ALTER TABLE public.temp_missing_jobs2 OWNER TO postgres;

        --
        -- Name: asset; Type: TABLE; Schema: recording; Owner: postgres
        --

        CREATE TABLE recording.asset (
            asset_id text NOT NULL,
            recording_id text NOT NULL,
            "json" jsonb NOT NULL
        );


        ALTER TABLE recording.asset OWNER TO postgres;

        --
        -- Name: recording; Type: TABLE; Schema: recording; Owner: postgres
        --

        CREATE TABLE recording.recording (
            recording_id text NOT NULL,
            application_id text NOT NULL,
            "json" jsonb NOT NULL,
            source_id text,
            is_public boolean,
            scheduled_job_id text,
            organization_id integer,
            created_date_time timestamp with time zone,
            modified_date_time timestamp with time zone,
            start_date_time timestamp with time zone,
            stop_date_time timestamp with time zone
        );


        ALTER TABLE recording.recording OWNER TO postgres;

        --
        -- Name: recording__source; Type: TABLE; Schema: recording; Owner: postgres
        --

        CREATE TABLE recording.recording__source (
            source_id text NOT NULL,
            recording_id text NOT NULL
        );


        ALTER TABLE recording.recording__source OWNER TO postgres;

        --
        -- Name: recording_asset; Type: TABLE; Schema: recording; Owner: postgres
        --

        CREATE TABLE recording.recording_asset (
            asset_id text NOT NULL,
            recording_id text NOT NULL,
            metadata jsonb,
            type text NOT NULL,
            content_type text NOT NULL,
            uri text NOT NULL,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            external_credential_id text,
            user_edited boolean
        );


        ALTER TABLE recording.recording_asset OWNER TO postgres;

        --
        -- Name: recording_clone; Type: TABLE; Schema: recording; Owner: postgres
        --

        CREATE TABLE recording.recording_clone (
            clone_id text NOT NULL,
            status text DEFAULT 'running'::text NOT NULL,
            source_application_id text NOT NULL,
            destination_application_id text NOT NULL,
            number_of_recordings integer DEFAULT 0 NOT NULL,
            number_of_completed_recordings integer DEFAULT 0 NOT NULL,
            request jsonb NOT NULL,
            response jsonb,
            created_date_time integer DEFAULT date_part('epoch'::text, now()),
            modified_date_time integer DEFAULT date_part('epoch'::text, now())
        );


        ALTER TABLE recording.recording_clone OWNER TO postgres;

        --
        -- Name: recording_metadata; Type: TABLE; Schema: recording; Owner: postgres
        --

        CREATE TABLE recording.recording_metadata (
            recording_id text NOT NULL,
            type text NOT NULL,
            content jsonb
        );


        ALTER TABLE recording.recording_metadata OWNER TO postgres;

        --
        -- Name: dropbox; Type: TABLE; Schema: watchers; Owner: postgres
        --

        CREATE TABLE watchers.dropbox (
            watcher_id text NOT NULL,
            application_id text NOT NULL,
            "json" jsonb NOT NULL
        );


        ALTER TABLE watchers.dropbox OWNER TO postgres;

        --
        -- Name: workflow_runtime; Type: TABLE; Schema: workflow; Owner: postgres
        --

        CREATE TABLE workflow.workflow_runtime (
            workflow_runtime_id character varying NOT NULL,
            organization_id integer NOT NULL,
            runtime_type character varying NOT NULL,
            host_uri character varying NOT NULL,
            metadata jsonb,
            created_by character varying NOT NULL,
            updated_by character varying NOT NULL,
            created_at timestamp with time zone NOT NULL,
            updated_at timestamp with time zone NOT NULL,
            token_id character varying,
            auth_token text
        );


        ALTER TABLE workflow.workflow_runtime OWNER TO postgres;

        --
        -- Name: workflow_runtime_storage; Type: TABLE; Schema: workflow; Owner: postgres
        --

        CREATE TABLE workflow.workflow_runtime_storage (
            workflow_runtime_id character varying NOT NULL,
            storage_key character varying NOT NULL,
            storage_metadata character varying,
            created_by character varying NOT NULL,
            updated_by character varying NOT NULL,
            created_at timestamp with time zone NOT NULL,
            updated_at timestamp with time zone NOT NULL,
            storage_data character varying NOT NULL
        );


        ALTER TABLE workflow.workflow_runtime_storage OWNER TO postgres;

        --
        -- Name: database_history id; Type: DEFAULT; Schema: audit; Owner: postgres
        --

        ALTER TABLE ONLY audit.database_history ALTER COLUMN id SET DEFAULT nextval('audit.database_history_id_seq'::regclass);


        --
        -- Name: event_triggers event_trigger_id; Type: DEFAULT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event_triggers ALTER COLUMN event_trigger_id SET DEFAULT nextval('event_trigger.event_triggers_event_trigger_id_seq'::regclass);


        --
        -- Name: cluster _pk_cluster@cluster_id; Type: CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.cluster
            ADD CONSTRAINT "_pk_cluster@cluster_id" PRIMARY KEY (cluster_id);


        --
        -- Name: job_bundle _pk_job_bundle@bundle_id; Type: CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.job_bundle
            ADD CONSTRAINT "_pk_job_bundle@bundle_id" PRIMARY KEY (bundle_id);


        --
        -- Name: node _pk_node@node_id; Type: CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.node
            ADD CONSTRAINT "_pk_node@node_id" PRIMARY KEY (node_id);


        --
        -- Name: cluster__preference ct_cluster__preference_selector; Type: CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.cluster__preference
            ADD CONSTRAINT ct_cluster__preference_selector UNIQUE (preference_type, preference_key);


        --
        -- Name: organization__cluster organization__cluster_pkey; Type: CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.organization__cluster
            ADD CONSTRAINT organization__cluster_pkey PRIMARY KEY (organization_id, cluster_id);


        --
        -- Name: task_pricing task_pricing_pkey; Type: CONSTRAINT; Schema: billing; Owner: postgres
        --

        ALTER TABLE ONLY billing.task_pricing
            ADD CONSTRAINT task_pricing_pkey PRIMARY KEY (task_id);


        --
        -- Name: callback_handler _pk_callback_handler@callback_handler_id; Type: CONSTRAINT; Schema: engine; Owner: postgres
        --

        ALTER TABLE ONLY engine.callback_handler
            ADD CONSTRAINT "_pk_callback_handler@callback_handler_id" PRIMARY KEY (callback_handler_id);


        --
        -- Name: engine _pk_engine@engine_id; Type: CONSTRAINT; Schema: engine; Owner: postgres
        --

        ALTER TABLE ONLY engine.engine
            ADD CONSTRAINT "_pk_engine@engine_id" PRIMARY KEY (engine_id);


        --
        -- Name: event_action_template event_action_template_pkey; Type: CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event_action_template
            ADD CONSTRAINT event_action_template_pkey PRIMARY KEY (template_id);


        --
        -- Name: event event_application_id_event_name_event_type_key; Type: CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event
            ADD CONSTRAINT event_application_id_event_name_event_type_key UNIQUE (application_id, event_name, event_type);


        --
        -- Name: event_custom_rules event_custom_rules_pkey; Type: CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event_custom_rules
            ADD CONSTRAINT event_custom_rules_pkey PRIMARY KEY (rule_id);


        --
        -- Name: event_triggers event_org_type_idx; Type: CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event_triggers
            ADD CONSTRAINT event_org_type_idx UNIQUE (organization_id, event_name, event_type);


        --
        -- Name: event event_pkey; Type: CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event
            ADD CONSTRAINT event_pkey PRIMARY KEY (event_id);


        --
        -- Name: event_schedule event_schedule_pkey; Type: CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event_schedule
            ADD CONSTRAINT event_schedule_pkey PRIMARY KEY (event_schedule_id);


        --
        -- Name: event_subscription event_subscription_pkey; Type: CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event_subscription
            ADD CONSTRAINT event_subscription_pkey PRIMARY KEY (event_subscription_id);


        --
        -- Name: event_triggers event_triggers_pkey; Type: CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event_triggers
            ADD CONSTRAINT event_triggers_pkey PRIMARY KEY (event_trigger_id);


        --
        -- Name: job _pk_job@job_id; Type: CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.job
            ADD CONSTRAINT "_pk_job@job_id" PRIMARY KEY (job_id);


        --
        -- Name: organization__task_type _pk_organization__task_type@organization_id,task_type_id; Type: CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.organization__task_type
            ADD CONSTRAINT "_pk_organization__task_type@organization_id,task_type_id" PRIMARY KEY (organization_id, task_type_id);


        --
        -- Name: organization__task_type_blacklist _pk_organization__task_type_blacklist@organization_id,task_type; Type: CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.organization__task_type_blacklist
            ADD CONSTRAINT "_pk_organization__task_type_blacklist@organization_id,task_type" PRIMARY KEY (organization_id, task_type_id);


        --
        -- Name: organization__task_type_category_blacklist _pk_organization__task_type_category_blacklist@organization_id,; Type: CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.organization__task_type_category_blacklist
            ADD CONSTRAINT "_pk_organization__task_type_category_blacklist@organization_id," PRIMARY KEY (organization_id, task_type_category_id);


        --
        -- Name: task_type _pk_task_type@task_type_id; Type: CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.task_type
            ADD CONSTRAINT "_pk_task_type@task_type_id" PRIMARY KEY (task_type_id);


        --
        -- Name: task_type_category _pk_task_type_category@task_type_category_id; Type: CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.task_type_category
            ADD CONSTRAINT "_pk_task_type_category@task_type_category_id" PRIMARY KEY (task_type_category_id);


        --
        -- Name: recording recording_pkey; Type: CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.recording
            ADD CONSTRAINT recording_pkey PRIMARY KEY (recording_id);


        --
        -- Name: build _pk_build@build_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build
            ADD CONSTRAINT "_pk_build@build_id" PRIMARY KEY (build_id);


        --
        -- Name: build__build_capability _pk_build__build_capability@build_id,build_capability_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build__build_capability
            ADD CONSTRAINT "_pk_build__build_capability@build_id,build_capability_id" PRIMARY KEY (build_id, build_capability_id);


        --
        -- Name: build__engine_category _pk_build__engine_category@build_id,engine_category_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build__engine_category
            ADD CONSTRAINT "_pk_build__engine_category@build_id,engine_category_id" PRIMARY KEY (build_id, engine_category_id);


        --
        -- Name: build_capability _pk_build_capability@build_capability_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build_capability
            ADD CONSTRAINT "_pk_build_capability@build_capability_id" PRIMARY KEY (build_capability_id);


        --
        -- Name: engine _pk_engine@engine_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine
            ADD CONSTRAINT "_pk_engine@engine_id" PRIMARY KEY (engine_id);


        --
        -- Name: engine_category _pk_engine_category@engine_category_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine_category
            ADD CONSTRAINT "_pk_engine_category@engine_category_id" PRIMARY KEY (engine_category_id);


        --
        -- Name: engine_class _pk_engine_class@engine_class_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine_class
            ADD CONSTRAINT "_pk_engine_class@engine_class_id" PRIMARY KEY (engine_class_id);


        --
        -- Name: engine_type _pk_engine_type@engine_type_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine_type
            ADD CONSTRAINT "_pk_engine_type@engine_type_id" PRIMARY KEY (engine_type_id);


        --
        -- Name: task _pk_job_new.task@task_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.task
            ADD CONSTRAINT "_pk_job_new.task@task_id" PRIMARY KEY (task_id);


        --
        -- Name: job _pk_job_new@job_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.job
            ADD CONSTRAINT "_pk_job_new@job_id" PRIMARY KEY (job_id);


        --
        -- Name: organization__engine _pk_organization__engine@organization_id,engine_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.organization__engine
            ADD CONSTRAINT "_pk_organization__engine@organization_id,engine_id" PRIMARY KEY (organization_id, engine_id);


        --
        -- Name: organization__engine_blacklist _pk_organization__engine_blacklist@organization_id,engine_id; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.organization__engine_blacklist
            ADD CONSTRAINT "_pk_organization__engine_blacklist@organization_id,engine_id" PRIMARY KEY (organization_id, engine_id);


        --
        -- Name: organization__engine_category_blacklist _pk_organization__engine_category_blacklist@organization_id,eng; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.organization__engine_category_blacklist
            ADD CONSTRAINT "_pk_organization__engine_category_blacklist@organization_id,eng" PRIMARY KEY (organization_id, engine_category_id);


        --
        -- Name: benchmark__job benchmark__job_pkey; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.benchmark__job
            ADD CONSTRAINT benchmark__job_pkey PRIMARY KEY (benchmark_job_id);


        --
        -- Name: benchmark benchmark_pkey; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.benchmark
            ADD CONSTRAINT benchmark_pkey PRIMARY KEY (benchmark_id);


        --
        -- Name: engine_certification engine_certification_pkey; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine_certification
            ADD CONSTRAINT engine_certification_pkey PRIMARY KEY (engine_id);


        --
        -- Name: export_request export_request_pkey; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.export_request
            ADD CONSTRAINT export_request_pkey PRIMARY KEY (id);


        --
        -- Name: job_pipeline job_pipeline_pkey; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.job_pipeline
            ADD CONSTRAINT job_pipeline_pkey PRIMARY KEY (job_pipeline_id);


        --
        -- Name: organization__job_pipeline organization__job_pipeline_pkey; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.organization__job_pipeline
            ADD CONSTRAINT organization__job_pipeline_pkey PRIMARY KEY (organization_id, job_pipeline_id);


        --
        -- Name: scheduled_job__job_pipeline scheduled_job__job_pipeline_pkey; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.scheduled_job__job_pipeline
            ADD CONSTRAINT scheduled_job__job_pipeline_pkey PRIMARY KEY (scheduled_job_id, job_pipeline_id);


        --
        -- Name: scheduled_job__job_template scheduled_job__job_template_pkey; Type: CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.scheduled_job__job_template
            ADD CONSTRAINT scheduled_job__job_template_pkey PRIMARY KEY (scheduled_job_id, job_template_id);


        --
        -- Name: entity _pk_libraries.entity@entity_id; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.entity
            ADD CONSTRAINT "_pk_libraries.entity@entity_id" PRIMARY KEY (entity_id);


        --
        -- Name: entity_identifier _pk_libraries.entity_identifier@entity_identifier_id; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.entity_identifier
            ADD CONSTRAINT "_pk_libraries.entity_identifier@entity_identifier_id" PRIMARY KEY (entity_identifier_id);


        --
        -- Name: entity_identifier_type _pk_libraries.entity_identifier_type@entity_identifier_type_id; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.entity_identifier_type
            ADD CONSTRAINT "_pk_libraries.entity_identifier_type@entity_identifier_type_id" PRIMARY KEY (entity_identifier_type_id);


        --
        -- Name: library_engine_model _pk_libraries.library@library_engine_model_id; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library_engine_model
            ADD CONSTRAINT "_pk_libraries.library@library_engine_model_id" PRIMARY KEY (library_engine_model_id);


        --
        -- Name: library _pk_libraries.library@library_id; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library
            ADD CONSTRAINT "_pk_libraries.library@library_id" PRIMARY KEY (library_id);


        --
        -- Name: library_type _pk_libraries.library_type@library_type_id; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library_type
            ADD CONSTRAINT "_pk_libraries.library_type@library_type_id" PRIMARY KEY (library_type_id);


        --
        -- Name: dataset_configurations dataset_configurations_pkey; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.dataset_configurations
            ADD CONSTRAINT dataset_configurations_pkey PRIMARY KEY (configuration_id);


        --
        -- Name: library__recording library__recording_pkey; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library__recording
            ADD CONSTRAINT library__recording_pkey PRIMARY KEY (library_id, recording_id);


        --
        -- Name: model_configurations model_configurations_pkey; Type: CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.model_configurations
            ADD CONSTRAINT model_configurations_pkey PRIMARY KEY (configuration_id);


        --
        -- Name: ingestion _pk_ingestion@ingestion_id; Type: CONSTRAINT; Schema: pacman; Owner: postgres
        --

        ALTER TABLE ONLY pacman.ingestion
            ADD CONSTRAINT "_pk_ingestion@ingestion_id" PRIMARY KEY (ingestion_id);


        --
        -- Name: ingestion_archive _pk_ingestion_archive@ingestion_id; Type: CONSTRAINT; Schema: pacman; Owner: postgres
        --

        ALTER TABLE ONLY pacman.ingestion_archive
            ADD CONSTRAINT "_pk_ingestion_archive@ingestion_id" PRIMARY KEY (ingestion_id);

        --
        -- Name: recording_asset _pk_recording.recording_asset@asset_id; Type: CONSTRAINT; Schema: recording; Owner: postgres
        --

        ALTER TABLE ONLY recording.recording_asset
            ADD CONSTRAINT "_pk_recording.recording_asset@asset_id" PRIMARY KEY (asset_id);


        --
        -- Name: recording_metadata _pk_recording.recording_metadata@recording_id,type; Type: CONSTRAINT; Schema: recording; Owner: postgres
        --

        ALTER TABLE ONLY recording.recording_metadata
            ADD CONSTRAINT "_pk_recording.recording_metadata@recording_id,type" PRIMARY KEY (recording_id, type);


        --
        -- Name: recording _pk_recording@recording_id; Type: CONSTRAINT; Schema: recording; Owner: postgres
        --

        ALTER TABLE ONLY recording.recording
            ADD CONSTRAINT "_pk_recording@recording_id" PRIMARY KEY (recording_id);


        --
        -- Name: asset _pk_recording_asset@asset_id; Type: CONSTRAINT; Schema: recording; Owner: postgres
        --

        ALTER TABLE ONLY recording.asset
            ADD CONSTRAINT "_pk_recording_asset@asset_id" PRIMARY KEY (asset_id);


        --
        -- Name: recording_clone _pk_recording_recording_clone@clone_id; Type: CONSTRAINT; Schema: recording; Owner: postgres
        --

        ALTER TABLE ONLY recording.recording_clone
            ADD CONSTRAINT "_pk_recording_recording_clone@clone_id" PRIMARY KEY (clone_id);


        --
        -- Name: recording__source recording__source_pkey; Type: CONSTRAINT; Schema: recording; Owner: postgres
        --

        ALTER TABLE ONLY recording.recording__source
            ADD CONSTRAINT recording__source_pkey PRIMARY KEY (source_id, recording_id);


        --
        -- Name: dropbox _pk_dropbox@watcher_id; Type: CONSTRAINT; Schema: watchers; Owner: postgres
        --

        ALTER TABLE ONLY watchers.dropbox
            ADD CONSTRAINT "_pk_dropbox@watcher_id" PRIMARY KEY (watcher_id);


        --
        -- Name: workflow_runtime workflow_runtime_id_pk; Type: CONSTRAINT; Schema: workflow; Owner: postgres
        --

        ALTER TABLE ONLY workflow.workflow_runtime
            ADD CONSTRAINT workflow_runtime_id_pk PRIMARY KEY (workflow_runtime_id);


        --
        -- Name: workflow_runtime_storage workflow_runtime_storage_pk; Type: CONSTRAINT; Schema: workflow; Owner: postgres
        --

        ALTER TABLE ONLY workflow.workflow_runtime_storage
            ADD CONSTRAINT workflow_runtime_storage_pk PRIMARY KEY (workflow_runtime_id, storage_key);


        --
        -- Name: _ix_aiware.cluster@created_date; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "_ix_aiware.cluster@created_date" ON aiware.cluster USING btree (created_date);


        --
        -- Name: _ix_aiware.cluster@organization_id; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "_ix_aiware.cluster@organization_id" ON aiware.cluster USING btree (organization_id);


        --
        -- Name: _ix_aiware.cluster__preference@preference_key,preference_type; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "_ix_aiware.cluster__preference@preference_key,preference_type" ON aiware.cluster__preference USING btree (preference_key, preference_type);


        --
        -- Name: _ix_aiware.job_bundle@cluster_id; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "_ix_aiware.job_bundle@cluster_id" ON aiware.job_bundle USING btree (cluster_id);


        --
        -- Name: _ix_aiware.job_bundle@created_date; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "_ix_aiware.job_bundle@created_date" ON aiware.job_bundle USING btree (created_date);


        --
        -- Name: _ix_aiware.node@cluster_id; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "_ix_aiware.node@cluster_id" ON aiware.node USING btree (cluster_id);


        --
        -- Name: _ix_aiware.node@deleted_date; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "_ix_aiware.node@deleted_date" ON aiware.node USING btree (deleted_date);


        --
        -- Name: ix_cluster@state_last_updated_date_time; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "ix_cluster@state_last_updated_date_time" ON aiware.cluster USING btree (state_last_updated_date_time);


        --
        -- Name: ix_cluster@status; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "ix_cluster@status" ON aiware.cluster USING btree (status);


        --
        -- Name: ix_cluster@tags; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "ix_cluster@tags" ON aiware.cluster USING gin (tags);


        --
        -- Name: ix_cluster@target_status; Type: INDEX; Schema: aiware; Owner: postgres
        --

        CREATE INDEX "ix_cluster@target_status" ON aiware.cluster USING btree (target_status);


        --
        -- Name: ix_database_history_started_date; Type: INDEX; Schema: audit; Owner: postgres
        --

        CREATE INDEX ix_database_history_started_date ON audit.database_history USING btree (started_date);


        --
        -- Name: ix_database_history_status; Type: INDEX; Schema: audit; Owner: postgres
        --

        CREATE INDEX ix_database_history_status ON audit.database_history USING btree (status);


        --
        -- Name: idx_subscription_hash; Type: INDEX; Schema: event_trigger; Owner: postgres
        --

        CREATE INDEX idx_subscription_hash ON event_trigger.event_subscription USING btree (subscription_hash);


        --
        -- Name: _ix_job.job@modified_date; Type: INDEX; Schema: job; Owner: postgres
        --

        CREATE INDEX "_ix_job.job@modified_date" ON job.job USING btree (modified_date);


        --
        -- Name: _ix_task_type_category@take_type_category_name; Type: INDEX; Schema: job; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_task_type_category@take_type_category_name" ON job.task_type_category USING btree (task_type_category_name);


        --
        -- Name: _ix_build@engine_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_build@engine_id" ON job_new.build USING btree (engine_id);


        --
        -- Name: _ix_build__engine_category@build_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_build__engine_category@build_id" ON job_new.build__engine_category USING btree (build_id);


        --
        -- Name: _ix_build_capability@build_capability_key,build_capability_valu; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_build_capability@build_capability_key,build_capability_valu" ON job_new.build_capability USING btree (build_capability_key, build_capability_value);


        --
        -- Name: _ix_build_state; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX _ix_build_state ON job_new.build USING btree (build_state);


        --
        -- Name: _ix_engine@engine_category_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_engine@engine_category_id" ON job_new.engine USING btree (engine_category_id);


        --
        -- Name: _ix_engine__application@application_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_engine__application@application_id" ON job_new.engine__application USING btree (application_id);


        --
        -- Name: _ix_engine__application@engine_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_engine__application@engine_id" ON job_new.engine__application USING btree (engine_id);


        --
        -- Name: _ix_engine_category@engine_category_name; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_engine_category@engine_category_name" ON job_new.engine_category USING btree (engine_category_name);


        --
        -- Name: _ix_engine_engine_state; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX _ix_engine_engine_state ON job_new.engine USING btree (engine_state);


        --
        -- Name: _ix_engine_owner_organization_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX _ix_engine_owner_organization_id ON job_new.engine USING btree (owner_organization_id);


        --
        -- Name: _ix_job.task@application_id,created_date_time,task_status; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job.task@application_id,created_date_time,task_status" ON job_new.task USING btree (application_id, created_date_time, task_status);


        --
        -- Name: _ix_job_cluster_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX _ix_job_cluster_id ON job_new.job USING btree (cluster_id);


        --
        -- Name: _ix_job_new.engine@library_required; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.engine@library_required" ON job_new.engine USING btree (library_required);


        --
        -- Name: _ix_job_new.job@application_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.job@application_id" ON job_new.job USING btree (application_id);


        --
        -- Name: _ix_job_new.job@application_id,created_date_time; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.job@application_id,created_date_time" ON job_new.job USING btree (application_id, created_date_time);


        --
        -- Name: _ix_job_new.job@bundle_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.job@bundle_id" ON job_new.job USING btree (bundle_id);


        --
        -- Name: _ix_job_new.job@created_date_time; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.job@created_date_time" ON job_new.job USING btree (created_date_time DESC);


        --
        -- Name: _ix_job_new.job@job_pipeline_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.job@job_pipeline_id" ON job_new.job USING btree (job_pipeline_id);


        --
        -- Name: _ix_job_new.job@modified_date_time; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.job@modified_date_time" ON job_new.job USING btree (modified_date_time);


        --
        -- Name: _ix_job_new.job@recording_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.job@recording_id" ON job_new.job USING btree (recording_id);


        --
        -- Name: _ix_job_new.job@scheduled_job_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.job@scheduled_job_id" ON job_new.job USING btree (scheduled_job_id);


        --
        -- Name: _ix_job_new.task@job_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_job_new.task@job_id" ON job_new.task USING btree (job_id);


        --
        -- Name: _ix_organization__engine@engine_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_organization__engine@engine_id" ON job_new.organization__engine USING btree (engine_id);


        --
        -- Name: _ix_organization__engine_blacklist@engine_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX "_ix_organization__engine_blacklist@engine_id" ON job_new.organization__engine_blacklist USING btree (engine_id);


        --
        -- Name: _pk_engine__application@engine_id,application_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE UNIQUE INDEX "_pk_engine__application@engine_id,application_id" ON job_new.engine__application USING btree (engine_id, application_id);


        --
        -- Name: idx_build__version; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX idx_build__version ON job_new.build USING btree (version DESC) WHERE (build_state <> 'deleted'::public.build_state);


        --
        -- Name: idx_export_request__org_id_created_date_time; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX idx_export_request__org_id_created_date_time ON job_new.export_request USING btree (organization_id, status, created_date_time DESC);


        --
        -- Name: idx_job__recording_id_active_not_tmpl; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX idx_job__recording_id_active_not_tmpl ON job_new.job USING btree (recording_id) WHERE ((deleted_date_time IS NULL) AND (is_template = false));


        --
        -- Name: idx_oecb_org_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX idx_oecb_org_id ON job_new.organization__engine_category_blacklist USING btree (organization_id);


        --
        -- Name: idx_task__job_id_template; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX idx_task__job_id_template ON job_new.task USING btree (job_id) WHERE (is_template = true);


        --
        -- Name: idx_task_created_date_time; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX idx_task_created_date_time ON job_new.task USING btree (created_date_time);


        --
        -- Name: idx_task_modified_date_time; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX idx_task_modified_date_time ON job_new.task USING btree (modified_date_time);


        --
        -- Name: idx_task_recording_id; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX idx_task_recording_id ON job_new.task USING btree (recording_id);


        --
        -- Name: ix_engine_validation_contract; Type: INDEX; Schema: job_new; Owner: postgres
        --

        CREATE INDEX ix_engine_validation_contract ON job_new.engine_category USING btree (validation_contract);


        --
        -- Name: _ix_libraries.entity@deleted_date_time,library_id,name; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_libraries.entity@deleted_date_time,library_id,name" ON libraries.entity USING btree ((COALESCE(deleted_date_time, 0)), library_id, lower(name));


        --
        -- Name: _ix_libraries.entity@library_id,is_published; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.entity@library_id,is_published" ON libraries.entity USING btree (library_id, is_published) WHERE (deleted_date_time IS NULL);


        --
        -- Name: _ix_libraries.entity_identifier@deleted_date_time,entity_id,cre; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.entity_identifier@deleted_date_time,entity_id,cre" ON libraries.entity_identifier USING btree (deleted_date_time, entity_id, created_date_time DESC);


        --
        -- Name: _ix_libraries.entity_identifier@entity_id,entity_identifier_typ; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.entity_identifier@entity_id,entity_identifier_typ" ON libraries.entity_identifier USING btree (entity_id, entity_identifier_type_id) WHERE (deleted_date_time IS NULL);


        --
        -- Name: _ix_libraries.entity_identifier@entity_id,priority; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.entity_identifier@entity_id,priority" ON libraries.entity_identifier USING btree (entity_id, priority) WHERE (deleted_date_time IS NULL);


        --
        -- Name: _ix_libraries.library@deleted_date_time,library_id,version; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.library@deleted_date_time,library_id,version" ON libraries.library USING btree (deleted_date_time, library_id, version);


        --
        -- Name: _ix_libraries.library@library_type_id; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.library@library_type_id" ON libraries.library USING btree (library_type_id) WHERE (deleted_date_time IS NULL);


        --
        -- Name: _ix_libraries.library_collaborator@deleted_date_time,library_id; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_libraries.library_collaborator@deleted_date_time,library_id" ON libraries.library_collaborator USING btree ((COALESCE(deleted_date_time, 0)), library_id, collaborator_org_id);


        --
        -- Name: _ix_libraries.library_collaborator@library_id,status; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.library_collaborator@library_id,status" ON libraries.library_collaborator USING btree (library_id, status) WHERE (deleted_date_time IS NULL);


        --
        -- Name: _ix_libraries.library_engine_model@deleted_date_time,library_id; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_libraries.library_engine_model@deleted_date_time,library_id" ON libraries.library_engine_model USING btree ((COALESCE(deleted_date_time, 0)), library_id, library_version, engine_id);


        --
        -- Name: _ix_libraries.library_engine_model@library_id,created_date_time; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.library_engine_model@library_id,created_date_time" ON libraries.library_engine_model USING btree (library_id, created_date_time DESC) WHERE (deleted_date_time IS NULL);


        --
        -- Name: _ix_libraries.library_engine_model@library_id,engine_id; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.library_engine_model@library_id,engine_id" ON libraries.library_engine_model USING btree (library_id, engine_id) WHERE (deleted_date_time IS NULL);


        --
        -- Name: _ix_libraries.library_engine_model@library_id,train_status; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX "_ix_libraries.library_engine_model@library_id,train_status" ON libraries.library_engine_model USING btree (library_id, train_status) WHERE (deleted_date_time IS NULL);


        --
        -- Name: _ix_libraries.lt_eit@library_type_id,entity_identifier_type_id; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE UNIQUE INDEX "_ix_libraries.lt_eit@library_type_id,entity_identifier_type_id" ON libraries.library_type__entity_identifier_type USING btree (library_type_id, entity_identifier_type_id);


        --
        -- Name: library__recording_library_id_idx; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX library__recording_library_id_idx ON libraries.library__recording USING btree (library_id);


        --
        -- Name: library_id; Type: INDEX; Schema: libraries; Owner: postgres
        --

        CREATE INDEX library_id ON libraries.model_configurations USING btree (library_id);

        --
        -- Name: _ix_recording.asset@recording_id,json->createdDateTime; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX "_ix_recording.asset@recording_id,json->createdDateTime" ON recording.asset USING btree (recording_id, ((json -> 'createdDateTime'::text)));


        --
        -- Name: _ix_recording.recording@application_id,created_date_time; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX "_ix_recording.recording@application_id,created_date_time" ON recording.recording USING btree (application_id, ((json -> 'created_date_time'::text)) DESC);


        --
        -- Name: _ix_recording.recording_asset@created_date_time; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX "_ix_recording.recording_asset@created_date_time" ON recording.recording_asset USING btree (created_date_time);


        --
        -- Name: _ix_recording.recording_clone@clone_id; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX "_ix_recording.recording_clone@clone_id" ON recording.recording_clone USING btree (clone_id);


        --
        -- Name: _ix_recording.recording_metadata@recording_id; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX "_ix_recording.recording_metadata@recording_id" ON recording.recording_metadata USING btree (recording_id);


        --
        -- Name: _ix_recording_.recording_asset@recording_id; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX "_ix_recording_.recording_asset@recording_id" ON recording.recording_asset USING btree (recording_id);


        --
        -- Name: _ix_recording_created_date_time@recording; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX "_ix_recording_created_date_time@recording" ON recording.recording USING btree (created_date_time);


        --
        -- Name: idx_recording__source_id; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX idx_recording__source_id ON recording.recording__source USING btree (recording_id);


        --
        -- Name: idx_recording_appid_created_date; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX idx_recording_appid_created_date ON recording.recording USING btree (application_id, created_date_time DESC);


        --
        -- Name: idx_recording_appid_start_date2; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX idx_recording_appid_start_date2 ON recording.recording USING btree (application_id, start_date_time);


        --
        -- Name: idx_recording_media_streamer2; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX idx_recording_media_streamer2 ON recording.recording USING btree (source_id, ((json -> 'createdDateTime'::text)), ((json ->> 'stopDateTime'::text)), ((json ->> 'startDateTime'::text)));


        --
        -- Name: recording_source_id_idx; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX recording_source_id_idx ON recording.recording USING btree (source_id);


        --
        -- Name: recording_source_id_stop; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX recording_source_id_stop ON recording.recording USING btree (source_id, stop_date_time DESC);


        --
        -- Name: recording_start_date_time_idx; Type: INDEX; Schema: recording; Owner: postgres
        --

        CREATE INDEX recording_start_date_time_idx ON recording.recording USING btree (start_date_time);


        --
        -- Name: workflow_runtime_storage_workflow_runtime_id_idx; Type: INDEX; Schema: workflow; Owner: postgres
        --

        CREATE INDEX workflow_runtime_storage_workflow_runtime_id_idx ON workflow.workflow_runtime_storage USING btree (workflow_runtime_id, storage_key varchar_pattern_ops);


        --
        -- Name: job insert_job_status; Type: TRIGGER; Schema: job; Owner: postgres
        --

        CREATE TRIGGER insert_job_status BEFORE INSERT ON job.job FOR EACH ROW EXECUTE PROCEDURE job.insert_job_status_table();


        --
        -- Name: job update_job_modified_date; Type: TRIGGER; Schema: job; Owner: postgres
        --

        CREATE TRIGGER update_job_modified_date BEFORE UPDATE ON job.job FOR EACH ROW EXECUTE PROCEDURE job.update_modified_date_column();


        --
        -- Name: job update_job_status; Type: TRIGGER; Schema: job; Owner: postgres
        --

        CREATE TRIGGER update_job_status BEFORE UPDATE ON job.job FOR EACH ROW EXECUTE PROCEDURE job.update_job_status_table();


        --
        -- Name: job_bundle _fk_job_bundle__cluster_id; Type: FK CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.job_bundle
            ADD CONSTRAINT _fk_job_bundle__cluster_id FOREIGN KEY (cluster_id) REFERENCES aiware.cluster(cluster_id);


        --
        -- Name: node _fk_node__cluster_id; Type: FK CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.node
            ADD CONSTRAINT _fk_node__cluster_id FOREIGN KEY (cluster_id) REFERENCES aiware.cluster(cluster_id);


        --
        -- Name: cluster__preference cluster_preference_fk; Type: FK CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.cluster__preference
            ADD CONSTRAINT cluster_preference_fk FOREIGN KEY (cluster_id) REFERENCES aiware.cluster(cluster_id) ON UPDATE CASCADE ON DELETE CASCADE;


        --
        -- Name: organization__cluster organization__cluster_cluster_id_fkey; Type: FK CONSTRAINT; Schema: aiware; Owner: postgres
        --

        ALTER TABLE ONLY aiware.organization__cluster
            ADD CONSTRAINT organization__cluster_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES aiware.cluster(cluster_id);


        --
        -- Name: callback_handler _fk_callback_handler__engine; Type: FK CONSTRAINT; Schema: engine; Owner: postgres
        --

        ALTER TABLE ONLY engine.callback_handler
            ADD CONSTRAINT _fk_callback_handler__engine FOREIGN KEY (engine_id) REFERENCES engine.engine(engine_id);


        --
        -- Name: engine _fk_engine__task_type; Type: FK CONSTRAINT; Schema: engine; Owner: postgres
        --

        ALTER TABLE ONLY engine.engine
            ADD CONSTRAINT _fk_engine__task_type FOREIGN KEY (engine_id) REFERENCES job.task_type(task_type_id);


        --
        -- Name: event_subscription fk_subscription__action_template_id; Type: FK CONSTRAINT; Schema: event_trigger; Owner: postgres
        --

        ALTER TABLE ONLY event_trigger.event_subscription
            ADD CONSTRAINT fk_subscription__action_template_id FOREIGN KEY (event_action_template_id) REFERENCES event_trigger.event_action_template(template_id);


        --
        -- Name: task_type _fk_task_type__task_type_category; Type: FK CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.task_type
            ADD CONSTRAINT _fk_task_type__task_type_category FOREIGN KEY (task_type_category_id) REFERENCES job.task_type_category(task_type_category_id);


        --
        -- Name: organization__task_type_blacklist organization__task_type_blacklist_task_type_id_fkey; Type: FK CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.organization__task_type_blacklist
            ADD CONSTRAINT organization__task_type_blacklist_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES job.task_type(task_type_id) ON DELETE CASCADE;


        --
        -- Name: organization__task_type_category_blacklist organization__task_type_category_bla_task_type_category_id_fkey; Type: FK CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.organization__task_type_category_blacklist
            ADD CONSTRAINT organization__task_type_category_bla_task_type_category_id_fkey FOREIGN KEY (task_type_category_id) REFERENCES job.task_type_category(task_type_category_id) ON DELETE CASCADE;


        --
        -- Name: organization__task_type organization__task_type_task_type_id_fkey; Type: FK CONSTRAINT; Schema: job; Owner: postgres
        --

        ALTER TABLE ONLY job.organization__task_type
            ADD CONSTRAINT organization__task_type_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES job.task_type(task_type_id) ON DELETE CASCADE;


        --
        -- Name: benchmark__job _fk_benchmark_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.benchmark__job
            ADD CONSTRAINT _fk_benchmark_id FOREIGN KEY (benchmark_id) REFERENCES job_new.benchmark(benchmark_id);


        --
        -- Name: build__build_capability _fk_build__build_capability__build_capability_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build__build_capability
            ADD CONSTRAINT _fk_build__build_capability__build_capability_id FOREIGN KEY (build_capability_id) REFERENCES job_new.build_capability(build_capability_id) ON DELETE CASCADE;


        --
        -- Name: build__build_capability _fk_build__build_capability__build_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build__build_capability
            ADD CONSTRAINT _fk_build__build_capability__build_id FOREIGN KEY (build_id) REFERENCES job_new.build(build_id) ON DELETE CASCADE;


        --
        -- Name: build__engine_category _fk_build__engine_category__build_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build__engine_category
            ADD CONSTRAINT _fk_build__engine_category__build_id FOREIGN KEY (build_id) REFERENCES job_new.build(build_id) ON DELETE CASCADE;


        --
        -- Name: build__engine_category _fk_build__engine_category__engine_category_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build__engine_category
            ADD CONSTRAINT _fk_build__engine_category__engine_category_id FOREIGN KEY (engine_category_id) REFERENCES job_new.engine_category(engine_category_id) ON DELETE CASCADE;


        --
        -- Name: build _fk_build__engine_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.build
            ADD CONSTRAINT _fk_build__engine_id FOREIGN KEY (engine_id) REFERENCES job_new.engine(engine_id);


        --
        -- Name: engine _fk_engine__engine_category_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine
            ADD CONSTRAINT _fk_engine__engine_category_id FOREIGN KEY (engine_category_id) REFERENCES job_new.engine_category(engine_category_id);


        --
        -- Name: engine_category _fk_engine_category__engine_class_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine_category
            ADD CONSTRAINT _fk_engine_category__engine_class_id FOREIGN KEY (engine_class_id) REFERENCES job_new.engine_class(engine_class_id) ON DELETE RESTRICT;


        --
        -- Name: engine_category _fk_engine_category__engine_type_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine_category
            ADD CONSTRAINT _fk_engine_category__engine_type_id FOREIGN KEY (engine_type_id) REFERENCES job_new.engine_type(engine_type_id);


        --
        -- Name: benchmark _fk_engine_category_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.benchmark
            ADD CONSTRAINT _fk_engine_category_id FOREIGN KEY (engine_category_id) REFERENCES job_new.engine_category(engine_category_id);


        --
        -- Name: benchmark _fk_engine_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.benchmark
            ADD CONSTRAINT _fk_engine_id FOREIGN KEY (baseline_engine_id) REFERENCES job_new.engine(engine_id);


        --
        -- Name: engine__application engine__application_engine_id_fkey; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine__application
            ADD CONSTRAINT engine__application_engine_id_fkey FOREIGN KEY (engine_id) REFERENCES job_new.engine(engine_id) ON DELETE CASCADE;


        --
        -- Name: engine_certification engine_certification_engine_id_fkey; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.engine_certification
            ADD CONSTRAINT engine_certification_engine_id_fkey FOREIGN KEY (engine_id) REFERENCES job_new.engine(engine_id) ON DELETE CASCADE;


        --
        -- Name: job fk_job_pipeline_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.job
            ADD CONSTRAINT fk_job_pipeline_id FOREIGN KEY (job_pipeline_id) REFERENCES job_new.job_pipeline(job_pipeline_id);


        --
        -- Name: task fk_job_pipeline_id; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.task
            ADD CONSTRAINT fk_job_pipeline_id FOREIGN KEY (job_pipeline_id) REFERENCES job_new.job_pipeline(job_pipeline_id);


        --
        -- Name: job job_job_template_id_fkey; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.job
            ADD CONSTRAINT job_job_template_id_fkey FOREIGN KEY (job_template_id) REFERENCES job_new.job(job_id);


        --
        -- Name: organization__engine_blacklist organization__engine_blacklist_engine_id_fkey; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.organization__engine_blacklist
            ADD CONSTRAINT organization__engine_blacklist_engine_id_fkey FOREIGN KEY (engine_id) REFERENCES job_new.engine(engine_id) ON DELETE CASCADE;


        --
        -- Name: organization__engine_category_blacklist organization__engine_category_blacklist_engine_category_id_fkey; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.organization__engine_category_blacklist
            ADD CONSTRAINT organization__engine_category_blacklist_engine_category_id_fkey FOREIGN KEY (engine_category_id) REFERENCES job_new.engine_category(engine_category_id) ON DELETE CASCADE;


        --
        -- Name: organization__engine organization__engine_engine_id_fkey; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.organization__engine
            ADD CONSTRAINT organization__engine_engine_id_fkey FOREIGN KEY (engine_id) REFERENCES job_new.engine(engine_id) ON DELETE CASCADE;


        --
        -- Name: organization__job_pipeline organization__job_pipeline_job_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: job_new; Owner: postgres
        --

        ALTER TABLE ONLY job_new.organization__job_pipeline
            ADD CONSTRAINT organization__job_pipeline_job_pipeline_id_fkey FOREIGN KEY (job_pipeline_id) REFERENCES job_new.job_pipeline(job_pipeline_id);


        --
        -- Name: entity _fk_libraries.entity__libraries.library; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.entity
            ADD CONSTRAINT "_fk_libraries.entity__libraries.library" FOREIGN KEY (library_id) REFERENCES libraries.library(library_id);


        --
        -- Name: entity_identifier _fk_libraries.entity_identifier__libraries.entity; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.entity_identifier
            ADD CONSTRAINT "_fk_libraries.entity_identifier__libraries.entity" FOREIGN KEY (entity_id) REFERENCES libraries.entity(entity_id);


        --
        -- Name: entity_identifier _fk_libraries.entity_identifier__libraries.entity_identifier_ty; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.entity_identifier
            ADD CONSTRAINT "_fk_libraries.entity_identifier__libraries.entity_identifier_ty" FOREIGN KEY (entity_identifier_type_id) REFERENCES libraries.entity_identifier_type(entity_identifier_type_id);


        --
        -- Name: library _fk_libraries.library__libraries.library_type; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library
            ADD CONSTRAINT "_fk_libraries.library__libraries.library_type" FOREIGN KEY (library_type_id) REFERENCES libraries.library_type(library_type_id);


        --
        -- Name: library_collaborator _fk_libraries.library_collaborator__libraries.library; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library_collaborator
            ADD CONSTRAINT "_fk_libraries.library_collaborator__libraries.library" FOREIGN KEY (library_id) REFERENCES libraries.library(library_id);


        --
        -- Name: library_engine_model _fk_libraries.library_engine_model__libraries.library; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library_engine_model
            ADD CONSTRAINT "_fk_libraries.library_engine_model__libraries.library" FOREIGN KEY (library_id) REFERENCES libraries.library(library_id);


        --
        -- Name: library_type__entity_identifier_type _fk_libraries.lt_eit__libraries.entity_identifier_type; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library_type__entity_identifier_type
            ADD CONSTRAINT "_fk_libraries.lt_eit__libraries.entity_identifier_type" FOREIGN KEY (entity_identifier_type_id) REFERENCES libraries.entity_identifier_type(entity_identifier_type_id);


        --
        -- Name: library_type__entity_identifier_type _fk_libraries.lt_eit__libraries.library_type; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library_type__entity_identifier_type
            ADD CONSTRAINT "_fk_libraries.lt_eit__libraries.library_type" FOREIGN KEY (library_type_id) REFERENCES libraries.library_type(library_type_id);


        --
        -- Name: library_engine_model configuration_id; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library_engine_model
            ADD CONSTRAINT configuration_id FOREIGN KEY (configuration_id) REFERENCES libraries.model_configurations(configuration_id);


        --
        -- Name: dataset_configurations dataset_configurations_configuration_id_fkey; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.dataset_configurations
            ADD CONSTRAINT dataset_configurations_configuration_id_fkey FOREIGN KEY (configuration_id) REFERENCES libraries.model_configurations(configuration_id) ON DELETE CASCADE;


        --
        -- Name: library__recording library__recording_library_id_fkey; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library__recording
            ADD CONSTRAINT library__recording_library_id_fkey FOREIGN KEY (library_id) REFERENCES libraries.library(library_id) ON DELETE CASCADE;


        --
        -- Name: library__recording library__recording_recording_id_fkey; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.library__recording
            ADD CONSTRAINT library__recording_recording_id_fkey FOREIGN KEY (recording_id) REFERENCES recording.recording(recording_id) ON DELETE CASCADE;


        --
        -- Name: model_configurations model_configurations_engine_category_id_fkey; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.model_configurations
            ADD CONSTRAINT model_configurations_engine_category_id_fkey FOREIGN KEY (engine_category_id) REFERENCES job_new.engine_category(engine_category_id);


        --
        -- Name: model_configurations model_configurations_library_id_fkey; Type: FK CONSTRAINT; Schema: libraries; Owner: postgres
        --

        ALTER TABLE ONLY libraries.model_configurations
            ADD CONSTRAINT model_configurations_library_id_fkey FOREIGN KEY (library_id) REFERENCES libraries.library(library_id) ON DELETE CASCADE;


        --
        -- Name: recording_asset _fk_recording.recording_asset@recording_id; Type: FK CONSTRAINT; Schema: recording; Owner: postgres
        --

        ALTER TABLE ONLY recording.recording_asset
            ADD CONSTRAINT "_fk_recording.recording_asset@recording_id" FOREIGN KEY (recording_id) REFERENCES recording.recording(recording_id) ON DELETE CASCADE;


        --
        -- Name: workflow_runtime_storage workflow_runtime_storage_workflow_runtime_fk; Type: FK CONSTRAINT; Schema: workflow; Owner: postgres
        --

        ALTER TABLE ONLY workflow.workflow_runtime_storage
            ADD CONSTRAINT workflow_runtime_storage_workflow_runtime_fk FOREIGN KEY (workflow_runtime_id) REFERENCES workflow.workflow_runtime(workflow_runtime_id);
    


        INSERT INTO job_new.build_capability (build_capability_id,build_capability_key,build_capability_value) VALUES 
        ('0d9c2ea8-876b-455a-8e8c-39f9e6c54d5c','language','en')
        ,('396511c4-b5a4-4e61-bce7-32ae0f5d18e0','language','ro')
        ,('835abe1f-930f-42ba-8dfe-c46ae4cd6616','language','es')
        ;
    
        INSERT INTO job_new.engine_type (engine_type_id,engine_type_name,engine_type_description) VALUES 
        ('0ab2745b-ca6b-43c9-befd-0ef1d28cb96d','Ingestion',NULL)
        ,('fcc22feb-9184-4f53-be5e-7694927864d9','Cognition',NULL)
        ,('b055b3ec-38ef-41c3-bf8a-a672e3a72dae','Aggregator',NULL)
        ;

        INSERT INTO job_new.engine_category (engine_category_id,engine_category_name,engine_category_description,"search",elastic,data_field,icon_class,editable,video_only,"order",created_date,updated_date,library_identifier_types,dependencies,color,engine_class_id,engine_type_id,export_formats) VALUES 
        ('f951fbf9-aa69-47a2-87c8-12dfb51a1f18','Thumbnail','Thumbnail generation for video','{"enabled": false}','{"enabled": false}','thumbnail','icon-thumbnail',false,false,17,1500074668,1500074668,NULL,'{"category": "thumbnail", "dependencies": ["ingestion"]}',NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('6faad6b7-0837-45f9-b161-2f6bf31b7a07','Facial Detection','Detect and Identify multiple faces within rich media content','{"enabled": true, "metadataKey": "face-recognition", "searchFields": {"entityIds": "face-recognition.series.entityId", "libraryIds": "face-recognition.series.libraryId"}, "autocompleteFields": {"entityId": "entityName", "libraryId": "libraryName"}}','{"type": "face-recognition", "enabled": true}','face','icon-face',true,true,5,1491603996,1491603996,'{face}','{"category": "image-detection", "dependencies": ["ingestion", "transcode"]}','#009688',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('17d62b84-8b49-465b-a6be-fe3ea3bc8f05','Fingerprint','Find the same audio by using audio fingerprints','{"enabled": true, "metadataKey": "fingerprint", "searchFields": {"entityIds": "fingerprint.series.entityId", "libraryIds": "fingerprint.series.libraryId"}, "autocompleteFields": {"entityId": "entityName", "libraryId": "libraryName"}}','{"type": "fingerprint", "enabled": true}','fingerprint','icon-finger_print3',false,false,4,1491603996,1491603996,'{audio-recording}','{"category": "fingerprint", "dependencies": []}','#009688',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('892960cb-14c7-4743-a6e2-d6e437d6c5bb','Conductor',NULL,'{"enabled": false}','{"enabled": false}','conductor','icon-conductor',false,false,12,1491603996,1491603996,NULL,NULL,NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('925e8039-5246-4ced-9f2b-b456d0b57ea1','Intracategory',NULL,NULL,NULL,NULL,'icon-intracategory',false,false,NULL,1524770180,1524770180,NULL,NULL,NULL,NULL,'b055b3ec-38ef-41c3-bf8a-a672e3a72dae','[]')
        ,('c1e5f177-ca10-433a-a155-bb5e4872cf9a','Intercategory',NULL,NULL,NULL,NULL,'icon-intercategory',false,false,NULL,1524770180,1524770180,NULL,NULL,NULL,NULL,'b055b3ec-38ef-41c3-bf8a-a672e3a72dae','[]')
        ,('09f48865-c9e5-47b9-be79-8581047477c4','Text to Speech','Convert text to speech','{"enabled": false}','{"enabled": false}','speech',NULL,false,false,18,1521148540,1521148540,NULL,'{"category": "text-to-speech", "dependencies": ["ingestion"]}',NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('c6e07fe3-f15f-48a7-8914-951b852d54d0','Audio Detection','Detect characteristics of sound, including alarms, breaking glass, gunshots and more within audio','{"enabled": true, "metadataKey": "audiodetection-audiosecurity-hpe", "searchField": "audiodetection-audiosecurity-hpe.series.found", "autocompleteField": "audiodetection-audiosecurity-hpe.series.found"}','{"type": "audio-detection", "enabled": true}','audio','icon-audio_det',false,false,8,1491603996,1491603996,NULL,'{"category": "audio-detection", "dependencies": ["ingestion", "transcode"]}','#673AB7',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('203ad7c2-3dbd-45f9-95a6-855f911563d0','Geolocation','Extract Location, acceleration, velocity and altitude from the media','{"enabled": true, "metadataKey": "geolocation", "searchField": "geolocation.series.location"}','{"type": "geolocation", "enabled": true}','geolocation','icon-gps',false,false,10,1491603996,1491603996,NULL,'{"category": "gps", "dependencies": ["ingestion"]}','#3F51B5',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('5a511c83-2cbd-4f2d-927e-cd03803a8a9c','Logo Recognition','Recognize Logos within the Video Media','{"enabled": true, "metadataKey": "logo-recognition", "searchField": "logo-recognition.series.found", "autocompleteField": "logo-recognition.series.found"}','{"type": "logo-recognition", "enabled": true}','logo','icon-logo-detection',false,true,16,1491603996,1491603996,NULL,'{"category": "image-detection", "dependencies": ["ingestion", "transcode"]}','#82B1FF',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923','Translate','Translate transcribed text from one language to another','{"enabled": false}','{"enabled": false}','translate','icon-translation',false,false,7,1491603996,1491603996,NULL,'{"category": "translation", "dependencies": ["transcribe", "bulk-edit-transcript"]}','#FF9800',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('4fef6040-3fb6-4757-9aae-4044e8b46bc9','Search',NULL,'{"enabled": false}','{"enabled": false}','search',NULL,false,false,11,1491603996,1491603996,NULL,NULL,NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('f2554098-f14b-4d81-9be1-41d0f992a22f','Sentiment','Infer the sentiment or emotion being emitted in media','{"enabled": true, "metadataKey": "sentiment-veritone", "searchField": "sentiment-veritone.series.score"}','{"enabled": false}','sentiment','icon-sentiment',false,false,3,1491603996,1491603996,NULL,'{"category": "sentiment", "dependencies": ["transcribe", "bulk-edit-transcript"]}',NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('c96b5d0e-3ce1-4fd7-9c38-d25ddef87a5f','Music Detection','Identify the music playing in the background of media','{"enabled": true, "metadataKey": "gracenote", "searchField": "q"}','{"enabled": false}','music','icon-engine-music-detection',false,false,9,1491603996,1491603996,NULL,NULL,'#673AB7',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('19bfa716-309a-41dc-9dac-d07a1e7008cd','Voice Recognition','Detect and Identify multiple voices within rich media content','{"enabled": false}','{"enabled": false}','voice',NULL,false,false,20,1532372731,1532372731,'{audio-recording}','{"category": "voice-recognition", "dependencies": ["ingestion"]}',NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('4be1a1b2-653d-4eaa-ba18-747a265305d8','Ingestion',NULL,'{"enabled": false}','{"enabled": false}','ingestion','icon-engine-ingestion',false,false,0,1491603996,1491603996,NULL,NULL,NULL,NULL,NULL,'[]')
        ,('70e54f46-7586-4ff1-876c-5f918357aec6','Reduction','Combine engine outputs from multiple segments','{"enabled": false}','{"enabled": false}','reducer','icon-reduction',false,false,98,1501470675,1501470675,NULL,NULL,NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('581dbb32-ea5b-4458-bd15-8094942345e3','Transcode',NULL,'{"enabled": false}','{"enabled": false}','transcode','icon-engine-transcode',false,false,1,1491603996,1491603996,NULL,'{"category": "transcode", "dependencies": ["ingestion"]}',NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('3b4ac603-9bfa-49d3-96b3-25ca3b502325','Text Recognition','Recognize Text within the Video Media','{"enabled": true, "metadataKey": "text-recognition", "searchField": "text-recognition.series.ocrtext.fulltext", "autocompleteField": "text-recognition.series.found"}','{"type": "text-recognition", "enabled": true}','ocr','icon-ocr',false,true,15,1491603996,1491603996,NULL,'{"category": "text-recognition", "dependencies": ["ingestion", "transcode"]}','#FF9800',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('935c4838-dcf6-415c-99c4-5ceb0a8944be','Station Playout','Find ads and songs for radio station mentions','{"enabled": true, "metadataKey": "next-radio", "searchFields": {"endDate": "next-radio.series.absoluteEnd", "station": "next-radio.documentCommon.station", "duration": "next-radio.series.duration", "spotType": "next-radio.series.spotType", "eventType": "next-radio.series.nextRadioEventType", "songAlbum": "next-radio.series.songAlbum", "songTitle": "next-radio.series.songTitle", "startDate": "next-radio.series.absoluteStart", "advertiser": "next-radio.series.advertiser", "songArtist": "next-radio.series.songArtist", "advertiserFulltext": "next-radio.series.advertiser.fulltext"}, "autocompleteFields": {"station": "next-radio.documentCommon.station", "spotType": "next-radio.series.spotType", "eventType": "next-radio.series.nextRadioEventType", "songAlbum": "next-radio.series.songAlbum", "songTitle": "next-radio.series.songTitle", "advertiser": "next-radio.series.advertiser", "songArtist": "next-radio.series.songArtist", "advertiserFulltext": "next-radio.series.advertiser"}}','{"type": "next-radio", "enabled": true}','stationPlayout','icon-station-playout',false,false,14,1490754945,1490754945,NULL,'{"category": "station-playout", "dependencies": ["ingestion"]}',NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('3b3cfe77-da94-4362-9ac2-3ed89747a68b','Human','Tasks to be performed by humans','{"enabled": false}','{"enabled": false}','human',NULL,false,false,99,1496953673,1496953673,NULL,'{"category": "human", "dependencies": ["ingestion"]}','#E91E63',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('088a31be-9bd6-4628-a6f0-e4004e362ea0','Object Detection','Recognize Object and Logos within the Video Media','{"enabled": true, "metadataKey": "object-recognition", "searchField": "object-recognition.series.found", "autocompleteField": "object-recognition.series.found"}','{"type": "object-recognition", "enabled": true}','object','icon-object_detection',false,true,6,1491603996,1491603996,'{image}','{"category": "image-detection", "dependencies": ["ingestion", "transcode"]}','#82B1FF',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('0b10da6b-3485-496c-a2cb-aabf59a6352d','Push',NULL,NULL,NULL,NULL,'icon-push',false,false,NULL,1524770180,1524770180,NULL,NULL,NULL,NULL,'0ab2745b-ca6b-43c9-befd-0ef1d28cb96d','[]')
        ,('4b150c85-82d0-4a18-b7fb-63e4a58dfcce','Pull',NULL,NULL,NULL,NULL,'icon-pull',false,false,NULL,1524770180,1524770180,NULL,NULL,NULL,NULL,'0ab2745b-ca6b-43c9-befd-0ef1d28cb96d','[]')
        ,('a70df3f6-84a7-4570-b8f4-daa122127e37','Correlation','Correlates structured data to recordings','{"enabled": false}','{"enabled": false}','correlation','icon-correlation',false,false,19,1491603996,1491603996,NULL,NULL,NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('c5458876-43d2-41e8-a340-f734702df04a','Workflow','','{"enabled": false}','{"enabled": false}','workflow','icon-workflow',false,false,21,1547762180,1547762180,NULL,'{"category": "workflow", "dependencies": []}',NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[]')
        ,('67cd4dd0-2f75-445d-a6f0-2f297d6cd182','Transcription','Convert the spoken word into readable text','{"enabled": true, "searchField": "q"}','{"enabled": false}','transcript','icon-transcription',true,false,2,1491603996,1491603996,NULL,'{"category": "transcribe", "dependencies": ["ingestion", "transcode"]}','#E91E63',NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[{"label": "Plain Text", "types": [], "format": "txt"}, {"label": "Time Text Markup Language", "types": [], "format": "ttml"}, {"label": "WebVTT", "types": ["subtitle"], "format": "vtt"}, {"label": "SubRip Text", "types": ["subtitle"], "format": "srt"}]')
        ,('a856c447-1030-4fb0-917f-08179f949c4e','Speaker Separation','Detect the change in speakers within your transcription results','{"enabled": false}','{"enabled": false}','speaker','icon-speaker-separation',false,false,21,1540784900,1540784900,NULL,'{"category": "speaker", "dependencies": ["transcribe"]}',NULL,NULL,'fcc22feb-9184-4f53-be5e-7694927864d9','[{"label": "Plain Text", "types": [], "format": "txt"}, {"label": "Time Text Markup Language", "types": [], "format": "ttml"}, {"label": "WebVTT", "types": ["subtitle"], "format": "vtt"}, {"label": "SubRip Text", "types": ["subtitle"], "format": "srt"}]')
        ;


        ---- ENGINES ----
        --
        -- Data for Name: engine; Type: TABLE DATA; Schema: job_new; Owner: postgres
        --

        -- mention-generate
        INSERT INTO job_new.engine (
            engine_id,
            engine_category_id,
            engine_name,
            engine_description,
            engine_state,
            deployment_model,
            owner_organization_id,
            is_public,
            price,
            core_job_data,
            fields,
            creates_recording,
            library_required,
            engine_currency
        ) VALUES (
            'mention-generate',
            '4fef6040-3fb6-4757-9aae-4044e8b46bc9',
            'mention-generate',
            '',
            'active',
            1,
            1, -- TODO: Assumes org ID 1 is root admin org.  Change for your environment
            TRUE,
            0,
            '{
                "category": "mention-generate",
                "dependencies": [
                    "insert"
                ],
                "waitForAllDepedencyTasksToComplete": true
            }',
            '[]',
            FALSE,
            FALSE,
            'USD'
        );

        -- download-file
        INSERT INTO job_new.engine (
            engine_id,
            engine_category_id,
            engine_name,
            engine_description,
            engine_state,
            deployment_model,
            owner_organization_id,
            is_public,
            price,
            core_job_data,
            fields,
            validation,
            creates_recording,
            engine_currency
        ) VALUES (
            'download-file',
            '4be1a1b2-653d-4eaa-ba18-747a265305d8',
            'Download',
            '',
            'active',
            1,
            1, -- TODO: Assumes org ID 1 is root admin org.  Change for your environment
            TRUE,
            0,
            '{
                "category": "ingestion"
            }',
            '[]',
            '{
                "fileUri": {
                    "format": {
                        "flags": "i",
                        "message": "fileUri must be a valid URL!",
                        "pattern": "(http(s)?://)?(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{2,256}(\\.[a-z]{2,6})?\\b([-a-zA-Z0-9@:%_\\+.~#?&//=]*)"
                    },
                    "presence": true
                },
                "startDateTime": {
                    "presence": true,
                    "numericality": {
                        "noStrings": true,
                        "onlyInteger": true,
                        "greaterThanOrEqualTo": 0
                    }
                }
            }',
            TRUE,
            'USD'
        );

        -- bulk-edit-transcript
        INSERT INTO job_new.engine (
            engine_id,
            engine_category_id,
            engine_name,
            engine_description,
            engine_state,
            deployment_model,
            owner_organization_id,
            is_public,
            price,
            core_job_data,
            fields,
            asset,
            creates_recording,
            library_required,
            engine_currency
        ) VALUES (
            'bulk-edit-transcript',
            '4fef6040-3fb6-4757-9aae-4044e8b46bc9',
            'Bulk Edit Transcript',
            '',
            'active',
            1,
            1, -- TODO: Assumes org ID 1 is root admin org.  Change for your environment
            TRUE,
            0,
            '{
                "category": "bulk-edit-transcript"
            }',
            '[]',
            'manual',
            FALSE,
            FALSE,
            'USD'
        );

        -- insert-into-index
        INSERT INTO job_new.engine (
            engine_id,
            engine_category_id,
            engine_name,
            engine_description,
            engine_state,
            deployment_model,
            owner_organization_id,
            is_public,
            price,
            core_job_data,
            fields,
            creates_recording,
            library_required,
            engine_currency
        ) VALUES (
            'insert-into-index',
            '4fef6040-3fb6-4757-9aae-4044e8b46bc9',
            'Add to Index',
            '',
            'active',
            1,
            1, -- TODO: Assumes org ID 1 is root admin org.  Change for your environment
            TRUE,
            0,
            '{
                "category": "insert",
                "dependencies": [
                    "ingestion",
                    "transcode",
                    "transcribe",
                    "bulk-edit-transcript"
                ]
            }', -- TODO: Dependencies are based on which engine categories are currently defined in your environment.  Tweak appropriately.
            '[]',
            FALSE,
            FALSE,
            'USD'
        );

        -- transcode-ffmpeg Engine
        INSERT INTO job_new.engine (
            engine_id,
            engine_category_id,
            engine_name,
            engine_description,
            engine_state,
            deployment_model,
            owner_organization_id,
            is_public,
            price,
            logo_path,
            core_job_data,
            fields,
            engine_currency
        ) VALUES (
            'transcode-ffmpeg',
            '581dbb32-ea5b-4458-bd15-8094942345e3',
            'Cerebral',
            'Cerebral is our most popular transcoding engine, able to inexpensively create and store files in alternative formats.',
            'active',
            '1',
            '1',
            'true',
            '25',
            'https://s3.amazonaws.com/static.veritone.com/task-logo/engine-alias/Cerebral.png',
            '{
                "category": "transcode",
                "dependencies": [
                    "ingestion"
                ]
            }',
            '[
                {
                    "name": "format",
                    "type": "picklist",
                    "options": [
                        {
                            "key": "",
                            "value": ""
                        },
                        {
                            "key": "mp3",
                            "value": "mp3"
                        },
                        {
                            "key": "mp3 (128 Bit rate)",
                            "value": "mp3, 128"
                        },
                        {
                            "key": "mp3 (256 Bit rate)",
                            "value": "mp3, 256"
                        },
                        {
                            "key": "wav",
                            "value": "wav"
                        },
                        {
                            "key": "wav (8KHz Sample rate)",
                            "value": "wav, 8000"
                        },
                        {
                            "key": "wav (16KHz Sample rate)",
                            "value": "wav, 16000"
                        }
                    ],
                    "description": ""
                },
                {
                    "name": "Channels",
                    "type": "picklist",
                    "options": [
                        {
                            "key": "--",
                            "value": ""
                        },
                        {
                            "key": "Stereo",
                            "value": "stereo"
                        },
                        {
                            "key": "Mono",
                            "value": "mono"
                        }
                    ],
                    "description": ""
                }
            ]',
            'USD'
        );

        -- transcode-ffmpeg
        INSERT INTO job_new.build (
            engine_id,
            build_id,
            version,
            build_state,
            price,
            created_date,
            updated_date,
            deployment_model,
            docker_image,
            task_runtime,
            is_legacy
        ) VALUES ('transcode-ffmpeg',
            'e245361a-9c87-4e58-a695-c3ff829d9e25',
            1,
            'deployed',
            25,
            1491603996,
            1491603996,
            0,
            '',
            '{
                "iron": {
                    "cluster": "<FIXME>",
                    "timeout": 21610,
                    "priority": 0
                }
            }', -- TODO: Replace <FIXME> with the cluster ID for the 2GB+ cluster in your environment
            TRUE
        );

        -- mention-generate
        INSERT INTO job_new.build (
            engine_id,
            build_id,
            version,
            build_state,
            price,
            created_date,
            updated_date,
            deployment_model,
            docker_image,
            task_runtime,
            is_legacy
        ) VALUES ('mention-generate',
            'cdf93fb5-d590-4a2a-9d07-d46bd3077e61',
            1,
            'deployed',
            0,
            1491603996,
            1491603996,
            0,
            '',
            '{
                "iron": {
                    "cluster": "58547f7a3053fe0007d769d3",
                    "priority": 0
                }
            }', -- TODO: Change Cluster ID to the 384MB cluster for your environment
            TRUE
        );

        -- download-file
        INSERT INTO job_new.build (
            engine_id,
            build_id,
            version,
            build_state,
            price,
            created_date,
            updated_date,
            deployment_model,
            docker_image,
            task_runtime,
            is_legacy
        ) VALUES ('download-file',
            '4f7831f4-fc92-4866-9212-9c43abe77e0e',
            1,
            'deployed',
            0,
            1491603996,
            1491603996,
            0,
            '',
            '{
                "iron": {
                    "cluster": "58547f693053fe0007d76962",
                    "priority": 2
                }
            }', -- TODO: Change Cluster ID to the 2GB cluster for your environment
            TRUE
        );

        -- bulk-edit-transcript
        INSERT INTO job_new.build (
            engine_id,
            build_id,
            version,
            build_state,
            price,
            created_date,
            updated_date,
            deployment_model,
            docker_image,
            task_runtime,
            is_legacy
        ) VALUES ('bulk-edit-transcript',
            '2e7d24fc-df7f-41b3-8f9a-74efa7aa5fc2',
            1,
            'deployed',
            0,
            1491603996,
            1491603996,
            0,
            '',
            '{
                "iron": {
                    "cluster": "58547f693053fe0007d76962",
                    "priority": 0
                }
            }', -- TODO: Change cluster ID to the 2GB for your environment
            TRUE
        );

        -- insert-into-index
        INSERT INTO job_new.build (
            engine_id,
            build_id,
            version,
            build_state,
            price,
            created_date,
            updated_date,
            deployment_model,
            docker_image,
            task_runtime,
            is_legacy
        ) VALUES ('insert-into-index',
            'b294792c-7e42-4654-935d-3d61b819a3e9',
            1,
            'deployed',
            0,
            1491603996,
            1491603996,
            0,
            '',
            '{
                "webhook": {
                    "executeUri": "https://api.@@{EXTERNAL_DNS_ZONE}@@/task-insert-server/task"
                }
            }', -- TODO: executeUri is environment-specific.  Change for your environment
            TRUE
        );

        INSERT INTO event_trigger.event_triggers (event_trigger_id,organization_id,event_name,consumer_directive,target_name,consumer_params,created_at_utc,updated_at_utc,created_by,updated_by,event_type) VALUES 
        (2,NULL,'recording_deleted',NULL,'RecordingsTopic',NULL,NULL,NULL,'dliang','dliang',NULL)
        ,(3,NULL,'recording_cognition_completed',NULL,'RecordingsTopic',NULL,NULL,NULL,'dliang','dliang',NULL)
        ,(18,NULL,'recording_inserted',NULL,'MentionsGenerateMedia',NULL,NULL,NULL,'jtruong','jtruong',NULL)
        ,(4,NULL,'structured_data_create',NULL,'StructuredDataTopic',NULL,NULL,NULL,NULL,'avershinin',NULL)
        ,(5,NULL,'structured_data_update',NULL,'StructuredDataTopic',NULL,NULL,NULL,NULL,'avershinin',NULL)
        ,(1,NULL,'structured_data_registry_create',NULL,'StructuredDataTopic',NULL,'2018-03-30 08:15:19.723','2018-03-30 08:15:19.723','avershinin','avershinin',NULL)
        ,(440,NULL,'watchlist_updated',NULL,'MentionsGenerateWatchlist',NULL,NULL,NULL,'sminkov','sminkov','')
        ,(6,NULL,'engine_build_deploy_success',NULL,'EngineTopic',NULL,'2018-06-07 18:04:29.910','2018-06-07 18:04:29.910','dliang','dliang',NULL)
        ,(7,NULL,'engine_build_deploy_fail',NULL,'EngineTopic',NULL,'2018-06-07 18:04:37.458','2018-06-07 18:04:37.458','dliang','dliang',NULL)
        ,(8,NULL,'engine_build_upload_completed',NULL,'EngineTopic',NULL,'2018-06-07 18:05:08.374','2018-06-07 18:05:08.374','jyang','jyang',NULL)
        ,(9,NULL,'engine_build_manifest_submitted',NULL,'EngineTopic',NULL,'2018-06-07 18:05:13.124','2018-06-07 18:05:13.124','jyang','jyang',NULL)
        ,(10,NULL,'engine_build_manifest_processed',NULL,'EngineTopic',NULL,'2018-06-07 18:05:20.485','2018-06-07 18:05:20.485','jyang','jyang',NULL)
        ,(11,NULL,'engine_build_vulnerability_check',NULL,'EngineTopic',NULL,'2018-06-07 18:05:20.485','2018-06-07 18:05:20.485','jyang','jyang',NULL)
        ,(12,NULL,'engine_build_vulnerability_checked',NULL,'EngineTopic',NULL,'2018-06-07 18:05:30.267','2018-06-07 18:05:30.267','jyang','jyang',NULL)
        ,(13,NULL,'engine_build_tests_run',NULL,'EngineTopic',NULL,'2018-06-07 18:05:30.267','2018-06-07 18:05:30.267','jyang','jyang',NULL)
        ,(14,NULL,'engine_build_test_report_done',NULL,'EngineTopic',NULL,'2018-06-07 18:05:34.767','2018-06-07 18:05:34.767','jyang','jyang',NULL)
        ,(15,NULL,'engine_build_deploy',NULL,'EngineTopic',NULL,'2018-06-07 18:05:34.767','2018-06-07 18:05:34.767','jyang','jyang',NULL)
        ,(441,NULL,'watchlist_created',NULL,'MentionsGenerateWatchlist',NULL,NULL,NULL,'sminkov','sminkov','')
        ,(40,NULL,'export_request',NULL,'EngineOutput',NULL,'2018-08-21 13:43:13.093','2018-08-21 13:43:13.093','jyang','jyang','')
        ,(22,NULL,'task_queued',NULL,'TaskTopic',NULL,'2018-07-17 11:48:13.498','2018-07-17 11:48:13.498','jyang','jyang',NULL)
        ,(23,NULL,'task_updated',NULL,'TaskTopic',NULL,'2018-07-17 11:48:13.498','2018-07-17 11:48:13.498','jyang','jyang',NULL)
        ,(41,NULL,'mention_inserted',NULL,'MentionSync',NULL,'2018-08-29 09:51:10.226','2018-08-29 09:51:10.226','sngo','sngo','mention')
        ,(42,NULL,'mention_deleted',NULL,'MentionSync',NULL,'2018-08-29 09:51:10.233','2018-08-29 09:51:10.233','sngo','sngo','mention')
        ,(43,NULL,'mention_updated',NULL,'MentionSync',NULL,'2018-08-29 09:51:10.235','2018-08-29 09:51:10.235','sngo','sngo','mention')
        ,(468,NULL,'asset_upload',NULL,'AssetsTopic',NULL,'2019-01-10 17:23:55.427','2019-01-10 17:23:55.427','jebenezer','jebenezer','asset')
        ,(301,-1,'correlate_tdo',NULL,'CorrelationTopic',NULL,'2018-10-30 15:01:43.151','2018-10-30 15:01:43.151','jebenezer','jebenezer','correlation')
        ,(432,NULL,'mention_export_request',NULL,'MentionExport',NULL,'2018-12-12 16:44:45.119','2018-12-12 16:44:45.119','ndthang','ndthang','export')
        ;

        INSERT INTO libraries.entity_identifier_type (entity_identifier_type_id,label,icon_class,data_type,label_plural,description) VALUES 
        ('face','Face','icon-face','image','faces','face images')
        ,('audio-recording','audio file','icon-mic','audio','audio files','audio recordings')
        ,('dataset','dataset',NULL,'tdo','datasets','temporal data objects')
        ,('image','image','icon-panorama','image','images','general images')
        ;


        INSERT INTO libraries.library_type (library_type_id,label,icon_class,entity_type_name_plural,entity_type_name,entity_type_schema) VALUES 
        ('people','People',NULL,'people','person','{}')
        ,('audio','Audio',NULL,'audio clips','audio clip','{}')
        ,('suspect','Suspect',NULL,'suspects','suspect','{"required": [], "properties": {"race": {"enum": ["American Indian or Alaska Native", "Asian", "Black or African American", "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "White", "Other"], "type": "string", "title": "Race"}, "caseId": {"type": "string", "title": "Case ID"}, "gender": {"enum": ["Male", "Female"], "type": "string", "title": "Gender"}, "eyeColor": {"enum": ["Blue", "Brown", "Gray", "Hazel", "Green"], "type": "string", "title": "Eye Color"}, "hairColor": {"enum": ["Black", "Brown", "Blonde", "Red", "Gray or White", "Other"], "type": "string", "title": "Hair Color"}, "suspectId": {"type": "string", "title": "Suspect ID"}, "approximateHeight": {"type": "string", "title": "Approximate Height"}, "approximateWeight": {"type": "string", "title": "Approximate Weight"}, "investigatingAgency": {"type": "string", "title": "Investigating Agency"}, "investigatingOfficerName": {"type": "string", "title": "Investigating Officer Name"}, "investigatingOfficerEmail": {"type": "string", "title": "Investigating Officer Email"}, "investigatingOfficerPhone": {"type": "string", "title": "Investigating Officer Phone"}}}')
        ,('ad','Ad',NULL,'ads','ad','{"required": ["spotType"], "properties": {"isci": {"type": "string", "title": "ISCI", "pattern": "^[a-zA-Z0-9]+$"}, "spotType": {"enum": ["Live :05", "Live :10", "Live :15", "Live :30", "Live :60", "Voiced :05", "Voiced :10", "Voiced :15", "Voiced :30", "Voiced :60", "Non Voiced :05", "Non Voiced :10", "Non Voiced :15", "Non Voiced :30", "Non Voiced :60", "MicroMention", "Bonus"], "type": "string", "title": "Spot Type", "default": "Voiced :30"}, "advertiser": {"type": "string", "title": "Advertiser", "minLength": 2}}}')
        ,('dataset','Dataset',NULL,'datasets','dataset','{}')
        ,('vtn-surveillance-target','Veritone Surveillance Target',NULL,'veritone surveillance targets','veritone surveillance target','{"required": [], "properties": {"type": {"enum": ["Guest", "Employee"], "type": "string", "title": "Type"}, "gender": {"enum": ["Male", "Female"], "type": "string", "title": "Gender"}, "website": {"type": "string", "title": "Website"}, "dateOfBirth": {"type": "string", "title": "Date Of Birth"}, "twitterUsername": {"type": "string", "title": "Twitter Username"}}}')
        ,('people-known-offender','IDentify - Known Offender',NULL,'known offenders','known offender','{"properties": {"age": {"type": "string", "title": "Age", "minimum": 0}, "race": {"enum": ["American Indian or Alaska Native", "Asian", "Black or African American", "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "White", "Other"], "type": "string", "title": "Race"}, "gender": {"enum": ["Male", "Female"], "type": "string", "title": "Gender"}, "height": {"type": "string", "title": "Height in Inches"}, "weight": {"type": "string", "title": "Weight"}, "eyeColor": {"enum": ["Blue", "Brown", "Gray", "Hazel", "Green"], "type": "string", "title": "Eye Color"}, "lastName": {"type": "string", "title": "Last Name"}, "bookingId": {"type": "string", "title": "Booking ID"}, "firstName": {"type": "string", "title": "First Name"}, "hairColor": {"enum": ["Black", "Brown", "Blonde", "Red", "Gray or White", "Other"], "type": "string", "title": "Hair Color"}, "suspectId": {"type": "string", "title": "Suspect ID"}, "middleName": {"type": "string", "title": "Middle Name"}, "bookingDate": {"type": "string", "title": "Booking Date"}, "dateOfBirth": {"type": "string", "title": "Date of Birth"}, "knownAliases": {"type": "string", "title": "Known Aliases"}, "lastKnownAddress": {"type": "string", "title": "Last Known Address"}}}')
        ,('people-of-interest','IDentify - People of Interest',NULL,'people of interest','person of interest','{"properties": {"age": {"type": "string", "title": "Age", "minimum": 0}, "race": {"enum": ["American Indian", "Asian", "Black or African American", "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "Mixed Race", "White", "Other"], "type": "string", "title": "Race"}, "gender": {"enum": ["Male", "Female"], "type": "string", "title": "Gender"}, "height": {"type": "string", "title": "Height In Inches"}, "eyeColor": {"enum": ["Blue", "Brown", "Grey", "Hazel", "Green", "Other"], "type": "string", "title": "Eye Color"}, "hairColor": {"enum": ["Black", "Brown", "Blonde", "Red", "Gray-White", "Bald", "Other"], "type": "string", "title": "Hair Color"}}}')
        ,('object','Object',NULL,'objects','object','{}')
        ;


        INSERT INTO libraries.library_type__entity_identifier_type (library_type_id,entity_identifier_type_id,min_items,max_items) VALUES 
        ('people','face',NULL,NULL)
        ,('audio','audio-recording',NULL,NULL)
        ,('suspect','face',NULL,NULL)
        ,('dataset','dataset',NULL,NULL)
        ,('ad','audio-recording',1,1)
        ,('people-known-offender','face',NULL,NULL)
        ,('people-of-interest','face',NULL,NULL)
        ,('object','image',NULL,NULL)
        ;


        -- From database repo.
        PERFORM extract(millennium from now());

        INSERT
            INTO
                event_trigger.event_triggers ( event_trigger_id, organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, event_type, created_by )
            VALUES( 441, NULL, 'watchlist_created', NULL, 'MentionsGenerateWatchlist', NULL, NULL, NULL, 'sminkov', '', 'sminkov' )
            ON CONFLICT DO NOTHING;

        INSERT
            INTO
                event_trigger.event_triggers ( event_trigger_id, organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, event_type, created_by )
            VALUES( 440, NULL, 'watchlist_updated', NULL, 'MentionsGenerateWatchlist', NULL, NULL, NULL, 'sminkov', '', 'sminkov' )
            ON CONFLICT DO NOTHING;


        ALTER TABLE recording.recording_asset ADD COLUMN IF NOT EXISTS user_edited BOOLEAN;

        create table if not exists aiware.organization__cluster (
            organization_id integer not null,
            cluster_id text not null references aiware.cluster (cluster_id),
            primary key (organization_id, cluster_id)
        );

        alter table aiware.cluster
        add column if not exists bypass_allowed_engines boolean,
        ADD COLUMN if not exists "default_cluster" bool DEFAULT false, --SINCE NO DB SCRIPTS EXISTS IN VERITONE'S DATA BASE REPO FOR THIS CUSTOM DEFINED COLLUMN MANUALLY ADD IN NOW INTO ON-PREM
        ADD COLUMN IF NOT EXISTS "cluster_type" "aiware"."cluster_type"; --SINCE NO DB SCRIPTS EXISTS FOR THIS CUSTOM DEFINED COLLUMN MANUALLY ADD IN NOW INTO ON-PREM

        INSERT INTO job_new.engine_category (
            "engine_category_id",
            "engine_category_name",
            "engine_category_description",
            "search",
            "elastic",
            "data_field",
            "icon_class",
            "editable",
            "video_only",
            "order",
            "created_date",
            "updated_date",
            "library_identifier_types",
            "dependencies",
            "color",
            "engine_class_id",
            "engine_type_id"
        ) VALUES (
            '19bfa716-309a-41dc-9dac-d07a1e7008cd',
            'Voice Recognition',
            'Detect and Identify multiple voices within rich media content',
            '{"enabled": false}',
            '{"enabled": false}',
            'voice',
            NULL,
            FALSE,
            FALSE,
            20,
            1532372731,
            1532372731,
            '{audio-recording}',
            '{"category": "voice-recognition", "dependencies": ["ingestion"]}',
            NULL,
            NULL,
            'fcc22feb-9184-4f53-be5e-7694927864d9'
        ) ON CONFLICT (engine_category_id) DO UPDATE SET (
            "engine_category_id",
            "engine_category_name",
            "engine_category_description",
            "search",
            "elastic",
            "data_field",
            "icon_class",
            "editable",
            "video_only",
            "order",
            "created_date",
            "updated_date",
            "library_identifier_types",
            "dependencies",
            "color",
            "engine_class_id",
            "engine_type_id"
        ) = (
            EXCLUDED.engine_category_id,
            EXCLUDED.engine_category_name,
            EXCLUDED.engine_category_description,
            EXCLUDED.search,
            EXCLUDED.elastic,
            EXCLUDED.data_field,
            EXCLUDED.icon_class,
            EXCLUDED.editable,
            EXCLUDED.video_only,
            EXCLUDED.order,
            EXCLUDED.created_date,
            EXCLUDED.updated_date,
            EXCLUDED.library_identifier_types,
            EXCLUDED.dependencies,
            EXCLUDED.color,
            EXCLUDED.engine_class_id,
            EXCLUDED.engine_type_id
        );


        ALTER TABLE job_new.engine_category ADD COLUMN IF NOT EXISTS export_formats JSONB not null default '[]'::JSONB;

        alter table job_new.job add column if not exists job_config jsonb;

        alter table recording.recording add column IF NOT EXISTS is_public boolean;
        alter table recording.recording add column IF NOT EXISTS source_id TEXT;
        ALTER TABLE recording.recording ADD COLUMN IF NOT EXISTS created_date_time timestamptz null;
        ALTER TABLE recording.recording ADD COLUMN IF NOT EXISTS modified_date_time timestamptz null;
        ALTER TABLE recording.recording ADD COLUMN IF NOT EXISTS start_date_time timestamptz null;
        ALTER TABLE recording.recording ADD COLUMN IF NOT EXISTS stop_date_time timestamptz null;
        ALTER TABLE recording.recording ADD COLUMN IF NOT EXISTS scheduled_job_id TEXT;
        ALTER TABLE recording.recording ADD COLUMN IF NOT EXISTS organization_id int4;

        CREATE TABLE IF NOT EXISTS job_new.export_request (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            organization_id int4 NOT NULL,
            status TEXT NOT NULL,
            requestor_id TEXT NOT NULL,
            asset_uri TEXT,
            created_date_time timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
            modified_date_time timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
            event_payload JSONB
        );

        update "libraries"."library_type" set "library_type_id"='people-known-offender', "label"='People - Known Offender', "icon_class"=null, "entity_type_name_plural"='known offenders', "entity_type_name"='known offender', "entity_type_schema"='{"required":[],"properties":{"bookingId":{"type":"string","title":"Booking ID"},"bookingDate":{"type":"string","title":"Booking Date"},"suspectId":{"type":"string","title":"Suspect ID"},"lastName":{"type":"string","title":"Last Name"},"firstName":{"type":"string","title":"First Name"},"middleName":{"type":"string","title":"Middle Name"},"gender":{"enum":["Male","Female"],"type":"string","title":"Gender"},"race":{"enum":["American Indian or Alaska Native","Asian","Black or African American","Hispanic or Latino","Native Hawaiian or Other Pacific Islander","White","Other"],"type":"string","title":"Race"},"age":{"type":"string","title":"Age","minimum":0},"height":{"type":"string","title":"Height"},"weight":{"type":"string","title":"Weight"},"hairColor":{"enum":["Black","Brown","Blonde","Red","Gray or White","Other"],"type":"string","title":"Hair Color"},"eyeColor":{"enum":["Blue","Brown","Gray","Hazel","Green"],"type":"string","title":"Eye Color"},"dateOfBirth":{"type":"string","title":"Date of Birth"},"knownAliases":{"type":"string","title":"Known Aliases"},"lastKnownAddress":{"type":"string","title":"Last Known Address"}}}' where "library_type_id"='people-known-offender';

        INSERT INTO job_new.engine ("engine_id","engine_category_id","engine_name","engine_description","engine_state","deployment_model","owner_organization_id","is_public","price","rating","website","logo_path","order","dependency","core_job_data","fields","validation","application_id","asset","creates_recording","deleted","created_date","updated_date","library_required","icon_path","engine_currency","engine_alias_id","engine_alias_name","engine_alias_description","engine_alias_logo_path","jwt_rights")
            VALUES
            ('61b28b11-ca2e-4825-962e-4a9312f15aa0','4b150c85-82d0-4a18-b7fb-63e4a58dfcce','Amazon S3 Adapter','Amazon S3 Adapter','active',1,@@{ROOT_ORG_ID}@@,FALSE,NULL,NULL,NULL,'https://www.filepicker.io/api/file/7dF2QTBgSEaEZ1zLkCuL',NULL,NULL,'{"category": "ingestion"}','[]',NULL,NULL,NULL,TRUE,FALSE,1526881286,1526881286,FALSE,NULL,'USD','61b28b11-ca2e-4825-962e-4a9312f15aa0',NULL,NULL,NULL,'{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}')
            ON CONFLICT DO NOTHING;

        UPDATE job_new.engine
            SET engine_alias_id = engine_id, jwt_rights = '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
            WHERE engine_id IN (
            '7dc1ee44-32f3-499a-9b7b-d040440e5e9a', -- Dropbox
            'b79d94cc-5b95-4bbd-ac01-f54b147f406f', -- Google Drive
            '8e1e1f59-67ef-41d8-a7f4-5e797884618c', -- FTP
            '2e701651-4b5a-4462-8dfc-8005dc42bda6', -- YouTube
            '61b28b11-ca2e-4825-962e-4a9312f15aa0', -- S3
            '9b4357b3-93bc-4886-bc62-53384eede9f5', -- RSS
            '447a3128-6348-4644-99d9-22401322b46b', -- SIP
            'b82077b1-4755-4ee1-9f40-c589ae0ba1a5', -- OneDrive
            '3bfcd954-7c0c-4456-903d-28e37caee711', -- Box
            '829846b5-3c87-4c22-a890-e80c82cc072b', -- Amazon Kinesis Video
            '9e611ad7-2d3b-48f6-a51b-0a1ba40feab4' -- Webstream Adapter
            );

        -- TV and Radio Adapter
        INSERT INTO job_new.engine ("engine_id","engine_category_id","engine_name","engine_description","engine_state","deployment_model","owner_organization_id","is_public","price","rating","website","logo_path","order","dependency","core_job_data","fields","validation","application_id","asset","creates_recording","deleted","created_date","updated_date","library_required","icon_path","engine_currency","engine_alias_id","engine_alias_name","engine_alias_description","engine_alias_logo_path","jwt_rights")
        VALUES
        ('74dfd76b-472a-48f0-8395-c7e01dd7fd24','4b150c85-82d0-4a18-b7fb-63e4a58dfcce','TV and Radio Adapter','Pulls data from TV and Radio streams.','active',1,@@{ROOT_ORG_ID}@@,FALSE,NULL,NULL,NULL,'https://www.filepicker.io/api/file/MSOOWq06TnmWq5TyncOQ',NULL,NULL,NULL,'[]',NULL,NULL,NULL,TRUE,FALSE,1533254106,1533335936,FALSE,NULL,'USD','74dfd76b-472a-48f0-8395-c7e01dd7fd24',NULL,NULL,NULL,'{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}')
        ON CONFLICT DO NOTHING;

        -- Podcast Adapter
        INSERT INTO job_new.engine ("engine_id","engine_category_id","engine_name","engine_description","engine_state","deployment_model","owner_organization_id","is_public","price","rating","website","logo_path","order","dependency","core_job_data","fields","validation","application_id","asset","creates_recording","deleted","created_date","updated_date","library_required","icon_path","engine_currency","engine_alias_id","engine_alias_name","engine_alias_description","engine_alias_logo_path","jwt_rights")
        VALUES
        ('cef516e4-d461-4d17-b01f-6c7bdfcaa204','4b150c85-82d0-4a18-b7fb-63e4a58dfcce','Podcast Adapter','Scans podcasts','active',1,@@{ROOT_ORG_ID}@@,FALSE,NULL,NULL,NULL,'https://www.filepicker.io/api/file/KdCg5PKzQcSOyjOu2tQf',NULL,NULL,NULL,'[]',NULL,NULL,NULL,TRUE,FALSE,1533264371,1533335873,FALSE,NULL,'USD','cef516e4-d461-4d17-b01f-6c7bdfcaa204',NULL,NULL,NULL,'{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}')
        ON CONFLICT DO NOTHING;

        -- Youtube Adapter
        INSERT INTO job_new.engine ("engine_id","engine_category_id","engine_name","engine_description","engine_state","deployment_model","owner_organization_id","is_public","price","rating","website","logo_path","order","dependency","core_job_data","fields","validation","application_id","asset","creates_recording","deleted","created_date","updated_date","library_required","icon_path","engine_currency","engine_alias_id","engine_alias_name","engine_alias_description","engine_alias_logo_path","jwt_rights")
        VALUES
        ('ccf24d4d-e9c0-4dae-887c-d2b5f9cc33cd','4b150c85-82d0-4a18-b7fb-63e4a58dfcce','Youtube Adapter','Pulls data from youtube video streams','active',1,@@{ROOT_ORG_ID}@@,FALSE,NULL,NULL,NULL,'https://www.filepicker.io/api/file/jgKi8cMRbmkwrGn0u3L3',NULL,NULL,NULL,'[]',NULL,NULL,NULL,TRUE,FALSE,1533265780,1533335701,FALSE,NULL,'USD','ccf24d4d-e9c0-4dae-887c-d2b5f9cc33cd',NULL,NULL,NULL,'{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}')
        ON CONFLICT DO NOTHING;

        -- Youtube Channel Adapter
        INSERT INTO job_new.engine ("engine_id","engine_category_id","engine_name","engine_description","engine_state","deployment_model","owner_organization_id","is_public","price","rating","website","logo_path","order","dependency","core_job_data","fields","validation","application_id","asset","creates_recording","deleted","created_date","updated_date","library_required","icon_path","engine_currency","engine_alias_id","engine_alias_name","engine_alias_description","engine_alias_logo_path","jwt_rights")
        VALUES
        ('4b2dadf2-e27a-49b2-9c54-192e0b3e562a','4b150c85-82d0-4a18-b7fb-63e4a58dfcce','Youtube Channel Adapter','Scans youtube channels for videos and pulls their data.','active',1,@@{ROOT_ORG_ID}@@,FALSE,NULL,NULL,NULL,'https://www.filepicker.io/api/file/cj9l7pElQwyJV9x78ibK',NULL,NULL,NULL,'[]',NULL,NULL,NULL,TRUE,FALSE,1533266656,1533335768,FALSE,NULL,'USD','4b2dadf2-e27a-49b2-9c54-192e0b3e562a',NULL,NULL,NULL,'{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}')
        ON CONFLICT DO NOTHING;

        UPDATE job_new.engine
        SET engine_alias_id = engine_id, jwt_rights = '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id IN (
        '74dfd76b-472a-48f0-8395-c7e01dd7fd24', -- TV and Radio Adapter
        'cef516e4-d461-4d17-b01f-6c7bdfcaa204', -- Podcast Adapter
        'ccf24d4d-e9c0-4dae-887c-d2b5f9cc33cd', -- Youtube Adapter 
        '4b2dadf2-e27a-49b2-9c54-192e0b3e562a' -- Youtube Channel Adapter 
        );


        insert into "libraries"."library_type"
        (
        "library_type_id",
        "label",
        "icon_class",
        "entity_type_name_plural",
        "entity_type_name",
        "entity_type_schema"
        ) values (
        'vtn-surveillance-target',
        'Veritone Surveillance Target',
        null,
        'veritone surveillance targets',
        'veritone surveillance target',
        '{"required": [], "properties": {"type": {"enum": ["Guest", "Employee"], "type": "string", "title": "Type"}, "gender": {"enum": ["Male", "Female"], "type": "string", "title": "Gender"}, "website": {"type": "string", "title": "Website"}, "dateOfBirth": {"type": "string", "title": "Date Of Birth"}, "twitterUsername": {"type": "string", "title": "Twitter Username"}}}'
        ) ON CONFLICT (library_type_id)
        DO NOTHING;

        INSERT INTO "event_trigger"."event_triggers"("organization_id","event_name","consumer_directive","target_name","consumer_params","created_at_utc","updated_at_utc","updated_by","created_by")
        VALUES
        (NULL,'export_request',NULL,'EngineOutput',NULL,now(),now(),'jyang','jyang')
        ON CONFLICT(event_trigger_id) DO NOTHING;

        update "job_new"."engine" set "price" = 200 where "engine_id" = '00f5fcf8-1ad5-4a24-9f56-877d398d5050';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '0307bc33-a94a-4fbc-a036-7ecacaca2f06';
        update "job_new"."engine" set "price" = 600 where "engine_id" = '0697ac78-3e65-44f2-abb8-75051ba6377a';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '07517eb1-4350-4228-b350-92d51d2b2294';
        update "job_new"."engine" set "price" = 100 where "engine_id" = '08d8a9b8-1469-4d8d-9a51-7e9292bebf95';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '097ea98f-9998-4799-9f43-ca4424ac7d39';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '0aa59fc0-7a78-4238-ba88-12f7abd021bf';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '0aab1c93-9a55-4e9b-bda3-24d9c48a3d5e';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '0b71a081-8335-4a19-b7a7-7fae5e569a35';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '120244fe-3ea7-435e-85f6-22d9aab614ba';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '136b5eb6-be95-4078-8bda-8306d7e36d94';
        update "job_new"."engine" set "price" = 1200 where "engine_id" = '1548e405-b389-4782-ae0d-b834d2042af7';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '1785518c-f81f-40bc-8ae1-220c70c3db56';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '18c8ccef-ece6-4826-85d2-d0e0302e344e';
        update "job_new"."engine" set "price" = 250 where "engine_id" = '20bdf75f-add6-4f91-9661-fe50fb73b526';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '25928acc-6181-4728-89bd-2da8aa15936d';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '281cf952-1f8a-42e4-bbac-63e2a2a06c48';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '2993bb2d-db36-4943-a8d5-6392f61bb327';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = '2ad6007a-5d7c-4812-be38-47e77e6d6379';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '2afed26c-ead1-4870-987c-5c77c71df428';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = '2dc5166f-c0ad-4d84-8a85-515c42b5d357';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '309d729e-f14a-48da-bd4d-1f92902a8a66';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '33312297-632b-414b-870b-193258a21ffd';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '344d72b7-2495-4e91-8ea3-77d8eee2b505';
        update "job_new"."engine" set "price" = 100 where "engine_id" = '3ae34e3d-bb5d-4c6b-a7a4-4e3d34832f1f';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '3ba8ddea-740d-4d52-889a-7fb97bef1f60';
        update "job_new"."engine" set "price" = 250 where "engine_id" = '3f115b93-97be-46f0-b0f2-7460db15ec34';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '441c9e9b-3232-4911-ac05-05f08e03175d';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '491f2839-85eb-4bad-816f-697edcda97cf';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '4edf4b45-1fde-4030-8833-d8389ee81fc4';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = '514dc8e9-f4ab-463b-b34b-83a419e3a254';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = '523095fd-8f32-4fd6-b7f5-274ffaaaafc7';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '54ff8699-f7fb-4fb1-8b04-3e5840690700';
        update "job_new"."engine" set "price" = 900 where "engine_id" = '56ad6aaa-89c6-47db-ae18-0f77808f0fa7';
        update "job_new"."engine" set "price" = 7000 where "engine_id" = '5a7ac053-e6d5-4e18-8b5c-4a078b5b145d';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '5aeb5be8-b399-4fed-aba3-6e79df8f06df';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '5b4dc573-0403-44fc-8507-ccb38593fdfb';
        update "job_new"."engine" set "price" = 100 where "engine_id" = '5bd4f4c0-bf60-4707-b1e3-084929fd67cb';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '61146261-099a-4e6e-9a12-a8f52583e2dc';
        update "job_new"."engine" set "price" = 600 where "engine_id" = '6496c3f7-b8af-48c7-8c0b-be8162925dc9';
        update "job_new"."engine" set "price" = 250 where "engine_id" = '67340733-66da-49c0-b58a-b22e9d18d8e7';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '67d850c6-9d00-4e2f-909e-64e5153551bd';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '695fa19a-080e-493c-b102-22397e28fb14';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '6d806d7d-8b29-4baa-bcee-8125740fbe8f';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '6de87fa0-1e27-4acd-9179-70914ad38bfc';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '74132097-925f-4191-aa84-60bf6fc813f3';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '74883f04-e906-4a89-b231-a485204c2a4a';
        update "job_new"."engine" set "price" = 900 where "engine_id" = '799155d9-7d48-4b4c-b98f-501e2894abb0';
        update "job_new"."engine" set "price" = 250 where "engine_id" = '7e3a05bc-ac51-45e2-8572-02f9082191b7';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '80172c67-eb3f-4ae1-b6fb-443403304f60';
        update "job_new"."engine" set "price" = 750 where "engine_id" = '80cb683e-003d-4ca7-8203-c2f0a6896efa';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '84dff93a-1fa5-409b-8d1c-9ea2a363e524';
        update "job_new"."engine" set "price" = 250 where "engine_id" = '862ff6b1-6f2d-4684-93ac-1bc069eaa914';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '88fcdc76-b76c-4868-a5d6-e27ae38344ca';
        update "job_new"."engine" set "price" = 100 where "engine_id" = '8b3f945d-21c6-4369-a31f-b00b48c2702e';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '8e87ce87-8d76-4984-8a57-03ee5dad146f';
        update "job_new"."engine" set "price" = 25 where "engine_id" = '9084f686-cf02-41c5-adb5-d48fb6558d77';
        update "job_new"."engine" set "price" = 250 where "engine_id" = '92341c9c-834b-4731-9194-a8d61110e849';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '94324969-bedb-4618-9421-eaac7ec6567b';
        update "job_new"."engine" set "price" = 100 where "engine_id" = '95d62ae8-edc2-4fb9-ad08-fe33646f0ece';
        update "job_new"."engine" set "price" = 200 where "engine_id" = '989aef4b-9501-493a-9470-504e668913b3';
        update "job_new"."engine" set "price" = 125 where "engine_id" = '9c4fe82b-27d4-4770-ba13-05f99e3796a1';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'a022d811-aa63-426d-9750-a2178a8aaf69';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'a26ee62f-0e05-4e31-a2fe-0caac1ecb921';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'a2a3b68e-8986-41dd-a437-f252395b6d87';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'a4da20a9-74f4-4c4c-b946-d0debac814dc';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'a82c4d54-bcfb-4fd8-a46a-cad117b4893b';
        update "job_new"."engine" set "price" = 750 where "engine_id" = 'a9443547-6158-4b17-b736-67f5d4087f70';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'aa152b16-e1b8-40b9-902a-37cb6c4f78be';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'ac7c025b-1df8-4755-a023-6b7ae06d4ea6';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'af72433e-76d1-49b4-855b-758c87c5768d';
        update "job_new"."engine" set "price" = 8500 where "engine_id" = 'b0957a51-9e93-4669-be31-f72d35af84e3';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'b591b262-da85-4e8f-9f3e-bbbf0459ca61';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'b5fae583-eca6-428e-b449-18b8e847d76b';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'b757ab8e-9c1f-49fc-925e-fcf7092a3672';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'b75fdff1-2c9b-4f48-b411-d16e899d0515';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'ba065561-f8d6-4aa1-9b20-3e17ceee1b13';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'c0a5a899-17bb-4195-8bc5-aedfa1b1f375';
        update "job_new"."engine" set "price" = 2000 where "engine_id" = 'c1152fe1-9075-4723-b843-668fb0880bcb';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'c131d296-ef65-41a2-b506-00d63382d083';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'c22948d7-aa84-4913-9088-5f359cf4187b';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'c42b581b-261e-4c7c-9485-2b73473e1172';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'c7816af9-a59c-466a-aab2-aa8c210483c7';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'ca399d1c-f9cf-4f81-8491-abdc0f8a84bb';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'ca49651b-16bd-464d-bb16-5ae9eede39da';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'cb2cedfe-f761-484d-a7f6-71aa4a8d5e27';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'cb5f0290-efc5-4115-98c0-d28fcb9a76bf';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'cfb5168d-cf31-438c-a07d-24f0cb215ff2';
        update "job_new"."engine" set "price" = 0 where "engine_id" = 'conductor-v3.1';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'correlation-gps';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'd40d4f9a-2a6a-4c32-b319-58e03fda5f8a';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'd439dc51-b212-416f-b825-6a5f1592973d';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'e02b3273-00e2-446f-a160-24a18dbcc188';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'e1748e04-0812-4100-a74c-85590c7b8824';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'e20576f1-ad80-4f54-81d3-4483db041d0f';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'e26cd2d1-c237-4f4d-a1a7-bda615aecd87';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'e3707970-5353-435c-82ed-64d105101d36';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'ea78d0b9-66c1-45a2-a0b9-74a09b08be37';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'ebad3567-2d62-4d45-a22c-d9a489d04f86';
        update "job_new"."engine" set "price" = 10000 where "engine_id" = 'ec3f9585-475d-45fb-a4c5-89a0b99d8c44';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'f675edd8-67eb-4251-8bbb-c30cfa9b9618';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'f810b03a-cc2c-4678-aa24-c03940550172';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'faa65a08-cd26-4a97-b8ba-97a1d4a30245';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'fb19161c-923b-468c-bc3f-4f428b0b9536';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'fb989080-0544-4fa8-ac00-a2c1e43f2f83';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'fc0e6b3b-13c8-4c94-a1be-ff1e0ee0121f';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'fe12c2cf-15f7-4267-88fb-21f7b820c6d7';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'fe8e0add-8eec-4636-a364-8082099a9dac';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'fingerprint-audio';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'gracenote';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'imagedetection-facerecognition-kairos';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'imagedetection-facerecognition-veritone';
        update "job_new"."engine" set "price" = 750 where "engine_id" = 'imagedetection-licenseplaterecognition-hpe';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'imagedetection-logorecognition-clarifai';
        update "job_new"."engine" set "price" = 600 where "engine_id" = 'imagedetection-logorecognition-google';
        update "job_new"."engine" set "price" = 600 where "engine_id" = 'imagedetection-logorecognition-hpe';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'imagedetection-logorecognition-logograb';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'imagedetection-objectrecognition-amazon';
        update "job_new"."engine" set "price" = 750 where "engine_id" = 'imagedetection-objectrecognition-amazon-moderation';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'imagedetection-objectrecognition-clarifai';
        update "job_new"."engine" set "price" = 3750 where "engine_id" = 'imagedetection-objectrecognition-cloudsight';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'imagedetection-objectrecognition-dextro';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'imagedetection-objectrecognition-google';
        update "job_new"."engine" set "price" = 675 where "engine_id" = 'imagedetection-objectrecognition-google-landmark';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'imagedetection-objectrecognition-oxford';
        update "job_new"."engine" set "price" = 1000 where "engine_id" = 'imagedetection-objectrecognition-watson-visual-recognition';
        update "job_new"."engine" set "price" = 100 where "engine_id" = 'imagedetection-objectrecognition-yolo';
        update "job_new"."engine" set "price" = 750 where "engine_id" = 'imagedetection-ocr-google';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'imagedetection-ocr-tesseract';
        update "job_new"."engine" set "price" = 300 where "engine_id" = 'sentiment-veritone';
        update "job_new"."engine" set "price" = 22500 where "engine_id" = 'speechpad';
        update "job_new"."engine" set "price" = 25 where "engine_id" = 'transcode-ffmpeg';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'transcode-zencoder';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'transcribe';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'transcribe-deepgram';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'transcribe-greenkey';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'transcribe-hpe';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-ara-sau';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-ara-xww';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-cat-esp';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-cmn-twn';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-deu-deu';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-eng-aus';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-eng-can';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-eng-gbr';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-eng-ind';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-eng-usa';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-eng-usa-wideband';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-eng-zaf';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-fra-can';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-fra-fra';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-heb-isr';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-hin-ind';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-ita-ita';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-jap-jap';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-kor-kor';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-nld-nld';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-nor-nor';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-pol-pol';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-por-bra';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-por-prt';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-rus-rus';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-spa-arg';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-spa-chl';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-spa-col';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-spa-esp';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-spa-gtm';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-spa-mex';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-spa-usa';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-spa-usa-wideband';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-swe-swe';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-tha-tha';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-tur-tur';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-wuu-chn-wideband';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-yue-hkg';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-zho-chn';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-zho-chn-wideband';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-nuance-containerized-zlm-mys';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'transcribe-oxford';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-de';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-el';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-en-au';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-en-gb';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-en-us';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-es';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-fr';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-hr';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-ja';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-pt';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-ru';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-speechmatics-container-v3-ro';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'transcribe-spokendata';
        update "job_new"."engine" set "price" = 125 where "engine_id" = 'transcribe-voicebase';
        update "job_new"."engine" set "price" = 250 where "engine_id" = 'transcribe-watson';
        update "job_new"."engine" set "price" = 300 where "engine_id" = 'translate-babeltranslate';
        update "job_new"."engine" set "price" = 200 where "engine_id" = 'translate-microsoft';
        update "job_new"."engine" set "price" = 300 where "engine_id" = 'translate-watson';

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights) VALUES ('f36f3a76-16c2-4a78-b291-bfa5da9e9bf0', 'a70df3f6-84a7-4570-b8f4-daa122127e37', 'Station Playout Correlation', 'station playout correlation', 'active', 0, @@{ROOT_ORG_ID}@@, false, null, null, null, 'https://www.filepicker.io/api/file/3CnOfZrnSuuDlxvYpogj', null, null, '{}', '[]', null, null, null, false, false, 1534545064, 1534545064, false, null, 'USD', 'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0', null, null, null, null) ON CONFLICT (engine_id) DO NOTHING;
        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights) VALUES ('d7f7e7cd-dca9-49af-90b6-53a3698690f8', 'a70df3f6-84a7-4570-b8f4-daa122127e37', 'Audience Correlation', 'Fake Engine for Correlation', 'active', 0, @@{ROOT_ORG_ID}@@, false, null, null, null, 'https://www.filepicker.io/api/file/3CnOfZrnSuuDlxvYpogj', null, null, '{}', '[]', null, null, null, false, false, 1534544838, 1534544838, false, null, 'USD', 'd7f7e7cd-dca9-49af-90b6-53a3698690f8', null, null, null, null) ON CONFLICT (engine_id) DO NOTHING;

        UPDATE job_new.engine_category SET export_formats = '[{"label": "Plain Text", "format": "txt", "types": []},{"label": "Time Text Markup Language", "format": "ttml", "types": []},{"label": "WebVTT", "format": "vtt", "types": ["subtitle"]},{"label": "SubRip Text", "format": "srt", "types": ["subtitle"]}]' WHERE engine_category_id = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

        UPDATE job_new.engine
            SET owner_organization_id = @@{ROOT_ORG_ID}@@
            WHERE engine_id = '434db220-b38f-4bb6-bf65-02a4469559ac';

        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'mention_inserted', NULL, 'MentionSync', NULL, now(), now(),'sngo','sngo','mention'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE 
        organization_id IS NULL AND
        event_name = 'mention_inserted' AND
        target_name = 'MentionSync' AND
        event_type = 'mention'
        );

        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'mention_deleted', NULL, 'MentionSync',NULL, now(), now(),'sngo','sngo','mention'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE 
        organization_id IS NULL AND
        event_name = 'mention_deleted' AND
        target_name = 'MentionSync' AND
        event_type = 'mention'
        );


        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'mention_updated', NULL, 'MentionSync',NULL, now(), now(),'sngo','sngo','mention'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE 
        organization_id IS NULL AND
        event_name = 'mention_updated' AND
        target_name = 'MentionSync' AND
        event_type = 'mention'
        );

        CREATE TABLE IF NOT EXISTS event_trigger.event_subscription (
            event_subscription_id uuid NOT NULL default uuid_generate_v4(),
            event_name text NULL DEFAULT ''::text,
            event_type text NULL DEFAULT ''::text,
            organization_id int4 NULL DEFAULT '-1'::integer,
            application_id text NULL DEFAULT ''::text,
            target_name text NULL DEFAULT ''::text,
            consumer_params jsonb NULL,
            created_at_utc timestamptz NOT NULL DEFAULT NOW(),
            updated_at_utc timestamptz NOT NULL DEFAULT NOW(),
            created_by text NULL DEFAULT ''::text,
            updated_by text NULL DEFAULT ''::text,
            CONSTRAINT event_subscription_pkey PRIMARY KEY (event_subscription_id)
        )
        WITH (
            OIDS=FALSE
        ) ;

        CREATE TABLE IF NOT EXISTS event_trigger.event(
            event_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            event_name text NOT NULL DEFAULT ''::text,
            event_type text NOT NULL DEFAULT ''::text,
            organization_id int NULL,
            application_id text NOT NULL DEFAULT ''::text,
            schema_data text NOT NULL DEFAULT ''::text,
            schema_hash text NOT NULL DEFAULT ''::text,	
            public boolean NOT NULL DEFAULT false,
            created_at_utc timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
            updated_at_utc timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
            created_by text NULL,
            updated_by text NULL,
            description text NOT NULL DEFAULT ''::text,
            UNIQUE (application_id, event_name, event_type)
        );


        update "job_new"."engine_category"
        set "engine_category_name"='Media (Pull)'
        where "engine_category_id"='4b150c85-82d0-4a18-b7fb-63e4a58dfcce';

        update "job_new"."engine_category"
        set "engine_category_name"='Media (Push)'
        where "engine_category_id"='0b10da6b-3485-496c-a2cb-aabf59a6352d';

        insert into "job_new"."engine_category" (
        "engine_category_id",
        "engine_category_name",
        "icon_class",
        "editable",
        "video_only",
        "dependencies",
        "engine_type_id",
        "export_formats"
        ) values (
        '5e82fab8-c845-4f9c-b7fc-92dfb26e6a3e',
        'Structured Data (Pull)',
        'icon-pull',
        'f',
        'f',
        '{"category": "ingestion"}',
        '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
        '[]');

        update "job_new"."engine"
        set "engine_category_id"='5e82fab8-c845-4f9c-b7fc-92dfb26e6a3e'
        where "engine_id"='4d0b2407-f2af-4f19-bdfc-83f74981790a';

        ALTER TABLE job_new.task ADD COLUMN IF NOT EXISTS task_executor_data JSONB null;

        PERFORM setval('event_trigger.event_triggers_event_trigger_id_seq', (SELECT MAX(event_trigger_id) FROM event_trigger.event_triggers)+1);

        -- trigger for failed logins, this is an internal event broadcasted via event_triggers
        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'audit_login_failure', NULL, 'Webhook', '{"url":"https://example.com/slack/webhook/redacted","template":"{\"text\":\"> :x: Failed Login for User: *{{userName}}*\"}"}', now(), now(),'sngo','sngo',''
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE 
        organization_id IS NULL AND
        event_name = 'audit_login_failure' AND
        target_name = 'Webhook'
        );

        -- trigger for successful logins, this is a public event broadcasted via event_subscriptions
        INSERT INTO event_trigger.event_subscription
        (event_name, event_type, organization_id, application_id, target_name, consumer_params, created_at_utc, updated_at_utc, created_by, updated_by)
        SELECT 'LoginSucceeded', 'authentication', @@{ROOT_ORG_ID}@@, 'system', 'Webhook', '{"url":"https://example.com/slack/webhook/redacted","encoding":"json","template":"{\"text\":\"> :+1: Successful Login for User:*{{userName}}* Org:*{{organizationId}}*\"}"}', now(), now(), 'sngo', 'sngo'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_subscription WHERE
        organization_id = @@{ROOT_ORG_ID}@@ AND
        event_name = 'LoginSucceeded' AND
        event_type = 'authentication' AND
        application_id = 'system' AND
        target_name = 'Webhook'
        );

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('8ae1db0e-fc8e-4917-a015-9a960548ec0a', 'LoginSucceeded', 'authentication', @@{ROOT_ORG_ID}@@, 'system', 'message LoginSucceeded  {
            string user_name = 10;
            string user_agent = 11;
            string ip = 12;
            string request_url = 13;
            string user_id = 14;
            int64 organization_id = 15;
        }', '074b02614f0216aa7d487c92f2759c9072a904e3721ab7fdfacba4134557f6ac', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;


        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('1e874e88-d645-4d51-a760-4a8d16ff1bbb', 'LoginFailed', 'authentication', @@{ROOT_ORG_ID}@@, 'system', 'message LoginFailed {
            string user_name = 10;
            string user_agent = 11;
            string ip = 12;
            string request_url = 13;
            string user_id = 14;
            int64 organization_id = 15;
        }', '1d810840ccc65797d9b04cbb3cd68489ad3b2bd86d9022f54acc2a770c3980db', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;


        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('0991d53a-b867-11e8-96f8-529269fb1459', 'EngineBuildVulnerabilityChecked', 'engine', @@{ROOT_ORG_ID}@@, 'system', 'message EngineBuildVulnerabilityChecked {
            string user_id = 10;
            string job_id = 11;
            string asset_id = 12;
            bool success = 13;
            string engine_id = 14;
            string build_id = 15;
        }', 'ADAC634B7D120F71C761C4EFD903C21684028B737786D3B936A7361E81BC3238', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('22851ae7-c694-40f5-925d-cef2544e59ef', 'EngineBuildManifestProcessed', 'engine', @@{ROOT_ORG_ID}@@, 'system', 'message EngineBuildManifestProcessed {
            string user_id = 10;
            string job_id = 11;
            bool success = 12;
            string engine_id = 13;
            string build_id = 14;
        }', '53D56D5DA847262427959E2CBF96189A50E14930B68FAF05E2868A76EA2B0545', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('73862f05-461b-48da-98c6-cc1c905b60bb', 'EngineBuildUploadCompleted', 'engine', @@{ROOT_ORG_ID}@@, 'system', 'message EngineBuildUploadCompleted {
            string user_id = 10;
            string job_id = 11;
            string asset_id = 12;
            bool success = 13;
        }', '964C6DF618936F8C5280A9C43D9D5A7D483FFF7DFDC6D8AA63A7F8089C4956A9', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('23e9abc5-dcd9-4ed5-be14-65c660ff6a43', 'EngineBuildTestReportDone', 'engine', @@{ROOT_ORG_ID}@@, 'system', 'message EngineBuildTestReportDone {
            string user_id = 10;
            string job_id = 11;
            bool success = 12;
            string engine_id = 13;
            string build_id = 14;
        }', '558CAA3EA3850A4CE26459F29CAE5C3CCADEB88D6F30D076A80B5CC4243D3600', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('73614167-4503-44f8-9673-25fc495d4a77', 'EngineBuildApproved', 'engine', @@{ROOT_ORG_ID}@@, 'system', 'message EngineBuildApproved {
            string user_id = 10;     
            string engine_id = 11;       
            string build_id = 12;          
            int64 organization_id = 13;             
            int32 status_code = 14;         
            string action = 15;         
        }', '315EBD603F6E197F0B6D3411B97291864BB3923B1AAA0DF44E586C984CBE6125', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('88ce22e4-84c6-4a97-b618-b10ddda67d51', 'EngineBuildDisapprove', 'engine', @@{ROOT_ORG_ID}@@, 'system', 'message EngineBuildDisapprove {
            string user_id = 10;
            string engine_id = 11;
            string build_id = 12;
            int64 organization_id = 13;
            int32 status_code = 14;
            string action = 15;
        }', '150978EABAE5F3915E369FB77D591126D48EC7907A3B1DF6785D57456D5F6DEC', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('0a5234dd-8a48-49a4-b4da-1d6d352984c7', 'EngineBuildDeploySuccess', 'engine', @@{ROOT_ORG_ID}@@, 'system', 'message engineBuildDeploySuccess {
            string user_id = 10;
            string engine_id = 11;
            string build_id = 12;
        }', '6A880A60217B1BF4F606F9D5BF739CCFD054B19496FECDAB886747AB0BB34813', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('f7cb3acf-0add-42ac-a3ca-826d73b4bf68', 'EngineBuildDeployFail', 'engine', @@{ROOT_ORG_ID}@@, 'system', 'message engineBuildDeployFail {
            string user_id = 10;
            string engine_id = 11;
            string build_id = 12;
        }', '7FBB6FF412AF32B6C7E6C4E3E21BAB62E0DF66EC78FFEB344E5E0280C4494D6C', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('b7e63208-c778-4e4f-8b89-7d708a2870fd', 'TaskQueued', 'task', @@{ROOT_ORG_ID}@@, 'system', 'message TaskQueued {
            string task_id = 10;
            string timestamp_ms = 11;
        }', 'EC2C18C30B4F38854584CDCA5C7080FBEA0F608D610DD50B07B602DB6DB19B60', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('1b2a14bb-e3eb-4ca8-9510-8647ccd33f06', 'TaskUpdated', 'task', @@{ROOT_ORG_ID}@@, 'system', 'message TaskUpdated {
            string task_id = 10;
            string timestamp_ms = 11;
            string task_status = 12;
        }', '865F8DB9C5E2A3F41F1833D81E25A5AB98ED809CC96595C1485804B7106C648B', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('07777220-324e-4db3-823f-f0b8e3776f6e', 'TaskCompleted', 'task', @@{ROOT_ORG_ID}@@, 'system', 'message TaskCompleted {
            string task_id = 10;
            string timestamp_ms = 11;
            string task_status = 12;
        }', '0932413BA14BE70706425538B90265D950B4B38958794AF9495A713991C7344A', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('1d31d2d7-710d-4690-bdae-6ff5d9b2bd59', 'JobCreated', 'job', @@{ROOT_ORG_ID}@@, 'system', 'message JobCreated {
            string job_id = 10;
            string timestamp_ms = 11;
        }', 'A70AE9CC900A245DA55126A8B0E0EAC4853734952BE9A3005224624D35D23737', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('72b0186f-2db5-4b1d-b667-5aab733a52ca', 'JobCompleted', 'job', @@{ROOT_ORG_ID}@@, 'system', 'message JobCompleted {
            string job_id = 10;
            string timestamp_ms = 11;
            string job_status = 12;
        }', '48BE5B2C10E6E0662977E086F95726BAE24609E5C4AFB6C00957DF92ACD53348', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('17b48ea5-df51-4fef-99f4-d3ea251df980', 'JobFailed', 'job', @@{ROOT_ORG_ID}@@, 'system', 'message JobFailed {
            string job_id = 10;
            string timestamp_ms = 11;
            string job_status = 12;
        }', '1DCC1798BC3AC7993A3504F996D365B7BF062A89C406197377239CDE7496E3D2', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;


        --- recording events ---
        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('e2aebf50-2bcc-4a5e-9491-c37a2e34df16', 'RecordingCreated', 'recording', @@{ROOT_ORG_ID}@@, 'system', 'message RecordingCreated {
            string recording_id = 10;
        }', '37f4f8d97ab26e5fcba490c0b4b91dcaf667257492ce9c968738146b8a52dfc5', true, '2018-09-24 00:36:59.353', '2018-09-24 00:36:59.353', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('9d895789-5b1f-4ed6-966d-226059f779e8', 'RecordingInserted', 'recording', @@{ROOT_ORG_ID}@@, 'system', 'message RecordingInserted {
            string recording_id = 10;
        }', '624450a7c908641f301e32065e7896366bf56976c7e1d83987d2b0eb678afaad', true, '2018-09-24 00:36:48.210', '2018-09-24 00:36:48.210', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('6e63bdda-3bd1-4b8d-9f4d-fb80ab24319b', 'RecordingDeleted', 'recording', @@{ROOT_ORG_ID}@@, 'system', 'message RecordingDeleted {
            string recording_id = 10;
        }', '28cbabab07b8bb3c7330f6f12517a83730ef70eed5634e41e9b2667b8d5aec15', true, '2018-09-24 00:36:36.036', '2018-09-24 00:36:36.036', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('7c0fb438-b3c3-40af-9158-b6e875497b97', 'RecordingCognitionCompleted', 'recording', @@{ROOT_ORG_ID}@@, 'system', 'message RecordingCognitionCompleted {
            message Payload {
                string job_id = 10;
                string task_id = 11;
                string application_id = 12;
                int64 organization_id = 13;
                string library_id = 14;
                string index_override = 15;
                string token = 16;
                string asset_id = 17;
                bool skip_mention_generation = 18;
            }    
            string recording_id = 10;
            Payload payload = 11;
        }', '2e60cc86a411fc08b00a8a559997fc087d2caf8f653f736660193145b0ee6f38', true, '2018-09-24 00:36:11.683', '2018-09-24 00:36:11.683', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        --- authentication events ---
        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('8876aa2f-1068-411d-b746-28c867c151cc', 'ActionTokenForbidden', 'authentication', @@{ROOT_ORG_ID}@@, 'system', 'message ActionTokenForbidden {
            string user_agent = 11;
            string ip = 12;
            string request_url = 13;
        }', '5c246156715c1fa39cd83e3e05c329cb99e402cf2271288281be35976dab6b5a', true, '2018-09-24 00:34:31.357', '2018-09-24 00:34:31.357', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('d5082d0e-3c96-4c71-9f27-c679650f2adf', 'ActionUserForbidden', 'authentication', @@{ROOT_ORG_ID}@@, 'system', 'message ActionUserForbidden  {
            string user_name = 10;
            string user_agent = 11;
            string ip = 12;
            string request_url = 13;
            string user_id = 14;
            int64 organization_id = 15;
        }', 'bf0bb7f57136e78c60cedade737e74b0a91f06b9ddcd4686ca514dce2a7ad02f', true, '2018-09-24 00:34:14.988', '2018-09-24 00:34:14.988', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('4eae78e7-50e9-4bb3-8629-7fa02c49066e', 'Impersonated', 'authentication', @@{ROOT_ORG_ID}@@, 'system', 'message Impersonated {
            string user_name = 10;
            string user_agent = 11;
            string ip = 12;
            string request_url = 13;
            string user_id = 14;
            int64 organization_id = 15;
            string impersontated_user_id = 16;
        }', 'bf2868049c36ba15820ea0d94235a8d32abf5fea0ff41f2f4226b97fb101ea63', true, '2018-09-24 00:33:58.253', '2018-09-24 00:33:58.253', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('40d89241-15bf-4670-9bd9-4a91c6c2930d', 'LoginAttemptsExceeded', 'authentication', @@{ROOT_ORG_ID}@@, 'system', 'message LoginAttemptsExceeded {
            string user_name = 10;
            string user_agent = 11;
            string ip = 12;
            string request_url = 13;
        }', '1fb1780aa77205ee65d8dd25627cb4c32d63f0fdf820d2c6d60ff6bf607ab300', true, '2018-09-24 00:33:26.268', '2018-09-24 00:33:26.268', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        --- asset event ---
        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('f65b42cd-1620-46c3-a746-84d03b09b53b', 'AssetUploaded', 'asset', @@{ROOT_ORG_ID}@@, 'system', 'message AssetUploaded  {
        string asset_id = 10;
        string recording_id = 11;
        }', '57d361f9a54f5576370f407ba2c2e9f99e814ea94cf39371c4f44feca54effa9', true, '2018-09-25 09:03:23.408', '2018-09-25 09:03:23.408', 'vertone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;


        UPDATE job_new.engine
        SET engine_alias_id = engine_id, jwt_rights = '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id = 'a6da2cdc-948a-4fd2-9916-67fcbad7cc7f';

        ALTER TABLE job_new.job ADD COLUMN IF NOT EXISTS job_status TEXT;

        CREATE SCHEMA IF NOT EXISTS workflow AUTHORIZATION postgres;

        CREATE TABLE IF NOT EXISTS workflow.workflow_runtime (
            workflow_runtime_id varchar NOT NULL,
            organization_id int4 NOT NULL,
            runtime_type varchar NOT NULL,
            host_uri varchar NOT NULL,
            api_token varchar NOT NULL,
            metadata jsonb NULL,
            created_by varchar NOT NULL,
            updated_by varchar NOT NULL,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL,
            CONSTRAINT workflow_runtime_id_pk PRIMARY KEY (workflow_runtime_id)
        );

        ALTER TABLE workflow.workflow_runtime OWNER TO postgres;

        CREATE TABLE IF NOT EXISTS workflow.workflow_runtime_storage (
            workflow_runtime_id varchar NOT NULL,
            storage_key varchar NOT NULL,
            storage_metadata varchar NULL,
            created_by varchar NOT NULL,
            updated_by varchar NOT NULL,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL,
            storage_data varchar NOT NULL,
            CONSTRAINT workflow_runtime_storage_pk PRIMARY KEY (workflow_runtime_id, storage_key),
            CONSTRAINT workflow_runtime_storage_workflow_runtime_fk FOREIGN KEY (workflow_runtime_id) REFERENCES workflow.workflow_runtime(workflow_runtime_id)
        );

        CREATE INDEX IF NOT EXISTS workflow_runtime_storage_workflow_runtime_id_idx ON workflow.workflow_runtime_storage USING btree (workflow_runtime_id, storage_key varchar_pattern_ops);

        ALTER TABLE workflow.workflow_runtime_storage OWNER TO postgres;

        ALTER TABLE workflow.workflow_runtime ADD COLUMN IF NOT EXISTS token_id varchar;
        ALTER TABLE workflow.workflow_runtime DROP COLUMN IF EXISTS api_token;

        UPDATE job_new.engine
        SET engine_alias_id = engine_id, jwt_rights = '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "job.read", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id IN (
        '4b2dadf2-e27a-49b2-9c54-192e0b3e562a', -- Youtube Channel
        'cef516e4-d461-4d17-b01f-6c7bdfcaa204' -- Podcast
        );

        UPDATE job_new.engine
        SET engine_alias_id = engine_id, jwt_rights = '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "job.read", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id = '3bfcd954-7c0c-4456-903d-28e37caee711';


        -- description: update all affected assets in pages of 10 minutes
        -- created between 2018-10-10 16:06:54 and 2018-10-11 10:50:12
        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539212814
        and created_date_time < 1539213414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539213414
        and created_date_time < 1539214014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539214014
        and created_date_time < 1539214614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539214614
        and created_date_time < 1539215214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539215214
        and created_date_time < 1539215814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539215814
        and created_date_time < 1539216414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539216414
        and created_date_time < 1539217014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539217014
        and created_date_time < 1539217614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539217614
        and created_date_time < 1539218214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539218214
        and created_date_time < 1539218814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539218814
        and created_date_time < 1539219414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539219414
        and created_date_time < 1539220014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539220014
        and created_date_time < 1539220614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539220614
        and created_date_time < 1539221214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539221214
        and created_date_time < 1539221814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539221814
        and created_date_time < 1539222414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539222414
        and created_date_time < 1539223014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539223014
        and created_date_time < 1539223614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539223614
        and created_date_time < 1539224214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539224214
        and created_date_time < 1539224814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539224814
        and created_date_time < 1539225414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539225414
        and created_date_time < 1539226014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539226014
        and created_date_time < 1539226614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539226614
        and created_date_time < 1539227214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539227214
        and created_date_time < 1539227814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539227814
        and created_date_time < 1539228414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539228414
        and created_date_time < 1539229014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539229014
        and created_date_time < 1539229614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539229614
        and created_date_time < 1539230214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539230214
        and created_date_time < 1539230814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539230814
        and created_date_time < 1539231414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539231414
        and created_date_time < 1539232014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539232014
        and created_date_time < 1539232614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539232614
        and created_date_time < 1539233214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539233214
        and created_date_time < 1539233814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539233814
        and created_date_time < 1539234414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539234414
        and created_date_time < 1539235014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539235014
        and created_date_time < 1539235614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539235614
        and created_date_time < 1539236214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539236214
        and created_date_time < 1539236814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539236814
        and created_date_time < 1539237414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539237414
        and created_date_time < 1539238014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539238014
        and created_date_time < 1539238614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539238614
        and created_date_time < 1539239214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539239214
        and created_date_time < 1539239814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539239814
        and created_date_time < 1539240414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539240414
        and created_date_time < 1539241014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539241014
        and created_date_time < 1539241614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539241614
        and created_date_time < 1539242214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539242214
        and created_date_time < 1539242814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539242814
        and created_date_time < 1539243414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539243414
        and created_date_time < 1539244014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539244014
        and created_date_time < 1539244614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539244614
        and created_date_time < 1539245214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539245214
        and created_date_time < 1539245814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539245814
        and created_date_time < 1539246414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539246414
        and created_date_time < 1539247014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539247014
        and created_date_time < 1539247614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539247614
        and created_date_time < 1539248214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539248214
        and created_date_time < 1539248814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539248814
        and created_date_time < 1539249414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539249414
        and created_date_time < 1539250014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539250014
        and created_date_time < 1539250614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539250614
        and created_date_time < 1539251214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539251214
        and created_date_time < 1539251814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539251814
        and created_date_time < 1539252414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539252414
        and created_date_time < 1539253014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539253014
        and created_date_time < 1539253614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539253614
        and created_date_time < 1539254214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539254214
        and created_date_time < 1539254814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539254814
        and created_date_time < 1539255414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539255414
        and created_date_time < 1539256014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539256014
        and created_date_time < 1539256614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539256614
        and created_date_time < 1539257214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539257214
        and created_date_time < 1539257814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539257814
        and created_date_time < 1539258414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539258414
        and created_date_time < 1539259014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539259014
        and created_date_time < 1539259614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539259614
        and created_date_time < 1539260214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539260214
        and created_date_time < 1539260814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539260814
        and created_date_time < 1539261414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539261414
        and created_date_time < 1539262014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539262014
        and created_date_time < 1539262614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539262614
        and created_date_time < 1539263214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539263214
        and created_date_time < 1539263814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539263814
        and created_date_time < 1539264414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539264414
        and created_date_time < 1539265014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539265014
        and created_date_time < 1539265614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539265614
        and created_date_time < 1539266214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539266214
        and created_date_time < 1539266814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539266814
        and created_date_time < 1539267414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539267414
        and created_date_time < 1539268014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539268014
        and created_date_time < 1539268614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539268614
        and created_date_time < 1539269214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539269214
        and created_date_time < 1539269814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539269814
        and created_date_time < 1539270414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539270414
        and created_date_time < 1539271014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539271014
        and created_date_time < 1539271614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539271614
        and created_date_time < 1539272214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539272214
        and created_date_time < 1539272814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539272814
        and created_date_time < 1539273414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539273414
        and created_date_time < 1539274014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539274014
        and created_date_time < 1539274614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539274614
        and created_date_time < 1539275214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539275214
        and created_date_time < 1539275814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539275814
        and created_date_time < 1539276414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539276414
        and created_date_time < 1539277014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539277014
        and created_date_time < 1539277614
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539277614
        and created_date_time < 1539278214
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539278214
        and created_date_time < 1539278814
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539278814
        and created_date_time < 1539279414
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539279414
        and created_date_time < 1539280014
        and metadata ->> 'source' = 'speechmatics-container-us';

        update recording.recording_asset
        set metadata = (select jsonb_set(metadata, '{source}', to_jsonb(text 'speechmatics-container-en-us'), false))
        where created_date_time >= 1539280014
        and created_date_time <= 1539280212
        and metadata ->> 'source' = 'speechmatics-container-us';

        -- Add Speaker Category
        -- Update Transcription Export to include doc format
        INSERT INTO "job_new"."engine_category" (
            "engine_category_id",
            "engine_category_name",
            "engine_category_description",
            "search",
            "elastic",
            "data_field",
            "icon_class",
            "editable",
            "video_only",
            "order",
            "library_identifier_types",
            "dependencies",
            "engine_class_id",
            "color",
            "engine_type_id",
            "export_formats"
        ) VALUES (
            'a856c447-1030-4fb0-917f-08179f949c4e',
            'Speaker Separation',
            'Detect the change in speakers within your transcription results',
            '{"enabled": false}',
            '{"enabled": false}',
            'speaker',
            'icon-speaker-separation',
            'f',
            'f',
            '21',
            null,
            '{"category": "speaker", "dependencies": ["transcribe"]}',
            null,
            null,
            'fcc22feb-9184-4f53-be5e-7694927864d9',
            '[{"label": "Plain Text", "types": [], "format": "txt"}, {"label": "Time Text Markup Language", "types": [], "format": "ttml"}, {"label": "WebVTT", "types": ["subtitle"], "format": "vtt"}, {"label": "SubRip Text", "types": ["subtitle"], "format": "srt"}, {"label": "Word Doc", "types": [], "format": "doc"}]'
        )
        ON CONFLICT DO NOTHING;

        UPDATE "job_new"."engine_category" 
        SET "export_formats"='[{"label": "Plain Text", "types": [], "format": "txt"}, {"label": "Time Text Markup Language", "types": [], "format": "ttml"}, {"label": "WebVTT", "types": ["subtitle"], "format": "vtt"}, {"label": "SubRip Text", "types": ["subtitle"], "format": "srt"}, {"label": "Word Doc", "types": [], "format": "doc"}]'
        WHERE "engine_category_id"='67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

        UPDATE job_new.engine
        SET jwt_rights = '{"roles":[{"roleName":"adapter", "taskRights":["discovery.mentions.read", "cms.sources.read"]}]}'
        WHERE engine_id = 'f49ba58f-540a-41c2-a68c-70ccdef2933f';

        UPDATE job_new.engine 
        SET jwt_rights = '{"roles": [{"roleName": "conductor", "taskRights": ["developer.engine.read", "job:create", "job.read", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id = '9203cf30-68d1-4978-a5a4-7f2f3a945ccb';

        update "job_new"."engine" set "engine_name"='Zetta Cloud - Entity Extraction',"engine_alias_name"='Entity Extraction - A',"order"=3,"price"=100,"engine_alias_description"='This engine classifies named entities from text into pre-defined categories such as people, organizations and locations.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/entity-extraction-A.png' where "engine_alias_id"='c4f10c5b-5b78-4bce-ac1a-150f0c6ee046';
        update "job_new"."engine" set "engine_name"='Zetta Cloud - Language Identification',"engine_alias_name"='Language Identification - A',"order"=4,"price"=100,"engine_alias_description"='This engine identifies languages as they appear in written text.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/language-identification-A.png' where "engine_alias_id"='b5262a55-741b-406d-8ed8-bdb8c46779ac';
        update "job_new"."engine" set "engine_name"='Zetta Cloud - Summary',"engine_alias_name"='Summary - A',"order"=5,"price"=100,"engine_alias_description"='This engine generates a synopsis, ie. condensed version, of the input text.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/summary-A.png' where "engine_alias_id"='89b2eddd-14a4-4f1d-8265-542187a88cb4';
        update "job_new"."engine" set "engine_name"='Zetta Cloud - Vector',"engine_alias_name"='Vector - A',"order"=6,"price"=100,"engine_alias_description"='This engine represents the input text as a mathematical vector.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/vector-A.png' where "engine_alias_id"='8e4c6299-7dc9-4684-b7e1-9cc0efe8d377';
        update "job_new"."engine" set "engine_name"='Google - Logo Recognition - V2F',"engine_alias_name"='Logo Recognition - F',"order"=5,"price"=600,"engine_alias_description"='This engine recognizes brand logos in images and video.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/logo-recognition-F.png' where "engine_alias_id"='361ae32c-4937-4d4c-9865-466fd3424bf9';
        update "job_new"."engine" set "engine_name"='Veritone - Person Detection',"engine_alias_name"='Object Detection - AB - Person',"order"=27,"price"=100,"engine_alias_description"='This engine detects the presence of people in video.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/object-detection-ab-person.png' where "engine_alias_id"='5bd4f4c0-bf60-4707-b1e3-084929fd67cb';
        update "job_new"."engine" set "engine_name"='Speechmatics - Catalan - V2F',"engine_alias_name"='Transcription - DJ - Catalan',"order"=113,"price"=125,"engine_alias_description"='This engine converts Catalan speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='059d10fb-f6c7-4c66-847a-361d833fca52';
        update "job_new"."engine" set "engine_name"='Speechmatics - Cloud - V2F',"engine_alias_name"='Transcription - DK - Cloud',"order"=114,"price"=125,"engine_alias_description"='This engine converts speech to text, and the user may select from one of multiple language options.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='f1bf71b5-c525-433a-957a-14d5ed4ff6ad';
        update "job_new"."engine" set "engine_name"='Speechmatics - Croatian - V2F',"engine_alias_name"='Transcription - DL - Croatian',"order"=115,"price"=125,"engine_alias_description"='This engine converts Croatian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='2fc91526-9c7d-44f2-881e-230ee6a94f5c';
        update "job_new"."engine" set "engine_name"='Speechmatics - Czech - V2F',"engine_alias_name"='Transcription - DM - Czech',"order"=116,"price"=125,"engine_alias_description"='This engine converts Czech speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='49077c9d-1a94-4445-a3d3-a6e493009c71';
        update "job_new"."engine" set "engine_name"='Speechmatics - Danish - V2F',"engine_alias_name"='Transcription - DN - Danish',"order"=117,"price"=125,"engine_alias_description"='This engine converts Danish speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='d710f6cb-6633-4a33-af5b-ef903e564497';
        update "job_new"."engine" set "engine_name"='Speechmatics - Dutch - V2F',"engine_alias_name"='Transcription - DO - Dutch',"order"=118,"price"=125,"engine_alias_description"='This engine converts Dutch speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='7c9ed2c7-1771-486d-9db9-415e43da8b83';
        update "job_new"."engine" set "engine_name"='Speechmatics - English (AU) - V2F',"engine_alias_name"='Transcription - DP - English (AU)',"order"=119,"price"=125,"engine_alias_description"='This engine converts Australian English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='e2a6ee89-593f-41d4-8cb1-f59f3061490f';
        update "job_new"."engine" set "engine_name"='Speechmatics - English (UK) - V2F',"engine_alias_name"='Transcription - DQ - English (UK)',"order"=120,"price"=125,"engine_alias_description"='This engine converts UK English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='6acbb32b-a117-4fad-8d08-16d295a0e4aa';
        update "job_new"."engine" set "engine_name"='Speechmatics - English (Global) - V2F',"engine_alias_name"='Transcription - DR - English (Global)',"order"=121,"price"=125,"engine_alias_description"='This engine converts Global English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='54525249-da68-4dbf-b6fe-aea9a1aefd4d';
        update "job_new"."engine" set "engine_name"='Speechmatics - English (US) - V2F',"engine_alias_name"='Transcription - DI - English (US)',"order"=112,"price"=125,"engine_alias_description"='This engine converts US English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c0e55cde-340b-44d7-bb42-2e0d65e98141';
        update "job_new"."engine" set "engine_name"='Speechmatics - Bulgarian - V2F',"engine_alias_name"='Transcription - DS - Bulgarian',"order"=122,"price"=125,"engine_alias_description"='This engine converts Bulgarian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='d8b6ecbe-3546-483d-bc2c-48603a06977d';
        update "job_new"."engine" set "engine_name"='Speechmatics - Finnish - V2F',"engine_alias_name"='Transcription - DT - Finnish',"order"=123,"price"=125,"engine_alias_description"='This engine converts Finnish speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='0d6e81de-7acf-4db5-a1e4-e83eddd89c54';
        update "job_new"."engine" set "engine_name"='Speechmatics - French - V2F',"engine_alias_name"='Transcription - DU - French',"order"=124,"price"=125,"engine_alias_description"='This engine converts French speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='61cea3e1-25c4-45a0-9f4c-5cb88a524d75';
        update "job_new"."engine" set "engine_name"='Speechmatics - German - V2F',"engine_alias_name"='Transcription - DV - German',"order"=125,"price"=125,"engine_alias_description"='This engine converts German speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='46a3e1fd-93b5-48a6-a0ee-893f6aaa29ee';
        update "job_new"."engine" set "engine_name"='Speechmatics - Greek - V2F',"engine_alias_name"='Transcription - DW - Greek',"order"=126,"price"=125,"engine_alias_description"='This engine converts Greek speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='d1bbefd9-1943-4c4c-a89e-4c3a49c0164a';
        update "job_new"."engine" set "engine_name"='Speechmatics - Hindi - V2F',"engine_alias_name"='Transcription - DX - Hindi',"order"=127,"price"=125,"engine_alias_description"='This engine converts Hindi speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='7d38cc1d-b8d2-4eaa-b5e6-11b2ca1018ee';
        update "job_new"."engine" set "engine_name"='Speechmatics - Hungarian - V2F',"engine_alias_name"='Transcription - DY - Hungarian',"order"=128,"price"=125,"engine_alias_description"='This engine converts Hungarian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c5635032-ca4f-4180-9243-01871272770a';
        update "job_new"."engine" set "engine_name"='Speechmatics - Italian - V2F',"engine_alias_name"='Transcription - DZ - Italian',"order"=129,"price"=125,"engine_alias_description"='This engine converts Italian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='71e9667e-390f-4e8a-b931-08c874706526';
        update "job_new"."engine" set "engine_name"='Speechmatics - Japanese - V2F',"engine_alias_name"='Transcription - EA - Japanese',"order"=130,"price"=125,"engine_alias_description"='This engine converts Japanese speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='f5c979ac-abc8-4c7d-87fd-fc4a49294248';
        update "job_new"."engine" set "engine_name"='Speechmatics - Korean - V2F',"engine_alias_name"='Transcription - EB - Korean',"order"=131,"price"=125,"engine_alias_description"='This engine converts Korean speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='4883ba80-7df5-4667-bc90-56c097b7a8c6';
        update "job_new"."engine" set "engine_name"='Speechmatics - Latvian - V2F',"engine_alias_name"='Transcription - EC - Latvian',"order"=132,"price"=125,"engine_alias_description"='This engine converts Latvian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='cf008cb8-79c4-480f-8b84-fb010c82d8de';
        update "job_new"."engine" set "engine_name"='Speechmatics - Lithuanian - V2F',"engine_alias_name"='Transcription - ED - Lithuanian',"order"=133,"price"=125,"engine_alias_description"='This engine converts Lithuanian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='23cff82c-974e-4001-8d22-4259b856a95f';
        update "job_new"."engine" set "engine_name"='Speechmatics - Polish - V2F',"engine_alias_name"='Transcription - EE - Polish',"order"=134,"price"=125,"engine_alias_description"='This engine converts Polish speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c53d8381-c416-4995-8619-3fdcfa5a127a';
        update "job_new"."engine" set "engine_name"='Speechmatics - Portuguese - V2F',"engine_alias_name"='Transcription - EF - Portuguese',"order"=135,"price"=125,"engine_alias_description"='This engine converts Portuguese speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='b0d23a0f-cf1f-4829-b146-adbeff79a626';
        update "job_new"."engine" set "engine_name"='Speechmatics - Romanian - V2F',"engine_alias_name"='Transcription - EG - Romanian',"order"=136,"price"=125,"engine_alias_description"='This engine converts Romanian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='3eae07fc-9977-4bad-b1db-078d2fdb545e';
        update "job_new"."engine" set "engine_name"='Speechmatics - Russian - V2F',"engine_alias_name"='Transcription - EH - Russian',"order"=137,"price"=125,"engine_alias_description"='This engine converts Russian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='24c6e3a6-66a9-4194-8d22-e13c144d0570';
        update "job_new"."engine" set "engine_name"='Speechmatics - Slovak - V2F',"engine_alias_name"='Transcription - EI - Slovak',"order"=138,"price"=125,"engine_alias_description"='This engine converts Slovak speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='002818f8-2ebd-44ba-9c46-d8e15eb21710';
        update "job_new"."engine" set "engine_name"='Speechmatics - Slovenian - V2F',"engine_alias_name"='Transcription - EJ - Slovenian',"order"=139,"price"=125,"engine_alias_description"='This engine converts Slovenian speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='38868b40-6f72-4446-b9fd-3e773d1d9e19';
        update "job_new"."engine" set "engine_name"='Speechmatics - Spanish - V2F',"engine_alias_name"='Transcription - EK - Spanish',"order"=140,"price"=125,"engine_alias_description"='This engine converts Spanish speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='71ab1ba9-e0b8-4215-b4f9-0fc1a1d2b44d';
        update "job_new"."engine" set "engine_name"='Speechmatics - Swedish - V2F',"engine_alias_name"='Transcription - EL - Swedish',"order"=141,"price"=125,"engine_alias_description"='This engine converts Swedish speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='b7274173-5ccf-4a74-a35a-ced2b6c2dca7';
        update "job_new"."engine" set "engine_name"='ListenByCode - Transcription',"engine_alias_name"='Transcription - EM - English',"order"=142,"price"=125,"engine_alias_description"='This engine converts English speech to text. The engine supports multiple accents and will auto-detect which accent is present in the audio file before transcribing.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/transcription-EM.png' where "engine_alias_id"='ba59b7e7-a03f-40fb-8273-72e6feea9389';
        update "job_new"."engine" set "engine_name"='Remeeting Transcription - English (UK) Telephony',"engine_alias_name"='Transcription - EN - English (UK) Telephony',"order"=143,"price"=125,"engine_alias_description"='This engine converts UK English speech to text and is best suited for Telephony (8kHz) audio.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/transcription-EN.png' where "engine_alias_id"='58b12472-fb0a-4c11-9dd8-cef826a5a8d7';
        update "job_new"."engine" set "engine_name"='Remeeting Transcription - Spanish (Latin America) Telephony',"engine_alias_name"='Transcription - EO - Spanish (Latin America) Telephony',"order"=144,"price"=125,"engine_alias_description"='This engine converts Latin American Spanish speech to text and is best suited for Telephony (8kHz) audio.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/transcription-EO.png' where "engine_alias_id"='77c73aca-ebfb-4236-b95a-8e8b5533102c';
        update "job_new"."engine" set "engine_name"='Remeeting Transcription - English (US) Broadcast',"engine_alias_name"='Transcription - EP - English (US) Broadcast',"order"=145,"price"=125,"engine_alias_description"='This engine converts US English speech to text and is best suited for Broadcast (16kHz) audio or video.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/transcription-EP.png' where "engine_alias_id"='106634c5-8988-4693-b072-f97889c05fa4';
        update "job_new"."engine" set "engine_name"='Remeeting Transcription - English (US) Telephony',"engine_alias_name"='Transcription - EQ - English (US) Telephony',"order"=146,"price"=125,"engine_alias_description"='This engine converts US English speech to text and is best suited for Telephony (8kHz) audio.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/transcription-EQ.png' where "engine_alias_id"='66d2e733-c78b-4130-8f85-3b7fde3e01e9';
        update "job_new"."engine" set "engine_name"='Remeeting Transcription - English (Keywords)',"engine_alias_name"='Transcription - ER - English',"order"=147,"price"=125,"engine_alias_description"='This engine converts English speech to text, except for specified keywords (ie. ''skips over'' certain words when transcribing).',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/transcription-ER.png' where "engine_alias_id"='1a4f4a2c-9d3c-4f4b-a876-3381d8bcb449';
        update "job_new"."engine" set "engine_name"='Pangeanic - Polish to English',"engine_alias_name"='Translate - AA - Polish to English',"order"=26,"price"=200,"engine_alias_description"='This engine translates text from Polish to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AA.png' where "engine_alias_id"='a022d811-aa63-426d-9750-a2178a8aaf69';
        update "job_new"."engine" set "engine_name"='Pangeanic - Romanian to English',"engine_alias_name"='Translate - AB - Romanian to English',"order"=27,"price"=200,"engine_alias_description"='This engine translates text from Romanian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AB.png' where "engine_alias_id"='f675edd8-67eb-4251-8bbb-c30cfa9b9618';
        update "job_new"."engine" set "engine_name"='Pangeanic - Slovakian to English',"engine_alias_name"='Translate - AC - Slovakian to English',"order"=28,"price"=200,"engine_alias_description"='This engine translates text from Slovakian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AC.png' where "engine_alias_id"='25928acc-6181-4728-89bd-2da8aa15936d';
        update "job_new"."engine" set "engine_name"='Pangeanic - Slovenian to English',"engine_alias_name"='Translate - AD - Slovenian to English',"order"=29,"price"=200,"engine_alias_description"='This engine translates text from Slovenian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AD.png' where "engine_alias_id"='a26ee62f-0e05-4e31-a2fe-0caac1ecb921';
        update "job_new"."engine" set "engine_name"='Pangeanic - Thai to English',"engine_alias_name"='Translate - AE - Thai to English',"order"=30,"price"=200,"engine_alias_description"='This engine translates text from Thai to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AE.png' where "engine_alias_id"='42d8cbd7-6016-4b66-ac71-f2527321e65a';
        update "job_new"."engine" set "engine_name"='Pangeanic - Traditional Chinese to English',"engine_alias_name"='Translate - AF - Traditional Chinese to English',"order"=31,"price"=200,"engine_alias_description"='This engine translates text from Traditional Chinese to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AF.png' where "engine_alias_id"='0aa59fc0-7a78-4238-ba88-12f7abd021bf';
        update "job_new"."engine" set "engine_name"='Pangeanic - German (Automotive) to English',"engine_alias_name"='Translate - AG - German (Automotive) to English',"order"=32,"price"=200,"engine_alias_description"='This engine translates text from German (Automotive vernacular) to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AG.png' where "engine_alias_id"='80172c67-eb3f-4ae1-b6fb-443403304f60';
        update "job_new"."engine" set "engine_name"='Pangeanic - Japanese (Financial) to English',"engine_alias_name"='Translate - AH - Japanese (Financial) to English',"order"=33,"price"=200,"engine_alias_description"='This engine translates text from Japanese (Financial vernacular) to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AH.png' where "engine_alias_id"='67d850c6-9d00-4e2f-909e-64e5153551bd';
        update "job_new"."engine" set "engine_name"='Pangeanic - Italian (Eyewear) to English',"engine_alias_name"='Translate - AI - Italian (Eyewear) to English',"order"=34,"price"=200,"engine_alias_description"='This engine translates text from Italian (Eyewear vernacular) to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AI.png' where "engine_alias_id"='ca399d1c-f9cf-4f81-8491-abdc0f8a84bb';
        update "job_new"."engine" set "engine_name"='Pangeanic - Portuguese OCR to English seg',"engine_alias_name"='Translate - AJ - Portuguese OCR to English',"order"=35,"price"=200,"engine_alias_description"='This engine translates text from Portuguese to English. It has been configured to handle OCR text.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AJ.png' where "engine_alias_id"='6ea80777-e3c4-4810-800d-60a995d208ac';
        update "job_new"."engine" set "engine_name"='Pangeanic - Portuguese OCR to English',"engine_alias_name"='Translate - AK - Portuguese OCR to English',"order"=36,"price"=200,"engine_alias_description"='This engine translates text from Portuguese to English.  It has been configured to handle OCR text.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AK.png' where "engine_alias_id"='f511a498-3afb-46e5-b023-d4a457e8f871';
        update "job_new"."engine" set "engine_name"='Pangeanic - Arabic to English',"engine_alias_name"='Translate - AL - Arabic to English',"order"=37,"price"=200,"engine_alias_description"='This engine translates text from Arabic to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-AL.png' where "engine_alias_id"='fe8e0add-8eec-4636-a364-8082099a9dac';
        update "job_new"."engine" set "engine_name"='Amazon - Translate',"engine_alias_name"='Translate - D',"order"=3,"price"=300,"engine_alias_description"='This engine translates Arabic, Chinese, French, German, Portuguese or Spanish to or from English.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='6f47f6d4-57e0-4c2c-9f4f-a3e95e7a725e';
        update "job_new"."engine" set "engine_name"='Pangeanic - Danish to English',"engine_alias_name"='Translate - E - Danish to English',"order"=4,"price"=200,"engine_alias_description"='This engine translates text from Danish to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-E.png' where "engine_alias_id"='18c8ccef-ece6-4826-85d2-d0e0302e344e';
        update "job_new"."engine" set "engine_name"='Pangeanic - French to English',"engine_alias_name"='Translate - F - French to English',"order"=5,"price"=200,"engine_alias_description"='This engine translates text from French to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-F.png' where "engine_alias_id"='1785518c-f81f-40bc-8ae1-220c70c3db56';
        update "job_new"."engine" set "engine_name"='Pangeanic - German to English',"engine_alias_name"='Translate - G - German to English',"order"=6,"price"=200,"engine_alias_description"='This engine translates text from German to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-G.png' where "engine_alias_id"='c22948d7-aa84-4913-9088-5f359cf4187b';
        update "job_new"."engine" set "engine_name"='Pangeanic - Italian to English',"engine_alias_name"='Translate - H - Italian to English',"order"=7,"price"=200,"engine_alias_description"='This engine translates text from Italian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-H.png' where "engine_alias_id"='6d806d7d-8b29-4baa-bcee-8125740fbe8f';
        update "job_new"."engine" set "engine_name"='Pangeanic - Japanese to English',"engine_alias_name"='Translate - I - Japanese to English',"order"=8,"price"=200,"engine_alias_description"='This engine translates text from Japanese to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-I.png' where "engine_alias_id"='0aab1c93-9a55-4e9b-bda3-24d9c48a3d5e';
        update "job_new"."engine" set "engine_name"='Pangeanic - Portuguese to English',"engine_alias_name"='Translate - J - Portuguese to English',"order"=9,"price"=200,"engine_alias_description"='This engine translates text from Portuguese to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-J.png' where "engine_alias_id"='5aeb5be8-b399-4fed-aba3-6e79df8f06df';
        update "job_new"."engine" set "engine_name"='Pangeanic - Russian to English',"engine_alias_name"='Translate - K - Russian to English',"order"=10,"price"=200,"engine_alias_description"='This engine translates text from Russian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-K.png' where "engine_alias_id"='c42b581b-261e-4c7c-9485-2b73473e1172';
        update "job_new"."engine" set "engine_name"='Pangeanic - Simplified Chinese to English',"engine_alias_name"='Translate - L - Simplified Chinese to English',"order"=11,"price"=200,"engine_alias_description"='This engine translates text from Simplified Chinese to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-L.png' where "engine_alias_id"='54ff8699-f7fb-4fb1-8b04-3e5840690700';
        update "job_new"."engine" set "engine_name"='Pangeanic - Spanish to English',"engine_alias_name"='Translate - M - Spanish to English',"order"=12,"price"=200,"engine_alias_description"='This engine translates text from Spanish to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-M.png' where "engine_alias_id"='441c9e9b-3232-4911-ac05-05f08e03175d';
        update "job_new"."engine" set "engine_name"='Pangeanic - Swedish to English',"engine_alias_name"='Translate - N - Swedish to English',"order"=13,"price"=200,"engine_alias_description"='This engine translates text from Swedish to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-N.png' where "engine_alias_id"='af72433e-76d1-49b4-855b-758c87c5768d';
        update "job_new"."engine" set "engine_name"='Pangeanic - Bulgarian to English',"engine_alias_name"='Translate - O - Bulgarian to English',"order"=14,"price"=200,"engine_alias_description"='This engine translates text from Bulgarian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-O.png' where "engine_alias_id"='c131d296-ef65-41a2-b506-00d63382d083';
        update "job_new"."engine" set "engine_name"='Pangeanic - Catalan to English',"engine_alias_name"='Translate - P - Catalan to English',"order"=15,"price"=200,"engine_alias_description"='This engine translates text from Catalan to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-P.png' where "engine_alias_id"='6de87fa0-1e27-4acd-9179-70914ad38bfc';
        update "job_new"."engine" set "engine_name"='Pangeanic - Czech to English',"engine_alias_name"='Translate - Q - Czech to English',"order"=16,"price"=200,"engine_alias_description"='This engine translates text from Czech to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-Q.png' where "engine_alias_id"='281cf952-1f8a-42e4-bbac-63e2a2a06c48';
        update "job_new"."engine" set "engine_name"='Pangeanic - Farsi to English',"engine_alias_name"='Translate - R - Farsi to English',"order"=17,"price"=200,"engine_alias_description"='This engine translates text from Farsi to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-R.png' where "engine_alias_id"='84dff93a-1fa5-409b-8d1c-9ea2a363e524';
        update "job_new"."engine" set "engine_name"='Pangeanic - Finnish to English',"engine_alias_name"='Translate - S - Finnish to English',"order"=18,"price"=200,"engine_alias_description"='This engine translates text from Finnish to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-S.png' where "engine_alias_id"='f5bbee23-6360-4bca-83f1-a9308bd06556';
        update "job_new"."engine" set "engine_name"='Pangeanic - Greek to English',"engine_alias_name"='Translate - T - Greek to English',"order"=19,"price"=200,"engine_alias_description"='This engine translates text from Greek to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-T.png' where "engine_alias_id"='ba065561-f8d6-4aa1-9b20-3e17ceee1b13';
        update "job_new"."engine" set "engine_name"='Pangeanic - Hebrew to English',"engine_alias_name"='Translate - U - Hebrew to English',"order"=20,"price"=200,"engine_alias_description"='This engine translates text from Hebrew to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-U.png' where "engine_alias_id"='5b4dc573-0403-44fc-8507-ccb38593fdfb';
        update "job_new"."engine" set "engine_name"='Pangeanic - Hungarian to English',"engine_alias_name"='Translate - V - Hungarian to English',"order"=21,"price"=200,"engine_alias_description"='This engine translates text from Hungarian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-V.png' where "engine_alias_id"='136b5eb6-be95-4078-8bda-8306d7e36d94';
        update "job_new"."engine" set "engine_name"='Pangeanic - Indonesian to English',"engine_alias_name"='Translate - W - Indonesian to English',"order"=22,"price"=200,"engine_alias_description"='This engine translates text from Indonesian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-W.png' where "engine_alias_id"='07517eb1-4350-4228-b350-92d51d2b2294';
        update "job_new"."engine" set "engine_name"='Pangeanic - Korean to English',"engine_alias_name"='Translate - X - Korean to English',"order"=23,"price"=200,"engine_alias_description"='This engine translates text from Korean to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-X.png' where "engine_alias_id"='989aef4b-9501-493a-9470-504e668913b3';
        update "job_new"."engine" set "engine_name"='Pangeanic - Malay to English',"engine_alias_name"='Translate - Y - Malay to English',"order"=24,"price"=200,"engine_alias_description"='This engine translates text from Malay to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-Y.png' where "engine_alias_id"='00f5fcf8-1ad5-4a24-9f56-877d398d5050';
        update "job_new"."engine" set "engine_name"='Pangeanic - Norwegian to English',"engine_alias_name"='Translate - Z - Norwegian to English',"order"=25,"price"=200,"engine_alias_description"='This engine translates text from Norwegian to English.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/translate-Z.png' where "engine_alias_id"='faa65a08-cd26-4a97-b8ba-97a1d4a30245';

        -- Table Definition ----------------------------------------------
        CREATE TABLE IF NOT EXISTS libraries.library__recording (
            library_id uuid REFERENCES libraries.library(library_id) ON DELETE CASCADE,
            recording_id text REFERENCES recording.recording(recording_id) ON DELETE CASCADE,
            CONSTRAINT library__recording_pkey PRIMARY KEY (library_id, recording_id)
        );

        -- Indices -------------------------------------------------------

        CREATE UNIQUE INDEX IF NOT EXISTS library__recording_pkey ON libraries.library__recording(library_id uuid_ops,recording_id text_ops);
        CREATE INDEX IF NOT EXISTS library__recording_library_id_idx ON libraries.library__recording(library_id uuid_ops);

        -- base config table for both entity & dataset libraries
        CREATE TABLE IF NOT EXISTS libraries.model_configurations (
            configuration_id uuid PRIMARY KEY,
            library_id uuid NOT NULL REFERENCES libraries.library(library_id) ON DELETE CASCADE,
            engine_category_id text NOT NULL REFERENCES job_new.engine_category(engine_category_id),
            target_engine_ids text[],
            created_date_time integer DEFAULT date_part('epoch'::text, now())
        );

        -- Indices 
        CREATE UNIQUE INDEX IF NOT EXISTS model_configurations_pkey ON libraries.model_configurations(configuration_id uuid_ops);
        CREATE INDEX IF NOT EXISTS library_id ON libraries.model_configurations(library_id uuid_ops);

        -- dataset only config table
        CREATE TABLE IF NOT EXISTS libraries.dataset_configurations (
            configuration_id uuid REFERENCES libraries.model_configurations(configuration_id) ON DELETE CASCADE PRIMARY KEY,
            ranked_source_engine_ids text[],
            min_confidence real DEFAULT 0,
            max_confidence real DEFAULT 100,
            allow_null_confidence boolean DEFAULT true
        );

        -- Indices 
        CREATE UNIQUE INDEX IF NOT EXISTS dataset_configurations_pkey ON libraries.dataset_configurations(configuration_id uuid_ops);

        -- Remove export Doc formats since it is not yet supported
        update "job_new"."engine_category" set "export_formats"='[{"label": "Plain Text", "types": [], "format": "txt"}, {"label": "Time Text Markup Language", "types": [], "format": "ttml"}, {"label": "WebVTT", "types": ["subtitle"], "format": "vtt"}, {"label": "SubRip Text", "types": ["subtitle"], "format": "srt"}]' where "engine_category_id"='67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
        update "job_new"."engine_category" set "export_formats"='[{"label": "Plain Text", "types": [], "format": "txt"}, {"label": "Time Text Markup Language", "types": [], "format": "ttml"}, {"label": "WebVTT", "types": ["subtitle"], "format": "vtt"}, {"label": "SubRip Text", "types": ["subtitle"], "format": "srt"}]' where "engine_category_id"='a856c447-1030-4fb0-917f-08179f949c4e';

        INSERT INTO event_trigger.event_triggers (organization_id, event_name, target_name, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL, 'correlate_tdo', 'CorrelationTopic', now(), now(),'jebenezer','jebenezer', 'correlation'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE 
        event_name = 'correlate_tdo' AND
        target_name = 'CorrelationTopic' AND
        event_type = 'correlation'
        );

        alter database platform set random_page_cost=1;

        -- Remove export Doc formats since it is not yet supported
        update job_new.build set task_runtime='{"iron": {"cluster": "59a9b4ef6564d1000b03a105", "priority": 0, "pollingDelay": 60}}'
        where engine_id = 'imagedetection-logorecognition-logograb'
        and build_id = 'cd9ce83c-7ee1-4ade-b3a1-8bdada256ec8';

        UPDATE event_trigger.event SET created_by = 'veritone' WHERE created_by = 'vertone';

        -- Remove export Doc formats since it is not yet supported
        update job_new.build set task_runtime='{"iron": {"cluster": "59a9b4ef6564d1000b03a105", "priority": 0, "pollingDelay": 60}}'
        where engine_id = 'imagedetection-logorecognition-logograb'
        and build_id = '56d68bf5-e941-4e35-b963-97c40747f3c6';

        alter table job_new.engine alter column "order" set default 100;

        ALTER TABLE
            workflow.workflow_runtime
        ADD COLUMN IF NOT EXISTS auth_token text;

        -- add mention gen public event
        INSERT INTO event_trigger.event
        (event_id, event_name, event_type, organization_id, application_id, schema_data, schema_hash, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        VALUES('300d6b2a-ce3d-4839-acc2-dd23ec10c64f', 'MentionGenerated', 'mention', @@{ROOT_ORG_ID}@@, 'system', 'message MentionGenerated {
            int64 mention_id = 10;
            int64 watchlist_id = 12;
            int64 schedule_id = 16;
            int64 tdo_id = 18;
        }', 'F3BCA0C2A883AC2F34B5A355F4B97CC7A12AEFE62A985980C4FEB405C28C60FE', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        UPDATE job_new.engine
        SET engine_alias_id = engine_id, jwt_rights = '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "job.read", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id = '9b4357b3-93bc-4886-bc62-53384eede9f5' -- RSS adapter
        ;

        UPDATE job_new.engine
        SET engine_alias_id = engine_id, jwt_rights = '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "job.read", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id IN (
        'ccf24d4d-e9c0-4dae-887c-d2b5f9cc33cd', -- Youtube video
        '9b4357b3-93bc-4886-bc62-53384eede9f5' -- RSS adapter
        );

        -- Remove export Doc formats since it is not yet supported
        update job_new.build set task_runtime='{"iron": {"cluster": "59a9b4ef6564d1000b03a105", "priority": 0, "pollingDelay": 60}}'
        where engine_id = 'imagedetection-logorecognition-logograb'
        and build_id = '56d68bf5-e941-4e35-b963-97c40747f3c6';

        -- Remove export Doc formats since it is not yet supported
        update job_new.build set task_runtime='{"iron": {"cluster": "59a9b4ef6564d1000b03a105", "priority": 0, "pollingDelay": 60}}'
        where engine_id = 'imagedetection-logorecognition-logograb'
        and build_id = '3b4eb74c-6392-40cb-a9a5-c692493fda3d';

        DO $$
        BEGIN
        BEGIN
            ALTER TABLE libraries.library_engine_model
            -- Add accuracy column to track engine_model performance
            ADD COLUMN IF NOT EXISTS accuracy integer,
            -- Add configuration column to track associated model configuration
            ADD COLUMN IF NOT EXISTS configuration_id uuid,
            -- Set constraint on configuration_id column
            ADD CONSTRAINT configuration_id
                FOREIGN KEY (configuration_id)
                REFERENCES libraries.model_configurations(configuration_id);
        EXCEPTION
            WHEN duplicate_object THEN RAISE NOTICE 'constraint "configuration_id" for relation "library_engine_model" already exists, skipping';
        END;
        END $$; 

        -- add new dataset library type
        INSERT INTO libraries.library_type (library_type_id, label, entity_type_name_plural, entity_type_name)
        SELECT 'dataset', 'Dataset', 'datasets', 'dataset'
        WHERE NOT EXISTS (
            SELECT library_type_id FROM libraries.library_type WHERE library_type_id = 'dataset'
        );

        -- add new 'tdo' entity identifier type for dataset library
        INSERT INTO libraries.entity_identifier_type (
            entity_identifier_type_id,
            label,
            data_type,
            label_plural,
            description
        )
        SELECT 'dataset', 'dataset', 'recording', 'datasets', 'temporal data objects'
        WHERE NOT EXISTS (
            SELECT entity_identifier_type_id 
            FROM libraries.entity_identifier_type 
            WHERE entity_identifier_type_id = 'dataset'
        );

        -- update library type & entity type relation shipe to includes dataset library
        INSERT INTO libraries.library_type__entity_identifier_type (library_type_id, entity_identifier_type_id)
        VALUES ('dataset', 'dataset')
        ON CONFLICT DO NOTHING;


        INSERT INTO "event_trigger"."event_triggers"("organization_id","event_name","consumer_directive","target_name","consumer_params","created_at_utc","updated_at_utc","updated_by","created_by","event_type")
        VALUES
        (NULL,'mention_export_request',NULL,'MentionExport',NULL,now(),now(),'ndthang','ndthang','export')
        ON CONFLICT(event_trigger_id) DO NOTHING;

        UPDATE libraries.entity_identifier_type
        SET data_type='tdo'
        WHERE entity_identifier_type_id='dataset'
            AND data_type='recording';

        update "job_new"."engine" set "engine_name"='Veritone - Speaker Separation',"engine_alias_name"='Speaker Separation - A',"order"=0,"price"=100,"engine_alias_description"='This engine diarizes, or segments transcripts by speaker.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='40356dac-ace5-46c7-aa02-35ef089ca9a4';
        update "job_new"."engine" set "engine_name"='Cyber Resonance - AdDetective',"engine_alias_name"='Sound Recognition - A',"order"=28,"price"=100,"engine_alias_description"='This engine detects the presence of individual advertisements in broadcast-quality audio.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/sound-recognition-A.png' where "engine_alias_id"='33ca995f-443d-4da6-b6aa-5267dd2c2e19';
        update "job_new"."engine" set "engine_name"='Microsoft Cognitive Services - Translator - V2F',"engine_alias_name"='Translate - AM - V2F',"order"=38,"price"=200,"engine_alias_description"='This engine translates text and has multiple language options, on V2F.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='5554ca03-2712-4299-8dbd-b139c691f6a1';
        update "job_new"."engine" set "engine_name"='Pangeanic - Language Identification',"engine_alias_name"='Language Identification - B',"order"=39,"price"=200,"engine_alias_description"='This engine identifies the language(s) present in a text file or transcript.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/language-identification-B.png' where "engine_alias_id"='c45d8fdc-5a61-4175-981d-fe1033003dfc';
        update "job_new"."engine" set "engine_name"='Capio.AI - Language Identification',"engine_alias_name"='Language Identification - C',"order"=160,"price"=125,"engine_alias_description"='This engine identifies the language(s) spoken in an audio file.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/language-identification-C.png' where "engine_alias_id"='e02b3273-00e2-446f-a160-24a18dbcc188';
        update "job_new"."engine" set "engine_name"='Google - Text Recognition (OCR) - V2F',"engine_alias_name"='Text Recognition - D - V2F',"order"=3,"price"=750,"engine_alias_description"='This premium engine recognizes text in images and video, on V2F.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='38afb67a-045b-43db-96db-9080073695ab';
        update "job_new"."engine" set "engine_name"='CyberExtruder Aureus - Face Recognition - V2F',"engine_alias_name"='Face Recognition - F - V2F',"order"=5,"price"=100,"engine_alias_description"='This engine recognizes people''s faces in visual content, on V2F.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='434db220-b38f-4bb6-bf65-02a4469559ac';
        update "job_new"."engine" set "engine_name"='Veritone - Face Recognition - Mask RCNN',"engine_alias_name"='Face Recognition - G',"order"=6,"price"=100,"engine_alias_description"='This engine recognizes people''s faces in visual content.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='ba5e41ad-31dc-4bc8-be19-617a10e08240';
        update "job_new"."engine" set "engine_name"='Machine Box - Facebox Recognize - V2F',"engine_alias_name"='Face Recognition - I - V2F',"order"=7,"price"=100,"engine_alias_description"='This engine recognizes people''s faces in visual content, on V2F.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/face-recognition-I.png' where "engine_alias_id"='dcef5300-5cc1-4fe3-bd8f-5c4d3a09b281';
        update "job_new"."engine" set "engine_name"='Veritone - Face Detection (Head) - V2F',"engine_alias_name"='Face Detection - E - V2F',"order"=9,"price"=100,"engine_alias_description"='This engine detects people''s heads in visual content. ',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='34b859a1-998d-419f-8d61-47f9f1d10046';
        update "job_new"."engine" set "engine_name"='Machine Box - Facebox Detect - V2F',"engine_alias_name"='Face Detection - F - V2F',"order"=10,"price"=100,"engine_alias_description"='This engine detects people''s faces in visual content, on V2F. ',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/face-detection-F.png' where "engine_alias_id"='2cac8eb8-b234-4289-a8fc-684cfa79d284';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Face Detection - V2F (USEast)',"engine_alias_name"='Face Detection - G - V2F',"order"=11,"price"=900,"engine_alias_description"='This engine detects the presence of faces in visual content, on V2F.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='e6f9f47b-4041-41cc-9cc8-dfe3507f0f4b';
        update "job_new"."engine" set "engine_name"='Machine Box - Facebox Similarity - V2F',"engine_alias_name"='Face Similarity - A - V2F',"order"=12,"price"=100,"engine_alias_description"='This engine returns the top 10 candidates for a recognized person''s face, on V2F.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/face-similarity-A.png' where "engine_alias_id"='bab908d5-1eb0-4b94-9b0c-5c4bb6a81d78';
        update "job_new"."engine" set "engine_name"='Google - General Object Detection - V2F',"engine_alias_name"='Object Detection - AC - V2F',"order"=28,"price"=750,"engine_alias_description"='This premium engine labels visual content to describe the objects and concepts in the image or video, on V2F. ',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c3497af0-ac1c-421d-8b2e-618797093623';
        update "job_new"."engine" set "engine_name"='Veritone - Apparel Color',"engine_alias_name"='Object Detection - AD - Apparel Color',"order"=29,"price"=100,"engine_alias_description"='This engine recognizes clothing color in visual content.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='cf346481-e1b6-4d04-8466-516722fe4495';
        update "job_new"."engine" set "engine_name"='Valossa Soccer BETA',"engine_alias_name"='Object Detection - AF - Soccer',"order"=31,"price"=750,"engine_alias_description"='Detect soccer related events, such as corner-kicks, goals, injuries, audience reactions etc.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/object-detection-AF.png' where "engine_alias_id"='5a1281c2-302f-469b-8803-6747877320ae';
        update "job_new"."engine" set "engine_name"='Valossa Visual Compliance Labels',"engine_alias_name"='Object Detection - AG - Moderation',"order"=32,"price"=750,"engine_alias_description"='This engine detects inappropriate or explicit content (eg. nudity, smoking) in images and video.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/object-detection-AG.png' where "engine_alias_id"='b22d104e-77c9-418d-8a7a-9a71c642a02d';
        update "job_new"."engine" set "engine_name"='Valossa Visual Object Labels',"engine_alias_name"='Object Detection - AH',"order"=33,"price"=750,"engine_alias_description"='This engine detects objects and concepts in visual content.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/object-detection-AH.png' where "engine_alias_id"='a8aa0daa-45d3-4dd4-8339-6aa7e6e66711';
        update "job_new"."engine" set "engine_name"='Veritone - General Object Detection GPU - V2F',"engine_alias_name"='Object Detection - AI - V2F',"order"=34,"price"=100,"engine_alias_description"='This engine detects objects and concepts in visual content, which requires GPU to run, on V2F.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='686a9a5d-ef18-4b63-9f8f-58aa0232d207';
        update "job_new"."engine" set "engine_name"='Veritone - General Object Detection - V2F',"engine_alias_name"='Object Detection - AJ - V2F',"order"=35,"price"=100,"engine_alias_description"='This engine detects objects and concepts in visual content, on V2F.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='b88ca760-381a-471c-a089-e53894db881a';
        update "job_new"."engine" set "engine_name"='Machine Box - Nudebox - V2F',"engine_alias_name"='Object Detection - AK - Moderation',"order"=36,"price"=100,"engine_alias_description"='This engine detects inappropriate or explicit content (ie. nudity) in visual content, on V2F.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/object-detection-AK.png' where "engine_alias_id"='a069d59e-8f16-4d41-ad8b-182d2367368f';
        update "job_new"."engine" set "engine_name"='Machine Box - Image Classification',"engine_alias_name"='Image Classification - A',"order"=37,"price"=100,"engine_alias_description"='This engine can be trained to classify the entire image, rather than detect objects within it.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/image-classification-A.png' where "engine_alias_id"='92295883-2004-42d0-8e6c-2783ee64bd43';
        update "job_new"."engine" set "engine_name"='HPE - License Plate',"engine_alias_name"='License Plate - A',"order"=38,"price"=750,"engine_alias_description"='This engine recognizes license plates in images.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='f5d91496-fd4a-8a61-2398-87fc50ee6693';
        update "job_new"."engine" set "engine_name"='OpenALPR - Video Clips - V2F',"engine_alias_name"='License Plate - B - V2F',"order"=39,"price"=100,"engine_alias_description"='This engine recognizes license plates in images.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='13521ca5-d5f8-4719-8a2c-815eda8dbdbf';
        update "job_new"."engine" set "engine_name"='Capio.AI - English (US) Stream - V2F',"engine_alias_name"='Transcription - ES - English (US) Stream - V2F',"order"=148,"price"=125,"engine_alias_description"='This engine transcribes US English speech to text.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/transcription-ES.png' where "engine_alias_id"='fe97522f-4b5a-4282-acaa-61242376e7f7';
        update "job_new"."engine" set "engine_name"='Amazon - Transcription - V2F',"engine_alias_name"='Transcription - ET - V2F',"order"=149,"price"=250,"engine_alias_description"='This engine transcribes US English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='1e235b57-9ada-411a-ba9c-1324205b9e40';
        update "job_new"."engine" set "engine_name"='Veritone - Transcription - DS English - V2F',"engine_alias_name"='Transcription - EU - English - V2F',"order"=150,"price"=100,"engine_alias_description"='This engine transcribes English from speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='07a44691-088f-4860-8e09-1dc3045574c9';
        update "job_new"."engine" set "engine_name"='Veritone - Transcription - DS English',"engine_alias_name"='Transcription - EV - English',"order"=151,"price"=100,"engine_alias_description"='This engine transcribes English from speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c3261a8e-fca8-475f-977f-1b1ddafe146a';
        update "job_new"."engine" set "engine_name"='Google - Transcription - V2F',"engine_alias_name"='Transcription - EW - V2F',"order"=152,"price"=250,"engine_alias_description"='This cloud engine transcribes speech to text and has multiple language selection options, on V2F.',"engine_alias_logo_path"=Null where "engine_alias_id"='f99d363b-d20a-4498-b3cc-840b79ee78d9';
        update "job_new"."engine" set "engine_name"='Veritone - Transcription - K English (UK)',"engine_alias_name"='Transcription - EX - English (UK)',"order"=153,"price"=100,"engine_alias_description"='This engine transcribes UK English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='6ad5c1c4-1c7f-4097-99a4-e48fbc9e719b';
        update "job_new"."engine" set "engine_name"='Veritone - Transcription - K English (US)',"engine_alias_name"='Transcription - EY - English (US)',"order"=154,"price"=100,"engine_alias_description"='This engine transcribes US English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='28c805fd-2b74-4a9b-84a1-c16a99a4fcf2';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - English (US) - V2F',"engine_alias_name"='Transcription - EZ - English (US) - V2F',"order"=155,"price"=125,"engine_alias_description"='This engine transcribes US English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='a3f9008a-63d2-4870-bb17-19fc70ba41de';
        update "job_new"."engine" set "engine_name"='Remeeting Transcription - Spanish (MX) Telephony',"engine_alias_name"='Transcription - FA - Spanish (MX) Telephony',"order"=156,"price"=125,"engine_alias_description"='This engine transcribes Mexican Spanish speech to text.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/transcription-FA.png' where "engine_alias_id"='3f355b77-008a-4689-9ff5-f5c96f3374cb';
        update "job_new"."engine" set "engine_name"='Remeeting Transcription - English (US) - V2F',"engine_alias_name"='Transcription - FB - English (US) - V2F',"order"=157,"price"=125,"engine_alias_description"='This engine transcribes US English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='13425741-0dcd-42ab-a3a3-16cb374acb28';
        update "job_new"."engine" set "engine_name"='VoiceBase Transcription - V2F',"engine_alias_name"='Transcription - FC - V2F',"order"=158,"price"=125,"engine_alias_description"='This engine transcribes speech to text and has multiple language options.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='b396fa74-83ff-4052-88a7-c37808a25673';
        update "job_new"."engine" set "engine_name"='Zoom Media - Transcription - V2F',"engine_alias_name"='Transcription - FD - V2F',"order"=159,"price"=500,"engine_alias_description"='This engine transcribes speech to text and has multiple language options.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='34ce9e41-8879-49c7-8f04-f1034eef45c6';

        -- Remove export Doc formats since it is not yet supported
        update job_new.build set task_runtime='{"iron": {"cluster": "59a9b4ef6564d1000b03a105", "priority": 0, "pollingDelay": 60}}'
        where engine_id = 'imagedetection-logorecognition-logograb'
        and build_id = 'c4e9db39-ce88-496a-85c2-e1acac488cb4';

        ALTER TABLE event_trigger.event_subscription
        ADD COLUMN IF NOT EXISTS subscription_hash text NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_subscription_hash ON event_trigger.event_subscription (subscription_hash);

        INSERT INTO "job_new"."engine_category" (
            "engine_category_id",
            "engine_category_name",
            "engine_category_description",
            "search",
            "elastic",
            "data_field",
            "icon_class",
            "editable",
            "video_only",
            "order",
            "library_identifier_types",
            "dependencies",
            "engine_class_id",
            "color",
            "engine_type_id",
            "export_formats"
        ) VALUES (
            'c5458876-43d2-41e8-a340-f734702df04a',
            'Workflow',
            '',
            '{"enabled": false}',
            '{"enabled": false}',
            'workflow',
            'icon-workflow',
            'f',
            'f',
            '21',
            null,
            '{"category": "workflow", "dependencies": []}',
            null,
            null,
            'fcc22feb-9184-4f53-be5e-7694927864d9',
            '[]'
        )
        ON CONFLICT DO NOTHING;

        UPDATE job_new.engine
        SET jwt_rights = '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id = '8e0f4cc4-9ff4-4814-8cae-91f0a81879d1';

        -- upsert new engine category for text document extraction
        INSERT INTO job_new.engine_category (
        "engine_category_id",
        "engine_category_name",
        "engine_category_description",
        "search",
        "elastic",
        "data_field",
        "icon_class",
        "editable",
        "video_only",
        "order",
        "dependencies",
        "color",
        "engine_class_id",
        "engine_type_id"
        ) VALUES (
        'ba2a423e-99c9-4422-b3a5-0b188d8388ab',
        'Text Extraction',
        'Extract text data from document files',
        '{"enabled": true}',
        '{"enabled": true}',
        'document',
        'icon-description',
        FALSE,
        FALSE,
        23,
        '{"category": "document", "dependencies": ["ingestion"]}',
        NULL,
        NULL,
        'fcc22feb-9184-4f53-be5e-7694927864d9'
        ) ON CONFLICT (engine_category_id) DO UPDATE SET (
        "engine_category_id",
        "engine_category_name",
        "engine_category_description",
        "search",
        "elastic",
        "data_field",
        "icon_class",
        "editable",
        "video_only",
        "order",
        "dependencies",
        "color",
        "engine_class_id",
        "engine_type_id"
        ) = (
        EXCLUDED.engine_category_id,
        EXCLUDED.engine_category_name,
        EXCLUDED.engine_category_description,
        EXCLUDED.search,
        EXCLUDED.elastic,
        EXCLUDED.data_field,
        EXCLUDED.icon_class,
        EXCLUDED.editable,
        EXCLUDED.video_only,
        EXCLUDED.order,
        EXCLUDED.dependencies,
        EXCLUDED.color,
        EXCLUDED.engine_class_id,
        EXCLUDED.engine_type_id
        );

        UPDATE job_new.engine_category ec SET (
        "engine_category_name",
        "engine_category_description",
        "data_field",
        "icon_class",
        "dependencies"
        ) = (
        'Cognition Utility',
        'Miscellaneous utility engines for cognition',
        'utility',
        NULL,
        '{"category": "utility", "dependencies": ["ingestion"]}'
        ) WHERE ec.engine_category_id = 'f951fbf9-aa69-47a2-87c8-12dfb51a1f18';

        alter table aiware.node add column if not exists node_config jsonb;

        alter table aiware.cluster add column if not exists cluster_config jsonb;
        alter table aiware.cluster add column if not exists status text; -- enum enforced in API
        alter table aiware.cluster add column if not exists target_status text; -- enum enforced in API
        alter table aiware.cluster add column if not exists tags text[];
        alter table aiware.cluster add column if not exists cluster_state jsonb;
        alter table aiware.cluster add column if not exists cluster_history jsonb;
        alter table aiware.cluster add column if not exists state_last_updated_date_time int4;

        ALTER TABLE job_new.engine_category ADD COLUMN IF NOT EXISTS validation_contract text;

        CREATE INDEX IF NOT EXISTS "ix_engine_validation_contract" on job_new.engine_category(validation_contract);

        UPDATE job_new.engine_category ec
        SET
        "validation_contract" = 'transcript'
        WHERE
        ec.engine_category_id = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

        UPDATE job_new.engine_category ec
        SET
        "validation_contract" = 'object'
        WHERE
        ec.engine_category_id = '088a31be-9bd6-4628-a6f0-e4004e362ea0';

        --  create entity identifier type for transcription-engine-model
        INSERT INTO "libraries"."entity_identifier_type"("entity_identifier_type_id", "label", "data_type", "label_plural", "description") VALUES('transcription-engine-model', 'engine-model', 'text', 'engine-models', 'Engine Models')
        ON CONFLICT DO nothing;

        -- create library type
        INSERT INTO "libraries"."library_type"("library_type_id", "label", "entity_type_name_plural", "entity_type_name", "entity_type_schema") VALUES('transcription-engine-model', 'Transcription Engine Model', 'engine-models', 'engine-model', '{}')
        ON CONFLICT DO nothing;

        -- link the entity type with the library
        INSERT INTO "libraries"."library_type__entity_identifier_type"("library_type_id", "entity_identifier_type_id") VALUES('transcription-engine-model', 'transcription-engine-model')
        ON CONFLICT DO nothing;

        -- force a library with a known GUID
        INSERT INTO "libraries"."library"("library_id","name","version","owner_org_id","library_type_id")
        VALUES
        (E'a31a421d-9ff0-401f-b017-4477dd9648ce',E'ConductorTrainingEngineModels',0,17457,E'transcription-engine-model')
        ON CONFLICT DO nothing;

        ALTER TABLE job_new.engine_class ADD COLUMN IF NOT EXISTS icon_class text;

        INSERT INTO job_new.engine_class(engine_class_id, engine_class_name, engine_class_description, icon_class)
        VALUES
        ('e0283fdf-7f85-472e-b367-59cc8d205ba7', 'audio', 'The input to engines in the Audio class is an audio or video file or stream. If your engine processes human speech or voice, it likely belongs in the Speech class instead. Audio engines may recognize a specific audio segment, such as an advertisement, identify sounds like that of a crying baby or detect the presence of audio or music in an audio or video file, for example.', 'icon-audio_det'),
        ('1bcfdd35-1e9b-4694-8273-00b19510d164', 'biometrics', 'The input to engines in the Biometrics class may be an image, speech or other audio or video file or stream. By definition, the Biometrics class covers cognitive analysis related to data points from the human body. Biometrics engines may detect or recognize faces, identify face attributes to estimate a person''s age or ethnicity or verify a person based on their unique iris, for example.', 'icon-face'),
        ('fc88ed0f-19e7-410c-8d3c-050f6d6e8fb0', 'data', 'The inputs to engines in the Data class can be structured or unstructured data. Examples include geolocation information, historical weather data, network usage data, billing records, or signals from IoT devices. Data engines may detect outliers or anomalies in data, correlate two or more data sets, identify the geographic location of a person, predict future trajectories based on historical trends, optimize presentation of content or advertising, or suggest a decision paths for example.', 'icon-third-party-data'),
        ('6f14c847-0901-47dc-98f0-e1b5fccba223', 'speech', 'The input to engines in the Speech class is human speech, in the form of an audio or video file or stream. Speech engines may make predictions about what was said by one or more speakers, identify those speakers, identify the language spoken or detect vocal emotion, for example.', 'icon-message'),
        ('29fd494a-e1e9-4eea-82bf-b80b36adbd82', 'text', 'The input to engines in the Text class can be structured or unstructured text. In some cases the text input is structured in a VTN standard format. Such is the case when the output from a Transcription (Speech) engine is fed into a Translation (Text) engine. Text engines may translate text from one language to another, summarize it, detect profane language or extract sentiment or entities, for example.  Text Analytics is often used as an umbrella term for combinations of Capabilities within the Text class.', 'icon-translation'),
        ('8e1d484e-7a52-488b-ab38-9b89f4778fa5', 'transformation', 'The inputs to engines in the Transformation class are varied and may include images, audio, video, data, etc. Transformation engines convert or manipulate the original input in some way, often outputting a derivative file based on the source. Examples include redacting faces or credit card numbers, summarizing or condensing a video, converting file format types or removing extraneous noise from audio, for example.', 'icon-transform'),
        ('dd5a5de8-547f-4e5c-8572-fac51810bc2a', 'vision', 'The input to engines in the Vision class is an image or video, file or stream. Vision engines may recognize objects within an image, classify the entire image, read license plates or classify actions or gestures, for example.  Most Capabilities commonly associated with the field of Computer Vision are included in Vision as defined by Veritone, though Face Recognition and associated capabilities have been classified under Biometrics.', 'icon-visibility')
        ON CONFLICT(engine_class_id) DO NOTHING;


        -- Join table to associate engines with applications (supports app packages feature)
        -- Table Definition ----------------------------------------------
        CREATE TABLE IF NOT EXISTS job_new.engine__application (
        engine_id text NOT NULL REFERENCES job_new.engine(engine_id) ON DELETE CASCADE,
        application_id uuid NOT NULL,
        created_date_time timestamp with time zone DEFAULT (now() at time zone 'utc')
        );

        -- Indices -------------------------------------------------------
        CREATE UNIQUE INDEX IF NOT EXISTS "_pk_engine__application@engine_id,application_id" ON job_new.engine__application(engine_id text_ops,application_id uuid_ops);
        CREATE INDEX IF NOT EXISTS "_ix_engine__application@engine_id" ON job_new.engine__application(engine_id text_ops);
        CREATE INDEX IF NOT EXISTS "_ix_engine__application@application_id" ON job_new.engine__application(application_id uuid_ops);

        -- Renaming "speaker separation" engine category to conform with the "face detection" convention
        update job_new.engine_category
        set engine_category_name        = 'Speaker Detection',
            engine_category_description = 'Detect and identify speakers in audio'
        where engine_category_id = 'a856c447-1030-4fb0-917f-08179f949c4e';

        -- New entity identifier type for "Voice"
        insert into libraries.entity_identifier_type (entity_identifier_type_id, label, icon_class, data_type, label_plural,
                                                    description)
        values ('voice-recording',
                'voice recording',
                'icon-record_voice_over',
                'audio',
                'voice recordings',
                'voice recordings')
        on conflict do nothing;

        -- Associate to "People" library type
        insert into libraries.library_type__entity_identifier_type (library_type_id, entity_identifier_type_id)
        VALUES ('people', 'voice-recording')
        on conflict do nothing;

        -- Associate to "Speaker Detection" engine category
        update job_new.engine_category
        set library_identifier_types = array ['voice-recording']
        where engine_category_id = 'a856c447-1030-4fb0-917f-08179f949c4e';


        -- Add new columns to engine table
        ALTER TABLE job_new.engine
        ADD COLUMN IF NOT EXISTS use_cases jsonb,
        ADD COLUMN IF NOT EXISTS industries jsonb,
        ADD COLUMN IF NOT EXISTS engine_manifest jsonb;

        -- Add new columns to engine table
        -- insert 'Entity Extraction' capability
        INSERT INTO job_new.engine_category (
        engine_category_id,
        engine_category_name,
        engine_category_description,
        data_field,
        icon_class,
        "order",
        engine_class_id,
        engine_type_id
        )
        VALUES
        ('a9fa3b20-96ab-44ce-86bc-7694a3b01d82', 'Entity Extraction', 'Classifies named entities, in unstructured text, into predefined categories, such as people, organizations, or locations.', 'entity', 'icon-entity', 24, '29fd494a-e1e9-4eea-82bf-b80b36adbd82', 'fcc22feb-9184-4f53-be5e-7694927864d9')
        ON CONFLICT(engine_category_id) DO NOTHING;

        -- insert 'License Plate' capability
        INSERT INTO job_new.engine_category (
        engine_category_id,
        engine_category_name,
        engine_category_description,
        data_field,
        "order",
        engine_class_id,
        engine_type_id,
        validation_contract
        )
        VALUES
        ('efb9867a-4349-42a3-9277-71fd4ad701a9', 'License Plate (ALPR)', 'Produces a text string of alphanumeric characters for each vehicle license plate recognized in an image or video.', 'alpr', 25, 'dd5a5de8-547f-4e5c-8572-fac51810bc2a', 'fcc22feb-9184-4f53-be5e-7694927864d9', 'license-plate')
        ON CONFLICT(engine_category_id) DO NOTHING;

        -- associate audio-related capabilities with audio class
        UPDATE job_new.engine_category
        SET engine_class_id = 'e0283fdf-7f85-472e-b367-59cc8d205ba7'
        WHERE data_field = 'audio'
        OR data_field = 'fingerprint';

        -- associate biometric-related capabilities with biometrics class
        UPDATE job_new.engine_category
        SET engine_class_id = '1bcfdd35-1e9b-4694-8273-00b19510d164'
        WHERE data_field = 'face';

        -- associate data-related capabilities with data class
        UPDATE job_new.engine_category
        SET engine_class_id = 'fc88ed0f-19e7-410c-8d3c-050f6d6e8fb0'
        WHERE data_field = 'correlation'
        OR data_field = 'geolocation';

        -- associate speech-related capabilities with speech class
        UPDATE job_new.engine_category
        SET engine_class_id = '6f14c847-0901-47dc-98f0-e1b5fccba223'
        WHERE data_field = 'speaker'
        OR data_field = 'transcript';

        -- associate text-related capabilities with text class
        UPDATE job_new.engine_category
        SET engine_class_id = '29fd494a-e1e9-4eea-82bf-b80b36adbd82'
        WHERE data_field = 'sentiment'
        OR data_field = 'speech'
        OR data_field = 'translate'
        OR data_field = 'document'
        OR data_field = 'entity';

        -- associate transcoding-related capabilities with transcoding class
        UPDATE job_new.engine_category
        SET engine_class_id = '8e1d484e-7a52-488b-ab38-9b89f4778fa5'
        WHERE data_field = 'transcode';

        -- associate vision-related capabilities with vision class
        UPDATE job_new.engine_category
        SET engine_class_id = 'dd5a5de8-547f-4e5c-8572-fac51810bc2a'
        WHERE data_field = 'object'
        OR data_field = 'ocr'
        OR data_field = 'logo'
        OR data_field = 'alpr';


        CREATE TABLE IF NOT EXISTS event_trigger.event_schedule (
        event_schedule_id uuid                              DEFAULT uuid_generate_v4() PRIMARY KEY,
        event_name        text                     NOT NULL,
        event_type        text                     NOT NULL,
        organization_id   integer                           DEFAULT '-1' :: integer,
        application_id    text                              DEFAULT '' :: text,
        payload           text                     NOT NULL,
        schedule          text                     NOT NULL,
        created_at_utc    timestamp with time zone NOT NULL DEFAULT now(),
        updated_at_utc    timestamp with time zone NOT NULL DEFAULT now(),
        created_by        text                              DEFAULT '' :: text,
        updated_by        text                              DEFAULT '' :: text
        );

        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by)
        SELECT NULL,'gql_query', NULL, 'System', NULL, now(), now(),'jebenezer','jebenezer'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE
        organization_id IS NULL AND
        event_name = 'gql_query' AND
        target_name = 'System'
        );

        UPDATE "job_new"."engine" SET "fields"='[{"max": 101, "min": 1, "info": "Sampling rate to run deep learning object detection", "name": "detectionRate", "step": 1, "type": "number", "label": "Detection Rate", "value": 5, "options": null, "defaultValue": "5"}, {"max": 1, "min": 0.1, "info": "Confidence Threshold", "name": "confidenceThreshold", "step": 0.01, "type": "number", "label": "Confidence Threshold", "value": 0.7, "options": null, "defaultValue": "0.7"}, {"max": null, "min": null, "info": "Video Type", "name": "videoType", "step": null, "type": "picklist", "label": "Video Type", "value": "CCTV", "options": [{"key": "CCTV", "value": "CCTV"}, {"key": "Bodycam", "value": "Bodycam"}, {"key": "Broadcast", "value": "Broadcast"}], "defaultValue": "CCTV"}]' WHERE "engine_id"='34b859a1-998d-419f-8d61-47f9f1d10046';

        CREATE TABLE IF NOT EXISTS job_new.benchmark(
        benchmark_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at_utc timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
        created_by text NULL,
        baseline_engine_id text NOT NULL,
        engine_ids text [],
        engine_category_id text NOT NULL,
        CONSTRAINT "_fk_engine_category_id" FOREIGN KEY (engine_category_id) REFERENCES job_new.engine_category,
        CONSTRAINT "_fk_engine_id" FOREIGN KEY (baseline_engine_id) REFERENCES job_new.engine (engine_id)
        );

        CREATE TABLE IF NOT EXISTS job_new.benchmark__job(
        benchmark_job_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        benchmark_id uuid NOT NULL,
        job_id text NOT NULL,
        CONSTRAINT "_fk_benchmark_id" FOREIGN KEY (benchmark_id) REFERENCES job_new.benchmark
        );

        ALTER TABLE event_trigger.event_subscription 
            ADD COLUMN IF NOT EXISTS conditions JSONB;

        update libraries.entity_identifier_type set data_type = 'image' where entity_identifier_type_id = 'bolo' and data_type = 'application';


        CREATE TABLE IF NOT EXISTS event_trigger.event_action_template (
            template_id text NOT NULL DEFAULT uuid_generate_v4(),
            template_status int NULL DEFAULT 0,
            template_name text NULL DEFAULT ''::text,
            organization_id int4 NULL DEFAULT '-1'::integer,
            application_id text NULL DEFAULT ''::text,
            input_type text NULL DEFAULT ''::text,
            input_validation jsonb NULL,
            input_attributes jsonb NULL,
            action_type text NULL DEFAULT ''::text,
            action_validation jsonb NULL,
            action_destination text NULL DEFAULT ''::text,
            action_attributes jsonb NULL,
            created_at_utc timestamptz NOT NULL DEFAULT NOW(),
            updated_at_utc timestamptz NOT NULL DEFAULT NOW(),
            created_by text NULL DEFAULT ''::text,
            updated_by text NULL DEFAULT ''::text,
            CONSTRAINT event_action_template_pkey PRIMARY KEY (template_id)
        );

        ALTER TABLE event_trigger.event_subscription ADD COLUMN IF NOT EXISTS event_action_template_id text;

        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_subscription__action_template_id') THEN
                ALTER TABLE event_trigger.event_subscription ADD CONSTRAINT "fk_subscription__action_template_id" FOREIGN KEY (event_action_template_id) REFERENCES event_trigger.event_action_template(template_id);
            END IF;
        END$$;

        INSERT INTO event_trigger.event_triggers (event_name, target_name, created_at_utc, updated_at_utc, created_by, updated_by, event_type)
        VALUES ('new_shared_collection', 'SharedCollectionSync', now(), now(), 'jebenezer', 'jebenezer', 'shared_collection')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event_triggers (event_name, target_name, created_at_utc, updated_at_utc, created_by, updated_by, event_type)
        VALUES ('update_shared_collection', 'SharedCollectionSync', now(), now(), 'jebenezer', 'jebenezer', 'shared_collection')
        ON CONFLICT DO NOTHING;

        ALTER TABLE job_new.benchmark
        ADD COLUMN IF NOT EXISTS organization_id integer DEFAULT '-1' :: integer;

        ALTER TABLE job_new.engine_category ADD COLUMN IF NOT EXISTS doc_link VARCHAR;

        INSERT INTO job_new.engine_category(engine_category_id, engine_category_name, engine_category_description, data_field, icon_class, "order", engine_class_id, engine_type_id, export_formats, doc_link)
        VALUES
        -- Text > Content Classification
        ('0481ff76-00c5-4e2d-b73d-2e3aaeef79eb', 'Content Classification', 'Classifies text into particular categories based on what words the text contains', 'concept', 'class', 26, '29fd494a-e1e9-4eea-82bf-b80b36adbd82', 'fcc22feb-9184-4f53-be5e-7694927864d9', '[]'::jsonb, 'developer/engines/cognitive/text/content-classification/'),
        -- Text > Keyword Extraction
        ('6c772d3b-6f40-4d85-a672-ddb75dbae0a4', 'Keyword Extraction', 'Identifies key terms and/or phrases that appear in one or more documents, based on parts of speech, salience, or other criteria', 'keyword', 'font_download', 27, '29fd494a-e1e9-4eea-82bf-b80b36adbd82', 'fcc22feb-9184-4f53-be5e-7694927864d9', '[]'::jsonb, 'developer/engines/cognitive/text/keyword-extraction/'),
        -- Text > Language Identification
        ('975f846e-79e6-4ead-8a49-23f02a5d068a', 'Language Identification', 'Analyzes text to deduce the most likely language being used in the text', 'language', 'language', 28, '29fd494a-e1e9-4eea-82bf-b80b36adbd82', 'fcc22feb-9184-4f53-be5e-7694927864d9', '[]'::jsonb, 'developer/engines/cognitive/text/language-identification/'),
        -- Text > Summarization
        ('24ffd12d-fcda-4f47-8843-b2e5dbfbb01f', 'Summarization', 'Generates a readable summary of a given piece of text', 'summary', 'chrome_reader_mode', 29, '29fd494a-e1e9-4eea-82bf-b80b36adbd82', 'fcc22feb-9184-4f53-be5e-7694927864d9', '[]'::jsonb, 'developer/engines/cognitive/text/summarization/')

        ON CONFLICT(engine_category_id) DO NOTHING;


        DO $$ BEGIN
            CREATE TYPE public.cluster_preference_type AS ENUM ('default', 'business_unit', 'organization');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        CREATE TABLE IF NOT EXISTS aiware.cluster__preference (
            preference_key text NOT NULL,
            preference_type cluster_preference_type NOT NULL,
            cluster_id text NOT NULL,
            CONSTRAINT cluster_preference_fk FOREIGN KEY (cluster_id) REFERENCES aiware."cluster"(cluster_id) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT ct_cluster__preference_selector UNIQUE (preference_type, preference_key)
        );

        -- Flyway: fix foreign key violation
        INSERT INTO aiware.cluster (
            cluster_id,
            organization_id,
            display_name,
            allowed_engines,
            secret_key,
            access_key,
            queue_credentials,
            docker_hub_credentials,
            paused,
            memory_size,
            cached_veritone_api_key,
            cached_date,
            created_date,
            updated_date,
            storage_size,
            cluster_type,
            default_cluster,
            is_public,
            bypass_allowed_engines,
            is_group
        ) VALUES (
            'rt-deadbeef-0000-0001-0001-ba5eba111111',
            @@{ROOT_ORG_ID}@@,
            'Default',
            '{9e611ad7-2d3b-48f6-a51b-0a1ba40feab4,c0e55cde-340b-44d7-bb42-2e0d65e98141,b88ca760-381a-471c-a089-e53894db881a,01e41442-758c-4602-9b85-e18b0fff7068}',
            '9AFB59B031F28B7ED5099D81F24BBF1416F1D55F',
            '5B94EF3CAB6FC4BD4F16',
            '{
            "clusterId": "59dd0df40e3986000d01fbf0",
            "clusterName": "E-prod-edge_-005962e9-4952-4251-8167-269859a4d26a",
            "clusterToken": "REDACTED_CLUSTER_TOKEN_VE23426"
            }',
            '{}',
            false,
            4294967300,
            'a6102:eafc07e210dc44faa124c22069e0341b6cda06c81f14431abc07b6f91c7f62fa',
            1507660357,
            1507659252,
            1507659252,
            10737418240,
            'RT',
            false,
            true,
            true,
            false
        ) ON CONFLICT DO NOTHING;

        CREATE INDEX IF NOT EXISTS "_ix_aiware.cluster__preference@preference_key,preference_type" ON aiware.cluster__preference USING btree (preference_key, preference_type);
        INSERT INTO aiware.cluster__preference (preference_key, preference_type, cluster_id) VALUES('default', 'default', 'rt-deadbeef-0000-0001-0001-ba5eba111111') ON CONFLICT DO NOTHING;

        UPDATE job_new.engine_class
        SET engine_class_description='The inputs to engines in the Data class can be structured or unstructured data. Examples include geolocation information, historical weather data, network usage data, billing records, or signals from IoT devices. Data engines may detect outliers or anomalies in data, correlate two or more data sets, identify the geographic location of a person, predict future trajectories based on historical trends, optimize presentation of content or advertising, or suggest a decision path for example.'
        WHERE engine_class_name='data';

        update     job_new.engine
        set     creates_recording = true
        where     engine_id = '38f07b81-0587-40af-aeba-851231214059';

        INSERT INTO event_trigger.event_triggers (event_name, target_name, created_at_utc, updated_at_utc, updated_by, created_by, event_type) 
        VALUES ('recording_created','RecordingsTopic', now(), now(), 'tonypham', 'tonypham', null )
        ON CONFLICT DO NOTHING;

        update "job_new"."engine" set "engine_name"='Fingerprint - V2F',"engine_alias_name"='Fingerprint - B - V2F',"order"=1,"price"=100,"engine_alias_description"='This V2F engine recognizes radio advertisements and other audio clips that appear across multiple radio shows or audio files at various times.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='1905ec9c-1919-4b82-a203-91b8949aa0d5';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Face Detection V2F (EUW)',"engine_alias_name"='Face Detection - H - V2F',"order"=100,"price"=750,"engine_alias_description"='This V2F engine detects the presence of faces in images or video (the time and location at which they appear).',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='60276af1-7fb7-4431-a3eb-09f81e6547bb';
        update "job_new"."engine" set "engine_name"='Veritone - Face Detection - V2F',"engine_alias_name"='Face Detection - I - V2F',"order"=100,"price"=100,"engine_alias_description"='This V2F engine detects the presence of faces in images or video (the time and location at which they appear).',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='d8da8d9c-a789-41a9-be4d-ac4abd55bb8c';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Celebrity V2F (EUW)',"engine_alias_name"='Face Recognition - J - V2F',"order"=100,"price"=750,"engine_alias_description"='This V2F engine has been pre-trained to recognize popular celebrities and does not require additional library training.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='5c559b17-c32f-4d04-844a-eb7b036d71f2';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Celebrity V2F (USE)',"engine_alias_name"='Face Recognition - K - V2F',"order"=100,"price"=750,"engine_alias_description"='This V2F engine has been pre-trained to recognize popular celebrities and does not require additional library training.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='5e651457-e102-4d16-a8f2-5c0c34f58851';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Face Recognition V2F (EUW)',"engine_alias_name"='Face Recognition - L - V2F',"order"=100,"price"=900,"engine_alias_description"='This V2F engine recognizes people''s faces in images or video, and must be taught those faces via Veritone Library.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='b74d4058-90f6-453a-9636-5982e34abe0c';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Face Recognition V2F (USE)',"engine_alias_name"='Face Recognition - M - V2F',"order"=100,"price"=900,"engine_alias_description"='This V2F engine recognizes people''s faces in images or video, and must be taught those faces via Veritone Library.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='fa7e75da-5955-476a-b20c-28e286fdfd8e';
        update "job_new"."engine" set "engine_name"='Machine Box - Facebox Similarity',"engine_alias_name"='Face Similarity - B',"order"=100,"price"=100,"engine_alias_description"='This engine suggests similar faces from a pre-trained library. It must be taught those faces via Veritone Library prior to running the engine.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/face-similarity-b.png' where "engine_alias_id"='616f6d39-b338-4c28-b9f2-902242f93c71';
        update "job_new"."engine" set "engine_name"='Microsoft Image Classification - V2F',"engine_alias_name"='Image Classification - B - V2F',"order"=100,"price"=1000,"engine_alias_description"='This V2F engine must be trained on a Veritone Library before you can run it. It will classify the entire image (or video frames) based on the library on which you train it.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='7a56e479-e591-4682-a274-7bfc5bbbb6e7';
        update "job_new"."engine" set "engine_name"='Machine Box - Tagbox (Trainable) - V2F',"engine_alias_name"='Image Classification - C - V2F',"order"=100,"price"=100,"engine_alias_description"='This V2F engine automatically describes images or frames from a video, and must be taught examples via Veritone Library.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/image-classification-c-v2f.png' where "engine_alias_id"='a593909b-5b17-4be8-9da4-d480d9600826';
        update "job_new"."engine" set "engine_name"='Machine Box - Tagbox - V2F',"engine_alias_name"='Image Classification - D - V2F',"order"=100,"price"=100,"engine_alias_description"='This V2F engine automatically describes images or frames from a video.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/image-classification-d-v2f.png' where "engine_alias_id"='d32660c0-208c-4e56-a221-2fb23e3d5487';
        update "job_new"."engine" set "engine_name"='LogoGrab - Image Hi-Res - V2F',"engine_alias_name"='Logo Recognition - G - V2F',"order"=100,"price"=1000,"engine_alias_description"='This V2F engine detects brand logos in images or video with very good fidelity. It is suggested you use a project key when running this engine. You are not required to do so, but you may experience lower accuracy if you do not.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='b6d42444-eb5b-499c-aeea-2062b465e241';
        update "job_new"."engine" set "engine_name"='LogoGrab - Video Lo-Res - V2F',"engine_alias_name"='Logo Recognition - H - V2F',"order"=100,"price"=1000,"engine_alias_description"='This V2F engine detects brand logos in video with good fidelity. It is suggested you use a project key when running this engine. You are not required to do so, but you may experience lower accuracy if you do not.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c7b9db9c-3e1b-4582-b3e6-f2ab4bf2e4fc';
        update "job_new"."engine" set "engine_name"='LogoGrab - Video Hi-Res - V2F',"engine_alias_name"='Logo Recognition - I - V2F',"order"=100,"price"=1800,"engine_alias_description"='This V2F engine detects brand logos in video with very good fidelity. It is suggested you use a project key when running this engine. You are not required to do so, but you may experience lower accuracy if you do not.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='e1f45643-4614-41e1-9ace-6e59bb5c5313';
        update "job_new"."engine" set "engine_name"='LogoGrab - Image Lo-Res - V2F',"engine_alias_name"='Logo Recognition - J - V2F',"order"=100,"price"=500,"engine_alias_description"='This V2F engine detects brand logos in images or video with good fidelity. It is suggested you use a project key when running this engine. You are not required to do so, but you may experience lower accuracy if you do not.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='e2f757bb-7bac-437d-b68a-6823ecb99e35';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Object Recognition V2F (EUW)',"engine_alias_name"='Object Detection - AM - V2F',"order"=100,"price"=1000,"engine_alias_description"='This V2F engine detects a wide range of objects in images or video. It works fastest in the EU and UK.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='4c093a0f-0d06-40ff-8c5d-d949348e691d';
        update "job_new"."engine" set "engine_name"='Veritone - Knife Detection - V2F',"engine_alias_name"='Object Detection - AN - Knife - V2F',"order"=100,"price"=100,"engine_alias_description"='This V2F knife detection engine has been trained on CCTV footage, and will work on images or video. It requires GPU.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='6e9acfb9-1c41-428a-b718-8456e9c60a28';
        update "job_new"."engine" set "engine_name"='Veritone - Gun Detection - V2F',"engine_alias_name"='Object Detection - AO - Gun - V2F',"order"=100,"price"=100,"engine_alias_description"='This V2F gun detection engine has been trained primarily on CCTV footage, and will work on images or video.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='10d374bd-2d09-4d5b-805f-4dd8ba07af6f';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Object Recognition V2F (USE)',"engine_alias_name"='Object Detection - AP - V2F',"order"=100,"price"=1000,"engine_alias_description"='This V2F engine detects a wide range of objects in images or video. It works fastest in North America.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='36d6865f-0408-4681-a8c2-2d5ba3facf47';
        update "job_new"."engine" set "engine_name"='Google Landmark - V2F',"engine_alias_name"='Object Detection - AQ - Landmark - V2F',"order"=100,"price"=675,"engine_alias_description"='This V2F engine recognizes well-known landmarks in images or video. It does not require library training.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='606f2ec1-cce0-472b-ae89-2fd1ba9267c9';
        update "job_new"."engine" set "engine_name"='Clarifai - Custom Trainable - V2F',"engine_alias_name"='Object Detection - AR - V2F',"order"=100,"price"=2000,"engine_alias_description"='This V2F engine must be trained on a Veritone Library before you can run it. It will classify the entire image (or video frames) based on the library on which you train it.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='5038cdc8-5e93-47c8-91f6-c5d0660eacfd';
        update "job_new"."engine" set "engine_name"='Machine Box - Objectbox - V2F',"engine_alias_name"='Object Detection - AS - V2F',"order"=100,"price"=100,"engine_alias_description"='This V2F engine requires a state file in order to detect objects based on your training. See machinebox.io for more info.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/object-detection-as-v2f.png' where "engine_alias_id"='ccdd0827-0e62-45e1-8af3-9fe4f2c84dba';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Unsafe Content V2F (EUW)',"engine_alias_name"='Object Detection - AT - Moderation - V2F',"order"=100,"price"=750,"engine_alias_description"='This V2F engine detects "unsafe (visual) content" in images or video. This includes nudity among other NSFW categories.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='e6753fa7-0b3f-4943-b0bc-e5fb1b98c803';
        update "job_new"."engine" set "engine_name"='Speechmatics - Speaker Separation - V2F',"engine_alias_name"='Speaker Separation - B - V2F',"order"=100,"price"=100,"engine_alias_description"='This V2F engine will segment a transcript by speaker. It must be run in the same job as a "transcription" task.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='fdd0fa96-d137-495d-a508-57b1ba155568';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Text Recognition V2F (USE)',"engine_alias_name"='Text Recognition - E - V2F',"order"=100,"price"=750,"engine_alias_description"='This V2F OCR engine reads text that appears in images, video frames or documents. It works fastest in North America.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='91e52856-6ed8-4639-beac-a33604357a0f';
        update "job_new"."engine" set "engine_name"='Amazon Rekognition - Text Recognition V2F (EUW)',"engine_alias_name"='Text Recognition - F - V2F',"order"=100,"price"=750,"engine_alias_description"='This V2F OCR engine reads text that appears in images, video frames or documents. It works fastest in EU and UK.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='583ec0cb-5863-46ef-930a-9dde79222379';
        update "job_new"."engine" set "engine_name"='Machine Box - OCRbox - V2F',"engine_alias_name"='Text Recognition - G - V2F',"order"=100,"price"=100,"engine_alias_description"='This basic V2F OCR engine reads text that appears in images or video frames.',"engine_alias_logo_path"='https://s3.amazonaws.com/static.veritone.com/task-logo/new_alias/text-recognition-g-v2f.png' where "engine_alias_id"='0667bd96-7117-4c69-b428-5a8231e1f450';
        update "job_new"."engine" set "engine_name"='Speechmatics Transcription - English Global',"engine_alias_name"='Transcription - FE - English (Global)',"order"=62,"price"=125,"engine_alias_description"='This transcription engine receives video or audio as input and produces a transcript. It supports all varieties, dialects and accents of English.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='dfeae24c-9f66-46ba-8337-d44669489354';
        update "job_new"."engine" set "engine_name"='Google STT - Broadcast One Speaker - V2F',"engine_alias_name"='Transcription - FF - V2F',"order"=100,"price"=250,"engine_alias_description"='This V2F transcription engine receives video or audio as input and produces a transcript. It supports a very long list of languages and is intended for one speaker, but may be used with multiple speakers.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='0daa45ab-9b3a-4e7f-80bc-20417412a951';
        update "job_new"."engine" set "engine_name"='Google STT - Broadcast Multi Speaker - V2F',"engine_alias_name"='Transcription - FG - V2F',"order"=100,"price"=250,"engine_alias_description"='This V2F transcription engine receives video or audio as input and produces a transcript. It supports US-English language and is intended for multiple speakers, but may be used with one speaker.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='1cbb5ddc-d945-4d4b-8a42-971b33e6c9bf';
        update "job_new"."engine" set "engine_name"='Microsoft - Transcription - V2F',"engine_alias_name"='Transcription - FH - V2F',"order"=100,"price"=250,"engine_alias_description"='Converts speech to text in 12 languages and allows extensions. Supported languages include English, Spanish, French, German, Italian, Chinese (Simplified), Japanese, Arabic, Russian, Portuguese (Brazilian), Hindi, and Korean.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='1eba4e19-7e04-4c33-8e2b-7a2226d9d30d';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Catalan (ESP) - V2F',"engine_alias_name"='Transcription - FI - Catalan (Spain) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Catalan (Spain)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='2c3bda6a-fc3e-449b-bc1d-20b96a802bba';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - English (AUS) - V2F',"engine_alias_name"='Transcription - FJ - English (Aus) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: English (Aus)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='2c91167b-d920-4f38-aa96-ff4f63d6d291';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - German - V2F',"engine_alias_name"='Transcription - FK - German - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: German',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='2e44f106-debc-4ede-b04f-8c53a6cdf8e5';
        update "job_new"."engine" set "engine_name"='Speechmatics - Arabic - V2F',"engine_alias_name"='Transcription - FL - Arabic - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F engine transcribes Arabic speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='2fc026a1-0791-410a-8f3f-2ada38598154';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Norwegian - V2F',"engine_alias_name"='Transcription - FM - Norwegian - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Norwegian',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='6c943887-76cb-45d7-8746-6510a9d98558';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Portuguese (BRA) - V2F',"engine_alias_name"='Transcription - FN - Portuguese (Brazil) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Portuguese (Brazil)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='7bed4679-27cf-49ec-ab9e-8c9595b63a20';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Spanish (MEX) - V2F',"engine_alias_name"='Transcription - FO - Spanish (Mexico) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Spanish (Mexico)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='08af3789-fce5-4b51-a63c-c9df110a5cc3';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Arabic (SAU) - V2F',"engine_alias_name"='Transcription - FP - Arabic (Saudi) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Arabic (Saudi)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='8e52a948-182a-430b-9f53-d0b636a40ea8';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Spanish (COL) - V2F',"engine_alias_name"='Transcription - FQ - Spanish (Colombia) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Spanish (Colombia)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='52d201a1-d710-4b33-b6f9-94e237dda4e3';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - French (FRA) - V2F',"engine_alias_name"='Transcription - FR - French (France) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: French (France)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='70c32696-932e-4832-a423-b9b40c0d0139';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Spanish (CHI) - V2F',"engine_alias_name"='Transcription - FS - Spanish (Chile) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Spanish (Chile)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='75ea61f5-dadf-44d7-922e-fd73560e95d2';
        update "job_new"."engine" set "engine_name"='VoiceBase Transcription - Priority (Low) - V2F',"engine_alias_name"='Transcription - FT - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F engine transcribes speech to text. Supported languages include: English-US, English-UK, English-AU, Portuguese-BR, Spanish-Latin America. Expect slow turnaround for a lower price.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='136e192c-29b4-4696-a7a8-2da57d4a6c4f';
        update "job_new"."engine" set "engine_name"='Veritone - Kaldi - English (UK) - V2F',"engine_alias_name"='Transcription - FU - English - V2F',"order"=100,"price"=100,"engine_alias_description"='This basic V2F engine transcribes English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='415cc721-c3b3-4bf5-bbc9-c399961dd620';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Mandarin (TWN) - V2F',"engine_alias_name"='Transcription - FV - Mandarin (Taiwan) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Mandarin (Taiwan)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='428ab814-3928-471a-993e-a3dae5624943';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Spanish (ESP) - V2F',"engine_alias_name"='Transcription - FW - Spanish (Spain) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Spanish (Spain)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='7807c10a-3cdb-4f1e-b1ba-250771d4f2c9';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Chinese (CHN) - V2F',"engine_alias_name"='Transcription - FX - Chinese (China) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Chinese (China)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='8523ed10-deb8-4e7e-9ddc-05a6bb16ce02';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Chinese (CHN) 16k - V2F',"engine_alias_name"='Transcription - FY - Chinese (China) 16kHz - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on broadcast quality audio (~16kHz) but may be used on audio of other frequencies. Supported language: Chinese (China)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='9994a115-4103-4b1b-914b-9696d063d8aa';
        update "job_new"."engine" set "engine_name"='Amazon Transcribe - V2F (EUW)',"engine_alias_name"='Transcription - FZ - V2F',"order"=100,"price"=250,"engine_alias_description"='This V2F engine transcribes speech to text in English or Spanish.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='3929002a-6902-4c59-b81c-7a79fcd8b9c0';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Cantonese (HK) - V2F',"engine_alias_name"='Transcription - GA - Cantonese (HK) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Cantonese (HK)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='6385592a-5ace-470d-a65a-6ae6b3acacab';
        update "job_new"."engine" set "engine_name"='Remeeting Transcription - English - V2F',"engine_alias_name"='Transcription - GB - English - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F engine transcribes English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='a8e2fd67-db09-4f2d-afda-64939cb9af29';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Spanish (US) - V2F',"engine_alias_name"='Transcription - GC - Spanish (US) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Spanish (US)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='a63d6ad6-f479-4185-8d83-ad8d7e9b7696';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Dutch - V2F',"engine_alias_name"='Transcription - GD - Dutch - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Dutch',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='b5974458-1b44-46eb-b8aa-ff5ddb7acc64';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - French (CAN) - V2F',"engine_alias_name"='Transcription - GE - French (Canada) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: French (Canada)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='ba3feb3f-e4a0-4cf0-b763-c6b14ba42894';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Spanish (GTM) - V2F',"engine_alias_name"='Transcription - GF - Spanish (Guatemala)  - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Spanish (Guatemala)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='be876e2e-1a44-4f19-be3b-8dd60945c0d4';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - English (UK) - V2F',"engine_alias_name"='Transcription - GG - English (UK) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: English (UK)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c7e549a0-37c6-464a-80af-0b6308534135';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Spanish (US) 16k - V2F',"engine_alias_name"='Transcription - GH - Spanish (US) 16kHz - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on broadcast quality audio (~16kHz) but may be used on audio of other frequencies. Supported language: Spanish (US)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='cb7b3b5c-7349-4041-8a0e-4cfc03dda14c';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Spanish (ARG) - V2F',"engine_alias_name"='Transcription - GI - Spanish (Argentina) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Spanish (Argentina)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='cb42d334-cdc6-4391-8511-cee8b298e201';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Portuguese (POR) - V2F',"engine_alias_name"='Transcription - GJ - Portuguese (Portugal) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Portuguese (Portugal)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='cda8dc33-b067-4f35-bdac-95ada18eecad';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Hindi - V2F',"engine_alias_name"='Transcription - GK - Hindi - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Hindi',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='ce11ba86-0140-4233-af23-0168554d2ffd';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - English (CAN) - V2F',"engine_alias_name"='Transcription - GL - English (Canada) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: English (Canada)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='cfdc62db-36d9-4697-8b36-52eb9c58465e';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - English (US) 16k - V2F',"engine_alias_name"='Transcription - GM - English (US) 16kHz - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on broadcast quality audio (~16kHz) but may be used on audio of other frequencies. Supported language: English (US)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='d3dedb9c-2dde-446c-90d5-540867edc71d';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Italian - V2F',"engine_alias_name"='Transcription - GN - Italian - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Italian',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='d982dff8-4c9a-44b7-aa18-89f6890d4007';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - Hebrew - V2F',"engine_alias_name"='Transcription - GO - Hebrew - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: Hebrew',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='efef8ff3-6d00-46bc-9593-0b10b5b40b9e';
        update "job_new"."engine" set "engine_name"='Nuance Transcription - English (IND) - V2F',"engine_alias_name"='Transcription - GP - English (India) - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F transcription engine converts speech to text and is trained on call center quality audio (~8kHz) but may be used on audio of other frequencies. Supported language: English (India)',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='fa537e4b-ac38-4ef1-af95-da3efb09cbf0';
        update "job_new"."engine" set "engine_name"='Google STT - Telephony - V2F',"engine_alias_name"='Transcription - GQ - Telephony - V2F',"order"=100,"price"=250,"engine_alias_description"='This V2F transcription engine receives video or audio as input and produces a transcript. It supports US-English language and is intended for telephony (8kHz) audio, but may be used on other audio.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='fbc105fc-8069-42ef-8769-0e86d9b2d251';
        update "job_new"."engine" set "engine_name"='VoiceBase Transcription - Priority (High) - V2F',"engine_alias_name"='Transcription - GR - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F engine transcribes speech to text. Supported languages include: English-US, English-UK, English-AU, Portuguese-BR, Spanish-Latin America. Expect fast turnaround for a higher price.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='fddec155-0808-4392-ac6f-d9d88f779965';
        update "job_new"."engine" set "engine_name"='RevSpeech Transcription - English - V2F',"engine_alias_name"='Transcription - GS - English - V2F',"order"=100,"price"=250,"engine_alias_description"='This V2F engine transcribes English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='fe7c500b-9881-4367-87e2-4c1f3a786939';
        update "job_new"."engine" set "engine_name"='Speechmatics Transcription - Dutch',"engine_alias_name"='Transcription - GT - Dutch',"order"=100,"price"=125,"engine_alias_description"='This engine transcribes Dutch speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='137161dc-63ad-42f6-9257-7aa2e6bcde8a';
        update "job_new"."engine" set "engine_name"='Speechmatics - English (US) - Bloomberg',"engine_alias_name"='Transcription - GU - English (US)',"order"=100,"price"=125,"engine_alias_description"='This engine transcribes English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='dbda045e-5521-46f5-aed1-0c8d473b77de';
        update "job_new"."engine" set "engine_name"='Microsoft Cognitive Services - Transcription - V2F',"engine_alias_name"='Transcription - GV - V2F',"order"=100,"price"=250,"engine_alias_description"='This V2F engine transcribes speech to text. Supported languages include: English-US, English-GB, English-India, Chinese-China, French-France, German-Germany, Italian and Spanish-Spain.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='df5a33d4-fbae-40df-be96-df4e8748fc04';
        update "job_new"."engine" set "engine_name"='ListenByCode Transcription - English - V2F',"engine_alias_name"='Transcription - GW - V2F',"order"=100,"price"=125,"engine_alias_description"='This V2F engine transcribes English speech to text. It works well on various audio frequencies (eg. 4kHz, 8kHz, 16kHz).',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='e6b26c7c-3900-4c40-ac46-184921dfca25';
        update "job_new"."engine" set "engine_name"='Veritone - Kaldi - English (US) - V2F',"engine_alias_name"='Transcription - GX - English (US) - V2F',"order"=100,"price"=100,"engine_alias_description"='This basic V2F engine transcribes English speech to text.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='ed9bbb45-0327-4283-83c2-cdac2d550778';
        update "job_new"."engine" set "engine_name"='Amazon Translate - V2F (EUW)',"engine_alias_name"='Translate - AN - V2F',"order"=100,"price"=250,"engine_alias_description"='This V2F translation engine supports dozens of input and output languages. It works fastest in EU and UK. Accepts transcripts and plain text as input.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='543e1f11-3490-401f-895a-9e81f89c784e';
        update "job_new"."engine" set "engine_name"='Google - Translate - V2F',"engine_alias_name"='Translate - AO - V2F',"order"=100,"price"=300,"engine_alias_description"='This V2F translation engine supports many, many input and output languages and is very accurate. Accepts transcripts and plain text as input.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c20ddcce-d52a-433f-81a9-32e56f34e062';
        update "job_new"."engine" set "engine_name"='Amazon Translate - V2F (USE)',"engine_alias_name"='Translate - AP - V2F',"order"=100,"price"=250,"engine_alias_description"='This V2F translation engine supports dozens of input and output languages. It works fastest in North America. Accepts transcripts and plain text as input.',"logo_path"=Null,"engine_alias_logo_path"=Null where "engine_alias_id"='c06ac5eb-3754-4055-b9fb-047b72660a0a';

        INSERT INTO event_trigger.event_triggers (event_name, target_name, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        VALUES ('recording_deleted','MentionSync', now(), now(), 'jebenezer', 'jebenezer', null )
        ON CONFLICT DO NOTHING;

        UPDATE job_new.engine_category SET engine_class_id='fc88ed0f-19e7-410c-8d3c-050f6d6e8fb0' WHERE engine_category_id='c5458876-43d2-41e8-a340-f734702df04a';

        UPDATE job_new.engine_category SET engine_category_name='Automation' WHERE engine_category_id='c5458876-43d2-41e8-a340-f734702df04a';

        UPDATE job_new.engine_category SET engine_category_description='Execute business rules designed in Automate Studio on a scheduled, event-driven, or manually triggered basis. These engines can include AI cognition or be purely rule-driven in nature' WHERE engine_category_id='c5458876-43d2-41e8-a340-f734702df04a';

        UPDATE job_new.engine_category SET engine_category_description='Execute business rules on a scheduled, event-driven, or manually triggered basis' WHERE engine_category_id='c5458876-43d2-41e8-a340-f734702df04a';

        INSERT INTO "event_trigger"."event_triggers"("organization_id","event_name","consumer_directive","target_name","consumer_params","created_at_utc","updated_at_utc","updated_by","created_by","event_type")
        VALUES
        (NULL,'mentions_deleted',NULL,'MentionSync',NULL,now(),now(),'ndthang','ndthang','mention')
        ON CONFLICT(event_trigger_id) DO NOTHING;

        INSERT INTO event_trigger.event
        (event_name, event_type, application_id, schema_data, public, created_at_utc, updated_at_utc, created_by, updated_by, description)
        values
        ('StructuredDataDelete', 'structured_data', 'system', 'message StructuredDataDelete {
            string id = 10;
            string data_registry_id = 11;
            int64 organization_id = 12;
        }', true, now(), now(), 'veritone', 'veritone', 'veritone event')
        ON CONFLICT DO NOTHING;

        INSERT INTO event_trigger.event_triggers (event_name, target_name, created_at_utc, updated_at_utc, updated_by, created_by, event_type) 
        VALUES ('structured_data_delete','StructuredDataTopic', now(), now(), 'tvuong', 'tvuong', null )
        ON CONFLICT DO NOTHING;

        -- Add is_group column to cluster table
        alter table aiware."cluster" ADD COLUMN IF NOT EXISTS is_group BOOL DEFAULT false;
        -- Add in_group column to cluster table
        ALTER TABLE aiware."cluster" ADD COLUMN IF NOT EXISTS in_group TEXT;
        -- omit this constraint to avoid locking cluster table on release
        --ALTER TABLE aiware."cluster" ADD CONSTRAINT in_group_fkey FOREIGN KEY (in_group) REFERENCES aiware."cluster"(cluster_id);

        DO $$ BEGIN
            CREATE TYPE public.rule_status_type AS ENUM ('active', 'inactive');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        CREATE TABLE IF NOT EXISTS event_trigger.event_custom_rules (
            rule_id text NOT NULL DEFAULT uuid_generate_v4(),
            rule_status rule_status_type NOT NULL,
            rule_name text NULL DEFAULT ''::text,
            rule_description text NULL DEFAULT ''::text,
            rule_params jsonb NULL,
            organization_id int4 NOT NULL,
            event_type text NOT NULL,
            event_name text NOT NULL,
            event_actions jsonb NULL,
            created_at_utc timestamptz NOT NULL DEFAULT timezone('UTC'::text, now()),
            updated_at_utc timestamptz NOT NULL DEFAULT timezone('UTC'::text, now()),
            created_by text NULL DEFAULT ''::text,
            updated_by text NULL DEFAULT ''::text,
            CONSTRAINT event_custom_rules_pkey PRIMARY KEY (rule_id)
        );


        -- Add Auto-Translate engine with ID = 9dfc55d8-2e46-4230-887c-b57d5d9c9869
        INSERT INTO job_new.engine (
        engine_id, engine_category_id, engine_name, engine_description, engine_state,
        deployment_model, owner_organization_id, is_public, price, rating, website,
        logo_path, "order", dependency, core_job_data, fields, validation,
        application_id, asset, creates_recording, deleted, created_date, updated_date,
        library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name,
        engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases,
        industries, engine_manifest
        ) VALUES (
        '9dfc55d8-2e46-4230-887c-b57d5d9c9869', '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923',
        'Auto-Translate', 'Detects language and then translates to destination language',
        'active', 2, 14634, false, NULL, NULL, NULL, NULL, 100, NULL,
        '{"category": "translation", "dependencies": ["transcribe", "bulk-edit-transcript"]}',
        '[]', NULL, NULL, NULL, false, false, 1571857906, 1571857906, false, NULL, 'USD',
        '9dfc55d8-2e46-4230-887c-b57d5d9c9869', NULL, NULL, NULL,
        '{"roles": [{"roleName": "conductor", "taskRights": ["job:create", "job.read"]}]}',
        '[]', '["Legal and compliance"]', '{"engineMode": "batch"}'
        ) ON CONFLICT DO NOTHING;

        INSERT INTO "event_trigger"."event_triggers"("organization_id","event_name","consumer_directive","target_name","consumer_params","created_at_utc","updated_at_utc","updated_by","created_by","event_type")
        VALUES
        (-1,'library_engine_train',NULL,'System',NULL,now(),now(),'ndthang','ndthang','system')
        ON CONFLICT(event_trigger_id) DO NOTHING;

        insert into
            job_new.engine_category(
                engine_category_id,
                engine_category_name,
                engine_category_description,
                editable,
                video_only,
                engine_class_id,
                engine_type_id
            )
        values
            (
                '10d69473-6977-4181-8883-c42cff3def13',
                'Anomaly Detection',
                'Highlight statistically significant values among incomprehensibly large datasets',
                false,
                false,
                '29fd494a-e1e9-4eea-82bf-b80b36adbd82',
                'fcc22feb-9184-4f53-be5e-7694927864d9'
            ) on conflict do nothing;

        DELETE FROM event_trigger.event_subscription
        WHERE
        REPLACE((consumer_params -> 'url') :: text, '"', '') IN (
            'https://nr@@{ROOT_ORG_ID}@@-workflow.aws-prod.veritone.com/3bdb4281-6fedee?authToken=Ev8PelGqX9s4bB9gaAjTa2WWFaenqWiLHRriEkQ0',
            'https://nr@@{ROOT_ORG_ID}@@-workflow.aws-prod.veritone.com/bc22526-fee37b?authToken=Ev8PelGqX9s4bB9gaAjTa2WWFaenqWiLHRriEkQ0',
            'https://nr@@{ROOT_ORG_ID}@@-workflow.aws-prod.veritone.com/bba53c03-446be?authToken=Ev8PelGqX9s4bB9gaAjTa2WWFaenqWiLHRriEkQ0'
        );

        -- Add controller_url column to cluster table
        ALTER TABLE aiware."cluster" ADD COLUMN IF NOT EXISTS controller_url TEXT;

        create table if not exists job_new.engine_certification (
            engine_id text primary key,
            email text not null,
            media_file_uri text not null,
            custom_fields jsonb not null DEFAULT '{}'::jsonb,
            created_at_utc timestamptz NOT NULL DEFAULT timezone('UTC'::text, now()),
            updated_at_utc timestamptz NOT NULL DEFAULT timezone('UTC'::text, now()),
            created_by text NOT NULL DEFAULT ''::text,
            updated_by text DEFAULT ''::text,
            foreign key (engine_id) references job_new.engine(engine_id) on delete cascade
        );

        INSERT INTO event_trigger.event_schedule (
            event_name,
            event_type,
            organization_id,
            application_id,
            payload,
            schedule,
            created_by,
            updated_by
        ) values (
            'expiring_watchlist_notification_cron',
            'ExpiringWatchlistNotificationCron',
            null,
            null,
            '{"event": "expiring_watchlist_notification_cron","organizationId" : 1}',
            '0 0 * * *',
            'ndthang',
            'ndthang'
        )
        ON CONFLICT(event_schedule_id) DO NOTHING;

        INSERT INTO event_trigger.event_triggers (
            organization_id,
            event_name,
            consumer_directive,
            target_name,consumer_params,
            created_at_utc,
            updated_at_utc,
            created_by,updated_by,
            event_type) 
        VALUES (
            -1,
            'expiring_watchlist_notification_cron',
            NULL,
            'ExpiringWatchlistNotificationCron',
            NULL,
            now(),
            now(),
            'ndthang',
            'ndthang',
            NULL
        )
        ON CONFLICT(event_trigger_id) DO NOTHING;

        -- insert events syncing change programs
        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'program_updated', NULL, 'ProgramsTopic', NULL, now(), now(),'nnguyen','nnguyen', 'program'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE
        organization_id IS NULL AND
        event_name = 'program_updated' AND
        target_name = 'ProgramsTopic'
        );

        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'program_inserted', NULL, 'ProgramsTopic', NULL, now(), now(),'nnguyen','nnguyen', 'program'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE
        organization_id IS NULL AND
        event_name = 'program_inserted' AND
        target_name = 'ProgramsTopic'
        );

        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'program_deleted', NULL, 'ProgramsTopic', NULL, now(), now(),'nnguyen','nnguyen', 'program'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE
        organization_id IS NULL AND
        event_name = 'program_deleted' AND
        target_name = 'ProgramsTopic'
        );

        -- insert events syncing change sources
        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'source_updated', NULL, 'ProgramsTopic', NULL, now(), now(),'nnguyen','nnguyen', 'program'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE
        organization_id IS NULL AND
        event_name = 'source_updated' AND
        target_name = 'ProgramsTopic'
        );

        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'source_deleted', NULL, 'ProgramsTopic', NULL, now(), now(),'nnguyen','nnguyen', 'program'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE
        organization_id IS NULL AND
        event_name = 'source_deleted' AND
        target_name = 'ProgramsTopic'
        );

        -- insert events syncing change sourceType
        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'source_type_updated', NULL, 'ProgramsTopic', NULL, now(), now(),'nnguyen','nnguyen', 'program'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE
        organization_id IS NULL AND
        event_name = 'source_type_updated' AND
        target_name = 'ProgramsTopic'
        );

        INSERT INTO event_trigger.event_triggers (organization_id, event_name, consumer_directive, target_name, consumer_params, created_at_utc, updated_at_utc, updated_by, created_by, event_type)
        SELECT NULL,'source_type_deleted', NULL, 'ProgramsTopic', NULL, now(), now(),'nnguyen','nnguyen', 'program'
        WHERE NOT EXISTS (
        SELECT 1 FROM event_trigger.event_triggers WHERE
        organization_id IS NULL AND
        event_name = 'source_type_deleted' AND
        target_name = 'ProgramsTopic'
        );

        UPDATE job_new.engine_category
        Set export_formats = export_formats || '[{"label": "Plain Text for Avid", "types": [], "format": "txtAvid"}]'::jsonb
        WHERE engine_category_id = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182' and engine_category_name = 'Transcription'
        AND (export_formats::jsonb @> '[{"label": "Plain Text for Avid", "types": [], "format": "txtAvid"}]'::jsonb) = FALSE;

        UPDATE job_new.engine 
        SET jwt_rights = '{"roles": [{"roleName": "conductor", "taskRights": ["job:create", "job.read", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}'
        WHERE engine_id = '9203cf30-68d1-4978-a5a4-7f2f3a945ccb';

        -- Base V3F Engines: https://github.com/veritone/realtime/wiki/Base-Engines-Deployment-info
        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('9e611ad7-2d3b-48f6-a51b-0a1ba40fe255', '4b150c85-82d0-4a18-b7fb-63e4a58dfcce', 'Webstream Adapter V3F', 'Real-time adapter for ingesting web streams from a URL', 'active', 1, 1, true, NULL, NULL, NULL, 'https://www.filepicker.io/api/file/QFdep7moSTetadeYF3E7', NULL, NULL, NULL, '[]', NULL, NULL, NULL, true, false, 1521659424, 1526511257, false, NULL, 'USD', '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255', NULL, NULL, NULL, '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}', NULL, NULL, NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest) 
        VALUES ('74dfd76b-472a-48f0-8395-c7e01dd7f255', '4b150c85-82d0-4a18-b7fb-63e4a58dfcce', 'TV and Radio Adapter V3F', 'Pulls data from TV and Radio streams.', 'active', 1, 1, true, NULL, NULL, NULL, 'https://www.filepicker.io/api/file/MSOOWq06TnmWq5TyncOQ', NULL, NULL, NULL, '[]', NULL, NULL, NULL, true, false, 1533254106, 1533335936, false, NULL, 'USD', '74dfd76b-472a-48f0-8395-c7e01dd7f255', NULL, NULL, NULL, '{"roles": [{"roleName": "adapter", "taskRights": ["job:create", "cms.access", "cms.sources.read", "cms.sources.update"], "assetRights": ["recording:create", "recording:update"]}]}', NULL, NULL, NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440', '4be1a1b2-653d-4eaa-ba18-747a265305d8', 'SI2 audio/video Chunk creator V3F', 'Engine used for splitting a stream to audio or video', 'active', 0, 1, true, NULL, NULL, NULL, 'https://www.filepicker.io/api/file/p2bLdy4nRrOwv34yoEhg', NULL, NULL, '{"category": "ingestion"}', '[]', NULL, NULL, NULL, true, false, 1571251687, 1571251687, false, NULL, 'USD', '8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('352556c7-de07-4d55-b33f-74b1cf237f25', '4be1a1b2-653d-4eaa-ba18-747a265305d8', 'SI2 Playback segment creator V3F', 'Engine used for creating playback segments from an input stream into the TDO.  Should be for initial ingestion only', 'active', 0, 1, true, NULL, NULL, NULL, 'https://www.filepicker.io/api/file/p2bLdy4nRrOwv34yoEhg', NULL, NULL, '{"category": "ingestion"}', '[]', NULL, NULL, NULL, true, false, 1571251687, 1571251687, false, NULL, 'USD', '352556c7-de07-4d55-b33f-74b1cf237f25', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('75fc943b-b5b0-4fe1-bcb6-9a7e1884257a', '4be1a1b2-653d-4eaa-ba18-747a265305d8', 'SI2 Stream Asset Creator V3F', 'Engine used for ingesting a stream and storing the data as an asset in the TDO with the given assetType', 'active', 0, 1, true, NULL, NULL, NULL, 'https://www.filepicker.io/api/file/p2bLdy4nRrOwv34yoEhg', NULL, NULL, '{"category": "ingestion"}', '[]', NULL, NULL, NULL, true, false, 1571251687, 1571251687, false, NULL, 'USD', '75fc943b-b5b0-4fe1-bcb6-9a7e1884257a', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3', '925e8039-5246-4ced-9f2b-b456d0b57ea1', 'Output Writer', 'Engine used to aggregate engine outputs and produce a final output', 'active', 0, 1, true, NULL, NULL, NULL, 'https://www.filepicker.io/api/file/p2bLdy4nRrOwv34yoEhg', NULL, NULL, '{"category": "ingestion"}', '[]', NULL, NULL, NULL, true, false, 1528493221, 1528493221, false, NULL, 'USD', '8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('c0e55cde-340b-44d7-bb42-2e0d65e98255', '67cd4dd0-2f75-445d-a6f0-2f297d6cd182', 'Speechmatics-En-Global V3F', 'Speechmatics Cloud ASR product in batch (pre-recorded audio or video files) and real-time.', 'active', 0, 1, true, 125, NULL, NULL, NULL, 112, NULL, '{"category": "transcribe", "dependencies": ["ingestion", "transcode"]}', '[]', NULL, NULL, 'c0e55cde-340b-44d7-bb42-2e0d65e98255', false, false, 1522199471, 1527015315, false, 'https://www.filepicker.io/api/file/PYhnibSPSYGNLF2xFzGV', 'USD', 'c0e55cde-340b-44d7-bb42-2e0d65e98255', 'Transcription - DQ - English (US)', 'This engine converts US English speech to text.', NULL, NULL, NULL, NULL, NULL)
        ON CONFLICT DO NOTHING;


        -- GLC Specific Engines: https://docs.google.com/spreadsheets/d/1L_0iDsF6J4be3yBASSKlbU2IzdqyiJ8oQES5VCPi8LY/edit#gid=0
        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('ab682a42-ffdb-40cd-a8f7-432905f0a5a1', '6faad6b7-0837-45f9-b161-2f6bf31b7a07', 'Face Similarity - V3F', 'This engine returns the top 10 candidates for a recognized person''s face, on V3F.', 'active', 0, 1, false, NULL, NULL, NULL, NULL, 100, NULL, '{"category": "image-detection", "dependencies": ["ingestion", "transcode"]}', '[{"max": 1, "min": 0, "name": "minConfidence", "type": "number", "label": "minConfidence", "value": 0, "required": false, "defaultValue": "0"}, {"name": "detector", "type": "picklist", "label": "detector", "value": "std", "options": [{"key": "Standard", "value": "std"}, {"key": "CNN (slower)", "value": "cnn"}], "required": false, "defaultValue": "std"}, {"name": "jitters", "type": "picklist", "label": "jitters", "value": "3", "options": [{"key": "Off (fastest)", "value": "0"}, {"key": "Low", "value": "3"}, {"key": "Medium", "value": "5"}, {"key": "High (slowest)", "value": "10"}], "required": false, "defaultValue": "3"}]', NULL, NULL, NULL, false, false, 1576026667, 1576026667, true, NULL, 'USD', 'ab682a42-ffdb-40cd-a8f7-432905f0a5a1', NULL, NULL, NULL, NULL, '["Identify"]', '[]', '{"engineMode": "chunk", "supportedInputTypes": ["image/jpeg", "image/gif"]}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('409938ee-b02c-461f-bece-94c90e4a1a84', 'f951fbf9-aa69-47a2-87c8-12dfb51a1f18', 'illuminate-upload-engine-batch-v3f', '', 'active', 2, 1, false, NULL, NULL, NULL, NULL, 100, NULL, '{"category": "utility", "dependencies": ["ingestion"]}', '[]', NULL, NULL, NULL, false, false, 1577240642, 1577240642, false, NULL, 'USD', '409938ee-b02c-461f-bece-94c90e4a1a84', NULL, NULL, NULL, NULL, '[]', '[]', NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('414eb717-388e-4082-9a04-65dec0b739bd', 'f951fbf9-aa69-47a2-87c8-12dfb51a1f18', 'illuminate-export-to-desktop-v3f', 'illuminate export to desktop v3f', 'active', 1, 1, true, NULL, NULL, NULL, NULL, 100, NULL, '{"category": "utility", "dependencies": ["ingestion"]}', '[]', NULL, NULL, NULL, false, false, 1577094678, 1581635651, false, NULL, 'USD', '414eb717-388e-4082-9a04-65dec0b739bd', NULL, NULL, NULL, NULL, '[]', '[]', NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('a38676f6-7557-4ba1-a544-c4020f800778', '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923', 'File Translator V3F', 'Translate your file', 'active', 2, 1, false, NULL, NULL, NULL, NULL, 100, NULL, '{"category": "translation", "dependencies": ["transcribe", "bulk-edit-transcript"]}', '[{"name": "pangeaMTTranslationServerUri", "type": "picklist", "label": "pangeaMTTranslationServerUri", "value": "http://prod.pangeamt.com:8080", "options": [{"key": "PangeaMT", "value": "http://prod.pangeamt.com:8080"}], "required": false, "defaultValue": "http://prod.pangeamt.com:8080"}, {"name": "pangeaMTTgtLang", "type": "picklist", "label": "pangeaMTTgtLang", "value": "en", "options": [{"key": "Spanish", "value": "es"}, {"key": "French", "value": "fr"}, {"key": "English", "value": "en"}, {"key": "Italian", "value": "it"}, {"key": "German", "value": "de"}, {"key": "Dutch", "value": "nl"}, {"key": "Portugese", "value": "pt"}, {"key": "Catalan", "value": "ca"}, {"key": "Norwegian", "value": "no"}, {"key": "Swedish", "value": "sv"}, {"key": "Danish", "value": "Da"}, {"key": "Finnish", "value": "fi"}, {"key": "Polish", "value": "pl"}, {"key": "Russian", "value": "ru"}, {"key": "Romanian", "value": "ro"}, {"key": "Bulgarian", "value": "bg"}, {"key": "Slovak", "value": "sk"}, {"key": "Czech", "value": "cs"}, {"key": "Croatian", "value": "hr"}, {"key": "Serbian", "value": "sr"}, {"key": "Albanian", "value": "sq"}, {"key": "Bosnian", "value": "bs"}, {"key": "Greek", "value": "el"}, {"key": "Arabic", "value": "ar"}, {"key": "Turkish", "value": "tr"}, {"key": "Persian (Farsi)", "value": "fa"}, {"key": "Ukranian", "value": "uk"}, {"key": "Hindi", "value": "hi"}, {"key": "Thai", "value": "th"}, {"key": "Vietnamese", "value": "vi"}, {"key": "Malay", "value": "ms"}, {"key": "Indonesian", "value": "id"}, {"key": "Chinese (Simplified)", "value": "zh"}, {"key": "Chinese (Traditional)", "value": "zh-tw"}, {"key": "Korean", "value": "ko"}, {"key": "Japanese", "value": "ja"}], "required": false, "defaultValue": "en"}, {"name": "pangeaMTSrcLang", "type": "picklist", "label": "pangeaMTSrcLang", "value": "es", "options": [{"key": "Spanish", "value": "es"}, {"key": "French", "value": "fr"}, {"key": "English", "value": "en"}, {"key": "Italian", "value": "it"}, {"key": "German", "value": "de"}, {"key": "Dutch", "value": "nl"}, {"key": "Portugese", "value": "pt"}, {"key": "Catalan", "value": "ca"}, {"key": "Norwegian", "value": "no"}, {"key": "Swedish", "value": "sv"}, {"key": "Danish", "value": "da"}, {"key": "Finnish", "value": "fi"}, {"key": "Polish", "value": "pl"}, {"key": "Russian", "value": "ru"}, {"key": "Romanian", "value": "ro"}, {"key": "Bulgarian", "value": "bg"}, {"key": "Slovak", "value": "sk"}, {"key": "Czech", "value": "cs"}, {"key": "Croatian", "value": "hr"}, {"key": "Serbian", "value": "sr"}, {"key": "Albanian", "value": "sq"}, {"key": "Bosnian", "value": "bs"}, {"key": "Greek", "value": "el"}, {"key": "Arabic", "value": "ar"}, {"key": "Turkish", "value": "tr"}, {"key": "Persian (Farsi)", "value": "fa"}, {"key": "Ukranian", "value": "uk"}, {"key": "Hindi", "value": "hi"}, {"key": "Thai", "value": "th"}, {"key": "Vietnamese", "value": "vi"}, {"key": "Malay", "value": "ms"}, {"key": "Indonesian", "value": "id"}, {"key": "Chinese (Simplified)", "value": "zh"}, {"key": "Chinese (Traditional)", "value": "zh-tw"}, {"key": "Korean", "value": "ko"}, {"key": "Japanese", "value": "ja"}], "required": false, "defaultValue": "es"}, {"name": "pangeaMTApiKey", "type": "text", "label": "pangeaMTApiKey", "required": false}]', NULL, NULL, NULL, false, false, 1576100779, 1576100779, false, NULL, 'USD', 'a38676f6-7557-4ba1-a544-c4020f800778', NULL, NULL, NULL, NULL, '["Just translate your files"]', '[]', '{"engineMode": "chunk", "supportedInputTypes": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "application/pdf", "text/html", "text/plain; charset=utf-8"]}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('8ce0226b-8d5a-4a2a-8820-feddd60b5c1c', 'f951fbf9-aa69-47a2-87c8-12dfb51a1f18', 'task-export-to-local-batch-v3f', '', 'active', 2, 1, false, NULL, NULL, NULL, NULL, 100, NULL, '{"category": "utility", "dependencies": ["ingestion"]}', '[]', NULL, NULL, NULL, false, false, 1577334415, 1577334415, false, NULL, 'USD', '8ce0226b-8d5a-4a2a-8820-feddd60b5c1c', NULL, NULL, NULL, NULL, '[]', '[]', NULL)
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.engine (engine_id, engine_category_id, engine_name, engine_description, engine_state, deployment_model, owner_organization_id, is_public, price, rating, website, logo_path, "order", dependency, core_job_data, fields, validation, application_id, asset, creates_recording, deleted, created_date, updated_date, library_required, icon_path, engine_currency, engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path, jwt_rights, use_cases, industries, engine_manifest)
        VALUES ('cbd5fc84-781a-4e45-bdac-c8b4e9e1354f', '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923', 'Pangeanic German-English V3F', 'Pangeanic German-English V3F', 'active', 0, 1, false, NULL, NULL, NULL, NULL, 100, NULL, '{"category": "translation", "dependencies": ["transcribe", "bulk-edit-transcript"]}', '[]', NULL, NULL, NULL, false, false, 1578468931, 1578468931, false, NULL, 'USD', 'cbd5fc84-781a-4e45-bdac-c8b4e9e1354f', NULL, NULL, NULL, NULL, '["Pangeanic German-English V3F"]', '[]', '{"engineMode": "chunk", "supportedInputTypes": ["text/plain", "application/ttml+xml"]}')
        ON CONFLICT DO NOTHING;


        -- Base V3F Engines: https://github.com/veritone/realtime/wiki/Base-Engines-Deployment-info
        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('9e611ad7-2d3b-48f6-a51b-0a1ba40fe255', 'fcd98c2e-8547-4fe9-86ab-b94f6e35468e', 17, 'deployed', NULL, 1582302243, 1582302243, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:9e611ad7-2d3b-48f6-a51b-0a1ba40fe255-fcd98c2e-8547-4fe9-86ab-b94f6e35468e', '{"edge": {}}', false, 60, 14, NULL, NULL, 637882659, NULL, '{"url": "https://github.com/veritone/realtime", "user": "qdang+superadmin@veritone.com", "build": "fcd98c2e-8547-4fe9-86ab-b94f6e35468e", "oauth": "", "runtime": "", "category": "ingestion", "engineId": "9e611ad7-2d3b-48f6-a51b-0a1ba40fe255", "isPublic": true, "schedule": "recurring", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": ["6"]}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "stream", "clusterSize": "custom", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "etversion=v0.3.1.3;builddate=2020-02-21_16:23:24;branch=wsa-fixup;commit=9f5f62f7d4ac88143007e8d4d3cc83383d325cd2", "customProfile": "webstream-adapter", "externalCalls": [], "inputEncoding": "", "outputFormats": ["video/webm"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "application/json", "supportedInputFormats": null}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('74dfd76b-472a-48f0-8395-c7e01dd7f255', 'ab45997f-81be-4027-808f-61cae2a0b4fc', 16, 'deployed', NULL, 1582300833, 1582300833, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:74dfd76b-472a-48f0-8395-c7e01dd7f255-ab45997f-81be-4027-808f-61cae2a0b4fc', '{"edge": {}}', false, 60, 14, NULL, NULL, 639335837, NULL, '{"url": "https://github.com/veritone/realtime", "user": "qdang+superadmin@veritone.com", "build": "ab45997f-81be-4027-808f-61cae2a0b4fc", "oauth": "", "runtime": "", "category": "ingestion", "engineId": "74dfd76b-472a-48f0-8395-c7e01dd7f255", "isPublic": true, "schedule": "recurring", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": ["1", "2"]}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "stream", "clusterSize": "custom", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "etversion=v0.3.1.3;builddate=2020-02-21_15:59:22;branch=more-timing;commit=532f624ade0b325e3fe9d3aec999c2b0ad1e164a", "customProfile": "webstream-adapter", "externalCalls": [], "inputEncoding": "", "outputFormats": ["video/webm"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "application/json", "supportedInputFormats": null}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440', '179bb1df-844a-4988-a030-03e2a84b219e', 15, 'deployed', NULL, 1582300890, 1582300890, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440-179bb1df-844a-4988-a030-03e2a84b219e', '{"edge": {}}', false, 60, 14, NULL, NULL, 639335597, NULL, '{"url": "https://github.com/veritone/engine-toolkit", "user": "qdang+superadmin@veritone.com", "build": "179bb1df-844a-4988-a030-03e2a84b219e", "oauth": "", "runtime": "", "category": "ingestion", "engineId": "8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "stream", "clusterSize": "custom", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "etversion=v0.3.1.3;builddate=2020-02-21_15:59:45;branch=more-timing;commit=532f624ade0b325e3fe9d3aec999c2b0ad1e164a", "customProfile": "stream-ingestor", "externalCalls": [], "inputEncoding": "", "outputFormats": ["video/mp4"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "application/json", "supportedInputFormats": null}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('352556c7-de07-4d55-b33f-74b1cf237f25', '0497e4c0-39e1-4a96-b1db-76b144edb491', 15, 'deployed', NULL, 1582300858, 1582300858, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:352556c7-de07-4d55-b33f-74b1cf237f25-0497e4c0-39e1-4a96-b1db-76b144edb491', '{"edge": {}}', false, 60, 14, NULL, NULL, 639335597, NULL, '{"url": "https://github.com/veritone/engine-toolkit", "user": "qdang+superadmin@veritone.com", "build": "0497e4c0-39e1-4a96-b1db-76b144edb491", "oauth": "", "runtime": "", "category": "ingestion", "engineId": "352556c7-de07-4d55-b33f-74b1cf237f25", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "stream", "clusterSize": "custom", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "etversion=v0.3.1.3;builddate=2020-02-21_15:59:29;branch=more-timing;commit=532f624ade0b325e3fe9d3aec999c2b0ad1e164a", "customProfile": "stream-ingestor", "externalCalls": [], "inputEncoding": "", "outputFormats": ["video/mp4"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "application/json", "supportedInputFormats": null}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('75fc943b-b5b0-4fe1-bcb6-9a7e1884257a', 'b71d88ba-40ac-4cf2-9b8e-84d5ba374516', 16, 'deployed', NULL, 1582300863, 1582300863, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:75fc943b-b5b0-4fe1-bcb6-9a7e1884257a-b71d88ba-40ac-4cf2-9b8e-84d5ba374516', '{"edge": {}}', false, 60, 14, NULL, NULL, 639335597, NULL, '{"url": "https://github.com/veritone/engine-toolkit", "user": "qdang+superadmin@veritone.com", "build": "b71d88ba-40ac-4cf2-9b8e-84d5ba374516", "oauth": "", "runtime": "", "category": "ingestion", "engineId": "75fc943b-b5b0-4fe1-bcb6-9a7e1884257a", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "stream", "clusterSize": "custom", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "etversion=v0.3.1.3;builddate=2020-02-21_15:59:37;branch=more-timing;commit=532f624ade0b325e3fe9d3aec999c2b0ad1e164a", "customProfile": "stream-ingestor", "externalCalls": [], "inputEncoding": "", "outputFormats": ["video/mp4"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "application/json", "supportedInputFormats": null}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3', '89599c9c-209f-4d8a-af02-0ab9e104f689', 16, 'deployed', NULL, 1582300894, 1582300894, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3-89599c9c-209f-4d8a-af02-0ab9e104f689', '{"edge": {}}', false, 60, 14, NULL, NULL, 639335516, NULL, '{"url": "https://github.com/veritone/engine-toolkit", "user": "qdang+superadmin@veritone.com", "build": "89599c9c-209f-4d8a-af02-0ab9e104f689", "oauth": "", "runtime": "", "category": "intra-category", "engineId": "8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "chunk", "clusterSize": "small", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "etversion=v0.3.1.3;builddate=2020-02-21_15:59:53;branch=more-timing;commit=532f624ade0b325e3fe9d3aec999c2b0ad1e164a", "customProfile": "", "externalCalls": [], "inputEncoding": "", "outputFormats": ["application/json"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "application/json", "supportedInputFormats": null}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('c0e55cde-340b-44d7-bb42-2e0d65e98255', '73601398-8833-4369-8e90-14475894df14', 11, 'deployed', 125, 1582301571, 1582301571, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:c0e55cde-340b-44d7-bb42-2e0d65e98255-73601398-8833-4369-8e90-14475894df14', '{"edge": {}}', false, 200, 62, 3, NULL, 3245891322, NULL, '{"url": "https://github.com/veritone/speechmatics-container-service/", "user": "qdang+superadmin@veritone.com", "build": "73601398-8833-4369-8e90-14475894df14", "oauth": "", "runtime": "", "category": "Transcription", "engineId": "c0e55cde-340b-44d7-bb42-2e0d65e98255", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "chunk", "clusterSize": "custom", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "Build Information: en:6.1.1.1; Is speaker separation engine: false", "customProfile": "speechmatics", "externalCalls": [], "inputEncoding": "", "outputFormats": ["application/json"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "application/json", "supportedInputFormats": ["audio/mp4", "audio/flac", "audio/wav", "audio/mpeg"]}')
        ON CONFLICT DO NOTHING;


        -- GLC Specific Engines: https://docs.google.com/spreadsheets/d/1L_0iDsF6J4be3yBASSKlbU2IzdqyiJ8oQES5VCPi8LY/edit#gid=0
        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest)
        VALUES ('ab682a42-ffdb-40cd-a8f7-432905f0a5a1', '4ec4aa6c-4ee4-49d0-918b-fa2e94c7466a', 7, 'deployed', NULL, 1580847504, 1580847504, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:ab682a42-ffdb-40cd-a8f7-432905f0a5a1-4ec4aa6c-4ee4-49d0-918b-fa2e94c7466a', '{"edge": {}}', false, 12, NULL, NULL, NULL, 392817659, NULL, '{"url": "https://machinebox.io/", "user": "framunno+cs@veritone.com", "build": "4ec4aa6c-4ee4-49d0-918b-fa2e94c7466a", "oauth": "", "runtime": "", "category": "faceDetection", "engineId": "ab682a42-ffdb-40cd-a8f7-432905f0a5a1", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": [], "maxFileMb": 0, "categories": null, "engineMode": "chunk", "clusterSize": "medium", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "", "customProfile": "", "externalCalls": ["https://machinebox.io"], "inputEncoding": "", "outputFormats": ["application/json"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "image/jpeg", "supportedInputFormats": ["image/gif", "image/jpeg"]}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('409938ee-b02c-461f-bece-94c90e4a1a84', '7857e2ed-87d8-4ea5-88a7-922924e9570b', 1, 'deployed', NULL, 1577240925, 1577240925, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:409938ee-b02c-461f-bece-94c90e4a1a84-7857e2ed-87d8-4ea5-88a7-922924e9570b', '{"edge": {}}', false, NULL, NULL, NULL, NULL, 58360839, NULL, '{"url": "https://github.com/veritone/task-illuminate-upload-engine-batch", "user": "nam.nguyen+success@setacinq.vn", "build": "7857e2ed-87d8-4ea5-88a7-922924e9570b", "oauth": "", "runtime": "", "category": "document", "engineId": "409938ee-b02c-461f-bece-94c90e4a1a84", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "batch", "clusterSize": "xlarge", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "", "customProfile": "", "externalCalls": [], "inputEncoding": "", "outputFormats": ["application/json"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "video/mp4", "supportedInputFormats": ["video/mp4"]}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('414eb717-388e-4082-9a04-65dec0b739bd', '3cb704ed-cd2e-43ee-a6af-1d3689a9b016', 17, 'deployed', NULL, 1580371162, 1580371162, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:414eb717-388e-4082-9a04-65dec0b739bd-3cb704ed-cd2e-43ee-a6af-1d3689a9b016', '{"edge": {}}', false, NULL, NULL, NULL, NULL, 84811801, NULL, '{"url": "https://github.com/veritone/task-illuminate-export-to-desktop", "user": "hoan.nguyen+success@setacinq.vn", "build": "3cb704ed-cd2e-43ee-a6af-1d3689a9b016", "oauth": "", "runtime": "", "category": "document", "engineId": "414eb717-388e-4082-9a04-65dec0b739bd", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "batch", "clusterSize": "xlarge", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "", "customProfile": "", "externalCalls": [], "inputEncoding": "", "outputFormats": ["application/json"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "video/mp4", "supportedInputFormats": ["video/mp4"]}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('a38676f6-7557-4ba1-a544-c4020f800778', 'a3841562-c726-4a0a-85fe-b056c78ffebe', 1, 'deployed', NULL, 1576101435, 1576101435, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:a38676f6-7557-4ba1-a544-c4020f800778-a3841562-c726-4a0a-85fe-b056c78ffebe', '{"edge": {}}', false, NULL, NULL, 1, NULL, 367005847, NULL, '{"url": "Enter your engine URL", "user": "adaniel+superadmin@veritone.com", "build": "a3841562-c726-4a0a-85fe-b056c78ffebe", "oauth": "", "runtime": "", "category": "Enter your engine category", "engineId": "a38676f6-7557-4ba1-a544-c4020f800778", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "chunk", "clusterSize": "small", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "", "customProfile": "", "externalCalls": [], "inputEncoding": "", "outputFormats": ["application/json"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "application/json", "supportedInputFormats": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "application/pdf", "text/html", "text/plain; charset=utf-8"]}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('8ce0226b-8d5a-4a2a-8820-feddd60b5c1c', 'f3d3dc36-89aa-4eba-9d3c-c951facd7e9a', 3, 'deployed', NULL, 1578890172, 1578890172, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:8ce0226b-8d5a-4a2a-8820-feddd60b5c1c-f3d3dc36-89aa-4eba-9d3c-c951facd7e9a', '{"edge": {}}', false, NULL, NULL, NULL, NULL, 21416416, NULL, '{"url": "https://github.com/veritone/task-export-to-local-batch", "user": "nam.nguyen+success@setacinq.vn", "build": "f3d3dc36-89aa-4eba-9d3c-c951facd7e9a", "oauth": "", "runtime": "", "category": "document", "engineId": "8ce0226b-8d5a-4a2a-8820-feddd60b5c1c", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "batch", "clusterSize": "xlarge", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "", "customProfile": "", "externalCalls": [], "inputEncoding": "", "outputFormats": ["application/json"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "video/mp4", "supportedInputFormats": ["video/mp4"]}')
        ON CONFLICT DO NOTHING;

        INSERT INTO job_new.build (engine_id, build_id, version, build_state, price, created_date, updated_date, deployment_model, docker_image, task_runtime, is_legacy, vul_low_count, vul_medium_count, vul_high_count, vul_critical_count, build_size, deploy_date, manifest) 
        VALUES ('cbd5fc84-781a-4e45-bdac-c8b4e9e1354f', 'b8fa423b-5634-4559-ada8-cd8c05a164f8', 2, 'deployed', NULL, 1578632308, 1578632308, 0, '026972849384.dkr.ecr.us-east-1.amazonaws.com/prod-validated:cbd5fc84-781a-4e45-bdac-c8b4e9e1354f-b8fa423b-5634-4559-ada8-cd8c05a164f8', '{"edge": {}}', false, 362, 253, 8, NULL, 7322412562, NULL, '{"url": "https://github.com/veritone/Pangeanic-Slovakia-to-English-V2f", "user": "nam.nguyen+success@setacinq.vn", "build": "b8fa423b-5634-4559-ada8-cd8c05a164f8", "oauth": "", "runtime": "", "category": "translate", "engineId": "cbd5fc84-781a-4e45-bdac-c8b4e9e1354f", "isPublic": true, "schedule": "", "schemaId": 0, "sourceId": 0, "ingestion": {"scanner": false, "supportsLiveStreams": false, "supportedSourceTypes": null}, "libraries": null, "maxFileMb": 0, "categories": null, "engineMode": "batch", "clusterSize": "large", "isBenchmark": false, "isConductor": false, "gpuSupported": "", "inputOptions": null, "releaseNotes": "", "customProfile": "", "externalCalls": [], "inputEncoding": "", "outputFormats": ["text/plain", "application/ttml+xml"], "serverCountry": "", "volumeProfile": "", "maxConcurrency": 50, "isCJISCompliant": false, "trainableViaApi": false, "whitelistOrgIds": null, "maxMediaLengthMs": 0, "minMediaLengthMs": 0, "fedRampImpactLevel": 0, "initialConcurrency": 50, "sourceFileDeletion": false, "supportedLanguages": null, "preferredInputFormat": "text/plain", "supportedInputFormats": ["text/plain", "application/ttml+xml"]}')
        ON CONFLICT DO NOTHING;
    END IF;
END;
$FLYWWAY$
