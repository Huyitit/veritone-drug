const chaiExpect = require('chai').expect;
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
jest.mock('request-promise');
const dal = require('./exportRequest.js')(serviceContext);

describe('#exportRequest', function () {
  const exportRequestId = 'acfbff25-8481-4aed-a43b-b3644b0b2700';

  afterAll(() => {
    jest.resetModules();
  });

  describe('#require', function () {
    it('should load module', function () {
      // validate basic structure
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(7);
      chaiExpect(typeof dal.getExportRequests).to.equal('function');
      chaiExpect(typeof dal.getExportRequest).to.equal('function');
      chaiExpect(typeof dal.createExportRequest).to.equal('function');
      chaiExpect(typeof dal.updateExportRequest).to.equal('function');
      chaiExpect(typeof dal.validateTDOData).to.equal('function');
      chaiExpect(typeof dal.validateOuputConfiguration).to.equal('function');
    });
  });

  describe('#getExportRequest', function () {
    it('should throw NotFound getExportRequest', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      serviceContext.dbConnections['core'].read._push([], false);
      try {
        res = await dal.getExportRequest(context, {
          organizationId: '7682',
          id: exportRequestId
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
      chaiExpect(res).to.undefined;
    });

    it('should get exportRequest', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33'
          }
        ],
        false
      );
      const er = await dal.getExportRequest(context, {
        organizationId: '7682',
        id: exportRequestId
      });

      chaiExpect(er).to.exist;
      chaiExpect(er.id).to.equal(exportRequestId);
      chaiExpect(er.status).to.equal('complete');
      chaiExpect(er.organizationId).to.equal('17560');
      chaiExpect(er.requestorId).to.equal(
        '73d50266-48f3-4991-93f3-26a1948fdb33'
      );
    });
  });

  describe('#getExportRequests', function () {
    it('should get exportRequests empty result', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([], false);
      const exportRequests = await dal.getExportRequests(context, {
        organizationId: '7682',
        id: '17560'
      });

      chaiExpect(exportRequests).to.exist;
      chaiExpect(exportRequests.records).to.exist;
      chaiExpect(exportRequests.records.length).to.equal(0);
    });

    it('should get exportRequests', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123',
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33'
          }
        ],
        false
      );
      const exportRequests = await dal.getExportRequests(context, {
        organizationId: '7682',
        id: '17560'
      });

      chaiExpect(exportRequests).to.exist;
      chaiExpect(exportRequests.records).to.exist;
      chaiExpect(exportRequests.records.length).to.equal(1);
      chaiExpect(exportRequests.records[0].status).to.equal('complete');
      chaiExpect(exportRequests.records[0].organizationId).to.equal('17560');
      chaiExpect(exportRequests.records[0].requestorId).to.equal(
        '73d50266-48f3-4991-93f3-26a1948fdb33'
      );
    });
    it('should get exportRequests failed', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123',
            status: 'failed',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33'
          }
        ],
        false
      );
      const exportRequests = await dal.getExportRequests(context, {
        organizationId: '7682',
        id: '17560'
      });

      chaiExpect(exportRequests).to.exist;
      chaiExpect(exportRequests.records).to.exist;
      chaiExpect(exportRequests.records.length).to.equal(1);
      chaiExpect(exportRequests.records[0].status).to.equal('failed');
    });
  });

  describe('#createExportRequest', function () {
    it('should throw InvalidInput error when tdoId or mentionId in tdoData object', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const args = {
        input: {
          includeMedia: false,
          tdoData: [{}]
        }
      };
      try {
        res = await dal.createExportRequest(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw InvalidInput error when not provide a tdoId if includeMedia is set to true', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const args = {
        input: {
          includeMedia: true,
          tdoData: [{ mentionId: '17560' }]
        }
      };

      try {
        res = await dal.createExportRequest(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should create exportRequest with user token', async function () {
      const context = mockUtil.makeContext();
      let res, err;
      const args = {
        input: {
          includeMedia: false,
          tdoData: [{ tdoId: 1 }]
        }
      };
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33'
          }
        ],
        false
      );

      try {
        res = await dal.createExportRequest(context, args);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('complete');
      chaiExpect(res.organizationId).to.equal('17560');
      chaiExpect(res.requestorId).to.equal(
        '73d50266-48f3-4991-93f3-26a1948fdb33'
      );
    });
    it('should create exportRequest with tokenId', async function () {
      let res, err;
      const args = {
        input: {
          includeMedia: false,
          tdoData: [{ tdoId: 1 }]
        }
      };
      const context = mockUtil.makeContext();
      context._authInfo.token = null;
      context._authInfo.tokenId = 'tokenId';
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33'
          }
        ],
        false
      );

      try {
        res = await dal.createExportRequest(context, args);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('complete');
      chaiExpect(res.organizationId).to.equal('17560');
      chaiExpect(res.requestorId).to.equal(
        '73d50266-48f3-4991-93f3-26a1948fdb33'
      );
    });
  });

  describe('#updateExportRequest', function () {
    it('should return getExportRequest when input empty status', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: exportRequestId,
          organizationId: '17560'
        }
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33'
          }
        ],
        false
      );
      try {
        res = await dal.updateExportRequest(context, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('complete');
      chaiExpect(res.organizationId).to.equal('17560');
      chaiExpect(res.requestorId).to.equal(
        '73d50266-48f3-4991-93f3-26a1948fdb33'
      );
    });

    it('should return update ExportRequest when status', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: exportRequestId,
          organizationId: '17560',
          status: 'complete'
        }
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33',
            asset_uri: 'test_asset_uri'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33',
            asset_uri: 'test_asset_uri'
          }
        ],
        false
      );
      try {
        res = await dal.updateExportRequest(context, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('complete');
    });

    it('should update and return sqlQueries if input contains sqlQueries', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: exportRequestId,
          organizationId: '17560',
          status: 'incomplete',
          sqlQueries: '{"statement":"select * from xyz;"}'
        }
      };
      // get exportRequest
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'incomplete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33',
            asset_uri: 'in-progress',
            event_payload:
              '{"type": "export", "event": "mention_export_request"}'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: exportRequestId,
            status: 'incomplete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33',
            asset_uri: 'in-progress',
            event_payload:
              '{"type": "export", "event": "mention_export_request", "sqlQueries: {"statement":"select * from xyz;"}}'
          }
        ],
        false
      );
      try {
        res = await dal.updateExportRequest(context, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('incomplete');
      chaiExpect(res.eventPayload).to.contain('sqlQueries');
    });

    it('should return updated if set status to failed', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: exportRequestId,
          organizationId: '17560',
          status: 'failed'
        }
      };
      // get exportRequest
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'incomplete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33',
            asset_uri: 'test_asset_uri'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: exportRequestId,
            status: 'failed',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33',
            asset_uri: 'test_asset_uri'
          }
        ],
        false
      );
      try {
        res = await dal.updateExportRequest(context, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('failed');
    });

    it('should return throw not found when empty', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: exportRequestId,
          organizationId: '17560',
          status: 'complete'
        }
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33',
            asset_uri: 'test_asset_uri'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([], false);
      try {
        res = await dal.updateExportRequest(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
      chaiExpect(res).to.be.undefined;
    });

    it('should return update ExportRequest when status and assetUri', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: exportRequestId,
          organizationId: '17560',
          status: 'complete',
          assetUri: 'test_asset_uri'
        }
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33',
            asset_uri: 'test_asset_uri'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            asset_uri: 'test_asset_uri'
          }
        ],
        false
      );
      try {
        res = await dal.updateExportRequest(context, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('complete');
      chaiExpect(res.organizationId).to.equal('17560');
      chaiExpect(res.assetUri).to.equal('test_asset_uri');
    });
  });

  describe('#validateTDOData', function () {
    it('should validate TDO data', async function () {
      let res, err;
      const args = { input: { tdoData: [{ id: 123 }] } };

      try {
        res = await dal.validateTDOData(args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.undefined;
    });
  });

  describe('#validateOuputConfiguration', function () {
    it('should call function', async function () {
      let res, err;

      try {
        res = await dal.validateOuputConfiguration();
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.undefined;
    });
  });

  describe('#createMentionExportRequest', function () {
    it('should throw InvalidInput error when input invalid userTimeZone', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          organizationId: '17560',
          userTimeZone: 'invalid userTimeZone'
        }
      };

      try {
        res = await dal.createMentionExportRequest(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should createMentionExportRequest without userTimeZone', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      const args = {
        input: {
          organizationId: '17560'
        }
      };

      try {
        res = await dal.createMentionExportRequest(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
    });

    it('should createMentionExportRequest with user token', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          organizationId: '17560',
          userTimeZone: 'America/Kentucky/Louisville'
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33'
          }
        ],
        false
      );
      try {
        res = await dal.createMentionExportRequest(args, context);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('complete');
      chaiExpect(res.organizationId).to.equal('17560');
      chaiExpect(res.requestorId).to.equal(
        '73d50266-48f3-4991-93f3-26a1948fdb33'
      );
    });

    it('should createMentionExportRequest with tokenId', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      context._authInfo.token = null;
      context._authInfo.tokenId = 'tokenId';

      const args = {
        input: {
          organizationId: '17560',
          userTimeZone: 'America/Kentucky/Louisville'
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: exportRequestId,
            status: 'complete',
            organization_id: '17560',
            requestor_id: '73d50266-48f3-4991-93f3-26a1948fdb33'
          }
        ],
        false
      );
      try {
        res = await dal.createMentionExportRequest(args, context);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(exportRequestId);
      chaiExpect(res.status).to.equal('complete');
      chaiExpect(res.organizationId).to.equal('17560');
      chaiExpect(res.requestorId).to.equal(
        '73d50266-48f3-4991-93f3-26a1948fdb33'
      );
    });
  });
});
