-- Look at the Notes columns, some indicies are not necessary
-- https://docs.google.com/spreadsheets/d/1zJiNn9aItu6N0cjyWUxkYtC6Iv-eP45n-5w-U29EhNA/edit#gid=0

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS job_bundle_updated_date_idx ON aiware.job_bundle USING btree (updated_date);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS node_updated_date_idx ON aiware.node USING btree (updated_date);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS job_pipeline_modified_date_time_idx ON job_new.job_pipeline USING btree (modified_date_time);

CREATE INDEX CONCURRENTLY IF NOT EXISTS build_updated_date_idx ON job_new.build USING btree (updated_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS engine_category_updated_date_idx ON job_new.engine_category USING btree (updated_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS engine_updated_date_idx ON job_new.engine USING btree (updated_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS export_request_modified_date_time_idx ON job_new.export_request USING btree (modified_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS flow_executions_updated_date_time_idx ON job_new.flow_executions USING btree (updated_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS flow_revisions_updated_date_time_idx ON job_new.flow_revisions USING btree (updated_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS entity_identifier_modified_date_time_idx ON libraries.entity_identifier USING btree (modified_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS library_modified_date_time_idx ON libraries.library USING btree (modified_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS entity_modified_date_time_idx ON libraries.entity USING btree (modified_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS library_engine_model_modified_date_time_idx ON libraries.library_engine_model USING btree (modified_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS scheduled_job__job_template_modified_date_time_idx ON job_new.scheduled_job__job_template USING btree (modified_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS organization__engine_modified_date_time_idx ON job_new.organization__engine USING btree (modified_date_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS recording__source_modified_date_time_idx ON recording.recording__source USING btree (modified_date_time);
