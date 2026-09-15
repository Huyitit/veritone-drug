
CREATE INDEX CONCURRENTLY if not exists idx_tree_object_oid ON tree_object (object_id, tree_object_status);

drop index concurrently if exists "_ix_arbitron_program_summary_dma@program_id"; -- for table arbitron_program_summary_dma
drop index concurrently if exists idx_arbitron_program_summary_dma_pid_m; -- for table arbitron_program_summary_dma
drop index concurrently if exists audience_media_source_id_index; -- for table audience
drop index concurrently if exists idx_audience_char_gender; -- for table audience_characteristic
drop index concurrently if exists brand_advertiser_id_index; -- for table brand
drop index concurrently if exists brand_organization_id_index; -- for table brand
drop index concurrently if exists buy_organization_id_index; -- for table buy
drop index concurrently if exists buy_advertiser_id_index; -- for table buy
drop index concurrently if exists buy_brand_id_index; -- for table buy
drop index concurrently if exists buy_campaign_id_index; -- for table buy
drop index concurrently if exists campaign_advertiser_id_index; -- for table campaign
drop index concurrently if exists campaign_brand_id_index; -- for table campaign
drop index concurrently if exists campaign_organization_id_index; -- for table campaign
drop index concurrently if exists "_ix_collection@created_by_user_id"; -- for table collection
drop index concurrently if exists "_ix_collection__share@share_source_id"; -- for table collection__share
drop index concurrently if exists "_ix_collection_tag@collection_id"; -- for table collection_tag
drop index concurrently if exists "_ix_collection_tag@favorite_id"; -- for table collection_tag
drop index concurrently if exists idx_folder_shared_slug; -- for table folder_shared
drop index concurrently if exists idx_folder_shared_folder_id; -- for table folder_shared
drop index concurrently if exists folder_station_station_id_index; -- for table folder_station
drop index concurrently if exists "_ix_invitation@sender_id"; -- for table invitation
drop index concurrently if exists idx_media_source_media_source_name_lower; -- for table media_source
drop index concurrently if exists "_ix_mp_user_organization@organization_id"; -- for table mp_user_organization
drop index concurrently if exists "_ix_mp_user_organization@mp_user_id"; -- for table mp_user_organization
drop index concurrently if exists organization_network_organization_id_index; -- for table organization_network
drop index concurrently if exists organization_network_network_id_index; -- for table organization_network
drop index concurrently if exists organization_station_station_id_index; -- for table organization_station
drop index concurrently if exists idx_program_task_data_num_task_templates; -- for table program
drop index concurrently if exists idx_program_task_data_engine_type_name; -- for table program
drop index concurrently if exists idx_program_task_data_category_engine_id; -- for table program
drop index concurrently if exists idx_program_task_data_num_job_templates; -- for table program
drop index concurrently if exists idx_program__acl_acl; -- for table program__acl
drop index concurrently if exists program_schedule_date_end; -- for table program_schedule
drop index concurrently if exists program_schedule_date_start; -- for table program_schedule
drop index concurrently if exists "_ix_resource_invite@sender_id"; -- for table resource_invite
drop index concurrently if exists "_ix_resource_invite_object@resource_invite_id"; -- for table resource_invite_object
drop index concurrently if exists idx_root_folder_id; -- for table root_folder
drop index concurrently if exists xprogramk; -- for table sf_program
drop index concurrently if exists xprograma; -- for table sf_program
drop index concurrently if exists xprogramq; -- for table sf_program
drop index concurrently if exists xprogramn; -- for table sf_program
drop index concurrently if exists xprogramd; -- for table sf_program
drop index concurrently if exists xprogramv; -- for table sf_program
drop index concurrently if exists xtalent4; -- for table sf_talent
drop index concurrently if exists xtalenty; -- for table sf_talent
drop index concurrently if exists xtalent2; -- for table sf_talent
drop index concurrently if exists "_ix_tracking_unit@campaign_id"; -- for table tracking_unit
drop index concurrently if exists "_ix_tracking_unit@organization_id,application_id"; -- for table tracking_unit
drop index concurrently if exists tracking_unit_network_network_id_index; -- for table tracking_unit_network
drop index concurrently if exists tree_object_expr_idx; -- for table tree_object
drop index concurrently if exists tree_object_expr_idx1; -- for table tree_object
drop index concurrently if exists idx_tree_object_status_status; -- for table tree_object_status
drop index concurrently if exists idx_tree_object_type_type; -- for table tree_object_type

-- rarely used indices
drop index concurrently if exists "_ix_media@owner_application_id";
drop index concurrently if exists "_ix_media@status,media_start_time";
drop index concurrently if exists idx_mention_created_at;

drop index concurrently if exists "ix_media@date_modified";
drop index concurrently if exists "ix_media@media_start_time,media_stop_time";
drop index concurrently if exists "idx_media_status_prtial";

drop index concurrently if exists "_ix_mention@mention_state_lookup_id";
drop index concurrently if exists "_ix_mention@advertiser_id";
drop index concurrently if exists "_ix_mention@organization_id";
drop index concurrently if exists "_ix_mention@tracking_unit_mention_hash";
drop index concurrently if exists "idx_mention_updated_at";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "_ix_market__media_source@media_source_id" ON market__media_source(media_source_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_root_folder_orgid
    ON root_folder (root_folder_type_id, organization_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_root_folder_userid
    ON root_folder (root_folder_type_id, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tree_objects_shared
    ON tree_object USING gin (shared_with);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_program_task_data_engine_id ON program USING gin ((task_data -> 'engineIds'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_program_task_data_category_engine_id ON program USING gin ((task_data -> 'engineCategoryIds'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_program_task_data_engine_type_id ON program USING gin ((task_data -> 'engineTypeIds'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_program_task_data_engine_type_name ON program USING gin ((task_data -> 'engineTypeNames'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_program_task_data_num_task_templates ON program USING gin ((task_data -> 'numTaskTemplates'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_program_task_data_num_job_templates ON program USING gin ((task_data -> 'numJobTemplates'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_program_organization_id_and_created_by ON program using btree(program_id, created_by) where created_by IS NOT NULL;
