const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const dal = require('./openidConnect')(serviceContext);

describe('openIdConnect', () => {
  let contextSuperAdmin, contextOrgAdmin;
  beforeEach(() => {
    serviceContext._clearAll();
    contextOrgAdmin = _.cloneDeep(mockUtil.makeContext());
    _.set(contextOrgAdmin, 'userInfo.permissionMasks', []);
    _.set(contextOrgAdmin, '_authInfo.permissionMasks', []);
    contextSuperAdmin = _.cloneDeep(mockUtil.makeContext());
  });

  describe('#require', function () {
    it('should load module', async function () {
      chaiExpect(typeof dal).to.equal('object');
      chaiExpect(Object.keys(dal).length).to.equal(5);
    });
  });

  describe('#getOpenIdConnect', function () {
    it('should throw error - connectId is required.', async function () {
      let err, res;

      // mock value
      const context = mockUtil.makeContext();

      try {
        res = await dal.getOpenIdConnect(context, {});
      } catch (error) {
        chaiExpect(error.message).to.equal('connectId is required.');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
    });

    it('should get openid connect', async function () {
      let err, res;

      // mock value
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['sso'].read._push(
        [{ id: 'connectId' }],
        false
      );

      try {
        res = await dal.getOpenIdConnect(context, {
          id: 'connectId',
          organizationId: 7682
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('connectId');
    });
  });

  describe('#getOpenIdConnects', function () {
    it('should throw error - Cannot determine organizationId for current user', async function () {
      let res, err;

      // remove auth organizationId in context
      _.set(contextOrgAdmin, '_authInfo.organization.organizationId', null);

      try {
        res = await dal.getOpenIdConnects(contextOrgAdmin, {});
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Cannot determine organizationId for current user'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('internal_error');
    });

    it('should get openid connects by org admin', async function () {
      const args = { organizationId: 7682 };

      // mock serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '2b26b175-2a20-49de-9c74-fd498e22e15e' }
      ]);
      // mock getOpenIdConnects
      serviceContext.dbConnections['sso'].read._push([{}], true, [
        `(soc.owner_organization_guid = '2b26b175-2a20-49de-9c74-fd498e22e15e' OR soco.organization_guid = '2b26b175-2a20-49de-9c74-fd498e22e15e')`,
        'LEFT JOIN sso_openid_connect__organization soco ON soco.connect_id = soc.connect_id AND enabled = true'
      ]);

      const res = await dal.getOpenIdConnects(contextOrgAdmin, args);

      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records.length).to.equal(1);
    });

    it('should get openid connects by superadmin with org filter', async function () {
      const args = { organizationId: 7682, orgId: 1234 };

      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '7343cbaf-fefa-4dcc-83fe-550d338ba22c' }
      ]);
      // mock getOpenIdConnects
      serviceContext.dbConnections['sso'].read._push([{}], true, [
        `(soc.owner_organization_guid = '7343cbaf-fefa-4dcc-83fe-550d338ba22c' OR soco.organization_guid = '7343cbaf-fefa-4dcc-83fe-550d338ba22c')`,
        'LEFT JOIN sso_openid_connect__organization soco ON soco.connect_id = soc.connect_id AND enabled = true'
      ]);

      const res = await dal.getOpenIdConnects(contextSuperAdmin, args);

      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records.length).to.equal(1);
    });

    it('should get openid connects by superadmin without org filter', async function () {
      const args = { organizationId: 7682 };

      // mock serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '2b26b175-2a20-49de-9c74-fd498e22e15e' }
      ]);
      // mock getOpenIdConnects
      serviceContext.dbConnections['sso'].read._push([{}]);

      const res = await dal.getOpenIdConnects(contextSuperAdmin, args);

      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records.length).to.equal(1);
    });
  });
});
