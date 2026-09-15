const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const mediaUtil = require('../helpers/mediaStreamer.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_CI_TEST_SERVICE_TOKEN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: ['AssetUpload', 'AccessMedia']
};
const config = helpers.config;

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif(
  (config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-mediaStreamer @nightly',
  () => {
    let gqlClient;
    let mediaTdoIds = [];
    let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;

    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS
      );
      let result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();

      const env = config.env;
      gqlClient = new GraphqlClient(env);
      result = await gqlClient.connect();
      expect(result.apiToken).toBeDefined();
      expect(result.token).toBeDefined();
    });

    afterAll(async () => {
      if (!mediaTdoIds.length) return;
      const query = `mutation($id: ID!) {
        deleteTDO(id: $id) {
          id
        }
      }`;
      for (const tdoId of mediaTdoIds) {
        await gqlClient.query(query, { id: tdoId });
      }
    });

    it('should index audit log event AssetUpload WHEN creating asset - success', async () => {
      let query = `
    mutation {
      createTDO(input: {
          status: "uploaded",
          startDateTime: 1476726655,
          stopDateTime: 1476726755
      }) {
          id
          applicationId
          startDateTime
          stopDateTime
      }
    }`;
      let result = await gqlClient.query(query);
      const tdo = _.get(result, 'createTDO', null);

      if (!tdo) {
        throw new Error('TDO not created');
      }
      mediaTdoIds.push(tdo.id);
      query = `
      mutation {
      createAsset(input: {
        containerId: "${tdo.id}"
        contentType: "video/mp4"
        assetType: "media"
      }) {
        id
        uri
      }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );
      result = await gqlClient.uploadFileGetRawResponse(
        query,
        'movie.mp4',
        './citest/data/movie.mp4',
        headers.headers
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );

      expect(correlationIDResponse).toBe(correlationID);

      const parsedResult = _.get(result, 'body.data');
      const asset = _.get(parsedResult, 'createAsset', null);
      expect(tdo).toBeDefined();
      expect(tdo.id).toBeDefined();
      expect(asset).toBeDefined();
      expect(asset.id).toBeDefined();
      expect(asset.uri).toBeDefined();

      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'success',
          targetType: 'tt_Asset',
          userName: helpers.config.userName,
          userAgent: 'core-graphql-server test',
          organizationId: _.toString(helpersAuditLog._organizationID),
          originatorApplication: 'GraphQL-CI-Test',
          originatorService: 'core-graphql-server',
          eventType: 'asset',
          eventName: 'AssetUpload',
          organizationName: 'Veritone, Inc.'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      // Not used as a filter to retrieve the record from Elasticsearch, but used for comparison with the expected values.
      expectedAuditLogItems[0].actionDetails = expect.stringMatching(
        /Uploaded file .*\.mp4 successfully/
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log event AssetUpload WHEN creating asset with asset metadata >1MB - failure', async () => {
      let query = `
        mutation {
          createTDO(input: {
              status: "uploaded",
              startDateTime: 1476726655,
              stopDateTime: 1476726755
          }) {
              id
              applicationId
              startDateTime
              stopDateTime
          }
        }
      `;
      let result = await gqlClient.query(query);
      const tdo = _.get(result, 'createTDO', null);

      if (!tdo) {
        throw new Error('TDO not created');
      }
      mediaTdoIds.push(tdo.id);

      // Generate a large string to exceed 1MB
      const largeString = 'A'.repeat(1024 * 1024 + 100); // ~1MB + 100 bytes
      query = `
        mutation {
          createAsset(input: {
            containerId: "${tdo.id}"
            assetType: "text/plain"
            details: {
              metadata: "${largeString}"
            }
            uri: "http://localhost/"
          }) {
            id
            uri
          }
        }
      `;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID
      );

      await helpersAuditLog._gqlClient
        .query(query, null, headers)
        .catch(async (e) => {
          const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
            e
          );
          expect(e).toBeDefined();
          const expectedAuditLogItems = [
            {
              actionName: 'create',
              actionResult: 'failure',
              actionDetails: 'Failed to upload file',
              targetType: 'tt_Asset',
              userName: helpers.config.userName,
              userAgent: 'core-graphql-server test',
              organizationId: _.toString(helpersAuditLog._organizationID),
              originatorApplication: 'GraphQL-CI-Test',
              originatorService: 'core-graphql-server',
              eventType: 'asset',
              eventName: 'AssetUpload',
              organizationName: 'Veritone, Inc.'
            }
          ];
          const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
            correlationID,
            expectedAuditLogItems
          );
          validateExpectedEvents({
            auditLogItems,
            expectedAuditLogItems,
            correlationID,
            correlationIDResponse
          });
        });
    });

    // This test depends on assets already indexed in Elasticsearch by previous audit-log test suites
    // (e.g. auditLog.engine.spec.js, auditLog.platform.spec.js). Running it in isolation — with only
    // the mediaStreamer suite active — will cause it to fail because no assets are indexed yet.
    // TODO: make this test self-contained and not reliant on other suites' data creation.
    it('should index audit log when querying assets', async () => {
      const { result, correlationID } = await mediaUtil.getAssetsWithRetry(
        gqlClient,
        helpersAuditLog,
        CONFIG_ADMIN_TOKEN,
        {
          maxRetries: 12, // wait for no more than 2 minutes (maxRetries * waitSeconds = 120s).
          waitSecondsOnEachRetry: 10 // number of seconds spent waiting on each retry.
        }
      );
      expect(!_.isEmpty(result.assets.assets.records)).toBeTruthy();

      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        result
      );
      const expectedAuditLogItems = [
        { eventType: 'media', eventName: 'AccessMedia' }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });
  }
);
