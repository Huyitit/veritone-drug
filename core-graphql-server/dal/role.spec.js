const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const SUPER_ADMIN_ROLE_ID = '3459c3de-493f-443a-8ad0-ddb9f3f6c76d';

const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);
const errors = require('../error')(serviceContext.config);

serviceContext.config.flyway = {
  rootOrgId: 1
};
serviceContext.config.system.rootOrg.roleIds = [SUPER_ADMIN_ROLE_ID];

let dal;

beforeAll(() => {
  dal = require('./role.js')(serviceContext);
});

describe('role.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // validate basic structure
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(5);
    });
  });

  describe('#getPermissionsForRole', function () {
    it('should get permission for role', async function () {
      let res, err;
      const roleId = 'roleId';
      const options = { offset: 0, limit: 30 };

      try {
        res = await dal.getPermissionsForRole(roleId, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(0);
    });
  });

  describe('#getPermissions', function () {
    it('should get permission, with filter array name and id', async function () {
      let res, err;
      const options = {
        offset: 0,
        limit: 30,
        name: ['name1', 'name2'],
        id: ['id1', 'id2']
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            permission_id: 'id1',
            permission_name: 'name1',
            permission_description: 'desc1',
            total: 100
          },
          {
            permission_id: 'id2',
            permission_name: 'name2',
            permission_description: 'desc2',
            total: 100
          }
        ],
        false
      );

      try {
        res = await dal.getPermissions(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal('id1');
      chaiExpect(res.records[1].id).to.equal('id2');
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.limit).to.equal(30);
    });

    it('should get permission, with filter string name and id', async function () {
      let res, err;
      const options = {
        name: 'name1,name2',
        id: 'id1,id2'
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            permission_id: 'id1',
            permission_name: 'name1',
            permission_description: 'desc1',
            total: 100
          },
          {
            permission_id: 'id2',
            permission_name: 'name2',
            permission_description: 'desc2',
            total: 100
          }
        ],
        false
      );

      try {
        res = await dal.getPermissions(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal('id1');
      chaiExpect(res.records[1].id).to.equal('id2');
    });

    it('should get all permissions, not filter anything', async function () {
      let res, err;
      const options = {};

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            permission_id: 'id1',
            permission_name: 'name1',
            permission_description: 'desc1',
            total: 100
          },
          {
            permission_id: 'id2',
            permission_name: 'name2',
            permission_description: 'desc2',
            total: 100
          }
        ],
        false
      );

      try {
        res = await dal.getPermissions(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal('id1');
      chaiExpect(res.records[1].id).to.equal('id2');
    });
  });

  describe('#getRoles', function () {
    it('should get role - success', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const options = {
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            role_id: 'id1',
            role_name: 'name1'
          },
          {
            role_id: 'id2',
            role_name: 'name2'
          },
          {
            role_id: SUPER_ADMIN_ROLE_ID,
            role_name: 'Customer Service'
          }
        ],
        false
      );

      try {
        res = await dal.getRoles(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].roleId).to.equal('id1');
      chaiExpect(res.records[1].roleId).to.equal('id2');
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.limit).to.equal(30);
    });

    it('should not include organization_id condition if filter by roleId', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const options = {
        offset: 0,
        limit: 30,
        id: 'id1'
      };

      try {
        res = await dal._getRolesQuery(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.sql).to.not.empty;
      chaiExpect(res.sql).to.not.contain('organization_id IS NULL');
    });

    it('should not include organization_id condition if filter by roleIds', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const options = {
        offset: 0,
        limit: 30,
        ids: ['id1', 'id2']
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            role_id: 'id1',
            role_name: 'name1'
          },
          {
            role_id: 'id2',
            role_name: 'name2'
          }
        ],
        false
      );

      try {
        res = await dal._getRolesQuery(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.sql).to.not.empty;
      chaiExpect(res.sql).to.not.contain('organization_id IS NULL');
    });

    it('should include application_id condition if filter by application_id', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const options = {
        offset: 0,
        limit: 30,
        ids: ['id1', 'id2'],
        applicationId: 'b0178224-c104-487d-a3b9-31277ba0e22a'
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            role_id: 'id1',
            role_name: 'name1'
          },
          {
            role_id: 'id2',
            role_name: 'name2'
          }
        ],
        false
      );

      try {
        res = await dal._getRolesQuery(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.sql).to.not.empty;
      chaiExpect(res.sql).to.contain('application_id =');
    });

    it('should get role without validateRole', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const options = {
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            role_id: 'id1',
            role_name: 'name1'
          },
          {
            role_id: 'id2',
            role_name: 'name2'
          },
          {
            role_id: SUPER_ADMIN_ROLE_ID,
            role_name: 'Customer Service'
          }
        ],
        false
      );

      try {
        res = await dal.getRoles(context, options, true);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(3);
      chaiExpect(res.records[0].roleId).to.equal('id1');
      chaiExpect(res.records[1].roleId).to.equal('id2');
      chaiExpect(res.records[2].roleId).to.equal(SUPER_ADMIN_ROLE_ID);
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.limit).to.equal(30);
    });
  });

  describe('#createRoles', function () {
    it('should throw an error if the input is invalid', async function () {
      const context = mockUtil.makeContext();
      let res, err;

      try {
        res = await dal.createRoles(context, null);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('no app role is added', async function () {
      const context = mockUtil.makeContext();
      let res, err;

      serviceContext.dbConnections['sso'].write._push([], false);
      const role = {
        id: 'id',
        name: 'name'
      };

      try {
        res = await dal.createRoles(context, role);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.empty;
    });

    it('app role is added successfully', async function () {
      const context = mockUtil.makeContext();
      let res, err;

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'id1',
            name: 'name1',
            description: 'description1',
            application_id: 'application_id1'
          }
        ],
        false
      );
      const role = {
        id: 'id',
        name: 'name'
      };

      try {
        res = await dal.createRoles(context, role);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].id).to.equal('id1');
      chaiExpect(res[0].name).to.equal('name1');
      chaiExpect(res[0].description).to.equal('description1');
      chaiExpect(res[0].applicationId).to.equal('application_id1');
    });

    it('should throw an error if the input is invalid', async function () {
      const context = mockUtil.makeContext();
      let res, err;

      try {
        res = await dal.createRoles(context, null);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('no app role is added', async function () {
      const context = mockUtil.makeContext();
      let res, err;

      serviceContext.dbConnections['sso'].write._push([], false);
      const role = {
        id: 'id',
        name: 'name'
      };

      try {
        res = await dal.createRoles(context, role);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res.length).to.equal(0);
    });

    it('should be fine if the input is not an array', async function () {
      const context = mockUtil.makeContext();
      let res, err;

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'id1',
            name: 'name1',
            description: 'description1',
            application_id: 'application_id1'
          }
        ],
        false
      );
      const role = {
        id: 'id1',
        name: 'name1'
      };

      try {
        res = await dal.createRoles(context, role);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(res[0].id).to.equal('id1');
      chaiExpect(res[0].name).to.equal('name1');
      chaiExpect(res[0].description).to.equal('description1');
      chaiExpect(res[0].applicationId).to.equal('application_id1');
    });

    it('app roles are added successfully', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const permissions = [
        'AIWARE_FOLDER_READ',
        'AIWARE_TDO_UPDATE',
        'ADMIN_ORG_READ',
        'RECORDING_DELETE'
      ];
      const permissionsMark = [65544, 32, 4194304];
      // mock DB
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: 'id1',
            name: 'name1',
            description: 'description1',
            application_id: 'application_id1',
            permissions: permissionsMark
          },
          {
            id: 'id2',
            name: 'name2',
            description: 'description2',
            application_id: 'application_id2',
            permissions: permissionsMark
          }
        ],
        false
      );
      const role = [
        {
          id: 'id1',
          name: 'name1',
          permissions
        },
        {
          id: 'id2',
          name: 'name2',
          permissions
        }
      ];

      try {
        res = await dal.createRoles(context, role);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
      chaiExpect(res[0].id).to.equal('id1');
      chaiExpect(res[0].name).to.equal('name1');
      chaiExpect(res[0].description).to.equal('description1');
      chaiExpect(res[0].applicationId).to.equal('application_id1');
      chaiExpect(res[0].permissions).to.equal(permissionsMark);

      chaiExpect(res[1].id).to.equal('id2');
      chaiExpect(res[1].name).to.equal('name2');
      chaiExpect(res[1].description).to.equal('description2');
      chaiExpect(res[1].applicationId).to.equal('application_id2');
      chaiExpect(res[1].permissions).to.equal(permissionsMark);
    });
  });
});
