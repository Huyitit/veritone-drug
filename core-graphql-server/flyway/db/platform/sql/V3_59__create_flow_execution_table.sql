CREATE TABLE IF NOT EXISTS job_new.flow_executions (
	flow_execution_id uuid NOT NULL, -- canonical id for executions
	flow_id uuid NOT NULL, -- canonical id of related flow
	flow_revision_id uuid NULL, -- optional flow revision id
	organization_id varchar(70) NOT NULL, -- org id
	user_id uuid NULL, -- id of user
	flow_execution_input varchar(64) NULL, -- url of file containing input or simple string
	flow_execution_status varchar(64) NULL, -- status of the execution
	flow_execution_result varchar(64) NULL, -- url of the results
	flow_execution_log varchar(64) NULL, -- url of the log
	created_date_time timestamptz NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT flow_executions_pkey PRIMARY KEY (flow_execution_id)
);

-- Permissions - AP Note: Not sure which are actully necessary
COMMENT ON TABLE job_new.flow_executions IS 'This holds the flow execution logs';

ALTER TABLE job_new.flow_executions OWNER TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE job_new.flow_executions TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE job_new.flow_executions TO core_graphql_server;
-- GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE job_new.flow_executions TO readwrite;
-- GRANT SELECT ON TABLE job_new.flow_executions TO readaccess;
-- GRANT SELECT ON TABLE job_new.flow_executions TO external_users;
-- GRANT SELECT ON TABLE job_new.flow_executions TO internal_users;
-- GRANT SELECT ON TABLE job_new.flow_executions TO readonly;

-- Indexes
CREATE INDEX IF NOT EXISTS flow_executions_flow_execution_id_idx ON job_new.flow_executions USING btree (flow_execution_id);
CREATE INDEX IF NOT EXISTS flow_executions_flow_id_idx ON job_new.flow_executions USING btree (flow_id);
CREATE INDEX IF NOT EXISTS flow_executions_flow_revision_id_idx ON job_new.flow_executions USING btree (flow_revision_id);
CREATE INDEX IF NOT EXISTS flow_executions_organization_id_idx ON job_new.flow_executions USING btree (organization_id);

-- Column comments
COMMENT ON COLUMN job_new.flow_executions.flow_execution_id IS 'canonical id for execution';
COMMENT ON COLUMN job_new.flow_executions.flow_revision_id IS 'canonical id for associated revision';
COMMENT ON COLUMN job_new.flow_executions.flow_id IS 'canonical id for associated flow';
COMMENT ON COLUMN job_new.flow_executions.user_id IS 'canonical id for authed user on creation';
COMMENT ON COLUMN job_new.flow_executions.organization_id IS 'org id';


