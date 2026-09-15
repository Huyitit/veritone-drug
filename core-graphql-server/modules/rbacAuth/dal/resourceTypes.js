module.exports = function createModule() {
  const RESOURCE_TYPE_DB_MAP = {
    TDO: {
      conn: 'core',
      idField: 'recording_id',
      table: 'recording.recording',
      auth_group_role_resource_join_table: 'public.rbac_recording_role',
      resourceField: 'recording_id'
    },
    Folder: {
      conn: 'media_platform',
      idField: 'tree_folder_id',
      table: 'public.tree_folder',
      auth_group_role_resource_join_table: 'public.rbac_folder_role',
      resourceField: 'folder_id'
    }

    /* resource types to be implemented later:
        SDO: {},
        Source: {},
        User: {},
        Organization: {},
        Job: {},
        Engine: {},
        Build: {},
        Library: {},
        Dataset: {},
        Application: {},

        AuthorizationGroup: {
          conn: 'sso',
          idField: 'auth_group_id',
          table: 'public.rbac_auth_group'
        }
         */
  };

  return {
    RESOURCE_TYPE_DB_MAP
  };
};
