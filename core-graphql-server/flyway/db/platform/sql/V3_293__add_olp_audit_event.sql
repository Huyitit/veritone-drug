UPDATE aiware.audit_config
SET baseline_events = ARRAY(
    SELECT DISTINCT unnest(
        baseline_events || ARRAY[
            'olp_enable',
            'olp_disable',
            'auth_group_create',
            'auth_group_update',
            'auth_group_delete',
            'auth_group_member_add',
            'auth_group_member_remove',
            'auth_permission_set_create',
            'auth_permission_set_update',
            'auth_permission_set_delete'
        ]
    )
)
WHERE EXISTS (
    SELECT 1 
    FROM information_schema.tables
    WHERE table_schema = 'aiware' AND table_name = 'audit_config'
);
