CREATE TABLE IF NOT EXISTS job_new.audit_log_export_request (
            id uuid DEFAULT public.uuid_generate_v4() NOT NULL,            
            filters jsonb,
            status text NOT NULL,
            requestor_id text NOT NULL,            
            download_url text,
            created_date_time timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
            modified_date_time timestamp with time zone DEFAULT timezone('UTC'::text, now()) NOT NULL
        );


ALTER TABLE IF EXISTS job_new.audit_log_export_request OWNER TO postgres;