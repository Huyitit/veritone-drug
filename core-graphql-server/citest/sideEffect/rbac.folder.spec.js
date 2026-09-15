/* global pending */
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const moment = require('moment');

const citestMarker = global.citestMarker || 'citest-should-delete';
const newOrgName = `${citestMarker}-rbac-org-${uuid.v4()}`;
const newUserName = `${citestMarker}-rbac-admin-${uuid.v4()}@localhost`;
const CMS_Editor = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';
const ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
const testUserPassword = 'testUserPassword';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

describe('Folder', () => {
  const rootFolderType = 'watchlist';

  const testStateObject = {
    testId: null,
    testOtherId: null,
    testName: null,
    testDescription: null,
    testParentId: null,
    testMoveParentId: null,
    testOrderIndex: 0,
    testIsDeleted: false,
    organizationId: null,
    orgRootFolderId: null
  };

  let watchlistId, watchlistName, watchlistTreeObjectId, sharedFolderId;
  let orgGuid, userId, token;
  let authGroupId, authPermissionSetId;
  let useRBACFeature = false;
  let gqlClient;
  let testOrgId, testOrgGuid;
  let userOptions, adminOption;
  let testUserToken;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    token = result.token;
    adminOption = helpers.requestOptions(token);

    const originInfo = await gqlClient.query(meGql);
    expect(originInfo).toBeDefined();
    expect(originInfo.me).toBeDefined();
    expect(originInfo.me.name).toBeDefined();
    expect(originInfo.me.organization).toBeDefined();
    expect(originInfo.me.organization.guid).toBeDefined();
    expect(originInfo.me.organization.name).toBeDefined();

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    const hasRBACAuthModule = _.has(introspectionQuery, '__type.name');

    // create organization with enableRBACFeature
    const testOrg = await setupTestOrganization(gqlClient);
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(newOrgName);
    expect(testOrg.users).toBeDefined();
    expect(testOrg.guid).toBeDefined();
    expect(testOrg.id).toBeDefined();
    testOrgId = testOrg.id;
    testOrgGuid = testOrg.guid;

    // login with new user
    const queryLoginNewUser = `mutation {
      userLogin(input: {
        userName: "${newUserName}"
        password: "${testUserPassword}"
        organizationGuid: "${testOrg.guid}"
      }) {
        token
        user {
          id
          name
        }
        organization {
          id
          guid
          jsondata
        }
      }
    }`;
    const newUser = await gqlClient.query(queryLoginNewUser);
    expect(newUser.userLogin.organization).toBeDefined();
    expect(
      newUser.userLogin.organization.jsondata.features.enableRBACFeature
    ).toEqual('enabled');

    testUserToken = newUser.userLogin.token;
    userOptions = helpers.requestOptions(testUserToken);

    result = await gqlClient.query(
      `
      query {
        me {
          id
          name
          organization {
            id
            guid
            jsondata
          }
        }
      }`,
      {},
      userOptions
    );

    expect(result.me).toBeDefined();
    useRBACFeature =
      hasRBACAuthModule &&
      _.get(result, 'me.organization.jsondata.features.enableRBACFeature') ===
        'enabled';
    orgGuid = _.get(result, 'me.organization.guid');
    userId = _.get(result, 'me.id');
  });

  afterAll(async () => {
    if (authGroupId) {
      const query = `mutation { authGroupDelete(id: "${authGroupId}") { id }}`;
      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authGroupDelete.id).toEqual(authGroupId);

      // recheck authGroup
      const recheckQuery = `query {
          authGroup(id: "${authGroupId}") {
            id
            name
          }
        }`;
      expect(async () =>
        gqlClient.query(recheckQuery, {}, userOptions)
      ).rejects.toThrow(/Authorization group not found/);
    }

    if (authPermissionSetId) {
      const query = `mutation { authPermissionSetDelete(id: "${authPermissionSetId}") { id }}`;
      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.authPermissionSetDelete.id).toEqual(authPermissionSetId);

      // recheck authPermissionSet
      const recheckQuery = `query {
          authPermissionSet(id: "${authPermissionSetId}") {
            id
            name
          }
        }`;

      expect(async () =>
        gqlClient.query(recheckQuery, {}, userOptions)
      ).rejects.toThrow(/Authorization permission set not found/);
    }

    if (userId) {
      const query = `mutation {
        deleteUser(id: "${userId}")  {
          id
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOption);
      expect(result.deleteUser.id).toEqual(userId);

      // recheck delete User
      const recheckQuery = `query {
          user (id: "${userId}") {
            id
            name
          }
        }`;

      expect(async () =>
        gqlClient.query(recheckQuery, {}, adminOption)
      ).rejects.toThrow(/not found/);
    }

    // delete root folder
    // delete org
    if (testOrgId) {
      const query = `mutation {
        updateOrganization(input:{
          id:"${testOrgId}",
          status: "deleted"
        }) {
          id
          name
          status
        }
      }`;
      const result = await gqlClient.query(query, {}, adminOption);
      expect(result.updateOrganization.id).toEqual(testOrgId);

      // recheck delete org
      const recheckQuery = `query {
          organization (id: "${testOrgId}") {
            id
            name
            status
          }
        }`;
      const orgData = await gqlClient.query(recheckQuery, {}, adminOption);
      const orgInfo = orgData.organization;
      expect(orgInfo.id).toEqual(testOrgId);
    }
  });

  describe('RBAC creation', () => {
    it('create auth group with a member (current user)', async () => {
      if (useRBACFeature) {
        const query = `
          mutation {
            authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "desc"
              ownerOrganization: "${orgGuid}"
              members: {
                id: "${userId}",
                memberType: User
              }
            }) {
              id
              name
            }
          }
        `;

        const result = await gqlClient.query(query, {}, userOptions);
        expect(result.authGroupCreate.id).toBeDefined();
        authGroupId = _.get(result, 'authGroupCreate.id');
      }
    });

    it('create auth permission set', async () => {
      if (useRBACFeature) {
        const query = `mutation  {
          authPermissionSetCreate(input: {
            name: "${citestMarker}-permission-test-${uuid.v4()}",
            description: "desc"
            permissions: [
              AIWARE_FOLDER_UPDATE,
              AIWARE_FOLDER_READ,
              AIWARE_FOLDER_DELETE,
              DISCOVERY_FOLDER_SHARE,
              DISCOVERY_FOLDER_READ,
              DISCOVERY_FOLDER_DELETE,
              DISCOVERY_FOLDER_UPDATE,
              DISCOVERY_ACCESS,
              COLLECTIONS_COLLECTIONS_SHARE
            ]
          }){
            id
            permissions
          }
        }`;

        const result = await gqlClient.query(query, {}, userOptions);
        authPermissionSetId = result.authPermissionSetCreate.id;
        expect(result.authPermissionSetCreate.id).toBeDefined();
        expect(result.authPermissionSetCreate.permissions).toEqual(
          expect.arrayContaining([
            'AIWARE_FOLDER_UPDATE',
            'AIWARE_FOLDER_READ',
            'AIWARE_FOLDER_DELETE'
          ])
        );
      }
    });
    it('add org ACE allowing to createTDO', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const query = `mutation  {
          addACEsToResources(
            ids:["${testOrgId}"], 
            resourceType: Organization
            entries: [{
              member: {id: "${authGroupId}", memberType: Group}, 
              permissionSetID: "${authPermissionSetId}"}
            ]) {
            records {
              id
              objectType
              permissionSet {
                id
              }
              objectType
            }
          }
        }`;

      const result = await gqlClient.query(query, {}, userOptions);

      const addedPermSet = _.get(result, 'addACEsToResources.records', []).find(
        (record) => {
          return record.permissionSet.id === authPermissionSetId;
        }
      );
      expect(addedPermSet).toBeDefined();
    });

    it('logs out and logs in again to refresh authInfo.authGroups', async () => {
      if (useRBACFeature) {
        const logoutMutation = `mutation {
          userLogout(token: "${testUserToken}") 
        }`;

        let result = await gqlClient.query(logoutMutation, {}, userOptions);
        expect(result.userLogout).toEqual(true);
        const queryLoginNewUser = `mutation {
          userLogin(input: {
            userName: "${newUserName}"
            password: "${testUserPassword}"
            organizationGuid: "${testOrgGuid}"
          }) {
            token
            user {
              id
              name
            }
            organization {
              id
              guid
              jsondata
            }
          }
        }`;
        const newUser = await gqlClient.query(queryLoginNewUser);
        testUserToken = newUser.userLogin.token;
        userOptions = helpers.requestOptions(testUserToken);
        expect(newUser.userLogin.organization).toBeDefined();
        expect(
          newUser.userLogin.organization.jsondata.features.enableRBACFeature
        ).toEqual('enabled');
      }
    });
  });

  describe('Root Folders', () => {
    it('create root folders', async () => {
      const query = `mutation {
        createRootFolders(rootFolderType: ${rootFolderType}) {
          id
          description
          treeObjectId
          rootFolderTypeId
          typeId
          organizationId
          ownerId
          createdDateTime
          orderIndex
          name
        }
      }`;

      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.createRootFolders).toBeDefined();

      const rootFolders = result.createRootFolders;
      expect(rootFolders.length).toEqual(2);
      expect(rootFolders[0].rootFolderTypeId).toEqual(1);
      expect(rootFolders[0].typeId).toEqual(4);
      expect(rootFolders[0].treeObjectId).toBeDefined();
      expect(rootFolders[1].treeObjectId).toBeDefined();
      expect(rootFolders[0].name).toBeDefined();
      expect(rootFolders[1].name).toBeDefined();
      testStateObject.testParentId = rootFolders[1].treeObjectId;
      testStateObject.testMoveParentId = rootFolders[0].treeObjectId;

      const orgRootFolder = _.head(
        _.filter(rootFolders, (rf) => !_.isNil(rf.organizationId))
      );
      testStateObject.orgRootFolderId = orgRootFolder.id;
    });

    it('add ACEs to root folder', async () => {
      if (useRBACFeature) {
        const query = `mutation  {
            addACEsToResources(
              ids:["${testStateObject.testParentId}", "${testStateObject.testMoveParentId}"], 
              resourceType: Folder
              entries: [{
                member: {id: "${authGroupId}", memberType: Group}, 
                permissionSetID: "${authPermissionSetId}"}
              ]) {
              records {
                id
                objectType
                permissionSet {
                  id
                }
                objectType
              }
            }
          }`;

        const result = await gqlClient.query(query, {}, userOptions);

        const addedPermSet = _.get(
          result,
          'addACEsToResources.records',
          []
        ).find((record) => {
          return record.permissionSet.id === authPermissionSetId;
        });
        expect(addedPermSet).toBeDefined();
      }
    });

    it('get root folders by API Token', async () => {
      const query = `query {
        rootFolders(
          type: ${rootFolderType}
        ) {
          id
          organizationId
        }
      }`;
      const result = await gqlClient.query(query, null, 'testToken');
      const rootFolders = _.get(result, 'rootFolders');
      // should get organization's root Folder when using APIToken
      expect(rootFolders).toBeDefined();
      // expect(rootFolders.length).toEqual(1);
      // expect(rootFolders[0].id).toEqual(testStateObject.orgRootFolderId);
      // expect(rootFolders[0].organizationId).toBeDefined();
    });
  });

  describe('Folders', () => {
    it('create a folder', async () => {
      testStateObject.testName =
        citestMarker + '-test-folders-' + moment().unix();
      testStateObject.testDescription = citestMarker + '-folders-description';
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
      const result = await gqlClient.query(query, {}, userOptions);
      testStateObject.testId = _.get(result, 'createFolder.treeObjectId');

      expect(testStateObject.testId).toBeDefined();
      expect(result.createFolder.id).toBeDefined();
      expect(result.createFolder.name).toEqual(testStateObject.testName);
    });

    it('add ACEs to folder', async () => {
      if (useRBACFeature && testStateObject.testId) {
        const query = `mutation  {
            addACEsToResources(
              ids:["${testStateObject.testId}"], 
              resourceType: Folder
              entries: [{
                member: {id: "${authGroupId}", memberType: Group}, 
                permissionSetID: "${authPermissionSetId}"}
              ]) {
              records {
                id
                objectType
                permissionSet {
                  id
                }
                objectType
              }
            }
          }`;

        const result = await gqlClient.query(query, {}, userOptions);
        const addedPermSet = _.get(
          result,
          'addACEsToResources.records',
          []
        ).find((record) => {
          return record.permissionSet.id === authPermissionSetId;
        });
        expect(addedPermSet).toBeDefined();
      }
    });

    it('create a folder and set ACEs in one call', async () => {
      testStateObject.testName = `${citestMarker}-test-folders-addAce-${moment().unix()}`;
      testStateObject.testDescription = `${citestMarker}-folders-description`;
      const query = `mutation {
        createFolder(input: {
          name: "${testStateObject.testName}",
          description: "${testStateObject.testDescription}",
          parentId: "${testStateObject.testParentId}"
          rootFolderType: ${rootFolderType}
        }) {
          id
          addACEs(
            entries:[{
              member: {
                id: "${authGroupId}", 
                memberType: Group
              }, 
              permissionSetID: "${authPermissionSetId}"
            }]){ records { id } }
        }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.createFolder.id).toBeDefined();
    });

    it('get a folder', async () => {
      const query = `
      fragment folderFields on Folder {
        id
        name
        description
        createdDateTime
        modifiedDateTime
        status
        ownerId
        maxDepth
        orderIndex
        typeId
        subfolders {
          id
          name
          description
        }
        parent {
          treeObjectId
        }
      }
      query {
        folder(id: "${testStateObject.testId}") {
          ...folderFields
        }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.folder.id).toBeDefined();
      expect(result.folder.typeId).toEqual(1);
      expect(_.get(result, 'folder.parent.treeObjectId')).toEqual(
        testStateObject.testParentId
      );
    });

    it('create a watchlist in the folder', async () => {
      const now = moment();
      const query = `mutation CreateWatchlist($input: CreateWatchlist!) {
            createWatchlist(input: $input) {
            id
            name
            treeObjectId
          }
        }`;
      const variables = {
        input: {
          startDateTime: now.toISOString(),
          stopDateTime: now.add(1, 'h').toISOString(),
          name: `${citestMarker} ${now.toISOString()}`,
          cognitiveSearches: [
            {
              mentionStatusId: '1',
              jsonstring: `{"state":{"search":"waterboy","language":"en"},"engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}`
            }
          ],
          sourceTypeIds: ['1'],
          parentFolderId: testStateObject.testId,
          details: {
            targetAudience: {
              ageGroup: [2, 2],
              gender: 3
            }
          },
          subscriptions: [],
          searchIndex: 'mine'
        }
      };

      const result = await gqlClient.query(query, variables, userOptions);
      watchlistId = _.get(result, 'createWatchlist.id');
      watchlistName = _.get(result, 'createWatchlist.name');
      watchlistTreeObjectId = _.get(result, 'createWatchlist.treeObjectId');
      expect(watchlistId).toBeDefined();
      expect(watchlistName).toBeDefined();
      expect(watchlistTreeObjectId).toBeDefined();
    });

    it('update a folder', async () => {
      const query = `mutation {
        updateFolder(input: {
          id: "${testStateObject.testId}"
          name: "${testStateObject.testName}-update"

        }) {
          id
          name
        }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      expect(result.updateFolder.name).toEqual(
        `${testStateObject.testName}-update`
      );
    });

    it('move a folder', async () => {
      const query = `mutation {
        moveFolder(input: {
          treeObjectId: "${testStateObject.testId}"
          prevParentTreeObjectId: "${testStateObject.testParentId}"
          newParentTreeObjectId: "${testStateObject.testMoveParentId}"
          prevOrderIndex: ${testStateObject.testOrderIndex}
          newOrderIndex: ${testStateObject.testOrderIndex}
          rootFolderType: ${rootFolderType}
        }) {
          treeObjectId
          parent {
            treeObjectId
          }
        }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      const moveFolder = result.moveFolder;
      expect(moveFolder.treeObjectId).toEqual(testStateObject.testId);
      expect(moveFolder.parent.treeObjectId).toEqual(
        testStateObject.testMoveParentId
      );
    });

    it('get folderOverview', async () => {
      const query = `query {
        folderOverview(ids: "${testStateObject.testId}", rootFolderType: watchlist) {
          treeObjectIds
        }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      const folderOverview = result.folderOverview;
      // expect(folderOverview.childFoldersCount).toEqual(0);
      // expect(folderOverview.childNonFolderObjectsCount).toEqual(1);
      // expect(_.get(folderOverview, 'treeObjectIds.0')).toEqual(
      //   watchlistTreeObjectId
      // );
      expect(folderOverview).toBeDefined();
    });

    it('get folderSummaryDetails', async () => {
      const query = `query ($ids: [ID!]!) {
        folderSummaryDetails(ids: $ids, rootFolderType: watchlist) {
          id
          treeObjectId
          typeId
          childFoldersCount
          childNonFolderObjectsCount
          childWatchlistsIds
          createdBy {
            id
          }
          depth
          fingerprints
          marketCount
          trackMyPrograms
          mediaSourceTypeIds
          orderIndex
          parentTreeObjectId
          programCount
          searchTerms
          trackingUnitName
          trackingUnitStartDate
          trackingUnitStopDate
          createdDateTime
          modifiedDateTime
        }
      }`;

      const variables = {
        ids: [testStateObject.testId]
      };
      const result = await gqlClient.query(query, variables, userOptions);
      const folderSummaryDetails = result.folderSummaryDetails;
      expect(folderSummaryDetails).toBeDefined();
    });

    it('delete watchlist in the folder', async () => {
      const query = `mutation  {
        deleteWatchlist(id: "${watchlistId}") {
          id
        }
      }`;

      const result = await gqlClient.query(query, {}, userOptions);
      const deletedId = _.get(result, 'deleteWatchlist.id');
      expect(deletedId).toEqual(watchlistId);
    });

    it('delete a folder', async () => {
      const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.testId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      testStateObject.testIsDeleted = true;
      expect(result.deleteFolder.id).toEqual(testStateObject.testId);
    });

    it('throw folder not found after deleting', async () => {
      const query = `query {
        folder(id: "${testStateObject.testId}") {
          id
          name
          description
        }
      }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
    });

    it('share a folder', async () => {
      const query = `mutation {
        shareFolder (input: {treeObjectId: "${testStateObject.testParentId}", readOrganizationIds: [${testOrgId}]}) {
          id
          treeObjectId
          sharedWith {
            read
            write
          }
        }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      const { shareFolder } = result;
      expect(shareFolder.id).toBeDefined();
      sharedFolderId = shareFolder.id;
      expect(shareFolder.treeObjectId).toEqual(testStateObject.testParentId);
      expect(shareFolder.sharedWith.read).toContainEqual(Number(testOrgId));
    });

    it('fetch shared folder by id', async () => {
      const query = `query($id: ID!) {
         folder(id: $id) {
            id
            sharedAccess
         }
      }`;
      if (sharedFolderId) {
        const variables = {
          id: sharedFolderId
        };

        const result = await gqlClient.query(query, variables, userOptions);
        const { folder } = result;
        expect(folder.id).toEqual(sharedFolderId);
        expect(folder.sharedAccess).toContainEqual('read');
      }
    });

    it('fetch shared folders', async () => {
      const query = `query {
         sharedFolders {
            id
            sharedWith {
              read
              write
            }
         }
      }`;
      const result = await gqlClient.query(query, {}, userOptions);
      const { sharedFolders } = result;
      expect(sharedFolders).toBeDefined();
    });
  });
});

const meGql = `
query {
  me {
    id
    name
    organization {
      id
      name
      guid
      jsondata
    }
    authGroups {
      records {
        id
        name
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

const getOrgGQL = `
query getOrganization($orgName: String) {
  organizations(
    name: $orgName
    nameMatch: contains
  ) {
    records {
      id
      guid
      name
      rootFolder {
        id
        name
        description
      }
      users {
        records {
          name
          id
          organizationGuid
          organizationId
          authGroups {
            records {
              id
              name
              description
            }
          }
        }
      }
    }
  }
}`;

async function setupTestOrganization(client) {
  // set up organization and users
  const orgName = newOrgName;
  const createOrgGql = `mutation ($kvp: JSONData!, $apps: JSONData) {
    createOrganization (input: {
      name: "${orgName}"
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
      features: {
        enableRBACFeature: 'enabled'
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
  };
  const org = await client.query(createOrgGql, variables);
  const newOrgGuid = _.get(org, 'createOrganization.guid');
  const newOrgId = _.get(org, 'createOrganization.id');

  // newFilePicker flag should be enabled in the new organization
  const useNewFilePickerFeature = _.get(
    org,
    'createOrganization.jsondata.features.newFilePicker'
  );
  expect(useNewFilePickerFeature).toEqual('enabled');

  // create admin
  // "ddca9b68-d775-4934-8ffd-7aecc779b652",
  const createAdminUser = `mutation {
    createUser(input: {
      name: "${newUserName}"
      password: "${testUserPassword}"
      organizationId: "${newOrgId}"
      roleIds: [
        "${ADMIN_ROLE}",
        "${CMS_Editor}",
      ]
      firstName: "First"
      lastName: "Last"
      jsondata: {
        firstName: "RBAC-User"
        lastName: "Admin"
      }
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }`;
  const newAdmin = await client.query(createAdminUser, {});
  expect(newAdmin.createUser.id).toBeDefined();
  expect(newAdmin.createUser.name).toBeDefined();

  const result = await client.query(getOrgGQL, { orgName: orgName });

  const testOrg = _.get(result, 'organizations.records[0]');
  return testOrg;
}
