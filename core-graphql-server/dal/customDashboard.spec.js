const chaiExpect = require('chai').expect;
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const dal = require('./customDashboard.js')(serviceContext);

describe('customDashboard.js', function () {
  const dashboardId = '1e290c18-c04a-4699-b775-0b528cc68e70';
  const userId = '513e96ec-2bea-49a5-9d98-dc74ac19b396';
  const mockDashboard = {
    id: dashboardId,
    user_id: userId,
    owner_organization_id: 7682,
    owner_application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb',
    host_app_id: '32babe30-fb42-11e4-89bc-27b69865858a',
    name: 'Mentions Dashboard',
    description: 'This dashboard contains mentions related analytics data.',
    data: {
      chart: [{ h: 4, id: '8', w: 6, x: 0, y: 0, minH: 4, minW: 6 }],
      header: [{ id: '5' }]
    }
  };
  const commonArgs = {
    organizationId: 7682,
    applicationId: mockDashboard.owner_application_id
  };

  describe('require', function () {
    it('should load module', function () {
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(5);
      chaiExpect(typeof dal.createCustomDashboard).to.equal('function');
      chaiExpect(typeof dal.deleteCustomDashboard).to.equal('function');
      chaiExpect(typeof dal.getCustomDashboard).to.equal('function');
      chaiExpect(typeof dal.getCustomDashboards).to.equal('function');
      chaiExpect(typeof dal.updateCustomDashboard).to.equal('function');
    });
  });

  describe('getCustomDashboard', function () {
    it('should throw NotFound error', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([], false);
      let res, err;

      try {
        res = await dal.getCustomDashboard(context, {
          id: dashboardId,
          ...commonArgs
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
    });

    it('should get customDashboard', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push(
        [{ ...mockDashboard }],
        false
      );

      const res = await dal.getCustomDashboard(context, {
        id: dashboardId,
        ...commonArgs
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(mockDashboard.id);
      chaiExpect(res.userId).to.equal(mockDashboard.user_id);
      chaiExpect(res.name).to.equal(mockDashboard.name);
      chaiExpect(res.description).to.equal(mockDashboard.description);
      chaiExpect(res.data).to.be.an('object');
      chaiExpect(res.data).to.eql(mockDashboard.data);
    });
  });

  describe('getCustomDashboard with engineJWT', function () {
    it('should get customDashboard with engineJWT that is scoped to org', async function () {
      const context = mockUtil.makeContext({
        authType: 'engineJWT'
      });
      serviceContext.dbConnections['media_platform'].read._push(
        [{ ...mockDashboard }],
        false
      );

      const res = await dal.getCustomDashboard(context, {
        id: dashboardId,
        ...commonArgs
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(mockDashboard.id);
      chaiExpect(res.userId).to.equal(mockDashboard.user_id);
      chaiExpect(res.name).to.equal(mockDashboard.name);
      chaiExpect(res.description).to.equal(mockDashboard.description);
      chaiExpect(res.data).to.be.an('object');
      chaiExpect(res.data).to.eql(mockDashboard.data);
    });

    it('should throw NotAllowed error if engineJWT is not scoped to any org', async function () {
      const context = mockUtil.makeContext({
        authType: 'engineJWT'
      });
      serviceContext.dbConnections['media_platform'].read._push([], false);
      let res, err;

      try {
        res = await dal.getCustomDashboard(context, {
          id: dashboardId
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
    });

    it('should throw InvalidInput error if no id is passed in', async function () {
      const context = mockUtil.makeContext({
        authType: 'engineJWT'
      });
      serviceContext.dbConnections['media_platform'].read._push([], false);
      let res, err;

      try {
        res = await dal.getCustomDashboard(context, {
          ...commonArgs
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });
  });

  describe('getCustomDashboards', function () {
    it('should return an empty result set', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([], false);

      const dashboards = await dal.getCustomDashboards(context, {
        ...commonArgs
      });

      chaiExpect(dashboards).to.exist;
      chaiExpect(dashboards.records).to.exist;
      chaiExpect(dashboards.records.length).to.equal(0);
    });

    it('should get custom dashboards', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push(
        [{ ...mockDashboard }],
        false
      );

      const dashboards = await dal.getCustomDashboards(context, {
        ...commonArgs
      });

      chaiExpect(dashboards).to.exist;
      chaiExpect(dashboards.records).to.exist;
      chaiExpect(dashboards.records.length).to.equal(1);
      chaiExpect(dashboards.records[0].id).to.equal(dashboardId);
    });

    it('should throw InvalidInput error if no id is passed in when using an engineJWT', async function () {
      const context = mockUtil.makeContext({
        authType: 'engineJWT'
      });
      serviceContext.dbConnections['media_platform'].read._push([], false);
      let res, err;

      try {
        res = await dal.getCustomDashboard(context, {
          ...commonArgs
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(res).to.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
    });
  });

  describe('createCustomDashboard', function () {
    it('should create a custom dashboard', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push(
        [{ ...mockDashboard }],
        false
      );
      const res = await dal.createCustomDashboard(context, {
        input: {
          hostAppId: mockDashboard.host_app_id,
          name: mockDashboard.name,
          description: mockDashboard.description,
          data: {
            ...mockDashboard.data
          }
        },
        ...commonArgs
      });

      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(mockDashboard.id);
      chaiExpect(res.userId).to.equal(mockDashboard.user_id);
      chaiExpect(res.hostAppId).to.equal(mockDashboard.host_app_id);
      chaiExpect(res.name).to.equal(mockDashboard.name);
      chaiExpect(res.description).to.equal(mockDashboard.description);
      chaiExpect(res.data).to.be.an('object');
      chaiExpect(res.data).to.eql(mockDashboard.data);
    });
  });

  describe('updateCustomDashboard', function () {
    it('should throw NotFound error if user does not have access to dashboard', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const newDashboardName = 'Mentions Dashboard v2';
      const args = {
        input: {
          id: dashboardId,
          name: newDashboardName
        },
        ...commonArgs
      };
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].write._push(
        [{ ...mockDashboard, name: newDashboardName }],
        false
      );

      try {
        res = await dal.updateCustomDashboard(context, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
    });

    it('should return updated custom dashboard', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const newDashboardName = 'Mentions Dashboard v2';
      const args = {
        input: {
          id: dashboardId,
          name: newDashboardName
        },
        ...commonArgs
      };
      serviceContext.dbConnections['media_platform'].read._push(
        [{ ...mockDashboard }],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{ ...mockDashboard, name: newDashboardName }],
        false
      );

      try {
        res = await dal.updateCustomDashboard(context, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(dashboardId);
      chaiExpect(res.name).to.equal(newDashboardName);
    });
  });

  describe('deleteCustomDashboard', function () {
    it('should throw NotFound error if custom dashboard does not exist', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push([], false);

      try {
        res = await dal.deleteCustomDashboard(context, {
          id: dashboardId
        });
      } catch (error) {
        err = error;
      }

      chaiExpect(res).to.be.undefined;
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
    });

    it('should delete a custom dashboard', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: dashboardId }],
        false
      );

      try {
        res = await dal.deleteCustomDashboard(context, {
          id: dashboardId
        });
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(dashboardId);
    });
  });
});
