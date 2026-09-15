UPDATE aiware.audit_config
SET baseline_events = ARRAY(
    SELECT unnest(baseline_events)
    EXCEPT
    SELECT 'audit_impersonate'
)
-- Remove impersonate from baseline_events
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1
AND 'audit_impersonate' = ANY (baseline_events);

-- Add the specified string values to baseline_events, deduplicating any existing values
UPDATE aiware.audit_config
SET baseline_events = ARRAY(
    SELECT DISTINCT unnest(baseline_events || ARRAY[
        'access_media',
        'audit_forbidden_action_token',
        'audit_forbidden_action_user',
        'application_create',
        'application_update',
        'application_delete',
        'cluster_delete',
        'cluster_update',
        'engine_build_pause',
        'engine_build_unpause',
        'engine_build_submit',
        'audit_login_attempts_exceeded',
        'new_version_installed',
        'organization_create',
        'organization_update',
        'organization_delete',
        'organization_invitation_accepted',
        'organization_invitation_rejected',
        'organization_request',
        'organization_request_rejected',
        'organization_request_approved',
        'package_created',
        'package_deleted',
        'package_approved',
        'package_grant_set',
        'package_grant_removed',
        'package_installed',
        'package_rejected',
        'user_create',
        'user_created',
        'user_update',
        'user_delete',
        'user_deleted'
    ])
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;

-- Step 3: Add the specified string values to configured_events, deduplicating any existing values
UPDATE aiware.audit_config
SET configured_events = ARRAY(
    SELECT DISTINCT unnest(configured_events || ARRAY[
        'asset_upload',
        'cluster_create',
        'engine_build_disapprove',
        'engine_build_invalidate',
        'engine_build_manifest_processed',
        'engine_build_manifest_submitted',
        'engine_create',
        'engine_update',
        'engine_disable',
        'engine_enable',
        'folder_create',
        'folder_update',
        'folder_delete',
        'job_created',
        'job_completed',
        'job_failed',
        'library_training_complete',
        'media_source_create',
        'media_source_update',
        'media_source_delete',
        'new_version_available',
        'recording_created',
        'recording_deleted',
        'structured_data_create',
        'structured_data_update',
        'structured_data_delete',
        'structured_data_registry_create',
        'structured_data_registry_update',
        'task_queued',
        'task_completed',
        'task_updated',
        'audit_impersonate'
    ])
)
WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'aiware' AND table_name = 'audit_config') = 1;