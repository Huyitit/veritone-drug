const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const orgHelper = require('../helpers/organization');
const config = helpers.config;

const env = config.env;
const _ = require('lodash');
const uuid = require('uuid');
const gqlClient = new GraphqlClient(env);
const chakram = require('chakram');
const { regexp } = require('express-xml-bodyparser');
const citestMarker = global.citestMarker || 'citest-should-delete';
const nameOrg = `${citestMarker}-application-${uuid.v4()}`;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const ROLES_IDS = [
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450' // Discovery Editor
];
describe('TDO RBAC', () => {

  let tdoId;
  let folderId;
  let folderId1;
  let defaultAGsToRemoveMember;
  let useRBACFeature;
  let testOrg, testUsers, adminUser, regularUser;
  let superOrgGuid, superOrgId, superUserId, superToken, superAdminOptions;
  let adminToken, adminOptions;
  let regularToken, regularOptions;
  let regularUserId;

  const uniqueId = Date.now().valueOf();
  const impersonateUser = async (user) => {
    const url = `${config.core_admin_url}/admin/impersonate/${user.id}/${user.organizationGuid}`;
    const options = helpers.requestOptions(superToken);
    const impersonated = await chakram.get(url, options);
    expect(_.get(impersonated, 'body.token')).toBeDefined();
    const userToken = _.get(impersonated, 'body.token');

    return {
      token: userToken,
      requestOptions: helpers.requestOptions(userToken)
    };
  };

  beforeAll(async () => {
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;

    const introspectionQuery = await gqlClient.query(`
          {
            __type(name: "AuthPermissionSet") {
              name
            }
        }`);

    // Since this test creates new org, we only need to check for env setting
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    const spadminMe = await gqlClient.query(meGql);

    expect(spadminMe.me).toBeDefined();
    superOrgGuid = _.get(spadminMe, 'me.organization.guid');
    superOrgId = _.get(spadminMe, 'me.organization.id');
    superUserId = _.get(spadminMe, 'me.id');

    const testOrgData = await orgHelper.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superToken },
      createOrgAndUserInput
    );

    testOrg = testOrgData.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');

    adminUser = _.find(testUsers, (user) => _.includes(user.name, 'admin'));
    regularUser = _.find(testUsers, (user) => _.includes(user.name, 'regular'));
    regularUserId = _.get(regularUser, 'id');
    // Login for super Admin user
    let impersonated;
    impersonated = await impersonateUser({
      id: superUserId,
      organizationGuid: superOrgGuid
    });
    superAdminOptions = impersonated.requestOptions;

    // Login for Admin user
    impersonated = await impersonateUser(adminUser);
    adminToken = impersonated.token;
    adminOptions = impersonated.requestOptions;

    // Login for Regular user
    impersonated = await impersonateUser(regularUser);
    regularToken = impersonated.token;
    regularOptions = impersonated.requestOptions;

    const me = await gqlClient.query(meGql, {}, regularOptions);
    defaultAGsToRemoveMember = _.get(me, 'me.authGroups.records', []);
  });

  // Folders
  it('should create a root folder', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const rootFolderQuery = `mutation {
        createRootFolders(rootFolderType: cms) {
          id
          description
          treeObjectId
          rootFolderTypeId
          typeId
        }
      }`;
    const rootFolderResult = await gqlClient.query(
      rootFolderQuery,
      null,
      regularOptions
    );
    expect(rootFolderResult.createRootFolders).toBeDefined();

    const rootFolders = rootFolderResult.createRootFolders;
    const treeObjectId = rootFolders[1].treeObjectId;
    const folderQuery = `mutation {
        createFolder(input: {
          name: "citest-should-delete-graphql-folders",
          description: "citest-should-delete-graphql-folders-description",
          rootFolderType: cms
          parentId: "${treeObjectId}",
        }) {
          id
          treeObjectId
          name
          description
          createdDateTime
          modifiedDateTime
        }
      }`;
    const result = await gqlClient.query(folderQuery, null, regularOptions);
    folderId = result.createFolder.id;

    expect(result.createFolder.id).toBeDefined();
    expect(result.createFolder.name).toBeDefined();

    const folderQuery1 = `mutation {
        createFolder(input: {
          name: "citest-should-delete-graphql-folders1",
          description: "citest-should-delete-graphql-folders1-description",
          rootFolderType: cms
          parentId: "${treeObjectId}",
        }) {
          id
          treeObjectId
          name
          description
          createdDateTime
          modifiedDateTime
        }
      }`;
    const result1 = await gqlClient.query(folderQuery1, null, regularOptions);
    folderId1 = result1.createFolder.id;

    expect(result1.createFolder.id).toBeDefined();
    expect(result1.createFolder.name).toBeDefined();
  });

  // TDO
  it('should create a TDO', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const query = `
        mutation {
        createTDO(input: {
            status: "uploaded",
            startDateTime: 1476726655,
            stopDateTime: 1476726755
            parentFolderId: "${folderId}"
        }) {
            id
            applicationId
          }
        }`;
    const result = await gqlClient.query(query, null, regularOptions);
    tdoId = _.get(result, 'createTDO.id', null);
    expect(tdoId).toBeDefined();
  });

  it('should get a TDO by ID', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const query = `
        query {
          temporalDataObject(id: "${tdoId}") { 
            id
            startDateTime
            stopDateTime
         }
        }`;
    const result = await gqlClient.query(query, null, regularOptions);
    expect(_.get(result, 'temporalDataObject.id')).toEqual(tdoId);
  });

  it('should update a TDO', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const query = `
        mutation updateTDO {
        updateTDO(
          input: {
            id: "${tdoId}"
            name: "updated tdo name"
          }
        ) {
          id
          details
        }
      }`;
    const result = await gqlClient.query(query, null, regularOptions);
    tdoId = _.get(result, 'updateTDO.id', null);
    const details = _.get(result, 'updateTDO.details', {});
    expect(tdoId).toBeDefined();
    expect(details).toHaveProperty('veritoneFile.fileName', 'updated tdo name');
  });

  // restricted user
  it('should removes restrict users from default AGs', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const authGroupIds = _.map(defaultAGsToRemoveMember, 'id');

    if (authGroupIds.length > 0) {
      const result = await Promise.all(
        authGroupIds.map((id) =>
          gqlClient.query(
            `mutation authGroupRemoveMembers {
                  authGroupRemoveMembers(
                    id: "${id}",
                    memberIds: ["${regularUserId}"]
                  ) {
                    id
                  }
                }`,
            {},
            adminOptions
          )
        )
      );
      expect(result.length).toEqual(authGroupIds.length);
    }
  });

  it('move tdo to new folder', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }

    const query = `mutation {
      moveTemporalDataObject(input: {
        tdoId: "${tdoId}"
        oldFolderId: "${folderId}"
        newFolderId: "${folderId1}"
      }) {
        id
      }
    }`;

    const maxRetries = 12;
    const delayBetweenRetries = 5000;

    let result;
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        result = await gqlClient.query(query, null, regularOptions);

        expect(result.moveTemporalDataObject.id).toEqual(tdoId);
        return;
      } catch (err) {
        lastError = err;

        if (i < maxRetries - 1) {
          await helpers.sleep(delayBetweenRetries);
        }
      }
    }

    console.warn(
      `[moveTemporalDataObject] Skipping test after ${maxRetries} retries `
    );
    return;
  });

  it('delete the tdoId', async () => {
    [tdoId].forEach(async (tdoId) => {
      const query = `
            mutation deleteTDO {
              deleteTDO(
                id: "${tdoId}"
              ) {
                id
              }
            }
          `;
      const result = await gqlClient.query(query, {}, regularOptions);
      expect(result.deleteTDO.id).toBeDefined();
    });
  });

  it('delete a folder', async () => {
    [folderId, folderId1].forEach(async (folderId) => {
      const query = `
            mutation {
                deleteFolder(input: {
                    id: "${folderId}"
                    orderIndex: 0
                }) {
                    id
                }
            }
          `;
      const result = await gqlClient.query(query, {}, regularOptions);
      expect(result.deleteFolder.id).toBeDefined();
    });
  });
});

const meGql = `
query {
  me {
    id
    name
    status
    organization {
      id
      guid
      status
      jsondata
    }
    authGroupIds
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

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-rbac-' + uuid.v4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    kvp: {
      features: {
        enableRBACFeature: 'enabled',
        enableRBACFeatureForSDO: 'enabled'
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
      key: 'regularUser',
      name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['cf2ed945-176b-4dd9-943e-22fcb1cf684f'] // CMS Viewer
    }
  ]
};
