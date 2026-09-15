CREATE TABLE IF NOT EXISTS job_new.flow_revisions (
	flow_revision_id uuid NOT NULL DEFAULT uuid_generate_v4(), -- canonical id for flows
	flow_revision_numb int4 NULL DEFAULT 1, -- human readable id
	organization_id varchar(70) NOT NULL, -- org id
	engine_id uuid NOT NULL, -- engine id
	is_head bool NOT NULL DEFAULT false, -- Latest flow revision
	runtime jsonb NOT NULL, -- json runtime for node red flow
	hash varchar(64) NOT NULL, -- hash of json runtime
	created_date_time timestamptz NULL DEFAULT CURRENT_TIMESTAMP,
	updated_by text NOT NULL,
	user_id uuid NULL, -- id of user
	build_id uuid NULL, -- id of build
	description varchar(500) NULL, -- description of changes
	CONSTRAINT flow_revisions_pkey PRIMARY KEY (flow_revision_id)
);

-- Permissions - AP Note: Not sure which are actully necessary
COMMENT ON TABLE job_new.flow_revisions IS 'This holds the flow revisions';

ALTER TABLE job_new.flow_revisions OWNER TO postgres;
-- GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE job_new.flow_revisions TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE job_new.flow_revisions TO core_graphql_server;
-- GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE job_new.flow_revisions TO readwrite;
-- GRANT SELECT ON TABLE job_new.flow_revisions TO readaccess;
-- GRANT SELECT ON TABLE job_new.flow_revisions TO external_users;
-- GRANT SELECT ON TABLE job_new.flow_revisions TO internal_users;
-- GRANT SELECT ON TABLE job_new.flow_revisions TO readonly;

-- Indexes
CREATE INDEX IF NOT EXISTS flow_revisions_build_id_idx ON job_new.flow_revisions USING btree (build_id);
CREATE INDEX IF NOT EXISTS flow_revisions_engine_id_idx ON job_new.flow_revisions USING btree (engine_id);
CREATE INDEX IF NOT EXISTS flow_revisions_flow_revision_id_idx ON job_new.flow_revisions USING btree (flow_revision_id);
CREATE INDEX IF NOT EXISTS flow_revisions_is_head_idx ON job_new.flow_revisions USING btree (is_head);
CREATE INDEX IF NOT EXISTS flow_revisions_organization_id_idx ON job_new.flow_revisions USING btree (organization_id);
CREATE INDEX IF NOT EXISTS flow_revisions_user_id_idx ON job_new.flow_revisions USING btree (user_id);

-- Column comments
COMMENT ON COLUMN job_new.flow_revisions.flow_revision_id IS 'canonical id for flows';
COMMENT ON COLUMN job_new.flow_revisions.flow_revision_numb IS 'human readable id';
COMMENT ON COLUMN job_new.flow_revisions.organization_id IS 'org id';
COMMENT ON COLUMN job_new.flow_revisions.engine_id IS 'engine id';
COMMENT ON COLUMN job_new.flow_revisions.is_head IS 'Latest flow revision';
COMMENT ON COLUMN job_new.flow_revisions.runtime IS 'json runtime for node red flow';
COMMENT ON COLUMN job_new.flow_revisions.hash IS 'hash of json runtime';
COMMENT ON COLUMN job_new.flow_revisions.user_id IS 'id of user';
COMMENT ON COLUMN job_new.flow_revisions.build_id IS 'id of build';
COMMENT ON COLUMN job_new.flow_revisions.description IS 'description of changes';

