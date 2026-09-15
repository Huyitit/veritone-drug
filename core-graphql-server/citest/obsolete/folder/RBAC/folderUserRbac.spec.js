const helpers = require('../../../helpers/index');
const orgHelper = require('../../../helpers/organization');
const userHelper = require('../../../helpers/user');
const folderHelper = require('../../../helpers/folder');
const tdoHelper = require('../../../helpers/tdo');
const rbacHelper = require('../../../helpers/rbacHelper');
const GraphqlClient = require('../../../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../../../helpers/superadminSession');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');
const util = require('../../../../util')();

const citestMarker = globalThis.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
let testSetup;

describe('citest_folder: rbac user', () => {
  let superUserId, superToken;
  let session;
  let testOrg, testUsers, adminUser, regularUser;
  let restrictUser, secondRestrictUser;
  let privateAuthGroupId;
  let adminToken, adminOptions;
  let regularToken, regularOptions;
  let restrictOptions, secondRestrictOptions;
  let useRBACFeature;
  let createdSDOId, createdSchemaId;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);

    // T17: This suite previously ran on the SHARED superadmin session (sys_graphql_citest_superadmin),
    // which is an admin MEMBER of every test org it creates (setupTestOrgAndUser enrolls the caller).
    // Concurrent specs (MAX_WORKERS=2) delete their test org in teardown; org-delete enumerates all
    // active members and calls removeAllUserSessions(userId) on each — GLOBAL, not org-scoped — which
    // DELETEs every one of the shared superadmin's session tokens (including this suite's) at any point
    // during the run. Bearer validation is per-token-key existence, so a killed token never recovers.
    // Fix: same isolation guardrail as T15/T16/T19 — a throwaway superadmin that is a member of no org
    // except its own, so no other spec's org-delete/user-delete/OLP-toggle can enumerate or kill it.
    // See helpers/superadminSession.js.
    //
    // This suite uses BOTH auth styles, so both must be fed from the isolated session:
    //   - implicit-auth call sites (introspection + meGql in this beforeAll) read gqlClient.userAuth,
    //     which createIsolatedSuperadmin's internal connect() leaves pointing at the vulnerable shared
    //     bootstrap superadmin — so we must overwrite it here.
    //   - explicit-token call sites (setupTestOrgAndUser, impersonateUser, deleteOrganization) take
    //     superToken, which we point at the isolated session's token.
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options;
    superToken = session.token;

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    // Since this test creates new org, we only need to check for env setting
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    const result = await gqlClient.query(meGql);

    expect(result.me).toBeDefined();
    superUserId = _.get(result, 'me.id');

    testSetup = await orgHelper.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superToken },
      createOrgAndUserInput
    );

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');
    // test users + superadmin who created the org
    expect(testUsers.length).toEqual(6);

    // Login for Admin user
    adminUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'adminUser';
    });
    adminOptions = adminUser.requestOptions;

    // Login for Regular user
    regularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'regularUser';
    });
    regularOptions = regularUser.requestOptions;

    // Login for Restrict user
    restrictUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'restrictUser';
    });
    restrictOptions = restrictUser.requestOptions;

    // Login for Secondary Restrict user
    secondRestrictUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'secondRestrictUser';
    });
    secondRestrictOptions = secondRestrictUser.requestOptions;
  });
  describe('Object operations', () => {
    let contentFolderTemplateId;

    describe('with Regular user', () => {
      let result, cmsRootFolderId, newFolderId, newTDOId;
      beforeAll(async () => {
        // Login as Regular user
        result = await gqlClient.query(meGql, {}, regularOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-regular-user`
        );
      });
      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: regularOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: regularOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'test folder for rbac created by regular user',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        newFolderId = _.get(createFolder, 'id');
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                status: "uploaded"
                name: "${citestMarker}-tdo-${uuid.v4()}"
                parentFolderId: "${newFolderId}"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'createTDO')).toBeDefined();
        expect(_.get(result, 'createTDO.id')).toBeDefined();
        expect(_.get(result, 'createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'createTDO.id');
      });
      it('should get the folder and the tdo by id', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        result = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOptions },
          { id: newFolderId }
        );
        expect(_.get(result, 'folder.id')).toBeDefined();
        expect(_.get(result, 'folder.name')).toContain(
          `${citestMarker}-folder`
        );
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObject(
              id: "${newTDOId}"
            ) {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'temporalDataObject.id')).toBeDefined();
        expect(_.get(result, 'temporalDataObject.name')).toContain(
          `${citestMarker}-tdo`
        );
      });
      it('should be able to do getACLForResources on the owned objects', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO ACEs

        const getResourcesACL = await gqlClient.query(
          `query getResourcesACL {
            getACLForResources(
              resourceType: TDO
              ids: ["${newTDOId}"]
            ) {
              records {
                id
              }
            }
          }`,
          {},
          regularOptions
        );

        const resourcesACL = _.get(getResourcesACL, 'getACLForResources');
        expect(_.get(resourcesACL, 'records')).toBeDefined();
        expect(_.get(resourcesACL, 'records[0].id')).toContain(newTDOId);
      });

      it('should get tdo through scrolling all temporal data objects (should have only 1)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObjects(
              offset: 0
              limit: 50
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          regularOptions
        );
        const TDOs = _.get(result, 'temporalDataObjects.records');
        expect(TDOs.length).toEqual(1);
      });
      it('should get tdo through search (should be only 1)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObjects(
              offset: 0
              limit: 50
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          regularOptions
        );
        const TDOs = _.get(result, 'temporalDataObjects.records');
        expect(TDOs.length).toEqual(1);
      });
      it('should create Data Registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createDataRegistry {
            createDataRegistry(
              input: {
                id: "${uuid.v4()}"
                name: "${citestMarker}-data-registry-${uuid.v4()}"
                description: "test data registry for rbac auth group and permission set operations"
                source: "citest-source"
              }
            ) {
              id
              name
              description
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'createDataRegistry')).toBeDefined();
        expect(_.get(result, 'createDataRegistry.name')).toContain(
          `${citestMarker}-data-registry`
        );
        testOrg.dataRegistryId = _.get(result, 'createDataRegistry.id');
      });
      it('should create Schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `mutation createSchema {
            createSchema(
              input: {
                id: "${uuid.v4()}"
                dataRegistryId: "${testOrg.dataRegistryId}"
                majorVersion: 1
                minorVersion: 0
                status: published
                definition: {
                  type: "object"
                  properties: {
                    name: {
                      type: "string"
                    }
                  }
                }
              }
            ) {
              id
              majorVersion
              minorVersion
              status
              definition
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createSchema')).toBeDefined();
        expect(_.get(result, 'createSchema.id')).toBeDefined();

        createdSchemaId = _.get(result, 'createSchema.id');
      });
      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createSDO {
            createStructuredData(
              input: {
                schemaId: "${createdSchemaId}"
                data: {
                  name: "test SDO"
                }
              }
            ) {
              id
              data
              schemaId
            }
          }`,
          {},
          regularOptions
        );

        createdSDOId = _.get(result, 'createStructuredData.id');

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `test SDO`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
      });
      it('should get the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Re-impersonate the regular user to ensure the token is fresh
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: regularUser.userId, organizationGuid: testOrg.guid }
        );
        regularOptions = impersonated.requestOptions;

        result = await gqlClient.query(
          `query getSDO {
            structuredData(
              id: "${createdSDOId}"
              schemaId: "${createdSchemaId}"
            ) {
              id
              data
              schemaId
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'structuredData.id')).toBeDefined();
        expect(_.get(result, 'structuredData.schemaId')).toEqual(
          createdSchemaId
        );
        expect(_.get(result, 'structuredData.data.name')).toContain(`test SDO`);
      });
      it('should be able to create Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await folderHelper.helpCreateFolderContentTemplate(
          { gqlClient, options: regularOptions },
          {
            folderId: newFolderId,
            sdoId: createdSDOId,
            schemaId: createdSchemaId
          }
        );
        const folderContentTemplate = _.get(
          result,
          'createFolderContentTemplate'
        );
        expect(folderContentTemplate.id).toBeDefined();
        expect(folderContentTemplate.sdoId).toEqual(createdSDOId);
        contentFolderTemplateId = folderContentTemplate.id;
      });
      it('should be able to update Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation updateFolderContentTemplate {
            updateFolderContentTemplate (input: {
              id: "${contentFolderTemplateId}"
              sdoId: "${createdSDOId}"
            }) {
              id
              sdoId
              createdDateTime
              modifiedDateTime
            }
          }`,
          {},
          regularOptions
        );
        const folderContentTemplate = _.get(
          result,
          'updateFolderContentTemplate'
        );
        expect(folderContentTemplate.id).toBeDefined();
        expect(folderContentTemplate.sdoId).toEqual(createdSDOId);
      });
      it('should be able to create TDO with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation {
            createTDO(
              input: {
                status: "uploaded",
                startDateTime: 1476726655,
                stopDateTime: 1476726755,
                contentTemplates: [{sdoId: "${createdSDOId}", schemaId: "${createdSchemaId}"}]
              }
            ) {
              id
            }
          }`,
          {},
          regularOptions
        );
        const tdo = _.get(result, 'createTDO');
        expect(tdo.id).toBeDefined();
      });
      it('should get all sdos under a schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query getSDOsUnderSchema {
            schema(id: "${createdSchemaId}") {
              structuredDataObjects {
                records {
                  id
                  schemaId
                }
              }
            }
          }
        `,
          {},
          regularOptions
        );
        const sdos = _.get(result, 'schema.structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos.length).toBe(1);
      });
    });
    describe('with Admin user to clean up test data', () => {
      let result;
      let folderIds, TDOIds;
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });
      it('should get all tdos', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObjects(
              offset: 0
              limit: 50
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'temporalDataObjects.records')).toBeDefined();
        TDOIds = _.get(result, 'temporalDataObjects.records').map(
          (tdo) => tdo.id
        );
        expect(TDOIds.length).toEqual(2);
      });
      it('should get all folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(rootFolders, '[0].childFolders.records');
        folderIds = childFolders.map((childFolder) => childFolder.treeObjectId);
        expect(childFolders.length).toBeGreaterThanOrEqual(1);
      });
      it('should delete all folders and tdos', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let deletedCount = 0;
        // Clean up TDOs
        for (let TDOId of TDOIds) {
          // delete TDO
          deletedCount++;
          result = await gqlClient.query(
            `mutation deleteTDOs {
              deleteTDO(
                id: "${TDOId}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        }
        expect(deletedCount).toEqual(2);
        // delete contentFolderTemplateId
        const deleteFolderContentTemplate =
          await folderHelper.helpDeleteContentFolderTemplate(
            { gqlClient, options: adminOptions },
            { id: contentFolderTemplateId }
          );
        expect(deleteFolderContentTemplate.id).toEqual(contentFolderTemplateId);

        deletedCount = 0;
        for (let folderId of folderIds) {
          // delete Folders
          deletedCount++;
          // Get ACL for folder before remove
          const getFolderACL = await gqlClient.query(
            `query getResourcesACL {
              getACLForResources(
                resourceType: Folder
                ids: ["${folderId}"]
              ) {
                records {
                  id
                }
              }
            }`,
            {},
            adminOptions
          );
          let folderACL = _.get(getFolderACL, 'getACLForResources.records');

          for (const ace of folderACL) {
            await rbacHelper.helpRemoveRbac(
              { gqlClient, options: adminOptions },
              {
                resourceType: 'Folder',
                ids: [ace.id]
              }
            );
          }

          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId, orderIndex: 0 }
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('JWT Token Operations', () => {
    let jwtToken, jwtTokenOption;
    let result;
    let newAuthGroup, newAuthPermissionSet;
    let regularUserId;
    let authGroups, authPermissionSets;
    let cmsRootFolderId, newTDOId, newFolderId;
    let acl;

    describe('on normal operations', () => {
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
        // Login as Regular user
        result = await gqlClient.query(meGql, {}, regularOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = _.get(result, 'me.id');

        result = await gqlClient.query(
          `query authGroup {
            authGroups(
              nameRegex: "${testOrg.name}"
            ) {
              records {
                id
                name
                members(memberType: User, limit: 15, offset: 0) {
                  records {
                    member {
                      __typename
                      ... on User {
                        id
                      }
                    }
                  }
                }
              }
            }
          }`,
          {},
          adminOptions
        );
        authGroups = _.get(result, 'authGroups.records');
        expect(authGroups.length).toBeGreaterThanOrEqual(2);

        // the default groups for the organization will include superadmin who created it.
        let hasSuperAdminMember = false;
        for (const g of authGroups) {
          const users = _.get(g, 'members.records', []);
          hasSuperAdminMember = _.some(
            users,
            (u) => _.get(u, 'member.id', '') === superUserId
          );
        }
        expect(hasSuperAdminMember).toEqual(true);

        authPermissionSets = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: adminOptions },
          {
            nameRegex: 'aiWARE',
            authClass: 'System'
          }
        );
        expect(authPermissionSets.length).toEqual(4);

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation authGroupCreate {
            authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "${citestMarker}-auth-group"
            }) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authGroupCreate')).toBeDefined();
        expect(_.get(result, 'authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = _.get(result, 'authGroupCreate');
      });
      it('should add regular user to the new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation authGroupAddMembers{
            authGroupAddMembers(
              id: "${newAuthGroup.id}"
              members: [{
                id: "${regularUserId}"
                memberType: User
              }]
            ) {
              id
              name
              description
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authGroupAddMembers')).toBeDefined();
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addPermSet {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
                description: "${citestMarker}-auth-permission-set"
                permissions: [AIWARE_TDO_CREATE,  AIWARE_TDO_DELETE,  AIWARE_TDO_READ,  AIWARE_TDO_SEARCH,  AIWARE_TDO_UPDATE, AIWARE_FOLDER_READ, RECORDING_READ]
              }
            ) {
              id
              name
              permissions
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'test folder for rbac by admin for JWT token test',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        newFolderId = _.get(createFolder, 'id');
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            ids: [newFolderId],
            resourceType: 'Folder',
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: 'Group'
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          }
        );

        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (let ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                status: "uploaded"
                name: "${citestMarker}-tdo-${uuid.v4()}"
                parentFolderId: "${newFolderId}"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'createTDO')).toBeDefined();
        expect(_.get(result, 'createTDO.id')).toBeDefined();
        expect(_.get(result, 'createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'createTDO.id');
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            ids: [newTDOId],
            resourceType: 'TDO',
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: 'Group'
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          }
        );

        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (let ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newTDOId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });

      it('should not move TDO without AIWARE_FOLDER_FILE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const defaultGroupIds = authGroups.map((g) => g.id);
        for (const groupId of defaultGroupIds) {
          await gqlClient.query(
            `mutation {
              authGroupRemoveMembers(id: "${groupId}", memberIds: ["${regularUserId}"]) { id }
            }`,
            {},
            adminOptions
          );
        }

        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: regularUserId, organizationGuid: testOrg.guid }
        );
        const restrictedRegularOptions = impersonated.requestOptions;

        try {
          await expect(
            tdoHelper.helpMoveTDO(
              { gqlClient, options: restrictedRegularOptions },
              {
                tdoId: newTDOId,
                oldFolderId: newFolderId,
                newFolderId: cmsRootFolderId
              }
            )
          ).rejects.toThrow(
            /No authorization access role found for Mutation.moveTemporalDataObject/
          );
        } finally {
          for (const groupId of defaultGroupIds) {
            await gqlClient.query(
              `mutation {
                authGroupAddMembers(id: "${groupId}", members: [{ id: "${regularUserId}", memberType: User }]) { id }
              }`,
              {},
              adminOptions
            );
          }
        }
      });
      it('should not create root folder without AIWARE_FOLDER_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const defaultGroupIds = authGroups.map((g) => g.id);
        for (const groupId of defaultGroupIds) {
          await gqlClient.query(
            `mutation {
              authGroupRemoveMembers(id: "${groupId}", memberIds: ["${regularUserId}"]) { id }
            }`,
            {},
            adminOptions
          );
        }

        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: regularUserId, organizationGuid: testOrg.guid }
        );
        const restrictedRegularOptions = impersonated.requestOptions;

        try {
          await expect(
            folderHelper.helpCreateRootFolders(
              { gqlClient, options: restrictedRegularOptions },
              'cms'
            )
          ).rejects.toThrow(
            /No authorization access role found for Mutation.createRootFolders/
          );
        } finally {
          for (const groupId of defaultGroupIds) {
            await gqlClient.query(
              `mutation {
                authGroupAddMembers(id: "${groupId}", members: [{ id: "${regularUserId}", memberType: User }]) { id }
              }`,
              {},
              adminOptions
            );
          }
        }
      });
      it('Should create JWT token and query regular user', async () => {
        // Assign Payload for JWT token
        result = await gqlClient.query(
          `mutation getEngJWT {
            getEngineJWT(
              input: {
                resource: {
                  userId: "${regularUserId}"
                  tdoId: "${newTDOId}"
                }
              }
            ) {
              token
            }
          }`,
          {},
          adminOptions
        );
        jwtToken = _.get(result, 'getEngineJWT.token');
        expect(jwtToken).toBeDefined();
        jwtTokenOption = helpers.requestOptions(jwtToken);
      });
      it('Should query new TDO using JWT token', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query TDO {
            temporalDataObject(
              id: ${newTDOId}
            ) {
              id
              name
            }
          }`,
          {},
          jwtTokenOption
        );
        expect(_.get(result, 'temporalDataObject.id')).toEqual(newTDOId);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const authGroups = await rbacHelper.helpGetGroup({
          gqlClient,
          options: adminOptions
        });
        for (let g of authGroups) {
          let error;
          try {
            result = await gqlClient.query(
              `mutation deleteAuthG {
                authGroupDelete(
                  id: "${g.id}"
                ) {
                  id
                }
              }`,
              {},
              adminOptions
            );
          } catch (e) {
            error = e;
          }
          if (g.name.includes(`${citestMarker}-org`)) {
            expect(_.toString(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }

        const authGroupsData = await rbacHelper.helpGetGroup({
          gqlClient,
          options: adminOptions
        });
        expect(authGroupsData.length).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const permissionSets = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: adminOptions },
          {
            nameRegex: `${citestMarker}-auth-permission-set`
          }
        );
        for (let ps of permissionSets) {
          result = await rbacHelper.helpDeleteAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              id: ps.id
            }
          );
        }

        const authPermissionSets = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: adminOptions },
          {
            nameRegex: `${citestMarker}-auth-permission-set`
          }
        );
        expect(authPermissionSets.length).toEqual(0);
      });
      it('Should NOT query new folder using JWT token', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let error;
        try {
          result = await gqlClient.query(
            `query TDO {
              temporalDataObject(
                id: ${newTDOId}
              ) {
                id
                name
              }
            }`,
            {},
            jwtTokenOption
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
      });
      it('Should delete new folder', async () => {
        const deleteFolder = await folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          { folderId: newFolderId, orderIndex: 0 }
        );
        expect(_.get(deleteFolder, 'id')).toEqual(newFolderId);
      });
      it('Should delete new TDO', async () => {
        result = await gqlClient.query(
          `mutation deleteTDOs {
            deleteTDO(
              id: "${newTDOId}"
            ) {
              id
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'deleteTDO.id')).toEqual(newTDOId);
      });
    });
  });

  describe('Manage access to resources', () => {
    let result;
    let defaultAGsToRemoveMember = [];
    let acl;
    let cmsRootFolderId;
    let folderIds = [];
    let newAuthPermissionSet;
    let restrictedFolderId;
    let restrictedFolderName;
    let schemaId, sdoFolderId, sdoId, sdoFolderContentTemplateId;

    beforeAll(async () => {
      // check restrictUser logins
      result = await gqlClient.query(meGql, {}, restrictOptions);
      expect(_.get(result, 'me.name')).toContain(
        `${citestMarker}-first-restrict-user`
      );
      defaultAGsToRemoveMember = _.get(result, 'me.authGroups.records', []);

      const rootFolders = await folderHelper.helpGetRootFolders(
        { gqlClient, options: adminOptions },
        'cms'
      );
      expect(rootFolders.length).toBeGreaterThan(0);
      expect(_.get(rootFolders[0], 'name')).toContain('cms');
      cmsRootFolderId = _.get(rootFolders[0], 'id');
    });

    it('should removes restrict users from default AGs', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const authGroupIds = _.map(defaultAGsToRemoveMember, 'id');

      if (authGroupIds.length > 0) {
        result = await Promise.all(
          authGroupIds.map((id) =>
            gqlClient.query(
              `mutation authGroupRemoveMembers {
                authGroupRemoveMembers(
                  id: "${id}",
                  memberIds: ["${restrictUser.userId}", "${secondRestrictUser.userId}"]
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

    it('should not be able to create Folder Content Template without AIWARE_SDO_READ permission', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `mutation createDataRegistry {
          createDataRegistry(
            input: {
              id: "${uuid.v4()}"
              name: "${citestMarker}-data-registry-${uuid.v4()}"
              description: "test data registry for rbac auth group and permission set operations"
              source: "citest-source"
            }
          ) {
            id
            name
            description
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'createDataRegistry')).toBeDefined();
      expect(_.get(result, 'createDataRegistry.name')).toContain(
        `${citestMarker}-data-registry`
      );
      testOrg.dataRegistryId = _.get(result, 'createDataRegistry.id');
      result = await gqlClient.query(
        `mutation createSchema {
          createSchema(
            input: {
              id: "${uuid.v4()}"
              dataRegistryId: "${testOrg.dataRegistryId}"
              majorVersion: 1
              minorVersion: 0
              status: draft
              definition: {
                type: "object"
                properties: {
                  name: {
                    type: "string"
                  }
                }
              }
            }
          ) {
            id
            majorVersion
            minorVersion
            status
            definition
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'createSchema')).toBeDefined();
      expect(_.get(result, 'createSchema.id')).toBeDefined();

      schemaId = _.get(result, 'createSchema.id');

      expect(schemaId).toBeDefined();

      result = await gqlClient.query(
        `mutation updateSchema {
          updateSchemaState(
            input: {
              id: "${schemaId}"
              status: published
            }
          ) {
            id
            status
          }
        }`,
        {},
        adminOptions
      );

      expect(_.get(result, 'updateSchemaState.id')).toBeDefined();
      expect(_.get(result, 'updateSchemaState.status')).toEqual('published');

      const createFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: regularOptions },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'test folder for rbac created by regular user',
          parentId: cmsRootFolderId,
          rootFolderType: 'cms'
        }
      );
      expect(createFolder).toBeDefined();
      expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
      sdoFolderId = _.get(createFolder, 'id');
      folderIds.push(sdoFolderId);

      // grant access folder to restrictUser
      const folderPermissionRes = await gqlClient.query(
        `mutation addPermSet {
           authPermissionSetCreate(
             input: {
               name: "${citestMarker}-folder-permission-set-${uuid.v4()}"
               description: "${citestMarker}-folder-permission-set"
               permissions: [
                 AIWARE_FOLDER_UPDATE
               ]
             }
           ) {
             id
             name
             permissions
           }
         }`,
        {},
        adminOptions
      );
      expect(
        _.get(folderPermissionRes, 'authPermissionSetCreate')
      ).toBeDefined();
      expect(
        _.get(folderPermissionRes, 'authPermissionSetCreate.name')
      ).toContain(`${citestMarker}-folder-permission-set`);
      const folderPermissionSets = _.get(
        folderPermissionRes,
        'authPermissionSetCreate'
      );

      await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: adminOptions },
        {
          ids: [sdoFolderId],
          resourceType: 'Folder',
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: 'User'
              },
              permissionSetID: folderPermissionSets.id
            }
          ]
        }
      );

      result = await gqlClient.query(
        `mutation createSDO {
          createStructuredData(
            input: {
              schemaId: "${schemaId}"
              data: {
                name: "test SDO"
              }
            }
          ) {
            id
            data
            schemaId
          }
        }`,
        {},
        regularOptions
      );

      sdoId = _.get(result, 'createStructuredData.id');
      // Login for Restrict user
      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictUser.userId, organizationGuid: testOrg.guid }
      );
      restrictOptions = impersonated.requestOptions;

      await expect(
        folderHelper.helpCreateFolderContentTemplate(
          { gqlClient, options: restrictOptions },
          {
            folderId: sdoFolderId,
            sdoId: sdoId,
            schemaId: schemaId
          }
        )
      ).rejects.toThrow(
        /No authorization access role found for Mutation.createFolderContentTemplate/
      );
    });

    it('should be able to create Folder Content Template with AIWARE_SDO_READ permission', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [
                AIWARE_SDO_READ,
              ]
            }
          ) {
            id
            name
            permissions
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      const sdoPermissionSets = _.get(result, 'authPermissionSetCreate');
      result = await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: adminOptions },
        {
          ids: [schemaId],
          resourceType: 'SDOSchema',
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: 'User'
              },
              permissionSetID: sdoPermissionSets.id
            }
          ]
        }
      );

      // re impersonateUser to reset role
      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictUser.userId, organizationGuid: testOrg.guid }
      );

      restrictOptions = impersonated.requestOptions;

      result = await folderHelper.helpCreateFolderContentTemplate(
        { gqlClient, options: restrictOptions },
        {
          folderId: sdoFolderId,
          sdoId: sdoId,
          schemaId: schemaId
        }
      );

      const folderContentTemplate = _.get(
        result,
        'createFolderContentTemplate'
      );
      expect(folderContentTemplate.id).toBeDefined();
      expect(folderContentTemplate.sdoId).toEqual(sdoId);
      sdoFolderContentTemplateId = folderContentTemplate.id;
    });

    it('should create a new permission set', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.query(
        `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [
                AIWARE_FOLDER_UPDATE,
                AIWARE_FOLDER_READ,
                AIWARE_FOLDER_DELETE,
                AIWARE_FOLDER_CREATE,
                AIWARE_FOLDER_FILE
              ]
            }
          ) {
            id
            name
            permissions
          }
        }`,
        {},
        adminOptions
      );
      expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
    });

    it('should share Root Folder Access with restrict users', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: adminOptions },
        {
          ids: [cmsRootFolderId],
          resourceType: 'Folder',
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: 'User'
              },
              permissionSetID: newAuthPermissionSet.id
            },
            {
              member: {
                id: secondRestrictUser.userId,
                memberType: 'User'
              },
              permissionSetID: newAuthPermissionSet.id
            }
          ]
        }
      );

      acl = _.get(result, 'addACEsToResources.records');
      // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 2 ACEs on user level
      expect(acl.length).toEqual(4);

      // add a trick to get user-private auth group id from acl
      const resourceACEOnUserLevel = _.find(acl, (ace) =>
        ace.id.includes(newAuthPermissionSet.id)
      );
      // aceId = resource_type::resource_id::ag_id::ps_id;
      privateAuthGroupId = _.get(resourceACEOnUserLevel, 'id', '').split(
        '::'
      )[2];
    });

    describe('should grant the user access to a private resource', () => {
      it('should not allow restricted users to create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;

        const createFolder = folderHelper.helpCreateFolder(
          { gqlClient, options: restrictOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description:
              'test folder for rbac created by admin for auth group and permission set operations',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );

        await expect(createFolder).rejects.toThrow(
          /No authorization access role found for Mutation.createFolder/
        );
      });

      it('should be able to create Folder with AIWARE_FOLDER_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addPermSet {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
                description: "${citestMarker}-auth-permission-set"
                permissions: [
                  AIWARE_FOLDER_CREATE,
                ]
              }
            ) {
              id
              name
              permissions
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        const folderPermissionSets = _.get(result, 'authPermissionSetCreate');

        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: Organization
              ids: ["${testOrg.id}"]
              entries: [
                {
                  member: {
                    id: "${restrictUser.userId}"
                    memberType: User
                  }
                  permissionSetID: "${folderPermissionSets.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );

        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;

        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: restrictOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description:
              'test folder for rbac created by admin for auth group and permission set operations',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        restrictedFolderName = _.get(createFolder, 'name');
        restrictedFolderId = _.get(createFolder, 'id');
        folderIds.push(restrictedFolderId);
      });

      it('should not create TDO without AIWARE_TDO_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictOptions },
          { id: cmsRootFolderId }
        );
        expect(_.get(folderResult, 'folder.id')).toEqual(cmsRootFolderId);
        const createTDO = tdoHelper.helpCreateTDO(
          { gqlClient, options: restrictOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            parentFolderId: cmsRootFolderId,
            status: 'uploaded',
            startDateTime: 1476726655,
            stopDateTime: 1476726655
          }
        );
        await expect(createTDO).rejects.toThrow(
          /No authorization access role found for Mutation.createTDO/
        );
      });

      it('should not create TDO with Asset without AIWARE_TDO_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictOptions },
          { id: cmsRootFolderId }
        );
        expect(_.get(folderResult, 'folder.id')).toEqual(cmsRootFolderId);
        const createTDOWithAsset = tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: restrictOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            parentFolderId: cmsRootFolderId,
            uri: 'https://s3.amazonaws.com/hold4fisher/s3Test.mp4',
            startDateTime: 1476726655,
            stopDateTime: 1476726655
          }
        );
        await expect(createTDOWithAsset).rejects.toThrow(
          /No authorization access role found for Mutation.createTDOWithAsset/
        );
      });

      it('should verify owner access', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );

        restrictOptions = impersonated.requestOptions;

        result = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictOptions },
          { id: restrictedFolderId }
        );

        expect(_.get(result, 'folder.id')).toEqual(restrictedFolderId);
      });
      it('should allow a restricted user to update a folder they created', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const impersonated = await await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;
        const result = await gqlClient.query(
          `mutation updateFolder {
            updateFolder(
              input: {
                id: "${restrictedFolderId}"
                name: "${restrictedFolderName}-updated"
              }
            ) {
              id
              name
            }
          }`,
          {},
          restrictOptions
        );
        expect(_.get(result, 'updateFolder')).toBeDefined();
        expect(_.get(result, 'updateFolder.name')).toContain(
          `${restrictedFolderName}-updated`
        );
      });
      it('should verify user access when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: secondRestrictUser.userId, organizationGuid: testOrg.guid }
        );
        secondRestrictOptions = impersonated.requestOptions;

        await expect(
          folderHelper.helpGetFolder(
            { gqlClient, options: secondRestrictOptions },
            { id: restrictedFolderId }
          )
        ).rejects.toThrow();
        // /The folder was not found. It either does not exist or you or your organization do not have access to it./
      });
      it('should verify user access for updating folder when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: secondRestrictUser.userId, organizationGuid: testOrg.guid }
        );
        secondRestrictOptions = impersonated.requestOptions;

        const query = `mutation updateFolder {
            updateFolder(
              input: {
                id: "${restrictedFolderId}"
                name: "${restrictedFolderName}-updated"
              }
            ) {
              id
              name
            }
          }`;

        await expect(
          gqlClient.query(query, {}, secondRestrictOptions)
        ).rejects.toThrow();
        // /The folder was not found. It either does not exist or you or your organization do not have access to it./
      });

      it('should not share folder without AIWARE_ADMIN_SUPERADMIN permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;

        const userFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: restrictOptions },
          {
            name: `${citestMarker}-user-owned-folder-${uuid.v4()}`,
            description: 'test folder created by restrictUser (owner)',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        const userFolderId = _.get(userFolder, 'id');
        folderIds.push(userFolderId);

        const shareFolder = folderHelper.helpShareFolder(
          { gqlClient, options: restrictOptions },
          {
            folderId: userFolderId,
            readOrganizationIds: [Number(testOrg.id)]
          }
        );

        await expect(shareFolder).rejects.toThrow(
          /No authorization access role found for Mutation.shareFolder/
        );
      });

      it('admin shares Private Resource Access with user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Folder',
            ids: [restrictedFolderId],
            entries: [
              {
                member: {
                  id: secondRestrictUser.userId,
                  memberType: 'User'
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          }
        );

        acl = _.get(result, 'addACEsToResources.records');
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 owner + 1 ACE on user level
        expect(acl.length).toEqual(4);
      });
      it('should verify user access when grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: secondRestrictUser.userId, organizationGuid: testOrg.guid }
        );
        secondRestrictOptions = impersonated.requestOptions;

        result = await folderHelper.helpGetFolder(
          { gqlClient, options: secondRestrictOptions },
          { id: restrictedFolderId }
        );
        expect(_.get(result, 'folder.id')).toEqual(restrictedFolderId);
      });
    });

    describe('should grant the user access to specific resources', () => {
      let restrictedFolderId1, restrictedFolderId2;
      it('should create folder', async () => {
        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description:
              'test folder for rbac created by admin for auth group and permission set operations',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        restrictedFolderId1 = _.get(createFolder, 'id');
        folderIds.push(restrictedFolderId1);
      });
      it('should verify user access when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;

        await expect(
          folderHelper.helpGetFolder(
            { gqlClient, options: restrictOptions },
            { id: restrictedFolderId1 }
          )
        ).rejects.toThrow();
        // /The folder was not found. It either does not exist or you or your organization do not have access to it./
      });
      it('should share Folder Resource Access with user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Folder',
            ids: [restrictedFolderId1],
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: 'User'
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          }
        );

        acl = _.get(result, 'addACEsToResources.records');
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 owner ACE + 1 ACE on user level
        expect(acl.length).toEqual(4);
      });
      it('should create Folder and share Folder Resource Access with user - by addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'test folder for rbac with addACEs nested mutation',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms',
            addAcesEntries: `[
                {
                  member: {
                    id: "${restrictUser.userId}"
                    memberType: User
                  }
                  permissionSetID: "${newAuthPermissionSet.id}"
                }
              ]`
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        restrictedFolderId2 = _.get(createFolder, 'id');
        folderIds.push(restrictedFolderId2);

        acl = _.get(createFolder, 'addACEs.records');
        // 1 default ACEs (orgAdmin + aiWARE Full Access) + 1 ACE on user level, ignore inheritance + 1 owner ACE
        expect(acl.length).toEqual(3);
      });
      it('should verify user access when grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;

        result = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictOptions },
          { id: restrictedFolderId1 }
        );
        expect(_.get(result, 'folder.id')).toEqual(restrictedFolderId1);

        result = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictOptions },
          { id: restrictedFolderId2 }
        );
        expect(_.get(result, 'folder.id')).toEqual(restrictedFolderId2);
      });
    });

    describe('should grant the restricted user read access to specific resources', () => {
      let aiwarePermissionsGetFolderId;
      let aiwarePermissionsGetPS;
      let aiwarePermissionsGetTDOId;
      it('should create folder', async () => {
        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description:
              'test folder for rbac created by admin for auth group and permission set operations',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        aiwarePermissionsGetFolderId = _.get(createFolder, 'id');
        folderIds.push(aiwarePermissionsGetFolderId);
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                status: "uploaded"
                name: "${citestMarker}-tdo-${uuid.v4()}"
                parentFolderId: "${aiwarePermissionsGetFolderId}"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createTDO')).toBeDefined();
        expect(_.get(result, 'createTDO.id')).toBeDefined();
        expect(_.get(result, 'createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        aiwarePermissionsGetTDOId = _.get(result, 'createTDO.id');
      });
      it('should create a new permission set with AIWARE_PERMISSIONS_GET permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [AIWARE_PERMISSIONS_GET]
            }
          ) {
            id
            name
            permissions
          }
        }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        aiwarePermissionsGetPS = _.get(result, 'authPermissionSetCreate');
      });
      it('should add restricted user to the new AIWARE_PERMISSIONS_GET permission set', async () => {
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            ids: [aiwarePermissionsGetFolderId],
            resourceType: 'Folder',
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: 'User'
                },
                permissionSetID: aiwarePermissionsGetPS.id
              }
            ]
          }
        );

        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (let ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(aiwarePermissionsGetFolderId) &&
              ace.id.includes(aiwarePermissionsGetPS.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });
      it('should be able to call getACLForResources as restricted user on the folder - resource level', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query getACLForResources {
                  getACLForResources(
                  resourceType: Folder
                  ids: ["${aiwarePermissionsGetFolderId}"]
                  permissions: []
                ) {
                  records {
                    id
                    objectID
                    objectType
                  }
                }
              }`,
          {},
          restrictOptions
        );
        acl = _.get(result, 'getACLForResources.records');
        let checkGroupAdded = false;
        for (let ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(aiwarePermissionsGetFolderId) &&
              ace.id.includes(aiwarePermissionsGetPS.id));
        }
        expect(checkGroupAdded).toEqual(true);
        expect(acl.length).toEqual(4);
      });
      it('should remove AIWARE_PERMISSIONS_GET permission set on resource level and add it again on organization level to restricted user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // get AIWARE_PERMISSIONS_GET ACEs for the folder
        result = await rbacHelper.helpGetAclForResources(
          { gqlClient, options: adminOptions },
          {
            ids: [aiwarePermissionsGetFolderId],
            resourceType: 'Folder'
          }
        );
        acl = _.get(result, 'getACLForResources.records');
        let checkGroupReturned = false;
        for (let ace of acl) {
          checkGroupReturned =
            checkGroupReturned ||
            (ace.id.includes(aiwarePermissionsGetFolderId) &&
              ace.id.includes(aiwarePermissionsGetPS.id));
        }
        expect(checkGroupReturned).toEqual(true);
        expect(acl.length).toEqual(4);
        let folderAceIdsToRemove = '';
        for (let ace of acl) {
          folderAceIdsToRemove =
            ace.member.id.includes(restrictUser.userId) && ace.id;
          if (folderAceIdsToRemove) break;
        }
        expect(folderAceIdsToRemove).toBeDefined();

        // remove AIWARE_PERMISSIONS_GET permission set on resource level
        result = await rbacHelper.helpRemoveRbac(
          { gqlClient, options: adminOptions },
          {
            ids: [folderAceIdsToRemove],
            resourceType: 'Folder'
          }
        );
        expect(_.get(result, 'removeACEsFromResource.records')).toBeDefined();

        // add AIWARE_PERMISSIONS_GET permission set on organization level
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            ids: [testOrg.id],
            resourceType: 'Organization',
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: 'User'
                },
                permissionSetID: aiwarePermissionsGetPS.id
              }
            ]
          }
        );

        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (let ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(testOrg.id) &&
              ace.id.includes(aiwarePermissionsGetPS.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });
      it('should be able to call getACLForResources as restricted user on any resource - organization level', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `query getACLForResources {
                  getACLForResources(
                  resourceType: Folder
                  ids: ["${aiwarePermissionsGetFolderId}"]
                  permissions: []
                ) {
                  records {
                    id
                    objectID
                    objectType
                  }
                }
              }`,
          {},
          restrictOptions
        );
        acl = _.get(result, 'getACLForResources.records');
        expect(acl).toBeDefined();

        result = await gqlClient.query(
          `query getACLForResources {
                  getACLForResources(
                  resourceType: TDO
                  ids: ["${aiwarePermissionsGetTDOId}"]
                  permissions: []
                ) {
                  records {
                    id
                    objectID
                    objectType
                  }
                }
              }`,
          {},
          restrictOptions
        );
        acl = _.get(result, 'getACLForResources.records');
        expect(acl).toBeDefined();
      });
    });

    describe('should grant the restricted user folder permissions and they can create TDO via createTDOWithAsset', () => {
      let folderWithReadAndFilePermissionsId;
      let folderReadAndFilePS;
      it('should create folder', async () => {
        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description:
              'test folder for rbac created by admin for auth group and permission set operations',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        folderWithReadAndFilePermissionsId = _.get(createFolder, 'id');
        folderIds.push(folderWithReadAndFilePermissionsId);
      });

      it('should create a new permission set with folder permissions', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [AIWARE_FOLDER_READ, AIWARE_FOLDER_FILE]
            }
          ) {
            id
            name
            permissions
          }
        }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        folderReadAndFilePS = _.get(result, 'authPermissionSetCreate');
      });

      it('should add restricted user to the new permission set and add org-level TDO_CREATE', async () => {
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            ids: [folderWithReadAndFilePermissionsId],
            resourceType: 'Folder',
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: 'User'
                },
                permissionSetID: folderReadAndFilePS.id
              }
            ]
          }
        );

        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (let ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(folderWithReadAndFilePermissionsId) &&
              ace.id.includes(folderReadAndFilePS.id));
        }
        expect(checkGroupAdded).toEqual(true);
        expect(acl.length).toEqual(4);

        // Add AIWARE_TDO_CREATE + AIWARE_FOLDER_READ + AIWARE_FOLDER_FILE at Organization level
        // createTDOWithAsset requires orgRole: [AIWARE_TDO_CREATE]
        // parentFolderId field requires orgRole: [AIWARE_FOLDER_FILE]
        const orgPermSetResult = await gqlClient.query(
          `mutation addPermSet {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-tdo-create-permission-set-${uuid.v4()}"
                description: "${citestMarker}-tdo-create-permission-set"
                permissions: [AIWARE_TDO_CREATE, AIWARE_FOLDER_READ, AIWARE_FOLDER_FILE]
              }
            ) {
              id
              name
              permissions
            }
          }`,
          {},
          adminOptions
        );
        const orgPermSet = _.get(orgPermSetResult, 'authPermissionSetCreate');
        expect(orgPermSet).toBeDefined();

        result = await gqlClient.query(
          `mutation addRole {
            addACEsToResources(
              resourceType: Organization
              ids: ["${testOrg.id}"]
              entries: [
                {
                  member: {
                    id: "${restrictUser.userId}"
                    memberType: User
                  }
                  permissionSetID: "${orgPermSet.id}"
                }
              ]
            ) {
              records {
                id
                objectType
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'addACEsToResources.records')).toBeDefined();
      });

      it('should be able to create TDO via createTDOWithAsset as restricted user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictUser.userId, organizationGuid: testOrg.guid }
        );
        restrictOptions = impersonated.requestOptions;

        const tdoName = `${citestMarker}-tdo-with-asset-${uuid.v4()}`;
        result = await gqlClient.query(
          `mutation createTDOWithAsset {
            createTDOWithAsset(
              input: {
                name: "${tdoName}"
                parentFolderId: "${folderWithReadAndFilePermissionsId}"
                uri: "https://s3.amazonaws.com/hold4fisher/s3Test.mp4"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
              status
            }
          }`,
          {},
          restrictOptions
        );
        expect(_.get(result, 'createTDOWithAsset')).toBeDefined();
        expect(_.get(result, 'createTDOWithAsset.id')).toBeDefined();
        expect(_.get(result, 'createTDOWithAsset.name')).toContain(tdoName);
      });
    });

    it('should delete these folders', async () => {
      let deletedCount = 0;
      // delete sdoFolderContentTemplateId
      const deleteFolderContentTemplate =
        await folderHelper.helpDeleteContentFolderTemplate(
          { gqlClient, options: adminOptions },
          { id: sdoFolderContentTemplateId }
        );
      expect(deleteFolderContentTemplate.id).toEqual(
        sdoFolderContentTemplateId
      );

      for (let folderId of folderIds) {
        // delete Folders
        deletedCount++;
        await folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          { folderId, orderIndex: 0 }
        );
      }
      expect(deletedCount).toEqual(folderIds.length);
    });

    it('should delete sdo and schema', async () => {
      if (sdoId) {
        const deleteSdo = await gqlClient.query(
          `mutation {
              deleteStructuredData (input: {
                id: "${sdoId}"
                schemaId: "${schemaId}"
              }){
                id
              }
            }`,
          {},
          adminOptions
        );

        expect(_.get(deleteSdo, 'deleteStructuredData.id')).toEqual(sdoId);
      }

      if (schemaId) {
        const deleteSdo = await gqlClient.query(
          `mutation {
              updateSchemaState (input: {
                id: "${schemaId}"
                status: deleted
              }){
                id
                status
              }
            }`,
          {},
          adminOptions
        );

        const deleteSdoData = _.get(deleteSdo, 'updateSchemaState');
        expect(deleteSdoData).toBeDefined();
        expect(deleteSdoData.id).toEqual(schemaId);
        expect(deleteSdoData.status).toEqual('deleted');
      }
    });

    describe('Auth filtering for Folders', () => {
      let testFolderIds = [];
      let sharedFolderIds = [];
      const TOTAL_FOLDERS_TO_CREATE = 25;
      const FOLDERS_TO_SHARE = 10; // Number of folders the restricted user can access

      it('should create multiple folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // Create folders that the restricted user will NOT have access to
        for (let i = 0; i < TOTAL_FOLDERS_TO_CREATE; i++) {
          const createFolder = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-test-folder-${i}-${uuid.v4()}`,
              description: `Test folder ${i} for auth filtering`,
              parentId: cmsRootFolderId,
              rootFolderType: 'cms'
            }
          );
          testFolderIds.push(createFolder.id);
        }

        expect(testFolderIds.length).toEqual(TOTAL_FOLDERS_TO_CREATE);
      });

      it('should grant restricted user access to only a subset of folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const permissionSetResult = await gqlClient.query(
          `mutation {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-folder-read-permission-${uuid.v4()}"
                description: "Permission set for testing auth filtering"
                permissions: [AIWARE_FOLDER_READ]
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );

        const permissionSetId = _.get(
          permissionSetResult,
          'authPermissionSetCreate.id'
        );
        expect(permissionSetId).toBeDefined();

        // Grant access to only the LAST FOLDERS_TO_SHARE folders (positions 15-24)
        // This tests the critical case where accessible folders are beyond the first batch
        // Old behavior (post-process): limit=10 would return 0 folders (first 10 have no access)
        // New behavior (pre-process): limit=10 would return 10 folders (finds accessible ones at 15-24)
        sharedFolderIds = testFolderIds.slice(-FOLDERS_TO_SHARE);

        await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            ids: sharedFolderIds,
            resourceType: 'Folder',
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: 'User'
                },
                permissionSetID: permissionSetId
              }
            ]
          }
        );

        expect(sharedFolderIds.length).toEqual(FOLDERS_TO_SHARE);
      });

      it('should return accessible folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // this should return the accessible folders up to the limit
        const result = await folderHelper.helpGetRootFolders(
          { gqlClient, options: restrictOptions },
          'cms',
          {
            limit: FOLDERS_TO_SHARE,
            offset: 0,
            orderBy: [
              { field: 'createdDateTime', direction: 'desc' },
              { field: 'name', direction: 'asc' }
            ]
          }
        );

        const childFolders = _.get(result[0], 'childFolders.records', []);
        const childFolderIds = _.map(childFolders, 'id');
        const accessFolderIds = _.intersection(childFolderIds, sharedFolderIds);

        expect(accessFolderIds.length).toEqual(FOLDERS_TO_SHARE);
      });

      it('admin user should see all folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const result = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms',
          {
            limit: 50,
            offset: 0,
            orderBy: [{ field: 'createdDateTime', direction: 'desc' }]
          }
        );

        const childFolders = _.get(result[0], 'childFolders.records', []);
        const folderCount = _.get(result[0], 'childFolders.count', 0);

        // Admin should see all test folders (plus any existing folders)
        expect(childFolders.length).toBeGreaterThanOrEqual(
          TOTAL_FOLDERS_TO_CREATE
        );
        expect(folderCount).toBeGreaterThanOrEqual(TOTAL_FOLDERS_TO_CREATE);

        const returnedFolderIds = childFolders.map((f) => f.id);
        for (const testFolderId of testFolderIds) {
          expect(returnedFolderIds).toContain(testFolderId);
        }
      });

      it('user with no access should not see the testing folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // secondRestrictUser has no ACEs to the testing folders
        const result = await folderHelper.helpGetRootFolders(
          { gqlClient, options: secondRestrictOptions },
          'cms',
          {
            limit: 20,
            offset: 0
          }
        );

        const childFolders = _.get(result[0], 'childFolders.records', []);
        const childFolderIds = _.map(childFolders, 'id');
        const accessFolderIds = _.intersection(childFolderIds, testFolderIds);

        expect(accessFolderIds.length).toEqual(0);
      });

      afterAll(async () => {
        if (!useRBACFeature) {
          return;
        }

        // Clean up all test folders
        for (const folderId of testFolderIds) {
          try {
            await folderHelper.helpDeleteFolder(
              { gqlClient, options: adminOptions },
              { folderId, orderIndex: 0 }
            );
          } catch (error) {
            console.warn(`Failed to delete folder ${folderId}:`, error.message);
          }
        }
      });
    });

    describe('should not be accessible to User Default Private AG via the regular groups APIs', () => {
      it("the user's default private AG cannot be listed", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // authGroups API.
        result = await gqlClient.query(
          `query authGroup {
            authGroups(
              ids: ["${privateAuthGroupId}"]
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authGroups.records')).toBeDefined();
        expect(result.authGroups.records.length).toEqual(0);

        // authGroups in User type.
        const impersonated = await chakram.get(
          `${config.core_admin_url}/admin/impersonate/${restrictUser.userId}/${testOrg.guid}`,
          helpers.requestOptions(superToken)
        );
        expect(_.get(impersonated, 'body.token')).toBeDefined();
        result = await gqlClient.query(meGql, {}, restrictOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-first-restrict-user`
        );
        const defaultAGs = _.get(result, 'me.authGroups.records', []);
        const defaultAGIds = _.map(defaultAGs, 'id');
        expect(defaultAGIds.includes(privateAuthGroupId)).toEqual(false);
      });
      it("the user's default private AG cannot be updated", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const query = `mutation authGroupUpdate {
            authGroupUpdate(
              input: {
                id: "${privateAuthGroupId}"
                description: "test2"
                name: "test2"
              }
            ) {
              id
              name
            }
          }`;
        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('Authorization group not found');
      });
      it("the user's default private AG cannot be deleted", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const query = `mutation deleteAuthGroup {
            authGroupDelete(
              id: "${privateAuthGroupId}"
            ) {
              id
            }
          }`;

        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('This auth group is a protected group.');
      });
      it("the user's default private AG cannot be added members to it", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const query = `
          mutation authGroupAddMembers{
            authGroupAddMembers(
              id: "${privateAuthGroupId}"
              members: [{
                id: "${regularUser.userId}"
                memberType: User
              }]
            ) {
              id
              name
              description
              
            }
          }
        `;

        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('Authorization group not found');
      });
      it("members cannot be added to the user's default private AG", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const query = `
          mutation authGroupAddMembers{
            authGroupAddMembers(
              id: "${privateAuthGroupId}"
              members: [{
                id: "${regularUser.userId}"
                memberType: User
              }]
            ) {
              id
              name
              description
              
            }
          }
        `;

        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('Authorization group not found');
      });
      it("members cannot be removed from the user's default private AG", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const query = `
          mutation authGroupRemoveMembers {
            authGroupRemoveMembers(
              id: "${privateAuthGroupId}",
              memberIds: ["${restrictUser.userId}"]
            ) {
                id
              }
          }
        `;

        await expect(async () =>
          gqlClient.query(query, {}, adminOptions)
        ).rejects.toThrow('Authorization group not found');
      });
    });
    it('should only delete non-protected auth groups', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      const authGroups = await rbacHelper.helpGetGroup({
        gqlClient,
        options: adminOptions
      });
      for (let g of authGroups) {
        let error;
        try {
          result = await gqlClient.query(
            `mutation deleteAuthG {
              authGroupDelete(
                id: "${g.id}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        if (g.name.includes(`${citestMarker}-org`)) {
          expect(_.toString(error)).toContain(
            'This auth group is a protected group.'
          );
        }
      }

      const authGroupsData = await rbacHelper.helpGetGroup({
        gqlClient,
        options: adminOptions
      });
      expect(authGroupsData.length).toBeGreaterThanOrEqual(2);
    });
    it('should only delete non-protected permission sets', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      const permissionSets = await rbacHelper.helpGetAuthPermissions(
        { gqlClient, options: adminOptions },
        {
          nameRegex: `${citestMarker}-auth-permission-set`
        }
      );

      for (let ps of permissionSets) {
        result = await rbacHelper.helpDeleteAuthPermissionSet(
          { gqlClient, options: adminOptions },
          {
            id: ps.id
          }
        );
      }

      await rbacHelper.helpGetAuthPermissions(
        { gqlClient, options: adminOptions },
        {
          nameRegex: `${citestMarker}-auth-permission-set`
        }
      );
    });
  });

  describe('Evaluate OLP Migration of Organization', () => {
    async function setOrgOLPFlag(orgId, enabled) {
      return gqlClient.query(
        `mutation updateOrganization {
          updateOrganization (input: {
            id: "${orgId}"
            metadata: {
              features: {
                enableRBACFeature: "${enabled ? 'enabled' : 'disabled'}"
              }
            }
          }){
            id
            status
            jsondata
          }
        }`,
        {},
        helpers.requestOptions(superToken)
      );
    }

    it('olpMigration should be removed', async () => {
      // Disable org enableRBACFeature
      let result = await setOrgOLPFlag(testOrg.id, false);
      const updateOrganization = _.get(result, 'updateOrganization');
      expect(updateOrganization).toBeDefined();
      expect(updateOrganization.id).toBeDefined();

      const _elasticRetryAttempts = 5;
      // retry 5 times to ensure olpMigration is removed
      for (let i = 0; i < _elasticRetryAttempts + 1; i++) {
        await util.sleep(1000);
        result = await gqlClient.query(
          `
        query organizations {
          organizations(
              kvpProperty: "features.olpMigration",
              name: "${testOrg.name}"
              nameMatch: exact
              limit: 1
              offset: 0
          ) {
            count
            records {
              id
              jsondata
            }
          }
        }
        `,
          {},
          helpers.requestOptions(superToken)
        );

        const organizations = _.get(result, 'organizations');
        expect(organizations).toBeDefined();
        try {
          expect(organizations.count).toEqual(0);
          break;
        } catch (error) {
          console.log(`Retrying to check olpMigration removal: ${i + 1}`);
        }

        if (i === _elasticRetryAttempts) {
          throw new Error(
            `Failed to remove olpMigration after ${_elasticRetryAttempts} attempts`
          );
        }
      }

      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictUser.userId, organizationGuid: testOrg.guid }
      );

      restrictOptions = impersonated.requestOptions;
    });
    it('should verify restricted user can get all SDOs and Schema after OLP migration disable', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      if (!createdSchemaId) {
        pending('No schema created in previous tests');
      }

      if (!createdSDOId) {
        pending('No SDO created in previous tests');
      }

      const getSchema = await gqlClient.query(
        `query getSchemas {
          schema(
            id: "${createdSchemaId}"
          ) {
            id
          }
        }`,
        {},
        restrictOptions
      );

      const getSDOs = await gqlClient.query(
        `query getStructuredDataObjects {
          structuredDataObjects(
          schemaId: "${createdSchemaId}"
          ) {
            records {
              id
            }
          }
        }`,
        {},
        restrictOptions
      );

      const schemaId = _.get(getSchema, 'schema.id');
      expect(schemaId).toBeDefined();
      expect(schemaId).toEqual(createdSchemaId);

      const sdos = _.get(getSDOs, 'structuredDataObjects.records');
      expect(sdos).toBeDefined();
      expect(sdos.length).toBeGreaterThanOrEqual(0);
    });

    describe('olp enabled', () => {
      beforeAll(async () => {
        // enable OLP
        let result = await setOrgOLPFlag(testOrg.id, true);
        expect(result.updateOrganization.id).toEqual(testOrg.id);
      });

      it('should be able to access pre-existing sdo and schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        if (!createdSchemaId) {
          pending('No schema created in previous tests');
        }

        if (!createdSDOId) {
          pending('No SDO created in previous tests');
        }

        const getSchema = await gqlClient.query(
          `query getSchemas {
          schema(
            id: "${createdSchemaId}"
          ) {
            id
          }
        }`,
          {},
          restrictOptions
        );

        const getSDOs = await gqlClient.query(
          `query getStructuredDataObjects {
          structuredDataObjects(
          schemaId: "${createdSchemaId}"
          ) {
            records {
              id
            }
          }
        }`,
          {},
          restrictOptions
        );

        const schemaId = _.get(getSchema, 'schema.id');
        expect(schemaId).toBeDefined();
        expect(schemaId).toEqual(createdSchemaId);

        const sdos = _.get(getSDOs, 'structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos.length).toBeGreaterThanOrEqual(0);
      });

      afterAll(async () => {
        // create new Admin to delete the created SDO and Schema
        const adminData = await userHelper.createUser(
          { gqlClient, superAdminToken: superToken },
          {
            name: `${citestMarker}-temp-admin-user-${uuid.v4()}@localhost`,
            rolesIds: [
              isDesktopAppEnabled
                ? null
                : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
              '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
              'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
            ].filter((roleId) => roleId),
            orgId: testOrg.id
          }
        );
        expect(adminData).toBeDefined();
        expect(adminData.id).toBeDefined();
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: adminData.id, organizationGuid: testOrg.guid }
        );
        const tempAdminOptions = impersonated.requestOptions;
        testSetup.listOptions.push({
          key: 'tempAdminUser',
          userId: adminData.id,
          requestOptions: tempAdminOptions
        });

        if (createdSDOId) {
          const deleteSdo = await gqlClient.query(
            `mutation {
              deleteStructuredData (input: {
                id: "${createdSDOId}"
                schemaId: "${createdSchemaId}"
              }){
                id
              }
            }`,
            {},
            tempAdminOptions
          );

          expect(_.get(deleteSdo, 'deleteStructuredData.id')).toEqual(
            createdSDOId
          );
        }

        if (createdSchemaId) {
          const deleteSdo = await gqlClient.query(
            `mutation {
              updateSchemaState (input: {
                id: "${createdSchemaId}"
                status: deleted
              }){
                id
                status
              }
            }`,
            {},
            tempAdminOptions
          );

          const deleteSdoData = _.get(deleteSdo, 'updateSchemaState');
          expect(deleteSdoData).toBeDefined();
          expect(deleteSdoData.id).toEqual(createdSchemaId);
          expect(deleteSdoData.status).toEqual('deleted');
        }

        // disable OLP to cleanup the created default objects
        let result = await setOrgOLPFlag(testOrg.id, false);
        expect(result.updateOrganization.id).toEqual(testOrg.id);
      });
    });
  });

  afterAll(async () => {
    if (!_.isEmpty(testSetup.listOptions)) {
      const listUserIds = testSetup.listOptions.map((user) => user.userId);
      await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
    }

    if (testOrg.id) {
      helpers.deleteOrganization(gqlClient.authUrl, testOrg.id, superToken);
    }

    // T17: tear down the isolated superadmin's own org + user LAST. This must run after the
    // testOrg delete above: deleting testOrg (which the isolated superadmin is a member of, via
    // setupTestOrgAndUser) kills session.token globally, but cleanup() uses its own captured
    // bootstrapOptions rather than session.token, so it stays valid. Folded into this existing
    // top-level afterAll (rather than a separate hook) so ordering is deterministic — a separate
    // same-scope afterAll declared earlier would run FIRST and kill the session before this
    // teardown's deleteMultiUser/deleteOrganization could use it.
    await session?.cleanup();
  });
});

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
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'secondRegularUser',
      name: `${citestMarker}-second-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'restrictUser',
      name: `${citestMarker}-first-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    },
    {
      key: 'secondRestrictUser',
      name: `${citestMarker}-second-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    }
  ]
};
