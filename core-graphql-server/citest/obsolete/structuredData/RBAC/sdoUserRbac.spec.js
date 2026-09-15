const helpers = require('../../../helpers/index');
const orgHelper = require('../../../helpers/organization');
const userHelper = require('../../../helpers/user');
const folderHelper = require('../../../helpers/folder');
const schemaHelper = require('../../../helpers/schema');
const dataRegistryHelper = require('../../../helpers/dataRegistry');
const rbacHelper = require('../../../helpers/rbacHelper');
const sdoHelper = require('../../../helpers/sdo');
const GraphqlClient = require('../../../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../../../helpers/superadminSession');
const { safe } = require('../../../helpers/cleanup/utils');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');
const util = require('../../../../util')();

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
let testSetup;

describe('citest_structureddata: rbac user', () => {
  let superOrgGuid, superOrgId, superUserId, superToken, superAdminOptions;
  let session;
  let testOrg,
    testUsers,
    adminUser,
    firstRegularUser,
    secondRegularUser,
    thirdRegularUser,
    firstRestrictUser,
    secondRestrictUser,
    thirdRestrictUser;
  let adminOptions,
    firstRegularUserOptions,
    secondRegularUserOptions,
    thirdRegularUserOptions,
    firstRestrictUserOptions,
    secondRestrictUserOptions,
    thirdRestrictUserOptions;
  let useRBACFeature;
  let dataRegistryId, createdSDOId, createdSchemaId;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    // T23: this suite previously ran every superadmin-scoped operation (org/user create,
    // impersonate, OLP-flag toggles, teardown deletes) on the SHARED superadmin session
    // (sys_graphql_citest_superadmin), which createOrganization enrolls as an admin MEMBER of
    // testOrg. Any concurrent spec's org-delete enumerates that org's active members and calls
    // removeAllUserSessions(userId) — GLOBAL, not org-scoped — killing the shared superadmin's
    // token mid-run, and this suite's teardown deleteOrganization(testOrg) in turn kills OTHER
    // suites' shared sessions. Same defect and same fix as T14/T15/T16: route this suite through
    // a throwaway isolated superadmin that is a member of no org but its own, so no other spec's
    // teardown can enumerate or kill its session, and this suite's own teardown cannot collaterally
    // kill anyone else. See helpers/superadminSession.js.
    session = await createIsolatedSuperadmin({ gqlClient });
    superToken = session.token;
    superAdminOptions = session.options;
    gqlClient.userAuth = session.options; // redirect implicit-auth call sites (me, introspection, deleteMultiUser)

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    result = await gqlClient.query(meGql);
    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');

    testSetup = await orgHelper.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superToken },
      createOrgAndUserInput,
      null,
      { clearAdminSeatLimit: true }
    );

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');
    expect(testUsers.length).toEqual(8);

    // Login for Admin user
    adminUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'adminUser';
    });
    adminOptions = adminUser.requestOptions;

    // Login for Regular user
    firstRegularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'firstRegularUser';
    });
    firstRegularUserOptions = firstRegularUser.requestOptions;

    secondRegularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'secondRegularUser';
    });
    secondRegularUserOptions = secondRegularUser.requestOptions;

    thirdRegularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'thirdRegularUser';
    });
    thirdRegularUserOptions = thirdRegularUser.requestOptions;

    // Login for Restrict user
    firstRestrictUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'firstRestrictUser';
    });
    firstRestrictUserOptions = firstRestrictUser.requestOptions;

    // Login for Secondary Restrict user
    secondRestrictUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'secondRestrictUser';
    });
    secondRestrictUserOptions = secondRestrictUser.requestOptions;

    thirdRestrictUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'thirdRestrictUser';
    });
    thirdRestrictUserOptions = thirdRestrictUser.requestOptions;
  });

  describe('Object operations', () => {
    let contentFolderTemplateId;
    let permSetId;
    let permSetIdAllPermissionsId;
    beforeAll(async () => {
      let result;
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      result = await dataRegistryHelper.helpCreateDataRegistry(
        { gqlClient, options: adminOptions },
        {
          id: uuid.v4(),
          name: `${citestMarker}-data-registry-${uuid.v4()}`,
          description:
            'test data registry for rbac auth group and permission set operations',
          source: 'citest-source'
        }
      );
      expect(_.get(result, 'createDataRegistry')).toBeDefined();
      expect(_.get(result, 'createDataRegistry.name')).toContain(
        `${citestMarker}-data-registry`
      );
      dataRegistryId = _.get(result, 'createDataRegistry.id');

      result = await schemaHelper.helpCreateSchema(
        { gqlClient, options: adminOptions },
        {
          id: uuid.v4(),
          dataRegistryId: dataRegistryId,
          majorVersion: 1,
          minorVersion: 0,
          status: 'draft',
          definition: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        }
      );
      expect(_.get(result, 'createSchema')).toBeDefined();
      expect(_.get(result, 'createSchema.id')).toBeDefined();
      createdSchemaId = _.get(result, 'createSchema.id');

      result = await schemaHelper.helpPublishSchema(
        { gqlClient, options: adminOptions },
        { id: createdSchemaId }
      );
      expect(_.get(result, 'updateSchemaState')).toBeDefined();
      expect(_.get(result, 'updateSchemaState.id')).toBeDefined();
      expect(_.get(result, 'updateSchemaState.status')).toEqual('published');
    });

    describe('with Regular user', () => {
      let result, cmsRootFolderId, newFolderId, newTDOId;
      let firstRegularSdoId1;
      beforeAll(async () => {
        // Login as First Regular user
        result = await gqlClient.query(meGql, {}, firstRegularUserOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-first-regular-user`
        );
      });

      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: firstRegularUserOptions },
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
          { gqlClient, options: firstRegularUserOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'test folder for rbac created by first regular user',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        newFolderId = _.get(createFolder, 'id');
      });

      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: firstRegularUserOptions },
          {
            schemaId: createdSchemaId,
            data: {
              name: 'test SDO 1 first regular user'
            }
          }
        );

        firstRegularSdoId1 = _.get(result, 'createStructuredData.id');
        createdSDOId = firstRegularSdoId1;

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `test SDO 1 first regular user`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
      });

      it('should get the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpGetStructuredData(
          { gqlClient, options: firstRegularUserOptions },
          { id: firstRegularSdoId1, schemaId: createdSchemaId }
        );

        expect(_.get(result, 'structuredData.id')).toBeDefined();
        expect(_.get(result, 'structuredData.schemaId')).toEqual(
          createdSchemaId
        );
        expect(_.get(result, 'structuredData.data.name')).toContain(
          `test SDO 1 first regular user`
        );
      });

      it('should update the created SDO using updateStructuredData mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: firstRegularUser.userId, organizationGuid: testOrg.guid }
        );
        firstRegularUserOptions = impersonated.requestOptions;

        result = await sdoHelper.helpUpdateStructuredData(
          { gqlClient, options: firstRegularUserOptions },
          {
            id: firstRegularSdoId1,
            schemaId: createdSchemaId,
            data: { name: 'test SDO 1 first regular user updated' }
          }
        );

        expect(_.get(result, 'updateStructuredData')).toBeDefined();
        expect(_.get(result, 'updateStructuredData.data.name')).toContain(
          `test SDO 1 first regular user updated`
        );
        expect(_.get(result, 'updateStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
        expect(_.get(result, 'updateStructuredData.id')).toEqual(
          firstRegularSdoId1
        );
      });

      it('should create a new SDO with non-exist SDOId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: firstRegularUserOptions },
          {
            id: uuid.v4(),
            schemaId: createdSchemaId,
            data: { name: 'test SDO 1 first regular user created' }
          }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `test SDO 1 first regular user created`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
        expect(_.get(result, 'createStructuredData.id')).toBeDefined();

        // should delete the created SDO
        const deleteResult = await sdoHelper.helpDeleteStructuredData(
          { gqlClient, options: firstRegularUserOptions },
          {
            id: _.get(result, 'createStructuredData.id'),
            schemaId: createdSchemaId
          }
        );
        expect(deleteResult).toBeDefined();
        expect(_.get(deleteResult, 'deleteStructuredData')).toBeDefined();
        expect(_.get(deleteResult, 'deleteStructuredData.id')).toEqual(
          _.get(result, 'createStructuredData.id')
        );
      });

      describe('should not RUD private sdo from other users', () => {
        let firstRegularPrivateSDOId;
        let defaultAGsToRemoveMember = [];
        let result;
        beforeAll(async () => {
          result = await gqlClient.query(meGql, {}, secondRegularUserOptions);
          expect(_.get(result, 'me.name')).toContain(
            `${citestMarker}-second-regular-user`
          );

          defaultAGsToRemoveMember = _.get(result, 'me.authGroups.records', []);
        });

        it('should removes restrict second regular user', async () => {
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
                      memberIds: ["${secondRegularUser.userId}"]
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

        it('should create private sdo by first regular user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          const permSetResult = await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-auth-permission-set-read-sdo-${uuid.v4()}`,
              description: `${citestMarker}-auth-permission-set-read-sdo`,
              permissions: ['AIWARE_SDO_READ']
            }
          );
          expect(permSetResult).toBeDefined();
          permSetId = _.get(permSetResult, 'authPermissionSetCreate.id');
          expect(permSetId).toBeDefined();

          result = await sdoHelper.helpCreateStructuredData(
            { gqlClient, options: firstRegularUserOptions },
            {
              schemaId: createdSchemaId,
              data: {
                name: 'test SDO first regular user'
              },
              addAcesEntries: [
                {
                  member: {
                    id: adminUser.userId,
                    memberType: 'User'
                  },
                  permissionSetID: permSetId
                }
              ]
            }
          );
          expect(_.get(result, 'createStructuredData')).toBeDefined();
          expect(_.get(result, 'createStructuredData.id')).toBeDefined();
          firstRegularPrivateSDOId = _.get(result, 'createStructuredData.id');
        });

        it('should not get the private sdo by second regular user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: secondRegularUser.userId, organizationGuid: testOrg.guid }
          );
          secondRegularUserOptions = impersonated.requestOptions;

          await expect(
            sdoHelper.helpGetStructuredData(
              { gqlClient, options: secondRegularUserOptions },
              { id: firstRegularPrivateSDOId, schemaId: createdSchemaId }
            )
          ).rejects.toThrow(/No authorization access role/i);
        });

        it('should not update the private sdo by second regular user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          await expect(
            sdoHelper.helpUpdateStructuredData(
              { gqlClient, options: secondRegularUserOptions },
              {
                id: firstRegularPrivateSDOId,
                schemaId: createdSchemaId,
                data: { name: 'test SDO second regular user updated' }
              }
            )
          ).rejects.toThrow(/No authorization access role/i);
        });

        it('should not delete the private sdo by second regular user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          await expect(
            sdoHelper.helpDeleteStructuredData(
              { gqlClient, options: secondRegularUserOptions },
              { id: firstRegularPrivateSDOId, schemaId: createdSchemaId }
            )
          ).rejects.toThrow(/No authorization access role/i);
        });

        it('should get the private sdo by admin user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          result = await sdoHelper.helpGetStructuredData(
            { gqlClient, options: adminOptions },
            { id: firstRegularPrivateSDOId, schemaId: createdSchemaId }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'structuredData')).toBeDefined();
          expect(_.get(result, 'structuredData.id')).toEqual(
            firstRegularPrivateSDOId
          );
        });

        it('shared read permission set should be able to read the private sdo', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          result = await rbacHelper.helpAddACEsToResources(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'SDO',
              ids: [firstRegularPrivateSDOId],
              resourceTypeSchemaId: createdSchemaId,
              entries: [
                {
                  member: { id: secondRegularUser.userId, memberType: 'User' },
                  permissionSetID: permSetId
                }
              ]
            }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'addACEsToResources')).toBeDefined();
          expect(_.get(result, 'addACEsToResources.records')).toBeDefined();
          await helpers.sleep(5000);

          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: secondRegularUser.userId, organizationGuid: testOrg.guid }
          );
          secondRegularUserOptions = impersonated.requestOptions;

          result = await sdoHelper.helpGetStructuredData(
            { gqlClient, options: secondRegularUserOptions },
            { id: firstRegularPrivateSDOId, schemaId: createdSchemaId }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'structuredData')).toBeDefined();
          expect(_.get(result, 'structuredData.id')).toEqual(
            firstRegularPrivateSDOId
          );
        });

        it('should RUD a private SDO from another user when get shared with all permissions', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          const permSetResult = await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-auth-full-permission-set-sdo-${uuid.v4()}`,
              description: `${citestMarker}-auth-full-permission-set-sdo`,
              permissions: [
                'AIWARE_SDO_READ',
                'AIWARE_SDO_CREATE',
                'AIWARE_SDO_UPDATE',
                'AIWARE_SDO_DELETE'
              ]
            }
          );
          expect(permSetResult).toBeDefined();
          permSetIdAllPermissionsId = _.get(
            permSetResult,
            'authPermissionSetCreate.id'
          );
          expect(permSetIdAllPermissionsId).toBeDefined();

          result = await rbacHelper.helpAddACEsToResources(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'SDO',
              ids: [firstRegularPrivateSDOId],
              resourceTypeSchemaId: createdSchemaId,
              entries: [
                {
                  member: { id: secondRegularUser.userId, memberType: 'User' },
                  permissionSetID: permSetIdAllPermissionsId
                }
              ]
            }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'addACEsToResources')).toBeDefined();
          expect(_.get(result, 'addACEsToResources.records')).toBeDefined();

          result = await rbacHelper.helpAddACEsToResources(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'SDOSchema',
              ids: [createdSchemaId],
              entries: [
                {
                  member: { id: secondRegularUser.userId, memberType: 'User' },
                  permissionSetID: permSetIdAllPermissionsId
                }
              ]
            }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'addACEsToResources')).toBeDefined();
          expect(_.get(result, 'addACEsToResources.records')).toBeDefined();

          await helpers.sleep(5000);
          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: secondRegularUser.userId, organizationGuid: testOrg.guid }
          );
          secondRegularUserOptions = impersonated.requestOptions;

          result = await sdoHelper.helpUpdateStructuredData(
            { gqlClient, options: secondRegularUserOptions },
            {
              id: firstRegularPrivateSDOId,
              schemaId: createdSchemaId,
              data: {
                name: 'test SDO 2 second regular user update by regular user 2'
              }
            }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'updateStructuredData')).toBeDefined();
          expect(_.get(result, 'updateStructuredData.id')).toEqual(
            firstRegularPrivateSDOId
          );
          expect(_.get(result, 'updateStructuredData.data.name')).toEqual(
            'test SDO 2 second regular user update by regular user 2'
          );

          result = await sdoHelper.helpDeleteStructuredData(
            { gqlClient, options: secondRegularUserOptions },
            { id: firstRegularPrivateSDOId, schemaId: createdSchemaId }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'deleteStructuredData')).toBeDefined();
          expect(_.get(result, 'deleteStructuredData.id')).toEqual(
            firstRegularPrivateSDOId
          );
        });
      });

      it('should be able to create Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await folderHelper.helpCreateFolderContentTemplate(
          { gqlClient, options: firstRegularUserOptions },
          {
            folderId: newFolderId,
            sdoId: firstRegularSdoId1,
            schemaId: createdSchemaId
          }
        );
        const folderContentTemplate = _.get(
          result,
          'createFolderContentTemplate'
        );
        expect(folderContentTemplate.id).toBeDefined();
        expect(folderContentTemplate.sdoId).toEqual(firstRegularSdoId1);
        contentFolderTemplateId = folderContentTemplate.id;
      });

      it('should be able to update Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await folderHelper.helpUpdateFolderContentTemplate(
          { gqlClient, options: firstRegularUserOptions },
          {
            id: contentFolderTemplateId,
            sdoId: firstRegularSdoId1
          }
        );
        const folderContentTemplate = _.get(
          result,
          'updateFolderContentTemplate'
        );
        expect(folderContentTemplate.id).toBeDefined();
        expect(folderContentTemplate.sdoId).toEqual(firstRegularSdoId1);
      });

      it('should be able to get folder to see sdo in content templates', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await folderHelper.helpGetFolder(
          { gqlClient, options: firstRegularUserOptions },
          { id: newFolderId }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'folder')).toBeDefined();
        expect(_.get(result, 'folder.id')).toBeDefined();
        expect(_.get(result, 'folder.id')).toEqual(newFolderId);
        expect(_.get(result, 'folder.contentTemplates')).toBeDefined();
        expect(_.get(result, 'folder.contentTemplates.length')).toEqual(1);
        expect(_.get(result, 'folder.contentTemplates[0].id')).toEqual(
          contentFolderTemplateId
        );
        expect(_.get(result, 'folder.contentTemplates[0].sdoId')).toEqual(
          firstRegularSdoId1
        );
        expect(_.get(result, 'folder.contentTemplates[0].schemaId')).toEqual(
          createdSchemaId
        );
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
                contentTemplates: [{sdoId: "${firstRegularSdoId1}", schemaId: "${createdSchemaId}"}]
              }
            ) {
              id
            }
          }`,
          {},
          firstRegularUserOptions
        );
        const tdo = _.get(result, 'createTDO');
        expect(tdo.id).toBeDefined();
      });

      it('should get all sdos under a schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await schemaHelper.helpGetSchema(
          { gqlClient, options: firstRegularUserOptions },
          { id: createdSchemaId }
        );

        const sdos = _.get(result, 'schema.structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos.length).toBe(1);
      });

      describe('should be able to get read access SDOs if they have read ACE on the schema', () => {
        let createdSchemaId2;
        let createdSdoId2;
        let permSetId;
        let defaultAGsToRemoveMember = [];
        beforeAll(async () => {
          // create new schema by admin
          const createSchema = await schemaHelper.helpCreateSchema(
            { gqlClient, options: adminOptions },
            {
              id: uuid.v4(),
              dataRegistryId: dataRegistryId,
              majorVersion: 2,
              minorVersion: 0,
              status: 'published',
              definition: {
                type: 'object',
                properties: {
                  name: { type: 'string' }
                }
              }
            }
          );
          expect(createSchema).toBeDefined();
          expect(_.get(createSchema, 'createSchema.id')).toBeDefined();
          createdSchemaId2 = _.get(createSchema, 'createSchema.id');

          // create new sdo on this schema by admin
          const createSdo = await sdoHelper.helpCreateStructuredData(
            { gqlClient, options: adminOptions },
            {
              schemaId: createdSchemaId2,
              data: { name: 'test SDO 2' }
            }
          );
          expect(createSdo).toBeDefined();
          expect(_.get(createSdo, 'createStructuredData.id')).toBeDefined();
          createdSdoId2 = _.get(createSdo, 'createStructuredData.id');

          // delete authGroup in first regular user
          result = await gqlClient.query(meGql, {}, thirdRegularUserOptions);
          expect(_.get(result, 'me.name')).toContain(
            `${citestMarker}-third-regular-user`
          );
          defaultAGsToRemoveMember = _.get(result, 'me.authGroups.records', []);
          const authGroupIds = _.map(defaultAGsToRemoveMember, 'id');
          if (authGroupIds.length > 0) {
            result = await Promise.all(
              authGroupIds.map((id) =>
                gqlClient.query(
                  `mutation authGroupRemoveMembers {
                    authGroupRemoveMembers(
                      id: "${id}",
                      memberIds: ["${thirdRegularUser.userId}"]
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

        it('should not read sdo in the schema if they have no read ACE on the schema', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          await helpers.sleep(5000);
          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: thirdRegularUser.userId, organizationGuid: testOrg.guid }
          );
          thirdRegularUserOptions = impersonated.requestOptions;

          const querySchema = await schemaHelper.helpGetSchema(
            { gqlClient, options: thirdRegularUserOptions },
            { id: createdSchemaId2 }
          );
          expect(querySchema).toBeDefined();
          expect(
            _.get(querySchema, 'schema.structuredDataObjects.records')
          ).toBeDefined();
          expect(
            _.get(querySchema, 'schema.structuredDataObjects.records.length')
          ).toEqual(0);
        });

        it('should read sdo in the schema if they have read ACE on the schema', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          const permSetResult = await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-auth-read-permission-set-sdo-${uuid.v4()}`,
              description: `${citestMarker}-auth-read-permission-set-sdo`,
              permissions: ['AIWARE_SDO_READ']
            }
          );
          expect(permSetResult).toBeDefined();
          expect(
            _.get(permSetResult, 'authPermissionSetCreate.id')
          ).toBeDefined();
          permSetId = _.get(permSetResult, 'authPermissionSetCreate.id');

          const addACE = await rbacHelper.helpAddACEsToResources(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'SDOSchema',
              ids: [createdSchemaId2],
              entries: [
                {
                  member: { id: thirdRegularUser.userId, memberType: 'User' },
                  permissionSetID: permSetId
                }
              ]
            }
          );
          expect(addACE).toBeDefined();
          expect(_.get(addACE, 'addACEsToResources')).toBeDefined();
          expect(_.get(addACE, 'addACEsToResources.records')).toBeDefined();

          await helpers.sleep(5000);
          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: thirdRegularUser.userId, organizationGuid: testOrg.guid }
          );
          thirdRegularUserOptions = impersonated.requestOptions;

          const querySchema = await schemaHelper.helpGetSchema(
            { gqlClient, options: thirdRegularUserOptions },
            { id: createdSchemaId2 }
          );
          expect(querySchema).toBeDefined();
          expect(
            _.get(querySchema, 'schema.structuredDataObjects.records')
          ).toBeDefined();
          expect(
            _.get(querySchema, 'schema.structuredDataObjects.records.length')
          ).toEqual(1);
          expect(
            _.get(querySchema, 'schema.structuredDataObjects.records[0].id')
          ).toEqual(createdSdoId2);
        });

        it('clean up test data', async () => {
          if (createdSdoId2) {
            const deleteSdo = await sdoHelper.helpDeleteStructuredData(
              { gqlClient, options: adminOptions },
              { id: createdSdoId2, schemaId: createdSchemaId2 }
            );
            expect(_.get(deleteSdo, 'deleteStructuredData.id')).toEqual(
              createdSdoId2
            );
          }

          if (createdSchemaId2) {
            const deleteSchema = await schemaHelper.helpDeleteSchema(
              { gqlClient, options: adminOptions },
              { schemaId: createdSchemaId2 }
            );
            expect(_.get(deleteSchema, 'updateSchemaState.id')).toEqual(
              createdSchemaId2
            );
            expect(_.get(deleteSchema, 'updateSchemaState.status')).toEqual(
              'deleted'
            );
          }
        });
      });

      it('should delete the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const deleteSdo = await sdoHelper.helpDeleteStructuredData(
          { gqlClient, options: adminOptions },
          { id: firstRegularSdoId1, schemaId: createdSchemaId }
        );
        expect(_.get(deleteSdo, 'deleteStructuredData.id')).toEqual(
          firstRegularSdoId1
        );
      });
    });

    describe('with Restrict user', () => {
      let defaultAGsToRemoveMember = [];
      let firstRestrictPrivateSDOId;
      let firstRestrictPublicSDOId;
      let result;
      beforeAll(async () => {
        // Login as First restrict user
        result = await gqlClient.query(meGql, {}, firstRestrictUserOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-first-restrict-user`
        );

        defaultAGsToRemoveMember = _.get(result, 'me.authGroups.records', []);
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
                    memberIds: ["${firstRestrictUser.userId}", "${secondRestrictUser.userId}"]
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

      it('should create a private SDO by regular user share only with second restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: firstRegularUserOptions },
          {
            schemaId: createdSchemaId,
            data: { name: 'test SDO first regular user' },
            addAcesEntries: [
              {
                member: {
                  id: secondRestrictUser.userId,
                  memberType: 'User'
                },
                permissionSetID: permSetIdAllPermissionsId
              }
            ]
          }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.id')).toBeDefined();
        firstRestrictPrivateSDOId = _.get(result, 'createStructuredData.id');
      });

      it('should get the private sdo by second restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpGetStructuredData(
          { gqlClient, options: secondRestrictUserOptions },
          { id: firstRestrictPrivateSDOId, schemaId: createdSchemaId }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'structuredData')).toBeDefined();
        expect(_.get(result, 'structuredData.id')).toBeDefined();
        expect(_.get(result, 'structuredData.id')).toEqual(
          firstRestrictPrivateSDOId
        );
      });

      it('should update the private sdo by second restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: secondRestrictUserOptions },
          {
            id: firstRestrictPrivateSDOId,
            schemaId: createdSchemaId,
            data: {
              name: 'private SDO first regular user updated by second restrict user'
            }
          }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.id')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toEqual(
          'private SDO first regular user updated by second restrict user'
        );
      });

      it('should not get the private sdo by first restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: firstRestrictUser.userId, organizationGuid: testOrg.guid }
        );
        firstRestrictUserOptions = impersonated.requestOptions;

        await expect(
          sdoHelper.helpGetStructuredData(
            { gqlClient, options: firstRestrictUserOptions },
            { id: firstRestrictPrivateSDOId, schemaId: createdSchemaId }
          )
        ).rejects.toThrow(/No authorization access role/i);
      });

      it('should not update the private sdo by first restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          sdoHelper.helpCreateStructuredData(
            { gqlClient, options: firstRestrictUserOptions },
            {
              id: firstRestrictPrivateSDOId,
              schemaId: createdSchemaId,
              data: { name: 'test SDO first regular user updated' }
            }
          )
        ).rejects.toThrow(/No authorization access role/i);
      });

      it('should not delete the private sdo by first restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          sdoHelper.helpDeleteStructuredData(
            { gqlClient, options: firstRestrictUserOptions },
            { id: firstRestrictPrivateSDOId, schemaId: createdSchemaId }
          )
        ).rejects.toThrow(/No authorization access role/i);
      });

      it('should create public sdo by admin user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: adminOptions },
          { schemaId: createdSchemaId, data: { name: 'test SDO public' } }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.id')).toBeDefined();
        firstRestrictPublicSDOId = _.get(result, 'createStructuredData.id');
      });

      it('should not get the public sdo by first restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          sdoHelper.helpGetStructuredData(
            { gqlClient, options: firstRestrictUserOptions },
            { id: firstRestrictPublicSDOId, schemaId: createdSchemaId }
          )
        ).rejects.toThrow(/No authorization access role/i);
      });

      it('should not update the private sdo by first restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          sdoHelper.helpCreateStructuredData(
            { gqlClient, options: firstRestrictUserOptions },
            {
              id: firstRestrictPublicSDOId,
              schemaId: createdSchemaId,
              data: { name: 'test SDO first regular user updated' }
            }
          )
        ).rejects.toThrow(/No authorization access role/i);
      });

      it('should not delete the private sdo by first restrict user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          sdoHelper.helpDeleteStructuredData(
            { gqlClient, options: firstRestrictUserOptions },
            { id: firstRestrictPublicSDOId, schemaId: createdSchemaId }
          )
        ).rejects.toThrow(/No authorization access role/i);
      });

      it('clean up restrict user test data', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        if (firstRestrictPrivateSDOId) {
          const deletePrivateSDO = await sdoHelper.helpDeleteStructuredData(
            { gqlClient, options: adminOptions },
            { id: firstRestrictPrivateSDOId, schemaId: createdSchemaId }
          );
          expect(_.get(deletePrivateSDO, 'deleteStructuredData.id')).toEqual(
            firstRestrictPrivateSDOId
          );
        }

        if (firstRestrictPublicSDOId) {
          const deletePublicSDO = await sdoHelper.helpDeleteStructuredData(
            { gqlClient, options: adminOptions },
            { id: firstRestrictPublicSDOId, schemaId: createdSchemaId }
          );
          expect(_.get(deletePublicSDO, 'deleteStructuredData.id')).toEqual(
            firstRestrictPublicSDOId
          );
        }
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
        expect(TDOIds.length).toEqual(1);
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
        for (var TDOId of TDOIds) {
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
        expect(deletedCount).toEqual(1);
        // delete contentFolderTemplateId
        const deleteFolderContentTemplate =
          await folderHelper.helpDeleteContentFolderTemplate(
            { gqlClient },
            { id: contentFolderTemplateId }
          );
        expect(deleteFolderContentTemplate.id).toEqual(contentFolderTemplateId);

        deletedCount = 0;
        for (var folderId of folderIds) {
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

  describe('Manage access to resources', () => {
    let result;
    let defaultAGsToRemoveMember = [];
    let acl;
    let cmsRootFolderId;
    let folderIds = [];
    let newAuthPermissionSet;
    let restrictedFolderId;
    let restrictedFolderName;
    let dataRegistryId,
      schemaId,
      sdoFolderId,
      sdoId,
      sdoFolderContentTemplateId;

    beforeAll(async () => {
      // check restrictUser logins
      result = await gqlClient.query(meGql, {}, firstRestrictUserOptions);
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
                  memberIds: ["${firstRestrictUser.userId}", "${secondRestrictUser.userId}"]
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

      const createDataRegistry =
        await dataRegistryHelper.helpCreateDataRegistry(
          { gqlClient, options: adminOptions },
          {
            id: uuid.v4(),
            name: `${citestMarker}-data-registry-${uuid.v4()}`,
            description:
              'test data registry for rbac auth group and permission set operations',
            source: 'citest-source'
          }
        );
      expect(createDataRegistry).toBeDefined();
      expect(_.get(createDataRegistry, 'createDataRegistry.id')).toBeDefined();
      dataRegistryId = _.get(createDataRegistry, 'createDataRegistry.id');

      const createSchema = await schemaHelper.helpCreateSchema(
        { gqlClient, options: adminOptions },
        {
          id: uuid.v4(),
          dataRegistryId: dataRegistryId,
          majorVersion: 1,
          minorVersion: 0,
          status: 'draft',
          definition: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        }
      );
      expect(createSchema).toBeDefined();
      expect(_.get(createSchema, 'createSchema.id')).toBeDefined();
      schemaId = _.get(createSchema, 'createSchema.id');

      const publishSchema = await schemaHelper.helpPublishSchema(
        { gqlClient, options: adminOptions },
        { id: schemaId }
      );
      expect(publishSchema).toBeDefined();
      expect(_.get(publishSchema, 'updateSchemaState.id')).toBeDefined();
      expect(_.get(publishSchema, 'updateSchemaState.status')).toEqual(
        'published'
      );

      const createFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: firstRegularUserOptions },
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

      const folderPermissionRes = await rbacHelper.helpCreateAuthPermissionSet(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-folder-permission-set-${uuid.v4()}`,
          description: `${citestMarker}-folder-permission-set`,
          permissions: ['AIWARE_FOLDER_UPDATE']
        }
      );
      expect(folderPermissionRes).toBeDefined();
      expect(
        _.get(folderPermissionRes, 'authPermissionSetCreate.id')
      ).toBeDefined();
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
                id: firstRestrictUser.userId,
                memberType: 'User'
              },
              permissionSetID: folderPermissionSets.id
            }
          ]
        }
      );

      result = await sdoHelper.helpCreateStructuredData(
        { gqlClient, options: firstRegularUserOptions },
        {
          schemaId: schemaId,
          data: {
            name: 'test SDO'
          }
        }
      );

      sdoId = _.get(result, 'createStructuredData.id');
      // Login for Regular user
      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: firstRestrictUser.userId, organizationGuid: testOrg.guid }
      );
      firstRestrictUserOptions = impersonated.requestOptions;

      await expect(
        folderHelper.helpCreateFolderContentTemplate(
          { gqlClient, options: firstRestrictUserOptions },
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

      const createPermissionRes = await rbacHelper.helpCreateAuthPermissionSet(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-auth-permission-set-${uuid.v4()}`,
          description: `${citestMarker}-auth-permission-set`,
          permissions: ['AIWARE_SDO_READ']
        }
      );
      expect(createPermissionRes).toBeDefined();
      expect(
        _.get(createPermissionRes, 'authPermissionSetCreate.id')
      ).toBeDefined();
      const sdoPermissionSets = _.get(
        createPermissionRes,
        'authPermissionSetCreate'
      );

      result = await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: adminOptions },
        {
          ids: [schemaId],
          resourceType: 'SDOSchema',
          entries: [
            {
              member: {
                id: firstRestrictUser.userId,
                memberType: 'User'
              },
              permissionSetID: sdoPermissionSets.id
            }
          ]
        }
      );

      // re impersonateUser to reset role
      await helpers.sleep(5000);
      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: firstRestrictUser.userId, organizationGuid: testOrg.guid }
      );

      firstRestrictUserOptions = impersonated.requestOptions;

      result = await folderHelper.helpCreateFolderContentTemplate(
        { gqlClient, options: firstRestrictUserOptions },
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

    it('should delete these folders', async () => {
      await safe('delete folder content template', async () => {
        await folderHelper.helpDeleteContentFolderTemplate(
          { gqlClient },
          { id: sdoFolderContentTemplateId }
        );
      });

      for (let folderId of folderIds) {
        await safe(`delete folder ${folderId}`, async () => {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId, orderIndex: 0 }
          );
        });
      }
    });

    it('should delete sdo and schema', async () => {
      if (sdoId) {
        await safe('delete SDO', async () => {
          await sdoHelper.helpDeleteStructuredData(
            { gqlClient, options: adminOptions },
            { id: sdoId, schemaId: schemaId }
          );
        });
      }

      if (schemaId) {
        await safe('delete schema', async () => {
          await schemaHelper.helpDeleteSchema(
            { gqlClient, options: adminOptions },
            { schemaId: schemaId }
          );
        });
      }
    });

    it('should re-add restrict users to default AGs', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      const permSetResult = await rbacHelper.helpCreateAuthPermissionSet(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-auth-full-permission-set-sdo-${uuid.v4()}`,
          description: `${citestMarker}-auth-full-permission-set-sdo`,
          permissions: [
            'AIWARE_SDO_READ',
            'AIWARE_SDO_CREATE',
            'AIWARE_SDO_UPDATE',
            'AIWARE_SDO_DELETE'
          ]
        }
      );
      expect(permSetResult).toBeDefined();
      const permSetIdAllPermissionsId = _.get(
        permSetResult,
        'authPermissionSetCreate.id'
      );

      const addMembersResult = await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: adminOptions },
        {
          ids: [createdSchemaId],
          resourceType: 'SDOSchema',
          entries: [
            {
              member: { id: firstRestrictUser.userId, memberType: 'User' },
              permissionSetID: permSetIdAllPermissionsId
            }
          ]
        }
      );
      expect(addMembersResult.addACEsToResources.records).toBeDefined();
      expect(addMembersResult.addACEsToResources.records.length).toEqual(5);
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

      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: firstRestrictUser.userId, organizationGuid: testOrg.guid }
      );
      firstRestrictUserOptions = impersonated.requestOptions;

      const getSchema = await schemaHelper.helpGetSchema(
        { gqlClient, options: firstRestrictUserOptions },
        { id: createdSchemaId }
      );

      const getSDOs = await sdoHelper.helpGetStructuredDataObjects(
        { gqlClient, options: firstRestrictUserOptions },
        { schemaId: createdSchemaId }
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

        await helpers.sleep(5000);
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: firstRestrictUser.userId, organizationGuid: testOrg.guid }
        );
        firstRestrictUserOptions = impersonated.requestOptions;

        const getSchema = await schemaHelper.helpGetSchema(
          { gqlClient, options: firstRestrictUserOptions },
          { id: createdSchemaId }
        );

        const getSDOs = await sdoHelper.helpGetStructuredDataObjects(
          { gqlClient, options: firstRestrictUserOptions },
          { schemaId: createdSchemaId }
        );

        const schemaId = _.get(getSchema, 'schema.id');
        expect(schemaId).toBeDefined();
        expect(schemaId).toEqual(createdSchemaId);

        const sdos = _.get(getSDOs, 'structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos.length).toBeGreaterThanOrEqual(0);
      });

      afterAll(async () => {
        await safe('create temp admin and cleanup', async () => {
          // create new Admin to delete the created SDO and Schema
          const adminData = await userHelper.createUser(
            { gqlClient, superAdminToken: superToken },
            {
              name: `${citestMarker}-temp-admin-user-${uuid.v4()}@localhost`,
              password: 'testUserPassword',
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
            await sdoHelper.helpDeleteStructuredData(
              { gqlClient, options: tempAdminOptions },
              { id: createdSDOId, schemaId: createdSchemaId }
            );
          }

          if (createdSchemaId) {
            await schemaHelper.helpDeleteSchema(
              { gqlClient, options: tempAdminOptions },
              { schemaId: createdSchemaId }
            );
          }

          // disable OLP to cleanup the created default objects
          await setOrgOLPFlag(testOrg.id, false);
        });
      });
    });
  });

  afterAll(async () => {
    if (!_.isEmpty(testSetup.listOptions)) {
      await safe('delete users', async () => {
        const listUserIds = testSetup.listOptions.map((user) => user.userId);
        await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
      });
    }

    // testOrg is a SEPARATE org from the isolated superadmin's own throwaway org, so it must
    // still be torn down explicitly (session.cleanup() only removes the isolated SA's own
    // org+user). Deleting testOrg now runs on the isolated superToken and only enumerates
    // testOrg's own members (isolated SA + this suite's test users) — never the shared session
    // other suites depend on. Await it so it completes before session.cleanup() kills the
    // isolated session.
    if (testOrg.id) {
      await safe('delete organization', async () => {
        await helpers.deleteOrganization(gqlClient.authUrl, testOrg.id, superToken);
      });
    }

    // Tear down the isolated superadmin's own throwaway org+user (uses the shared bootstrap
    // token internally, so it is unaffected by the testOrg delete above).
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
    name: citestMarker + '-org-olp-sdo-rbac-' + uuid.v4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    kvp: {
      features: {
        automaticPackageCreation: 'enabled',
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
        '032218c3-d47e-4287-9d16-7bb867c01266',
        '6d982ee9-ff07-499f-a182-03457a6187f6',
        '3577dfc6-f441-41f9-8dab-ef9079530450',
        '912e377e-f4a4-4184-8db1-baa9670d8081'
      ].filter((roleId) => roleId)
    },
    {
      key: 'firstRegularUser',
      name: `${citestMarker}-first-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'secondRegularUser',
      name: `${citestMarker}-second-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'thirdRegularUser',
      name: `${citestMarker}-third-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'firstRestrictUser',
      name: `${citestMarker}-first-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    },
    {
      key: 'secondRestrictUser',
      name: `${citestMarker}-second-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    },
    {
      key: 'thirdRestrictUser',
      name: `${citestMarker}-third-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    }
  ]
};
