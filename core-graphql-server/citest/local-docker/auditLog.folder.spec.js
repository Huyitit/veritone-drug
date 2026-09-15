const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  configurableEvents: ['FolderCreate', 'FolderUpdate', 'FolderDelete']
};

let rootFolders;
let folderId;

const rootFolderType = 'cms';
const testStateObject = {
  testId: null,
  testName: 'citest_folder_' + Date.now(),
  testDescription: null,
  testParentId: null,
  testOrderIndex: 0
  // this is used for which step of the tests are on
};

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
  'audit-log-folder @nightly', () => {
  let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const query = `mutation {
        createRootFolders(rootFolderType: ${rootFolderType}) {
          id
          description
          treeObjectId
          rootFolderTypeId
          typeId
        }
      }`;
    const queryResult = await helpersAuditLog._gqlClient.query(
      query,
      null,
      headers
    );
    expect(queryResult).toBeDefined();
    expect(!_.isEmpty(queryResult.createRootFolders)).toBeTruthy();
    expect(_.isArray(queryResult.createRootFolders)).toBeTruthy();
    const rootFolders = queryResult.createRootFolders;
    testStateObject.testParentId = rootFolders[1].treeObjectId;
  });

  it('should index audit log when creating a folder', async () => {
    testStateObject.testDescription = 'graphql-folders-description';

    const query = `mutation {
        createFolder(input: {
          name: "${testStateObject.testName}",
          description: "${testStateObject.testDescription}",
          parentId: "${testStateObject.testParentId}",
          orderIndex: ${testStateObject.testOrderIndex},
          rootFolderType: ${rootFolderType}
        }) {
          id
          treeObjectId
          name
          description
          createdDateTime
          modifiedDateTime
          status
          ownerId
          maxDepth
          orderIndex
        }
      }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    testStateObject.testId = _.get(result, 'createFolder.treeObjectId');
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    expect(result).toBeDefined();
    expect(result.createFolder.id).toBeDefined();
    expect(result.createFolder.name).toEqual(`${testStateObject.testName}`);
    folderId = _.get(result, 'createFolder.treeObjectId');

    const expectedAuditLogItems = [
      {
        eventType: 'folder',
        eventName: 'FolderCreate',
        actionResult: 'success',
        actionName: 'create'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Created folder citest_folder_\d+$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log when failing to create a folder', async () => {
    testStateObject.testDescription = 'graphql-folders-description';

    const query = `mutation {
        createFolder(input: {
          name: "${testStateObject.testName}",
          description: "${testStateObject.testDescription}",
          parentId: "XYZ",
          orderIndex: ${testStateObject.testOrderIndex},
          rootFolderType: ${rootFolderType}
        }) {
          id
          treeObjectId
          name
          description
          createdDateTime
          modifiedDateTime
          status
          ownerId
          maxDepth
          orderIndex
        }
      }`;

    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(query, null, headers)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );

        const expectedAuditLogItems = [
          {
            eventType: 'folder',
            eventName: 'FolderCreate',
            actionResult: 'failure',
            actionName: 'create'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /^Failed to create folder*$/
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });
  });

  it('should index audit log when updating a folder', async () => {
    const query = `
      mutation {
        updateFolder(
          input: {
            id: "${folderId}"
            name: "${testStateObject.testName}-updated"
          }) {
            id
            name
          }
        }
      `;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    expect(result).toBeDefined();
    expect(result.updateFolder.id).toBeDefined();
    expect(result.updateFolder.name).toEqual(
      `${testStateObject.testName}-updated`
    );

    const expectedAuditLogItems = [
      {
        eventType: 'folder',
        eventName: 'FolderUpdate',
        actionResult: 'success',
        actionName: 'update'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Updated folder citest_folder_\d+$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log when failing to update a folder', async () => {
    const query = `
      mutation {
        updateFolder(
          input: {
            id: "XYZ"
            name: "${testStateObject.testName}-updated"
          }) {
            id
            name
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
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );
        const expectedAuditLogItems = [
          {
            eventType: 'folder',
            eventName: 'FolderUpdate',
            actionResult: 'failure',
            actionName: 'update'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /^Failed to update folder XYZ*$/
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });
  });

  it('should index audit log when deleting a folder', async () => {
    const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.testId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
          message
        }
      }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    expect(result).toBeDefined();
    expect(result.deleteFolder.id).toBeDefined();
    expect(result.deleteFolder.message).toBeNull();

    const expectedAuditLogItems = [
      {
        eventType: 'folder',
        eventName: 'FolderDelete',
        actionResult: 'success',
        actionName: 'delete'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    expectedAuditLogItems[0].actionDetails = expect.stringMatching(
      /^Deleted folder citest_folder_\d+-updated$/
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log when failing to delete a folder', async () => {
    const query = `mutation {
        deleteFolder(input: {
          id: "XYZ"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
          message
        }
      }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(query, null, headers)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );

        const expectedAuditLogItems = [
          {
            eventType: 'folder',
            eventName: 'FolderDelete',
            actionResult: 'failure',
            actionName: 'delete'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        expectedAuditLogItems[0].actionDetails = expect.stringMatching(
          /^Failed to delete folder XYZ*$/
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });
  });
});
