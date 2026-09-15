-- Copy Table
CREATE TABLE IF NOT EXISTS job_new.flow_templates AS TABLE flows;

-- Permissions
ALTER TABLE job_new.flow_templates OWNER TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE job_new.flow_templates TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE job_new.flow_templates TO core_graphql_server;
-- GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE job_new.flow_templates TO readwrite;
-- GRANT SELECT ON TABLE job_new.flow_templates TO readaccess;
-- GRANT SELECT ON TABLE job_new.flow_templates TO external_users;
-- GRANT SELECT ON TABLE job_new.flow_templates TO internal_users;
-- GRANT SELECT ON TABLE job_new.flow_templates TO readonly;
