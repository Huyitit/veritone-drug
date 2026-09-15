DO $FLYWWAY$
BEGIN
    IF (EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'public' 
                    AND  TABLE_NAME = '_arbitron_audience_estimate_')) THEN
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
        -- Name: audience; Type: DATABASE; Schema: -; Owner: postgres
        --

        -- CREATE DATABASE audience WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8';


        ALTER DATABASE audience OWNER TO postgres;

        -- \connect audience

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
        -- Name: hstore; Type: EXTENSION; Schema: -; Owner: 
        --

        CREATE EXTENSION IF NOT EXISTS hstore WITH SCHEMA public;


        --
        -- Name: EXTENSION hstore; Type: COMMENT; Schema: -; Owner: 
        --

        -- COMMENT ON EXTENSION hstore IS 'data type for storing sets of (key, value) pairs';


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
        -- Name: array_count(anyarray); Type: FUNCTION; Schema: public; Owner: postgres
        --

        CREATE FUNCTION public.array_count(arr anyarray) RETURNS public.hstore
            LANGUAGE plpgsql IMMUTABLE STRICT
            AS $$
            BEGIN
            RETURN
                hstore(array_agg(COALESCE(v::text, 'null')), array_agg(c::text)) FROM (
                    SELECT v, COUNT(*) as c FROM unnest(arr) v GROUP BY v
                ) t ;
            END;
        $$;


        ALTER FUNCTION public.array_count(arr anyarray) OWNER TO postgres;

        --
        -- Name: hstore_accum(public.hstore[], public.hstore); Type: FUNCTION; Schema: public; Owner: postgres
        --

        CREATE FUNCTION public.hstore_accum(a public.hstore[], b public.hstore) RETURNS public.hstore[]
            LANGUAGE plpgsql IMMUTABLE
            AS $$
            BEGIN
            RETURN
                Array[hstore_add(a[1],b), hstore_add(a[2],array_count(akeys(b))::hstore)];
            END;
        $$;


        ALTER FUNCTION public.hstore_accum(a public.hstore[], b public.hstore) OWNER TO postgres;

        --
        -- Name: hstore_add(public.hstore, public.hstore); Type: FUNCTION; Schema: public; Owner: postgres
        --

        CREATE FUNCTION public.hstore_add(a public.hstore, b public.hstore) RETURNS public.hstore
            LANGUAGE plpgsql IMMUTABLE
            AS $$
        BEGIN
            RETURN
                hstore(
                array_agg(key),
                    array_agg(
                    (
                        COALESCE(r.value::integer, 0) +
                        COALESCE(l.value::integer, 0)
                    )::text
                )
            )
            FROM each(a) l
            FULL OUTER JOIN each(b) r
            USING (key);
        END;
        $$;


        ALTER FUNCTION public.hstore_add(a public.hstore, b public.hstore) OWNER TO postgres;

        --
        -- Name: hstore_avg(public.hstore[]); Type: FUNCTION; Schema: public; Owner: postgres
        --

        CREATE FUNCTION public.hstore_avg(a public.hstore[]) RETURNS public.hstore
            LANGUAGE plpgsql IMMUTABLE STRICT
            AS $$
            BEGIN
            RETURN
                COALESCE (
                    hstore(
                        array_agg(key),
                        array_agg((l.value::integer / r.value::integer)::integer::text)
                    ),''::hstore)
                FROM each(a[1]) l
                INNER JOIN each(a[2]) r
                USING (key);
            END;
        $$;


        ALTER FUNCTION public.hstore_avg(a public.hstore[]) OWNER TO postgres;

        --
        -- Name: avg(public.hstore); Type: AGGREGATE; Schema: public; Owner: postgres
        --

        CREATE AGGREGATE public.avg(public.hstore) (
            SFUNC = public.hstore_accum,
            STYPE = public.hstore[],
            INITCOND = '{}',
            FINALFUNC = public.hstore_avg
        );


        ALTER AGGREGATE public.avg(public.hstore) OWNER TO postgres;

        --
        -- Name: sum(public.hstore); Type: AGGREGATE; Schema: public; Owner: postgres
        --

        CREATE AGGREGATE public.sum(public.hstore) (
            SFUNC = public.hstore_add,
            STYPE = public.hstore,
            INITCOND = ''
        );


        ALTER AGGREGATE public.sum(public.hstore) OWNER TO postgres;

        SET default_tablespace = '';

        SET default_with_oids = false;

        --
        -- Name: _arbitron_audience_estimate_; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public._arbitron_audience_estimate_ (
            file_id integer NOT NULL,
            geo_indicator integer NOT NULL,
            estimate_type integer NOT NULL,
            daypart_id integer NOT NULL,
            listening_location integer NOT NULL,
            audience_charecteristic_id integer NOT NULL,
            station_combo_id text NOT NULL,
            projection integer NOT NULL
        );


        ALTER TABLE public._arbitron_audience_estimate_ OWNER TO postgres;

        --
        -- Name: _stage_arbitron_audience_characteristic; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public._stage_arbitron_audience_characteristic (
            audience_characteristic_id integer NOT NULL,
            audience_characteristic_name text NOT NULL,
            demographics_code text NOT NULL,
            qualitative_code text NOT NULL
        );


        ALTER TABLE public._stage_arbitron_audience_characteristic OWNER TO postgres;

        --
        -- Name: _stage_arbitron_daypart; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public._stage_arbitron_daypart (
            daypart_id integer NOT NULL,
            daypart_name text NOT NULL,
            daypart_quarter_hours text NOT NULL
        );


        ALTER TABLE public._stage_arbitron_daypart OWNER TO postgres;

        --
        -- Name: _stage_arbitron_daypart_day; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public._stage_arbitron_daypart_day (
            daypart_id integer NOT NULL,
            day_of_week integer NOT NULL,
            start_time time without time zone,
            end_time time without time zone
        );


        ALTER TABLE public._stage_arbitron_daypart_day OWNER TO postgres;

        --
        -- Name: _stage_arbitron_station_combo; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public._stage_arbitron_station_combo (
            geo_indicator text NOT NULL,
            station_combo_type text NOT NULL,
            station_combo_id text NOT NULL,
            station_combo_name text NOT NULL,
            station_call_letters text NOT NULL,
            station_band text NOT NULL,
            call_letter_change_indicator text NOT NULL,
            station_frequency text NOT NULL,
            station_format_code text NOT NULL,
            station_activity_code text NOT NULL,
            home_outside_indicator text NOT NULL,
            station_sequence_number text NOT NULL,
            station_encode_flag text NOT NULL
        );


        ALTER TABLE public._stage_arbitron_station_combo OWNER TO postgres;

        --
        -- Name: _stage_media_source; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public._stage_media_source (
            media_source_name text,
            media_source_id integer
        );


        ALTER TABLE public._stage_media_source OWNER TO postgres;

        --
        -- Name: _stage_program_schedule_day; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public._stage_program_schedule_day (
            program_id integer,
            media_source_id integer,
            program_schedule_day_of_week integer,
            start_time time(6) without time zone,
            end_time time(6) without time zone
        );


        ALTER TABLE public._stage_program_schedule_day OWNER TO postgres;

        --
        -- Name: age_group; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.age_group (
            age_group_id integer NOT NULL,
            age_group_name text
        );


        ALTER TABLE public.age_group OWNER TO postgres;

        --
        -- Name: arbitron_audience_characteristic; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_audience_characteristic (
            audience_characteristic_id integer NOT NULL,
            audience_characteristic_name text NOT NULL,
            demographics_code text NOT NULL,
            qualitative_code text NOT NULL,
            age_group_id integer NOT NULL,
            gender_id integer NOT NULL
        );


        ALTER TABLE public.arbitron_audience_characteristic OWNER TO postgres;

        --
        -- Name: arbitron_daypart; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_daypart (
            daypart_id integer NOT NULL,
            daypart_name text NOT NULL,
            daypart_quarter_hours text NOT NULL
        );


        ALTER TABLE public.arbitron_daypart OWNER TO postgres;

        --
        -- Name: arbitron_daypart_day; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_daypart_day (
            daypart_id integer NOT NULL,
            day_of_week integer NOT NULL,
            start_time time without time zone,
            end_time time without time zone
        );


        ALTER TABLE public.arbitron_daypart_day OWNER TO postgres;

        --
        -- Name: arbitron_file; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_file (
            file_id integer NOT NULL,
            record_id text NOT NULL,
            record_type text NOT NULL,
            report_period_id text NOT NULL,
            arbitron_market_code text NOT NULL,
            report_period_short text NOT NULL,
            report_period_name text NOT NULL,
            start_date timestamp without time zone NOT NULL,
            end_date timestamp without time zone NOT NULL,
            market_name text NOT NULL,
            standard text NOT NULL,
            copyright text NOT NULL
        );


        ALTER TABLE public.arbitron_file OWNER TO postgres;

        --
        -- Name: arbitron_file_file_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
        --

        CREATE SEQUENCE public.arbitron_file_file_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;


        ALTER TABLE public.arbitron_file_file_id_seq OWNER TO postgres;

        --
        -- Name: arbitron_file_file_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
        --

        ALTER SEQUENCE public.arbitron_file_file_id_seq OWNED BY public.arbitron_file.file_id;


        --
        -- Name: arbitron_in_tab; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_in_tab (
            file_id integer NOT NULL,
            geo_indicator text NOT NULL,
            audience_characteristic_id text NOT NULL,
            in_tab_value text NOT NULL
        );


        ALTER TABLE public.arbitron_in_tab OWNER TO postgres;

        --
        -- Name: arbitron_market; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_market (
            arbitron_market_id integer NOT NULL,
            market_name text NOT NULL,
            market_code text NOT NULL,
            market_type_id integer NOT NULL,
            latitude text,
            longitude text
        );


        ALTER TABLE public.arbitron_market OWNER TO postgres;

        --
        -- Name: arbitron_market_arbitron_market_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
        --

        CREATE SEQUENCE public.arbitron_market_arbitron_market_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;


        ALTER TABLE public.arbitron_market_arbitron_market_id_seq OWNER TO postgres;

        --
        -- Name: arbitron_market_arbitron_market_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
        --

        ALTER SEQUENCE public.arbitron_market_arbitron_market_id_seq OWNED BY public.arbitron_market.arbitron_market_id;


        --
        -- Name: arbitron_media_source_summary_dma; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_media_source_summary_dma (
            media_source_id integer NOT NULL,
            start_date date NOT NULL,
            end_date date NOT NULL,
            daypart_id integer NOT NULL,
            arbitron_market_id integer NOT NULL,
            audience_aqh integer NOT NULL,
            audience_characteristics public.hstore NOT NULL
        );


        ALTER TABLE public.arbitron_media_source_summary_dma OWNER TO postgres;

        --
        -- Name: arbitron_media_source_summary_metro; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_media_source_summary_metro (
            media_source_id integer NOT NULL,
            start_date date NOT NULL,
            end_date date NOT NULL,
            daypart_id integer NOT NULL,
            arbitron_market_id integer NOT NULL,
            audience_aqh integer NOT NULL,
            audience_characteristics public.hstore NOT NULL
        );


        ALTER TABLE public.arbitron_media_source_summary_metro OWNER TO postgres;

        --
        -- Name: arbitron_network_affiliation; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_network_affiliation (
            file_id integer NOT NULL,
            network_type_id text NOT NULL,
            network_affiliation_id text NOT NULL,
            station_combo_id text NOT NULL,
            unused text NOT NULL
        );


        ALTER TABLE public.arbitron_network_affiliation OWNER TO postgres;

        --
        -- Name: arbitron_population; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_population (
            file_id integer NOT NULL,
            geo_indicator text NOT NULL,
            audience_characteristic_id text NOT NULL,
            weighted_population text NOT NULL
        );


        ALTER TABLE public.arbitron_population OWNER TO postgres;

        --
        -- Name: arbitron_program_market_summary_dma; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_program_market_summary_dma (
            program_id integer NOT NULL,
            arbitron_market_id integer NOT NULL,
            start_date date NOT NULL,
            end_date date NOT NULL,
            program_hour integer NOT NULL,
            audience_aqh integer NOT NULL,
            audience_characteristics public.hstore NOT NULL
        );


        ALTER TABLE public.arbitron_program_market_summary_dma OWNER TO postgres;

        --
        -- Name: arbitron_program_summary_dma; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_program_summary_dma (
            program_id integer NOT NULL,
            start_date date NOT NULL,
            end_date date NOT NULL,
            program_hour integer NOT NULL,
            markets integer[] NOT NULL,
            media_sources integer[] NOT NULL,
            audience_aqh integer NOT NULL,
            audience_characteristics public.hstore NOT NULL,
            day_of_week integer
        );


        ALTER TABLE public.arbitron_program_summary_dma OWNER TO postgres;

        --
        -- Name: arbitron_program_summary_metro; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_program_summary_metro (
            program_id integer NOT NULL,
            start_date date NOT NULL,
            end_date date NOT NULL,
            program_hour integer NOT NULL,
            markets integer[] NOT NULL,
            media_sources integer[] NOT NULL,
            audience_aqh integer NOT NULL,
            audience_characteristics public.hstore NOT NULL,
            day_of_week integer
        );


        ALTER TABLE public.arbitron_program_summary_metro OWNER TO postgres;

        --
        -- Name: arbitron_station_combo; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.arbitron_station_combo (
            geo_indicator text NOT NULL,
            station_combo_type text NOT NULL,
            station_combo_id text NOT NULL,
            station_combo_name text NOT NULL,
            station_call_letters text NOT NULL,
            station_band text NOT NULL,
            call_letter_change_indicator text NOT NULL,
            station_frequency text NOT NULL,
            station_format_code text NOT NULL,
            station_activity_code text NOT NULL,
            home_outside_indicator text NOT NULL,
            station_sequence_number text NOT NULL,
            station_encode_flag text NOT NULL,
            media_source_id integer,
            media_source_ids integer[]
        );


        ALTER TABLE public.arbitron_station_combo OWNER TO postgres;

        --
        -- Name: gender; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.gender (
            gender_id integer NOT NULL,
            gender_name text
        );


        ALTER TABLE public.gender OWNER TO postgres;

        --
        -- Name: program_start_time; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.program_start_time (
            program_id integer,
            day_of_week integer,
            start_time integer
        );


        ALTER TABLE public.program_start_time OWNER TO postgres;

        --
        -- Name: temp_arbitron_file; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.temp_arbitron_file (
            file_id integer,
            arbitron_market_code text,
            record_type text,
            start_date timestamp without time zone,
            end_date timestamp without time zone,
            market_name text,
            report_period_name text,
            rnum bigint
        );


        ALTER TABLE public.temp_arbitron_file OWNER TO postgres;

        --
        -- Name: temp_program_dayparts; Type: TABLE; Schema: public; Owner: postgres
        --

        CREATE TABLE public.temp_program_dayparts (
            program_id integer,
            media_source_id integer,
            daypart_id integer,
            day_of_week integer,
            program_hour interval,
            daypart_start time without time zone,
            daypart_end time without time zone,
            program_start time(6) without time zone,
            program_end time(6) without time zone
        );


        ALTER TABLE public.temp_program_dayparts OWNER TO postgres;

        --
        -- Name: arbitron_file file_id; Type: DEFAULT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.arbitron_file ALTER COLUMN file_id SET DEFAULT nextval('public.arbitron_file_file_id_seq'::regclass);


        --
        -- Name: arbitron_market arbitron_market_id; Type: DEFAULT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.arbitron_market ALTER COLUMN arbitron_market_id SET DEFAULT nextval('public.arbitron_market_arbitron_market_id_seq'::regclass);


        --
        -- Name: arbitron_file _pk_arbitron_file@file_id; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.arbitron_file
            ADD CONSTRAINT "_pk_arbitron_file@file_id" PRIMARY KEY (file_id);


        --
        -- Name: age_group age_group_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.age_group
            ADD CONSTRAINT age_group_pkey PRIMARY KEY (age_group_id);


        --
        -- Name: gender gender_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
        --

        ALTER TABLE ONLY public.gender
            ADD CONSTRAINT gender_pkey PRIMARY KEY (gender_id);


        --
        -- Name: _ix_arbitron_audience_estimate@file_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_arbitron_audience_estimate@file_id" ON public._arbitron_audience_estimate_ USING btree (file_id);


        --
        -- Name: _ix_arbitron_audience_estimate@station_combo_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_arbitron_audience_estimate@station_combo_id" ON public._arbitron_audience_estimate_ USING btree (station_combo_id, listening_location, audience_charecteristic_id, estimate_type, daypart_id, projection);


        --
        -- Name: _ix_arbitron_media_source_summary_dma@media_source_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_arbitron_media_source_summary_dma@media_source_id" ON public.arbitron_media_source_summary_dma USING btree (media_source_id, start_date, end_date, daypart_id, arbitron_market_id, audience_aqh, audience_characteristics);


        --
        -- Name: _ix_arbitron_media_source_summary_metro@media_source_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_arbitron_media_source_summary_metro@media_source_id" ON public.arbitron_media_source_summary_metro USING btree (media_source_id, start_date, end_date, daypart_id, arbitron_market_id, audience_aqh, audience_characteristics);


        --
        -- Name: _ix_arbitron_program_summary_dma@program_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_arbitron_program_summary_dma@program_id" ON public.arbitron_program_summary_dma USING btree (program_id, start_date);

        ALTER TABLE public.arbitron_program_summary_dma CLUSTER ON "_ix_arbitron_program_summary_dma@program_id";


        --
        -- Name: _ix_arbitron_program_summary_metro@program_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_arbitron_program_summary_metro@program_id" ON public.arbitron_program_summary_metro USING btree (program_id, start_date);

        ALTER TABLE public.arbitron_program_summary_metro CLUSTER ON "_ix_arbitron_program_summary_metro@program_id";


        --
        -- Name: _ix_program_start_time@program_id; Type: INDEX; Schema: public; Owner: postgres
        --

        CREATE INDEX "_ix_program_start_time@program_id" ON public.program_start_time USING btree (program_id);
    END IF;
END;
$FLYWWAY$