
-- Doc: https://docs.google.com/spreadsheets/d/1zJiNn9aItu6N0cjyWUxkYtC6Iv-eP45n-5w-U29EhNA/edit#gid=0

-- job_new.build
DROP TRIGGER IF EXISTS build_upd ON job_new.build;

CREATE TRIGGER build_upd
BEFORE UPDATE ON job_new.build FOR EACH ROW
EXECUTE PROCEDURE updated_date_int_upd();

-- job_new.engine_category
DROP TRIGGER IF EXISTS engine_category_upd ON job_new.engine_category;

CREATE TRIGGER engine_category_upd
BEFORE UPDATE ON job_new.engine_category FOR EACH ROW
EXECUTE PROCEDURE updated_date_int_upd();

-- job_new.engine: modified_date_time_ts_upd (google sheet) --> updated_date_int_upd
DROP TRIGGER IF EXISTS engine_upd ON job_new.engine;

CREATE TRIGGER engine_upd
BEFORE UPDATE ON job_new.engine FOR EACH ROW
EXECUTE PROCEDURE updated_date_int_upd();

-- job_new.export_request
DROP TRIGGER IF EXISTS export_request_upd ON job_new.export_request;

CREATE TRIGGER export_request_upd
BEFORE UPDATE ON job_new.export_request FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_ts_upd();

-- job_new.flow_executions
DROP TRIGGER IF EXISTS flow_executions_upd ON job_new.flow_executions;

CREATE TRIGGER flow_executions_upd
BEFORE UPDATE ON job_new.flow_executions FOR EACH ROW
EXECUTE PROCEDURE updated_date_time_ts_upd();

-- job_new.flow_revisions
DROP TRIGGER IF EXISTS flow_revisions_upd ON job_new.flow_revisions;

CREATE TRIGGER flow_revisions_upd
BEFORE UPDATE ON job_new.flow_revisions FOR EACH ROW
EXECUTE PROCEDURE updated_date_time_ts_upd();

-- libraries.entity_identifier
DROP TRIGGER IF EXISTS entity_identifier_upd ON libraries.entity_identifier;

CREATE TRIGGER entity_identifier_upd
BEFORE UPDATE ON libraries.entity_identifier FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_int_upd();

-- libraries.library
DROP TRIGGER IF EXISTS library_upd ON libraries.library;

CREATE TRIGGER library_upd
BEFORE UPDATE ON libraries.library FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_int_upd();

-- libraries.entity
DROP TRIGGER IF EXISTS entity_upd ON libraries.entity;

CREATE TRIGGER entity_upd
BEFORE UPDATE ON libraries.entity FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_int_upd();

-- libraries.library_engine_model
DROP TRIGGER IF EXISTS library_engine_model_upd ON libraries.library_engine_model;

CREATE TRIGGER library_engine_model_upd
BEFORE UPDATE ON libraries.library_engine_model FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_int_upd();

-- job_new.scheduled_job__job_template
DROP TRIGGER IF EXISTS scheduled_job__job_template_upd ON job_new.scheduled_job__job_template;

CREATE TRIGGER scheduled_job__job_template_upd
BEFORE UPDATE ON job_new.scheduled_job__job_template FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_ts_upd();

-- job_new.organization__engine
DROP TRIGGER IF EXISTS organization__engine_upd ON job_new.organization__engine;

CREATE TRIGGER organization__engine_upd
BEFORE UPDATE ON job_new.organization__engine FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_ts_upd();

-- recording.recording__source
DROP TRIGGER IF EXISTS recording__source_upd ON recording.recording__source;

CREATE TRIGGER recording__source_upd
BEFORE UPDATE ON recording.recording__source FOR EACH ROW
EXECUTE PROCEDURE modified_date_time_ts_upd();
