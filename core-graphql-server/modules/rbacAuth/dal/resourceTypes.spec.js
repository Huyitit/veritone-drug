const chaiExpect = require('chai').expect;

const createModule = require('./resourceTypes.js');

describe('rbacAuth/dal/resourceTypes.js', function () {
  let map;

  beforeEach(function () {
    map = createModule().RESOURCE_TYPE_DB_MAP;
  });

  it('exposes RESOURCE_TYPE_DB_MAP with the documented resource types', function () {
    chaiExpect(map).to.be.an('object');
    chaiExpect(Object.keys(map)).to.include.members(['TDO', 'Folder']);
  });

  it('maps the TDO resource type to its recording DB binding', function () {
    chaiExpect(map.TDO).to.deep.equal({
      conn: 'core',
      idField: 'recording_id',
      table: 'recording.recording',
      auth_group_role_resource_join_table: 'public.rbac_recording_role',
      resourceField: 'recording_id'
    });
  });

  it('maps the Folder resource type to its tree_folder DB binding', function () {
    chaiExpect(map.Folder).to.deep.equal({
      conn: 'media_platform',
      idField: 'tree_folder_id',
      table: 'public.tree_folder',
      auth_group_role_resource_join_table: 'public.rbac_folder_role',
      resourceField: 'folder_id'
    });
  });

  it('binds each resource type to a distinct RBAC join table (no shared-grant leakage)', function () {
    const joins = Object.values(map).map(
      (t) => t.auth_group_role_resource_join_table
    );
    chaiExpect(new Set(joins).size).to.equal(joins.length);
  });
});
