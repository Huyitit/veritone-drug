const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const { safe } = require('../helpers/cleanup/utils');

const config = helpers.config;

const env = config.env;
const _ = require('lodash');
const uuid = require('uuid');
const gqlClient = new GraphqlClient(env);
const chakram = require('chakram');
const citestMarker = global.citestMarker || 'citest-should-delete';
const nameOrg = `${citestMarker}-application-${uuid.v4()}`;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
console.log('isDesktopAppEnabled:', isDesktopAppEnabled);

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450' // Discovery Editor
  // '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);

describe('citest_tdo :AiwareTDOPermissions', () => {
  let applicationOrgGUID = null;
  let aiwareOptions = null;
  let tdoId = null;
  let assetId = null;
  let tdoId1 = null;
  let tdoId2 = null;
  let superAdminOption = null;
  let applicationOrgId = null;
  let folderId = null;
  let folderId1 = null;

  const uniqueId = Date.now().valueOf();
  const serviceToken =
    'citest_service_token:dbd399ece3554c9d9fa3d1015e743b5858468ad2eeb540f2b58556ff69562c50';

  beforeAll(async () => {
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdminOption = helpers.requestOptions(result.token);

    const applicationOrganization = await getOrCreateOrganization(nameOrg);

    // create or get admin user
    const adminUserId = await getOrCreateUser(
      applicationOrganization,
      uniqueId,
      true
    );
    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid;
    const adminOptions = await impersonate(
      adminUserId,
      applicationOrgGUID,
      result.token
    );

    const application = await createApplication(adminOptions);

    const applicationRole =
      _.find(application.applicationRoles, (role) =>
        role.name.includes('aiware')
      ) || application.applicationRoles[0];
    // create or get aiware user
    const aiwareUserId = await getOrCreateUser(
      applicationOrganization,
      uniqueId,
      false,
      applicationRole.id
    );
    aiwareOptions = await impersonate(
      aiwareUserId,
      applicationOrgGUID,
      result.token
    );
  });
  // TDO
  it('should create a TDO', async () => {
    const query = `
        mutation {
        createTDO(input: {
            status: "uploaded",
            startDateTime: 1476726655,
            stopDateTime: 1476726755
        }) {
            id
            applicationId
          }
        }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    tdoId = _.get(result, 'createTDO.id', null);
    expect(tdoId).toBeDefined();
  });
  it('should create a TDO with an asset', async () => {
    const query = `
        mutation createTDOWithAsset {
        createTDOWithAsset(
          input: {
            name: "tdo asset test"
            contentType: "application"
            assetType: "vtn-standard"
            uri: "https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4"
            startDateTime: "01/22/2025"
            stopDateTime: "01/22/2025"
          }
        ) {
          id
        }
      }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    tdoId1 = _.get(result, 'createTDOWithAsset.id', null);
    expect(tdoId1).toBeDefined();
  });
  it('should get a TDO by ID', async () => {
    const query = `
        query {
          temporalDataObject(id: "${tdoId}") { 
            id
            startDateTime
            stopDateTime
         }
        }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    expect(_.get(result, 'temporalDataObject.id')).toEqual(tdoId);
  });
  it('should get a list of TDOs', async () => {
    const query = `query {
        temporalDataObjects{
          records{
            id
            name
          }
        }
      }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    const tdos = _.get(result, 'temporalDataObjects.records', []);
    const tdo = _.find(tdos, (tdo) => tdo.id === tdoId);
    expect(tdo).toBeDefined();
  });
  it('should update a TDO', async () => {
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
    const result = await gqlClient.query(query, null, aiwareOptions);
    tdoId = _.get(result, 'updateTDO.id', null);
    const details = _.get(result, 'updateTDO.details', {});
    expect(tdoId).toBeDefined();
    expect(details).toHaveProperty('veritoneFile.fileName', 'updated tdo name');
  });

  // Asset
  it('should create an asset', async () => {
    const query = `mutation {
        createAsset(input: {
            containerId: "${tdoId}"
            contentType: "application/json"
            assetType: "vtn-standard"
            uri: "https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4"
        }) {
            id
            uri
            assetType
        }
     }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    assetId = _.get(result, 'createAsset.id', null);
    expect(_.get(result, 'createAsset.id')).toBeDefined();
  });
  it('should update the created asset', async () => {
    const query = `mutation updateAsset {
        updateAsset(input: {
            id: "${assetId}"
        }) {
            id
        }
    }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    assetId = _.get(result, 'updateAsset.id', null);
    expect(_.get(result, 'updateAsset.id')).toBeDefined();
  });
  it('should get the asset by ID', async () => {
    const query = `query asset {
        asset(id: "${assetId}") {
            id
        }
    }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    const returnedAssetId = _.get(result, 'asset.id', null);
    expect(returnedAssetId).toEqual(assetId);
  });

  // Engine Results
  it('should get engine result by source engineId', async () => {
    const query = `query getEngineOutput {
      engineResults(
        tdoId: "${tdoId}", 
        engineIds: ["insert-into-index"]
      ) {
        sourceId
        records {
          tdoId
          engineId
          jsondata
        }
      } 
    }`;

    const result = await gqlClient.query(query, null, aiwareOptions);
    const engineResults = _.get(result, 'engineResults');

    expect(engineResults).toBeDefined();
  });

  // Signed URL
  it('should get a signed writable URL', async () => {
    const query = `query getSignedWritableUrl {
        getSignedWritableUrl {
        url
        unsignedUrl
            key
        }
    }`;

    const result = await gqlClient.query(query, null, aiwareOptions);
    const signedWritableUrl = _.get(result, 'getSignedWritableUrl');
    expect(_.get(signedWritableUrl, 'url')).toBeDefined();
    expect(_.get(signedWritableUrl, 'unsignedUrl')).toBeDefined();
    expect(_.get(signedWritableUrl, 'key')).toBeDefined();
    expect(signedWritableUrl).toBeDefined();
  });

  it('should get multiple signed writable URLs', async () => {
    const query = `query getSignedWritableUrls {
        getSignedWritableUrls(number: 2 path: "tdo_apitest" type: "asset") {
        bucket
        key
        }
    }`;

    const result = await gqlClient.query(query, null, aiwareOptions);
    const signedWritableUrl = _.get(result, 'getSignedWritableUrls');
    expect(signedWritableUrl).toBeDefined();
  });

  it('should get upload status of a key', async () => {
    const query = `query getUploadStatus {
        getUploadStatus(input: {
        key: "12"
        }) {
        status
        }
    }`;

    const result = await gqlClient.query(query, null, aiwareOptions);
    const uploadStatus = _.get(result, 'getUploadStatus');
    expect(uploadStatus).toBeDefined();
  });

  // clone request
  it('should fetch clone requests', async () => {
    const query = `query cloneRequests {
        cloneRequests {
            records {
            id
            }
        }
    }`;

    const result = await gqlClient.query(query, null, aiwareOptions);
    const cloneRequests = _.get(result, 'cloneRequests');
    expect(cloneRequests).toBeDefined();
  });

  // Folders
  it('should create a root folder', async () => {
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
      aiwareOptions
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
    const result = await gqlClient.query(folderQuery, null, aiwareOptions);
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
    const result1 = await gqlClient.query(folderQuery1, null, aiwareOptions);
    folderId1 = result1.createFolder.id;

    expect(result1.createFolder.id).toBeDefined();
    expect(result1.createFolder.name).toBeDefined();
  });
  it('should file a TDO into the folder', async () => {
    const query = `mutation {
            fileTemporalDataObject(input: {
              tdoId: "${tdoId}"
              folderId: "${folderId}"
            }) {
              id
              folders {
                id
                parent {
                  id
                }
              }
            }
          }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    expect(_.get(result, 'fileTemporalDataObject.id')).toBeDefined();
  });

  it('should unfile the TDO from the folder ', async () => {
    const query = `mutation {
            unfileTemporalDataObject(input: {
              tdoId: "${tdoId}"
              folderId: "${folderId}"
            }) {
              id
              folders {
                id
              }
            }
          }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    let unfileTemporalDataObject = _.get(result, 'unfileTemporalDataObject');
    expect(unfileTemporalDataObject.id).toBeDefined();
    expect(unfileTemporalDataObject.folders).toEqual([]);
  });

  it('move tdo to new folder', async () => {
    const tdoQuery = `
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
    const resultTDO = await gqlClient.query(tdoQuery, null, aiwareOptions);
    tdoId2 = _.get(resultTDO, 'createTDO.id', null);
    expect(tdoId).toBeDefined();

    const query = `mutation {
          moveTemporalDataObject(input: {
            tdoId: "${tdoId2}"
            oldFolderId: "${folderId}"
            newFolderId: "${folderId1}"
          }) {
            id
            folders {
              id
              treeObjectId
            }
          }
        }`;
    const result = await gqlClient.query(query, null, aiwareOptions);
    expect(result.moveTemporalDataObject.id).toEqual(tdoId2);
  });

  afterAll(async () => {
    // Clean up asset
    if (assetId) {
      await safe(`delete asset ${assetId}`, async () => {
        const query = `mutation deleteAsset {
          deleteAsset(id: "${assetId}") {
              id
          }
      }`;
        await gqlClient.query(query, null, aiwareOptions);
      });
    }

    // Clean up TDOs
    const tdoIds = [tdoId, tdoId1, tdoId2].filter(Boolean);
    for (const id of tdoIds) {
      await safe(`delete TDO ${id}`, async () => {
        const query = `mutation { deleteTDO(id: "${id}") { id } }`;
        await gqlClient.query(query, null, aiwareOptions);
      });
    }

    // Clean up folders
    const folderIds = [folderId, folderId1].filter(Boolean);
    for (const id of folderIds) {
      await safe(`delete folder ${id}`, async () => {
        const query = `mutation { deleteFolder(input: { id: "${id}", orderIndex: 0 }) { id } }`;
        await gqlClient.query(query, null, aiwareOptions);
      });
    }
  });
});

async function getOrganization(name, ignoreExpect) {
  const getOrgQuery = `
      query getOrganization {
        organizations(
          name: "${name}"
          nameMatch: contains
        ) {
          records {
            id
            guid
            name
            jsondata
            users {
              records {
                name
                id
                organizationGuid
                organizationId
                organizationGuids
                authGroups {
                  records {
                    id
                    name
                    description
                  }
                }
                roles{
                  id
                } 
                status
              }
            }
          }
        }
      }`;

  const resultOrg = await gqlClient.query(getOrgQuery);
  const applicationOrg = _.get(resultOrg, 'organizations.records[0]');

  if (!ignoreExpect) {
    expect(applicationOrg).toBeDefined();
    expect(applicationOrg.name).toContain(name);
  }

  return applicationOrg;
}

async function setupTestOrganization(prefixName) {
  // create organization
  const queryOrg = `mutation ($kvp: JSONData!, $apps: JSONData) {
        createOrganization (input: {
          name: "${prefixName}-${uuid.v4()}"
          businessUnit: "Legal"
          types: [agency, broadcaster]
          metadata: $kvp
          applications: $apps
        }) {
          id
          guid
          name
          type
          jsondata
        }
      }`;

  const variables = {
    kvp: {
      test: 'value',
      features: {
        automaticPackageCreation: 'enabled'
      }
    },
    apps: []
  };
  const resultOrg = await gqlClient.query(queryOrg, variables);
  expect(resultOrg.createOrganization.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(resultOrg.createOrganization.id).toBeDefined();
  expect(resultOrg.createOrganization.guid).toBeDefined();

  return await getOrganization(prefixName);
}
async function createAdminUser(uniqueId, orgId) {
  const query = `mutation {
    createUser(input: {
    name: "${uniqueId}-admin-user-${uuid.v4()}@localhost"
      organizationId: "${orgId}"
      firstName: "Flow-User"
      lastName: "Admin"
      jsondata: {
        firstName: "Flow-User"
        lastName: "Admin"
      }
      roleIds: ${JSON.stringify(ROLES_IDS)}
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }

  `;
  const result = await gqlClient.query(query);
  return _.get(result, 'createUser.id');
}
async function createApplication(adminOptions) {
  const query = `
      mutation CreateApplicationWithRoles($appRolesInput: [CreateApplicationRole!]) {
        createApplication(input: {
          name: "ci-test-app-role-${uuid.v4()}",
          description: "ci-test-app-role",
          url: "www.example.com",
          checkPermissions: true,
          status: active
          applicationRoles: $appRolesInput
        }) {
          id
          applicationRoles(ownedOnly: false) {
            id
            name
            permissions
          }
        }
      }`;
  const variables = {
    appRolesInput: {
      id: uuid.v4(),
      name: `ci-aiware-test-app-role-${uuid.v4()}`,
      description: 'ci-aiware-test-app-role',
      isPrivate: false,
      isAppEventRole: false,
      permissions: [
        'AIWARE_TDO_CREATE',
        'AIWARE_TDO_DELETE',
        'AIWARE_TDO_READ',
        'AIWARE_TDO_UPDATE'
      ]
    }
  };
  const result = await gqlClient.query(query, variables, adminOptions);
  return _.get(result, 'createApplication');
}
async function createAiwareUser(uniqueId, orgId, aiwareRoleId) {
  const query = `mutation {
    createUser(input: {
    name: "${uniqueId}-aiware-user-${uuid.v4()}@localhost"
      organizationId: "${orgId}"
      firstName: "User"
      lastName: "Aiware"
      jsondata: {
        firstName: "User"
        lastName: "Aiware"
      }
      roleIds: ["${aiwareRoleId}"]
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }

  `;
  const result = await gqlClient.query(query);
  return _.get(result, 'createUser.id');
}

async function getOrCreateOrganization(nameOrg) {
  let applicationOrganization = await getOrganization(nameOrg, true);

  if (!applicationOrganization) {
    applicationOrganization = await setupTestOrganization(nameOrg);
  }

  return applicationOrganization;
}

async function getOrCreateUser(
  applicationOrganization,
  uniqueId,
  isAdmin = false,
  aiwareRoleId
) {
  const users = _.get(applicationOrganization, 'users.records', []) || [];

  const hasAllRoles = (user, roleIds) =>
    _.every(roleIds, (roleId) => user.roles.some((role) => role.id === roleId));

  const isSingleOrgUser = (user) =>
    user.status === 'active' && user.organizationGuids.length === 1;

  if (isAdmin) {
    const adminUsers = users.filter(
      (user) => isSingleOrgUser(user) && hasAllRoles(user, ROLES_IDS)
    );
    if (adminUsers.length === 0) {
      return await createAdminUser(uniqueId, applicationOrganization.id);
    }

    const adminUser =
      _.find(adminUsers, (user) => user.name.includes('admin')) ||
      adminUsers[0];
    return adminUser.id;
  }

  const aiwareRoleIds = [
    'AIWARE_TDO_CREATE',
    'AIWARE_TDO_DELETE',
    'AIWARE_TDO_READ',
    'AIWARE_TDO_UPDATE'
  ];

  const aiwareUsers = users.filter(
    (user) => isSingleOrgUser(user) && hasAllRoles(user, aiwareRoleIds)
  );
  if (aiwareUsers.length === 0) {
    return await createAiwareUser(
      uniqueId,
      applicationOrganization.id,
      aiwareRoleId
    );
  }

  const aiwareUser =
    _.find(aiwareUsers, (user) => user.name.includes('aiware')) ||
    aiwareUsers[0];
  return aiwareUser.id;
}

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}
