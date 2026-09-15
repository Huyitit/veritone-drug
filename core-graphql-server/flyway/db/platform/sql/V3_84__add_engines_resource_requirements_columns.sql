--
-- Name: type_gpu; Type: TYPE; Schema: job_new; Owner: postgres
--

DROP TYPE IF EXISTS job_new.type_gpu;
CREATE TYPE job_new.type_gpu AS ENUM (
    'none',
    'aws_p2',
    'aws_p3'
);

ALTER TYPE job_new.type_gpu OWNER TO postgres;

ALTER TABLE job_new.engine
ADD COLUMN IF NOT EXISTS cpu_resource_mcpu INTEGER DEFAULT 1024 NOT NULL,
ADD COLUMN IF NOT EXISTS cpu_shares INTEGER DEFAULT 1024 NOT NULL,
ADD COLUMN IF NOT EXISTS gpu_supported job_new.type_gpu DEFAULT 'none'::job_new.type_gpu NOT NULL,
ADD COLUMN IF NOT EXISTS memory_resource_bytes BIGINT DEFAULT '2147483648'::BIGINT NOT NULL,
ADD COLUMN IF NOT EXISTS storage_resource_bytes BIGINT DEFAULT '1073741824'::BIGINT NOT NULL;
