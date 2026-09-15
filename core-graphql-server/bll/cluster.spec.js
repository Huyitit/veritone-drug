const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

let dal;

describe('bll Cluster tests', function () {
  beforeAll(function () {
    dal = require('./cluster.js')(serviceContext);
    chaiExpect(dal).to.be.a('object');
    chaiExpect(typeof dal.updateOrganizationCluster).to.equal('function');
    chaiExpect(typeof dal.updateClusterPreferences).to.equal('function');
  });
  describe('#updateOrganizationCluster', function () {
    let context;

    beforeEach(function () {
      context = _.cloneDeep(mockUtil.makeContext());
    });

    it('should throw error - not allow', async function () {
      let res, err;
      const args = {
        input: { organizationId: 12345 }
      };

      _.set(context, '_authInfo.permissionMasks', null);

      try {
        res = await dal.updateOrganizationCluster(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Only superadmin user can update default Cluster for other organizations'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
      chaiExpect(res).to.undefined;
    });

    it('should update default cluster - legacy', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          clusterId: 'b869397d-c0c0-40cd-abbf-33d55d4286ce'
        }
      };

      // dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: args.input.clusterId }
      ]);
      // dal.cluster.setClusterByPreference
      serviceContext.dbConnections['core'].write._push([
        {
          preference_key: '7682',
          preference_type: 'organization',
          cluster_id: 'b869397d-c0c0-40cd-abbf-33d55d4286ce'
        }
      ]);

      try {
        res = await dal.updateOrganizationCluster(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.organizationId).to.equal('7682');
      chaiExpect(res.clusterId).to.equal(args.input.clusterId);
    });

    it.each`
      action
      ${'setDefault'}
      ${'removeDefault'}
      ${'setOverride'}
      ${'removeOverride'}
    `('action: $action cluster for org', async function (action) {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          clusterId: 'b869397d-c0c0-40cd-abbf-33d55d4286ce',
          action
        }
      };

      // dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: args.input.clusterId }
      ]);
      // dal.cluster.setClusterByPreference
      serviceContext.dbConnections['core'].write._push([
        {
          preference_key: '7682',
          preference_type: 'organization',
          cluster_id: 'b869397d-c0c0-40cd-abbf-33d55d4286ce'
        }
      ]);

      try {
        res = await dal.updateOrganizationCluster(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.organizationId).to.equal('7682');
      chaiExpect(res.clusterId).to.equal(args.input.clusterId);
    });
  });

  describe('#updateClusterPreferences', function () {
    let context = {};
    let ctxRegularUser = {};

    beforeEach(function () {
      serviceContext._clearAll();
      context = _.cloneDeep(mockUtil.makeContext());
      ctxRegularUser = _.cloneDeep(mockUtil.makeContext({ authType: 'user' }));
      ctxRegularUser._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
    });

    it('should throw error - clusterId is required', async function () {
      let res, err;
      const args = {};

      try {
        res = await dal.updateClusterPreferences(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('clusterId is required.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error if a regular user overrides default cluster for other organization', async function () {
      let res, err;
      const args = {
        input: {
          id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd',
          setAsDefaultForOrganization: 1
        }
      };

      try {
        res = await dal.updateClusterPreferences(ctxRegularUser, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Only superadmin user can update default Cluster for other organizations'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
      chaiExpect(res).to.be.undefined;
    });
    it('should override default cluster preference', async function () {
      let err;
      const args = {
        input: {
          id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd',
          setAsEnvironmentDefaultCluster: true
        }
      };

      // getCluster
      serviceContext.dbConnections['core'].read._push([
        { cluster_id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd' }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          chaiExpect(params[0]).to.equal('default');
          chaiExpect(params[1]).to.equal('default');
          return true;
        }
      );

      try {
        await dal.updateClusterPreferences(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
    });
    it('should set default cluster for business units', async function () {
      let err;
      const args = {
        input: {
          id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd',
          setAsDefaultForBUs: ['Media', 'Legal', 'Media']
        }
      };

      // getCluster
      serviceContext.dbConnections['core'].read._push([
        { cluster_id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { cluster_id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd' }
      ]);

      // setCluster
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          chaiExpect(params[0]).to.equal('Media');
          chaiExpect(params[1]).to.equal('business_unit');
          return true;
        }
      );
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          chaiExpect(params[0]).to.equal('Legal');
          chaiExpect(params[1]).to.equal('business_unit');
          return true;
        }
      );

      try {
        await dal.updateClusterPreferences(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
    });
    it('should set default cluster for other organization', async function () {
      let err;
      const args = {
        input: {
          id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd',
          organization: 1
        }
      };

      // getCluster
      serviceContext.dbConnections['core'].read._push([
        { cluster_id: 'cc5daf0d-7b64-4524-815e-2fcd852e92cd' }
      ]);
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          chaiExpect(params[0]).to.equal('1');
          chaiExpect(params[1]).to.equal('organization');
          return true;
        }
      );

      try {
        await dal.updateClusterPreferences(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
    });
  });
});
