create index concurrently if not exists "_ix_job_new.job@job_pipeline_id" on job_new.job(job_pipeline_id);
create index concurrently if not exists "_ix_job_new.job@scheduled_job_id" on job_new.job(scheduled_job_id);

drop index concurrently if exists job."_ix_job.job@application_id"; -- for table job.job
drop index concurrently if exists job."_ix_job.job@application_id,json->createdDateTime"; -- for table job.job
drop index concurrently if exists job."_ix_job.job@recording_id"; -- for table job.job
drop index concurrently if exists job."_ix_job.job@json->createdDateTime"; -- for table job.job
drop index concurrently if exists job."_ix_job.job@json->tasks"; -- for table job.job
drop index concurrently if exists job.idx_job_status_history_application_id; -- for table job.job_status_history
drop index concurrently if exists job.idx_job_status_history_job_id; -- for table job.job_status_history
drop index concurrently if exists job."_ix_job_status_history@modified_date__application_id"; -- for table job.job_status_history
drop index concurrently if exists job."_ix_organization__task_type@task_type_id"; -- for table job.organization__task_type
drop index concurrently if exists job."_ix_organization__task_type_blacklist@task_type_id"; -- for table job.organization__task_type_blacklist
drop index concurrently if exists job."_ix_organization__task_type_category_blacklist@task_type_catego"; -- for table job.organization__task_type_category_blacklist
drop index concurrently if exists job."_ix_recording.recording@application_id"; -- for table job.recording
drop index concurrently if exists job."_ix_recording.recording@json->veritone-permissions->acls"; -- for table job.recording
drop index concurrently if exists job."_ix_task_type@task_type_category_id"; -- for table job.task_type
drop index concurrently if exists job_new."_ix_job_new.build@manifest"; -- for table job_new.build
drop index concurrently if exists job_new."_ix_organization__engine_category_blacklist@engine_category_id"; -- for table job_new.organization__engine_category_blacklist
drop index concurrently if exists recording."_ix_recording.recording@json->>'createdDateTime'"; -- for table recording.recording
drop index concurrently if exists libraries."_ix_libraries.library@name"; -- for table libraries.library
drop index concurrently if exists libraries."_ix_libraries.library@deleted_date_time,owner_org_id"; -- for table libraries.library
drop index concurrently if exists libraries."_ix_libraries.library_collaborator@permissions"; -- for table libraries.library_collaborator
drop index concurrently if exists aiware."_ix_aiware.node@updated_date"; -- for table aiware.node
drop index concurrently if exists aiware."_ix_aiware.node@last_ping"; -- for table aiware.node
drop index concurrently if exists aiware."_ix_aiware.node@created_date"; -- for table aiware.node
drop index concurrently if exists job_new."_ix_build_capability@build_capability_value"; -- for table job_new.build_capability

CREATE INDEX CONCURRENTLY IF NOT EXISTS recording_source_id_idx ON recording.recording (source_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS recording_scheduled_job_id_idx ON recording.recording (scheduled_job_id);


create index concurrently if not exists "ix_cluster@status" on aiware.cluster(status);
create index concurrently if not exists "ix_cluster@target_status" on aiware.cluster(target_status);
create index concurrently if not exists "ix_cluster@state_last_updated_date_time" on aiware.cluster(state_last_updated_date_time);
-- use gin operator to query:
--    select * from cluster where 'tags' @> ARRAY['myTag']
create index concurrently if not exists "ix_cluster@tags" on aiware.cluster using gin ("tags");
