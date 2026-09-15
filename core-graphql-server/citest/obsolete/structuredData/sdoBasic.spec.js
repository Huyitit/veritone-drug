const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const userHelpers = require('../../helpers/user');
const dataRegistyHelpers = require('../../helpers/dataRegistry');
const schemaHelpers = require('../../helpers/schema');
const sdoHelpers = require('../../helpers/sdo');
const folderHelpers = require('../../helpers/folder');
const GraphqlClient = require('../../helpers/gql');
const { createIsolatedSuperadmin } = require('../../helpers/superadminSession');
const { safe } = require('../../helpers/cleanup/utils');
const chakram = require('chakram');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const role = require('../../../dal/role');
let gqlClient;
const env = config.env;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const citestMarker = global.citestMarker || 'citest-should-delete';

let superAdminOptions = {};
let legacyAdminOptions = {};
let legacyAdminOptions2 = {};
let regularUserOptions = {};
let regularUserOptions2 = {};
const requestOptions = [
  (superAdminOptions = {}),
  (legacyAdminOptions = {}),
  (legacyAdminOptions2 = {}),
  (regularUserOptions = {}),
  (regularUserOptions2 = {})
];

const testSchemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    foo: {
      $id: '/properties/foo',
      type: 'string',
      title: 'The Foo Schema',
      default: '',
      examples: ['bar']
    },
    bar: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
};

const createdTestData = [];
let newFolderId, newTDOId, contentFolderTemplateId;
let folderId;
let testSetup;

describe('citest_structureddata: lagacy structured data ci test', () => {
  let testOrg, testUsers;
  let superOrgGuid, superOrgId, superUserId, superToken;
  let dataRegistryId, schemaId, sdoId, existOrgSdoId;
  let adminDataRegistryId, adminSchemaId, adminSdoId;
  let regularSdoId;
  let session;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);

    // T26: this suite previously ran on the SHARED superadmin session
    // (sys_graphql_citest_superadmin, from gqlClient.connect()), which becomes an admin MEMBER
    // of testOrg (setupTestOrgAndUser enrolls the caller). Any concurrent spec's org-delete/
    // user-delete/OLP-toggle enumerates that org's active members and calls the GLOBAL
    // removeAllUserSessions on each — killing this suite's shared token mid-run (bearer
    // validation is per-token-key existence, so a killed token never recovers). Same defect and
    // same fix as T14/T15/T16/T22/T23: route this suite through a throwaway isolated superadmin
    // that is a member of no org but its own. See helpers/superadminSession.js.
    session = await createIsolatedSuperadmin({ gqlClient });
    superToken = session.token;
    requestOptions.superAdminOptions = session.options;
    gqlClient.userAuth = session.options; // route implicit-auth call sites (me, deleteMultiUser) through the isolated SA

    const result = await gqlClient.query(meGql);
    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');

    testSetup = await orgHelpers.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superToken },
      createOrgAndUserInput
    );

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');
    expect(testUsers.length).toEqual(5);

    // Login for admin user
    const adminUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'adminUser';
    });
    requestOptions.legacyAdminOptions = adminUser.requestOptions;

    // Login for second admin user
    const secondAdminUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'secondAdminUser';
    });
    requestOptions.legacyAdminOptions2 = secondAdminUser.requestOptions;

    // Login for regular user
    const regularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'regularUser';
    });
    requestOptions.regularUserOptions = regularUser.requestOptions;

    // Login for second regular user
    const secondRegularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'secondRegularUser';
    });
    requestOptions.regularUserOptions2 = secondRegularUser.requestOptions;
  });

  afterAll(async () => {
    if (regularSdoId) {
      await safe('delete regular SDO', async () => {
        await sdoHelpers.helpDeleteStructuredData(
          { gqlClient, options: requestOptions.regularUserOptions },
          {
            id: regularSdoId,
            schemaId: adminSchemaId
          }
        );
      });
    }

    if (adminSdoId) {
      await safe('delete admin SDO', async () => {
        await sdoHelpers.helpDeleteStructuredData(
          { gqlClient, options: requestOptions.legacyAdminOptions },
          {
            id: adminSdoId,
            schemaId: adminSchemaId
          }
        );
      });
    }

    if (existOrgSdoId) {
      await safe('delete existing org SDO', async () => {
        await sdoHelpers.helpDeleteStructuredData(
          { gqlClient, options: requestOptions.superAdminOptions },
          {
            id: existOrgSdoId,
            schemaId: schemaId
          }
        );
      });
    }

    if (schemaId) {
      await safe('delete schema', async () => {
        await schemaHelpers.helpDeleteSchema(
          {
            gqlClient,
            options: requestOptions.superAdminOptions
          },
          { schemaId: schemaId }
        );
      });
    }

    if (adminSchemaId) {
      await safe('delete admin schema', async () => {
        await schemaHelpers.helpDeleteSchema(
          {
            gqlClient,
            options: requestOptions.superAdminOptions
          },
          { schemaId: adminSchemaId }
        );
      });
    }

    if (!_.isEmpty(testSetup.listOptions)) {
      await safe('delete users', async () => {
        const listUserIds = testSetup.listOptions.map((user) => user.userId);
        await userHelpers.deleteMultiUser({ gqlClient }, listUserIds);
      });
    }

    if (testOrg.id) {
      await safe('delete organization', async () => {
        await helpers.deleteOrganization(gqlClient.authUrl, testOrg.id, superToken);
      });
    }

    await session?.cleanup();
  });

  describe('legacy super admin tests', () => {
    it('should create a data registry success', async () => {
      let res;
      res = await dataRegistyHelpers.helpCreateDataRegistry(
        { gqlClient, options: requestOptions.superAdminOptions },
        {
          name: `${citestMarker} + '-registry-unix-name-in-org-' ${uuid.v4()}`,
          description: 'citest data registry description',
          source: 'citest data registry source'
        }
      );
      expect(res.createDataRegistry.id).toBeDefined();
      dataRegistryId = res.createDataRegistry.id;
    });

    it('upsert a schema draft should success', async () => {
      let recResult, upsertSchemaDraft;

      const variables = {
        dataRegistryId: dataRegistryId,
        schema: testSchemaInput
      };

      recResult = await schemaHelpers.helpUpsertSchemaDraft(
        { gqlClient, options: requestOptions.superAdminOptions },
        variables
      );

      upsertSchemaDraft = _.get(recResult, 'upsertSchemaDraft');
      expect(upsertSchemaDraft).toBeDefined();
      schemaId = upsertSchemaDraft.id;
      expect(schemaId).toBeDefined();
      expect(upsertSchemaDraft.dataRegistryId).toEqual(dataRegistryId);
      expect(upsertSchemaDraft.status).toEqual('draft');
      expect(upsertSchemaDraft.definition).toEqual(testSchemaInput);
      expect(upsertSchemaDraft.validActions).toEqual([
        'view',
        'edit',
        'publish',
        'delete'
      ]);
      expect(_.get(upsertSchemaDraft, 'organizationId')).toEqual(
        superOrgId.toString()
      );
      expect(_.get(upsertSchemaDraft, 'organization.id')).toEqual(
        superOrgId.toString()
      );

      schemaId = upsertSchemaDraft.id;
      createdTestData.push({
        schemaId,
        dataRegistryId
      });
    });

    it('publish a schema draft should success', async () => {
      let recResult, updateSchemaState;

      recResult = await schemaHelpers.helpPublishSchema(
        { gqlClient, options: requestOptions.superAdminOptions },
        { id: schemaId, breakingChanges: false }
      );

      updateSchemaState = _.get(recResult, 'updateSchemaState');
      expect(updateSchemaState).toBeDefined();
      expect(updateSchemaState.id).toEqual(schemaId);
      expect(updateSchemaState.status).toEqual('published');
      expect(updateSchemaState.createdDateTime).toBeDefined();
      expect(updateSchemaState.modifiedDateTime).toBeDefined();
      expect(updateSchemaState.validActions).toEqual([
        'view',
        'edit',
        'deactivate',
        'delete'
      ]);
    });

    it('create a structured data should success', async () => {
      let recResult;
      recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.superAdminOptions },
        {
          schemaId: schemaId,
          data: { foo: 'bar' }
        }
      );
      expect(recResult).toBeDefined();
      sdoId = _.get(recResult, 'createStructuredData.id');
    });

    it('get structured data should success', async () => {
      let recResult;
      let data = null;

      const variables = {
        schemaId: schemaId,
        ids: [sdoId]
      };

      recResult = await sdoHelpers.helpGetStructuredDataObjects(
        { gqlClient, options: requestOptions.superAdminOptions },
        variables
      );

      expect(recResult).toBeDefined();
      data = recResult.structuredDataObjects;
      expect(data).toBeDefined();
      expect(data.records).toBeDefined();
      expect(data.records.length > 0).toEqual(true);
      expect(data.records.length).toEqual(data.count);
    });

    it('read sdo with schema query should success', async () => {
      let recResult;

      recResult = await schemaHelpers.helpGetSchema(
        { gqlClient, options: requestOptions.superAdminOptions },
        { id: schemaId }
      );

      expect(recResult).toBeDefined();
      expect(recResult.schema).toBeDefined();
      expect(recResult.schema.id).toEqual(schemaId);
      expect(recResult.schema.structuredDataObjects).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records).toBeDefined();
      expect(
        recResult.schema.structuredDataObjects.records.length
      ).toBeGreaterThan(0);
      expect(
        _.find(recResult.schema.structuredDataObjects.records, { id: sdoId })
      ).toBeDefined();
    });

    it('update a structured data should success', async () => {
      var recResult;
      var createStructuredData = null;

      recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.superAdminOptions },
        {
          id: sdoId,
          schemaId: schemaId,
          data: { foo: 'updated bar' }
        }
      );

      expect(recResult).toBeDefined();
      createStructuredData = _.get(recResult, 'createStructuredData');
      expect(createStructuredData).toBeDefined();
    });

    it('create folder content template with sdo should success', async () => {
      const folderIdRes = await createCmsFolderFlow(
        gqlClient,
        requestOptions.superAdminOptions,
        citestMarker
      );
      newFolderId = folderIdRes;

      const createFolderContentTemplateResult = await gqlClient.query(
        `mutation createFolderContentTemplate{
                  createFolderContentTemplate (input: {
                    folderId: "${newFolderId}"
                    sdoId: "${sdoId}"
                    schemaId: "${schemaId}"
                  }) {
                    id
                    folderId
                    sdoId
                    sdo {
                      id
                      schemaId
                    }
                    schemaId
                    data
                    createdDateTime
                    modifiedDateTime
                  }
                }`,
        {},
        requestOptions.superAdminOptions
      );
      const folderContentTemplate = _.get(
        createFolderContentTemplateResult,
        'createFolderContentTemplate'
      );
      expect(folderContentTemplate.id).toBeDefined();
      expect(folderContentTemplate.sdoId).toEqual(sdoId);
      contentFolderTemplateId = folderContentTemplate.id;
    });

    it('create tdo with belonged sdo should success', async () => {
      const result = await gqlClient.query(
        `mutation {
                  createTDO(
                    input: {
                      status: "uploaded",
                      startDateTime: 1476726655,
                      stopDateTime: 1476726755,
                      contentTemplates: [{sdoId: "${sdoId}", schemaId: "${schemaId}"}]
                    }
                  ) {
                    id
                  }
                }`,
        {}
      );
      const tdo = _.get(result, 'createTDO');
      expect(tdo.id).toBeDefined();
    });

    it('delete structured data should success', async () => {
      let recResult;

      const variables = {
        schemaId: schemaId,
        id: sdoId
      };

      recResult = await sdoHelpers.helpDeleteStructuredData(
        { gqlClient, options: requestOptions.superAdminOptions },
        variables
      );

      expect(recResult).toBeDefined();
      expect(recResult.deleteStructuredData).toBeDefined();
      expect(recResult.deleteStructuredData.id).toBeDefined();
    });

    it('should prepare shared sdo success', async () => {
      let recResult;
      recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        {
          schemaId: schemaId,
          data: { foo: 'bar' }
        }
      );
      expect(recResult).toBeDefined();
      existOrgSdoId = _.get(recResult, 'createStructuredData.id');
    });

    it('update existing org sdo should success', async () => {
      const updateSDORes = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.superAdminOptions },
        {
          id: existOrgSdoId,
          schemaId: schemaId,
          data: { foo: 'updated bar' }
        }
      );

      expect(updateSDORes).toBeDefined();
    });

    it('delete existing org sdo should success', async () => {
      let recResult;

      const variables = {
        schemaId: schemaId,
        id: schemaId
      };

      recResult = await sdoHelpers.helpDeleteStructuredData(
        { gqlClient, options: requestOptions.superAdminOptions },
        variables
      );

      expect(recResult).toBeDefined();
      expect(recResult.deleteStructuredData).toBeDefined();
      expect(recResult.deleteStructuredData.id).toBeDefined();
    });
  });

  describe('legacy admin tests', () => {
    it('should create a data registry success', async () => {
      let res;
      res = await dataRegistyHelpers.helpCreateDataRegistry(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        {
          name: `${citestMarker} + '-legacy-admin-registry-unix-name-in-org-' ${uuid.v4()}`,
          description: 'citest data registry description',
          source: 'citest data registry source'
        }
      );
      expect(res.createDataRegistry.id).toBeDefined();
      adminDataRegistryId = res.createDataRegistry.id;
    });

    it('upsert a schema draft should success', async () => {
      let recResult, upsertSchemaDraft;

      const variables = {
        dataRegistryId: adminDataRegistryId,
        schema: testSchemaInput
      };

      recResult = await schemaHelpers.helpUpsertSchemaDraft(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        variables
      );

      upsertSchemaDraft = _.get(recResult, 'upsertSchemaDraft');
      expect(upsertSchemaDraft).toBeDefined();
      adminSchemaId = upsertSchemaDraft.id;
      expect(adminSchemaId).toBeDefined();
      expect(upsertSchemaDraft.dataRegistryId).toEqual(adminDataRegistryId);
      expect(upsertSchemaDraft.status).toEqual('draft');
      expect(upsertSchemaDraft.definition).toEqual(testSchemaInput);
      expect(upsertSchemaDraft.validActions).toEqual([
        'view',
        'edit',
        'publish',
        'delete'
      ]);
    });

    it('publish a schema draft should success', async () => {
      let recResult, updateSchemaState;

      recResult = await schemaHelpers.helpPublishSchema(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        { id: adminSchemaId, breakingChanges: false }
      );

      updateSchemaState = _.get(recResult, 'updateSchemaState');
      expect(updateSchemaState).toBeDefined();
      expect(updateSchemaState.id).toEqual(adminSchemaId);
      expect(updateSchemaState.status).toEqual('published');
      expect(updateSchemaState.createdDateTime).toBeDefined();
      expect(updateSchemaState.modifiedDateTime).toBeDefined();
      expect(updateSchemaState.validActions).toEqual([
        'view',
        'edit',
        'deactivate',
        'delete'
      ]);
    });

    it('create a structured data should success', async () => {
      var recResult;
      recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        {
          schemaId: adminSchemaId,
          data: { foo: 'bar' }
        }
      );
      expect(recResult).toBeDefined();
      adminSdoId = _.get(recResult, 'createStructuredData.id');
    });

    it('update a structured data should success', async () => {
      var recResult;
      var createStructuredData = null;

      recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        {
          id: adminSdoId,
          schemaId: adminSchemaId,
          data: { foo: 'admin updated bar' }
        }
      );

      expect(recResult).toBeDefined();
      createStructuredData = _.get(recResult, 'createStructuredData');
      expect(createStructuredData).toBeDefined();
    });

    it('get structured data should success', async () => {
      let recResult;
      let data = null;

      const variables = {
        schemaId: adminSchemaId,
        ids: [adminSdoId]
      };

      recResult = await sdoHelpers.helpGetStructuredDataObjects(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        variables
      );

      expect(recResult).toBeDefined();
      data = recResult.structuredDataObjects;
      expect(data).toBeDefined();
      expect(data.records).toBeDefined();
      expect(data.records.length > 0).toEqual(true);
      expect(data.records.length).toEqual(data.count);
    });

    it('read sdo with schema query should success', async () => {
      let recResult;

      recResult = await schemaHelpers.helpGetSchema(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        { id: adminSchemaId }
      );

      expect(recResult).toBeDefined();
      expect(recResult.schema).toBeDefined();
      expect(recResult.schema.id).toEqual(adminSchemaId);
      expect(recResult.schema.structuredDataObjects).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records).toBeDefined();
      expect(
        recResult.schema.structuredDataObjects.records.length
      ).toBeGreaterThan(0);
      expect(
        _.find(recResult.schema.structuredDataObjects.records, {
          id: adminSdoId
        })
      ).toBeDefined();
    });

    it('create folder content template with sdo should success', async () => {
      const folderIdRes = await createCmsFolderFlow(
        gqlClient,
        requestOptions.superAdminOptions,
        citestMarker
      );
      folderId = folderIdRes;

      const createFolderContentTemplateResult =
        await folderHelpers.helpCreateFolderContentTemplate(
          {
            gqlClient,
            options: requestOptions.legacyAdminOptions
          },
          {
            folderId: folderId,
            sdoId: adminSdoId,
            schemaId: adminSchemaId
          }
        );
      const folderContentTemplate = _.get(
        createFolderContentTemplateResult,
        'createFolderContentTemplate'
      );
      expect(folderContentTemplate.id).toBeDefined();
      expect(folderContentTemplate.sdoId).toEqual(adminSdoId);
    });

    it('create TDO with belonged SDO should success', async () => {
      var res;
      res = await gqlClient.query(
        `mutation {
                createTDO(
                  input: {
                    status: "uploaded",
                    startDateTime: 1476726655,
                    stopDateTime: 1476726755,
                    contentTemplates: [{sdoId: "${adminSdoId}", schemaId: "${adminSchemaId}"}]
                  }
                ) {
                  id
                }
              }`,
        {},
        requestOptions.legacyAdminOptions
      );
      const tdo = _.get(res, 'createTDO');
      expect(tdo.id).toBeDefined();
    });

    it('read existing org sdo should success', async () => {
      var res;
      res = await sdoHelpers.helpGetStructuredData(
        { gqlClient, options: requestOptions.legacyAdminOptions2 },
        {
          id: adminSdoId,
          schemaId: adminSchemaId
        }
      );
      expect(res).toBeDefined();
      expect(res.structuredData.id).toEqual(adminSdoId);
    });

    it('update a structured data should success', async () => {
      var recResult;
      var createStructuredData = null;

      recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.legacyAdminOptions2 },
        {
          id: adminSdoId,
          schemaId: adminSchemaId,
          data: { foo: 'admin 2 updated bar' }
        }
      );

      expect(recResult).toBeDefined();
      createStructuredData = _.get(recResult, 'createStructuredData');
      expect(createStructuredData).toBeDefined();
    });

    it('delete existing org sdo should success', async () => {
      let recResult;

      const variables = {
        id: adminSdoId,
        schemaId: adminSchemaId
      };

      recResult = await sdoHelpers.helpDeleteStructuredData(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        variables
      );

      expect(recResult).toBeDefined();
    });
  });

  describe('regular user tests', () => {
    it('should create a structured data success', async () => {
      var recResult;
      recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.legacyAdminOptions },
        {
          schemaId: adminSchemaId,
          data: { foo: 'bar' }
        }
      );
      expect(recResult).toBeDefined();
      adminSdoId = _.get(recResult, 'createStructuredData.id');
    });

    it('read sdo with schema query should success', async () => {
      let recResult;

      recResult = await schemaHelpers.helpGetSchema(
        { gqlClient, options: requestOptions.regularUserOptions },
        { id: adminSchemaId }
      );

      expect(recResult).toBeDefined();
      expect(recResult.schema).toBeDefined();
      expect(recResult.schema.id).toEqual(adminSchemaId);
      expect(recResult.schema.structuredDataObjects).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records).toBeDefined();
      expect(
        recResult.schema.structuredDataObjects.records.length
      ).toBeGreaterThan(0);
      expect(
        _.find(recResult.schema.structuredDataObjects.records, {
          id: adminSdoId
        })
      ).toBeDefined();
    });

    it('read existing org sdo should success', async () => {
      const getSDORes = await sdoHelpers.helpGetStructuredData(
        { gqlClient, options: requestOptions.regularUserOptions },
        {
          id: adminSdoId,
          schemaId: adminSchemaId
        }
      );

      expect(getSDORes).toBeDefined();
      expect(getSDORes.structuredData.id).toEqual(adminSdoId);
      expect(getSDORes.structuredData.schemaId).toEqual(adminSchemaId);
    });

    it('create a structured data should success', async () => {
      var recResult;
      recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: requestOptions.regularUserOptions },
        {
          schemaId: adminSchemaId,
          data: { foo: 'regular user bar' }
        }
      );
      expect(recResult).toBeDefined();
      regularSdoId = _.get(recResult, 'createStructuredData.id');
    });

    it('create folder content template with sdo should success', async () => {
      const createFolderContentTemplateResult =
        await folderHelpers.helpCreateFolderContentTemplate(
          {
            gqlClient,
            options: requestOptions.regularUserOptions
          },
          {
            folderId: folderId,
            sdoId: regularSdoId,
            schemaId: adminSchemaId
          }
        );
      const folderContentTemplate = _.get(
        createFolderContentTemplateResult,
        'createFolderContentTemplate'
      );
      expect(folderContentTemplate.id).toBeDefined();
      expect(folderContentTemplate.sdoId).toEqual(regularSdoId);
    });
  });
});

async function createCmsFolderFlow(gqlClient, options, citestMarker) {
  const rootFolderResult = await gqlClient.query(
    `
    query cmsFolder {
      rootFolders(type: cms) {
        id
        name
        description
      }
    }
    `,
    {},
    options
  );

  let rootFolders = _.get(rootFolderResult, 'rootFolders', []);
  let cmsRootFolderId;

  if (rootFolders.length > 0) {
    cmsRootFolderId = _.get(rootFolders[0], 'id');
  } else {
    const createRootFolderRes = await gqlClient.query(
      `
        mutation {
        createRootFolders(rootFolderType: cms) {
          id
          description
          treeObjectId
          rootFolderTypeId
          typeId
        }
      }
      `,
      {},
      options
    );

    const rootFolders = createRootFolderRes.createRootFolders;
    cmsRootFolderId = rootFolders[1].treeObjectId;
  }

  const folderName = `${citestMarker}-folder-${uuid.v4()}`;
  const folderResult = await gqlClient.query(
    `
    mutation createFolder {
      createFolder(
        input: {
          name: "${folderName}"
          description: "test folder for rbac created by admin user"
          parentId: "${cmsRootFolderId}"
          rootFolderType: cms
        }
      ) {
        id
        name
      }
    }
    `,
    {},
    options
  );
  const newFolderId = _.get(folderResult, 'createFolder.id');

  return newFolderId;
}

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-legacy-sdo-' + uuid.v4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    kvp: {
      features: {
        enableRBACFeature: 'disabled'
      }
    },
    apps: [
      {
        applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
        applicationKey: 'cms'
      },
      isDesktopAppEnabled
        ? null
        : {
            applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
            applicationKey: 'admin'
          },
      {
        applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
        applicationKey: 'developer'
      },
      {
        applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
        applicationKey: 'discovery'
      }
    ].filter((app) => app)
  },
  userInputs: [
    {
      key: 'adminUser',
      name: `${citestMarker}-admin-user-${uuid.v4()}@localhost`,
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      key: 'secondAdminUser',
      name: `${citestMarker}-second-admin-user-${uuid.v4()}@localhost`,
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      key: 'regularUser',
      name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'secondRegularUser',
      name: `${citestMarker}-second-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    }
  ]
};

const meGql = `
query {
  me {
    id
    name
    organization {
      id
      guid
      jsondata
    }
    authGroups {
      records {
        id
        name
        authClass
        parentGroups {
          records {
            id
            name
            description
          }
        }
        permissionSet{
          id
          name
          permissions
        }
        appRole {
          description
          permissions {
            records {
              id
              name
              __typename
            }
          }
        }
      }
    }
  }
}`;
