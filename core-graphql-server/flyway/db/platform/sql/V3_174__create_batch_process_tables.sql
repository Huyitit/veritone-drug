-- AWT-10544
CREATE TABLE IF NOT EXISTS job_new.batch (
	batch_id uuid NOT NULL PRIMARY KEY,
	batch_name varchar NOT NULL,
	batch_selector jsonb NOT NULL,
	status varchar NOT NULL,
	organization_id int4 NOT NULL,
	created_by varchar NULL,
	modified_by varchar NULL,
	created_date date NOT NULL DEFAULT NOW(),
	modified_date date NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_new.batch_process (
	batch_process_id uuid NOT NULL PRIMARY KEY,
	batch_id uuid NOT NULL REFERENCES job_new.batch(batch_id),
	status varchar NOT NULL,
	process_definition jsonb NOT NULL,
	concurrency int4 NULL,
	completed_count int4 NOT NULL DEFAULT 0,
	pending_count int4 NOT NULL DEFAULT 0,
	running_count int4 NOT NULL DEFAULT 0,
	failed_count int4 NOT NULL DEFAULT 0,
	total_count int4 NOT NULL DEFAULT 0,
	organization_id int4 NOT NULL,
	date_created  TIMESTAMP DEFAULT NOW() NOT NULL,
    date_modified TIMESTAMP DEFAULT NOW() NOT NULL,
    created_by varchar NULL,
	modified_by varchar NULL
);

CREATE INDEX IF NOT EXISTS batch_process__batch_id_idx
    ON job_new.batch_process (batch_id);

CREATE INDEX IF NOT EXISTS batch_process__batch_org_idx
    ON job_new.batch_process (organization_id, status, date_modified);

CREATE TABLE IF NOT EXISTS job_new.batch_item (
    batch_id UUID NOT NULL REFERENCES job_new.batch(batch_id),
    item_id VARCHAR NOT NULL
) PARTITION BY HASH (batch_id);

CREATE INDEX IF NOT EXISTS batch_item__batch_id_item_id_idx
    ON job_new.batch_item (batch_id, item_id);

CREATE TABLE job_new.batch_item_p20_0 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 0);
CREATE TABLE job_new.batch_item_p20_1 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 1);
CREATE TABLE job_new.batch_item_p20_2 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 2);
CREATE TABLE job_new.batch_item_p20_3 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 3);
CREATE TABLE job_new.batch_item_p20_4 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 4);
CREATE TABLE job_new.batch_item_p20_5 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 5);
CREATE TABLE job_new.batch_item_p20_6 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 6);
CREATE TABLE job_new.batch_item_p20_7 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 7);
CREATE TABLE job_new.batch_item_p20_8 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 8);
CREATE TABLE job_new.batch_item_p20_9 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 9);
CREATE TABLE job_new.batch_item_p20_10 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 10);
CREATE TABLE job_new.batch_item_p20_11 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 11);
CREATE TABLE job_new.batch_item_p20_12 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 12);
CREATE TABLE job_new.batch_item_p20_13 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 13);
CREATE TABLE job_new.batch_item_p20_14 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 14);
CREATE TABLE job_new.batch_item_p20_15 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 15);
CREATE TABLE job_new.batch_item_p20_16 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 16);
CREATE TABLE job_new.batch_item_p20_17 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 17);
CREATE TABLE job_new.batch_item_p20_18 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 18);
CREATE TABLE job_new.batch_item_p20_19 PARTITION OF job_new.batch_item FOR VALUES WITH (MODULUS 20, REMAINDER 19);

-- create type for the item action status
DROP TYPE IF EXISTS job_new.batch_process_item_status CASCADE;
CREATE TYPE job_new.batch_process_item_status AS ENUM ('pending', 'queued', 'running', 'completed', 'failed', 'aborted');
COMMENT ON TYPE job_new.batch_process_item_status IS 'The current state of a batch item';
ALTER TYPE job_new.batch_process_item_status OWNER TO postgres;

-- table definition
DROP TABLE IF EXISTS job_new.batch_process_item CASCADE;
CREATE TABLE IF NOT EXISTS job_new.batch_process_item
(
    batch_process_id UUID NOT NULL REFERENCES job_new.batch_process(batch_process_id),
    item_id VARCHAR NOT NULL,
    action_id VARCHAR NULL,
    status job_new.batch_process_item_status NOT NULL DEFAULT 'pending',
	date_created timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
    date_modified timestamptz NOT NULL default (current_timestamp AT TIME ZONE 'UTC'),
    CONSTRAINT batch_process_item_pk
        PRIMARY KEY (batch_process_id, item_id)
) PARTITION BY HASH (batch_process_id);

CREATE INDEX IF NOT EXISTS batch_process_item__batch_id_item_id_action_id_status_idx
    ON job_new.batch_process_item (batch_process_id, item_id, action_id, status);

COMMENT ON TABLE job_new.batch_process_item IS 'Table for managing the lists of actions and action states for processing_batch';
COMMENT ON COLUMN job_new.batch_process_item.batch_process_id IS 'Processing batch id';
COMMENT ON COLUMN job_new.batch_process_item.item_id IS 'Batch member id';
COMMENT ON COLUMN job_new.batch_process_item.action_id IS 'Reference id of the action performed on the item';

CREATE TABLE job_new.batch_process_item_p20_0 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 0);
CREATE TABLE job_new.batch_process_item_p20_1 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 1);
CREATE TABLE job_new.batch_process_item_p20_2 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 2);
CREATE TABLE job_new.batch_process_item_p20_3 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 3);
CREATE TABLE job_new.batch_process_item_p20_4 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 4);
CREATE TABLE job_new.batch_process_item_p20_5 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 5);
CREATE TABLE job_new.batch_process_item_p20_6 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 6);
CREATE TABLE job_new.batch_process_item_p20_7 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 7);
CREATE TABLE job_new.batch_process_item_p20_8 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 8);
CREATE TABLE job_new.batch_process_item_p20_9 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 9);
CREATE TABLE job_new.batch_process_item_p20_10 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 10);
CREATE TABLE job_new.batch_process_item_p20_11 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 11);
CREATE TABLE job_new.batch_process_item_p20_12 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 12);
CREATE TABLE job_new.batch_process_item_p20_13 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 13);
CREATE TABLE job_new.batch_process_item_p20_14 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 14);
CREATE TABLE job_new.batch_process_item_p20_15 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 15);
CREATE TABLE job_new.batch_process_item_p20_16 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 16);
CREATE TABLE job_new.batch_process_item_p20_17 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 17);
CREATE TABLE job_new.batch_process_item_p20_18 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 18);
CREATE TABLE job_new.batch_process_item_p20_19 PARTITION OF job_new.batch_process_item FOR VALUES WITH (MODULUS 20, REMAINDER 19);