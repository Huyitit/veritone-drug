/* global pending */
const helpers = require('../../../helpers/index');
const orgHelper = require('../../../helpers/organization');
const userHelper = require('../../../helpers/user');
const folderHelper = require('../../../helpers/folder');
const sdoHelper = require('../../../helpers/sdo');
const rbacHelper = require('../../../helpers/rbacHelper');
const dataRegistryHelper = require('../../../helpers/dataRegistry');
const schemaHelper = require('../../../helpers/schema');
const GraphqlClient = require('../../../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../../../helpers/superadminSession');
const { safe } = require('../../../helpers/cleanup/utils');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

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
      key: 'firstRegularUser',
      name: `${citestMarker}-first-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'secondRegularUser',
      name: `${citestMarker}-second-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    }
  ]
};

let gqlClient;
let testSetup;

describe('citest_structureddata: rbac Admin', () => {
  let superOrgGuid, superOrgId, superUserId, superToken, superOptions;
  let session, bootstrapOptions, bootstrapToken;
  let testOrg, testUsers, adminUser, firstRegularUser, secondRegularUser;
  let adminOptions, firstRegularUserOptions, secondRegularUserOptions;
  let adminUserId, firstRegularUserId, secondRegularUserId;
  let useRBACFeature;
  let createACESforSDO, createdSchemaId;
  let createdSDOId, createdSchemaIdForSDOOperation;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    // Bootstrap: one shared-superadmin login for provisioning (and shard-0 warm-up).
    const bootstrapResult = await gqlClient.connect();
    expect(bootstrapResult.apiToken).toBeDefined();
    expect(bootstrapResult.token).toBeDefined();
    bootstrapOptions = helpers.requestOptions(bootstrapResult.token);
    bootstrapToken = bootstrapResult.token;

    // T22: Provision a brand-new superadmin in its own isolated org for EVERY shard,
    // rather than branching on shard index. Previously shard 0 reused the shared bootstrap
    // superadmin (an admin MEMBER of every org it creates) as testOrg's creator, so the
    // afterAll REST org-delete enumerated its members and called removeAllUserSessions —
    // GLOBAL, not org-scoped — killing the shared session that concurrent specs depend on
    // (the T14/T15/T16 defect). createIsolatedSuperadmin creates the superadmin in a
    // throwaway org, so it is a member of no org but its own, and grants the identical
    // 3 roles (Super Admin + aiWARE Administrator + aiWARE Instance Administrator) the
    // prior per-shard temp superadmin held — subsuming both T10 (own TOKEN: Redis key per
    // shard) and T11 (the 3-role grant needed for createOrganization). Same guardrail as
    // the T14/T15/T16/T18/T19/T20/T23 sibling fixes.
    session = await createIsolatedSuperadmin({ gqlClient });
    superToken = session.token;
    superOptions = session.options;
    gqlClient.userAuth = superOptions;
    gqlClient.userToken = superToken;
    // tokenAuth is set for shape-parity with prior code but is never consumed by this spec
    // (no call site reads it); feed it the bootstrap apiToken since the isolated helper
    // returns no apiToken of its own.
    gqlClient.tokenAuth = helpers.requestOptions(bootstrapResult.apiToken);

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    // Since this test creates new org, we only need to check for env setting
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    let result = await gqlClient.query(meGql);
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
    // test users + superadmin who created the org
    expect(testUsers.length).toEqual(4);

    // Login for Admin user
    adminUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'adminUser';
    });
    adminOptions = adminUser.requestOptions;
    adminUserId = adminUser.id;

    firstRegularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'firstRegularUser';
    });
    firstRegularUserOptions = firstRegularUser.requestOptions;
    firstRegularUserId = firstRegularUser.userId;

    secondRegularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'secondRegularUser';
    });
    secondRegularUserOptions = secondRegularUser.requestOptions;
    secondRegularUserId = secondRegularUser.userId;
  });

  describe('Object operations', () => {
    describe('with Admin user', () => {
      let result;
      let dataRegistryId, schemaId;
      let sdoId1;
      let newFolderId;
      let contentTemplateId1;
      beforeAll(async () => {
        // check admin logins
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });

      it('should create data registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const dataRegistryInput = {
          id: uuid.v4(),
          name: `${citestMarker}-data-registry-${uuid.v4()}`,
          description:
            'test data registry for rbac auth group and permission set operations',
          source: 'citest-source'
        };

        result = await dataRegistryHelper.helpCreateDataRegistry(
          { gqlClient, options: adminOptions },
          dataRegistryInput
        );
        expect(_.get(result, 'createDataRegistry')).toBeDefined();
        expect(_.get(result, 'createDataRegistry.name')).toContain(
          `${citestMarker}-data-registry`
        );
        dataRegistryId = _.get(result, 'createDataRegistry.id');
      });

      it('should create schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

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
                name: {
                  type: 'string'
                }
              }
            }
          }
        );

        expect(_.get(result, 'createSchema')).toBeDefined();
        expect(_.get(result, 'createSchema.id')).toBeDefined();

        schemaId = _.get(result, 'createSchema.id');
      });

      it('should set status of the created schema to published', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await schemaHelper.helpPublishSchema(
          { gqlClient, options: adminOptions },
          { id: schemaId }
        );

        expect(_.get(result, 'updateSchemaState')).toBeDefined();
        expect(_.get(result, 'updateSchemaState.id')).toBeDefined();
        expect(_.get(result, 'updateSchemaState.status')).toEqual('published');
      });

      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: adminOptions },
          {
            schemaId: schemaId,
            data: {
              name: 'admin user test SDO 1'
            }
          }
        );

        sdoId1 = _.get(result, 'createStructuredData.id');
        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `admin user test SDO 1`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          schemaId
        );
      });

      it('should read the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await sdoHelper.helpGetStructuredData(
          { gqlClient, options: adminOptions },
          { id: sdoId1, schemaId: schemaId }
        );

        expect(_.get(result, 'structuredData.id')).toBeDefined();
        expect(_.get(result, 'structuredData.schemaId')).toEqual(schemaId);
        expect(_.get(result, 'structuredData.data.name')).toContain(
          `admin user test SDO 1`
        );
      });

      it('should update the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: adminOptions },
          {
            id: sdoId1,
            schemaId: schemaId,
            data: { name: 'admin user test SDO 1 updated' }
          }
        );

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `admin user test SDO 1 updated`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          schemaId
        );
      });

      it('should update the created SDO using updateStructuredData mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpUpdateStructuredData(
          { gqlClient, options: adminOptions },
          {
            id: sdoId1,
            schemaId: schemaId,
            data: { name: 'admin user test SDO 1 updated by admin' }
          }
        );

        expect(_.get(result, 'updateStructuredData')).toBeDefined();
        expect(_.get(result, 'updateStructuredData.data.name')).toContain(
          `admin user test SDO 1 updated by admin`
        );
        expect(_.get(result, 'updateStructuredData.schemaId')).toEqual(
          schemaId
        );
        expect(_.get(result, 'updateStructuredData.id')).toEqual(sdoId1);
      });

      it('should failed when using updating structured date mutation with non-exist SDOId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        await expect(
          sdoHelper.helpUpdateStructuredData(
            { gqlClient, options: adminOptions },
            {
              id: uuid.v4(),
              schemaId: schemaId,
              data: { name: 'admin user test SDO 1 updated by admin' }
            }
          )
        ).rejects.toThrow(/Structured data object not found/);
      });

      it('should create a new SDO with non-exist SDOId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: adminOptions },
          {
            id: uuid.v4(),
            schemaId: schemaId,
            data: { name: 'admin user test SDO 1 created by admin' }
          }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `admin user test SDO 1 created by admin`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          schemaId
        );
        expect(_.get(result, 'createStructuredData.id')).toBeDefined();
        const newSDOId = _.get(result, 'createStructuredData.id');

        // should delete the created SDO
        const deleteResult = await sdoHelper.helpDeleteStructuredData(
          { gqlClient, options: adminOptions },
          { id: newSDOId, schemaId: schemaId }
        );

        expect(deleteResult).toBeDefined();
        expect(_.get(deleteResult, 'deleteStructuredData')).toBeDefined();
        expect(_.get(deleteResult, 'deleteStructuredData.id')).toEqual(
          newSDOId
        );
      });

      describe('should RUD private SDO', () => {
        let permSetId;
        let privateSDOId;
        it('should create a private SDO', async () => {
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
              schemaId: schemaId,
              data: {
                name: 'first regular user test SDO 1'
              },
              addAcesEntries: [
                {
                  member: {
                    id: secondRegularUserId,
                    memberType: 'User'
                  },
                  permissionSetID: permSetId
                }
              ]
            }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'createStructuredData')).toBeDefined();
          expect(_.get(result, 'createStructuredData.data.name')).toContain(
            `first regular user test SDO 1`
          );
          expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
            schemaId
          );
          privateSDOId = _.get(result, 'createStructuredData.id');
        });

        it('should read the private SDO by admin user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }

          result = await sdoHelper.helpGetStructuredData(
            { gqlClient, options: adminOptions },
            { id: privateSDOId, schemaId: schemaId }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'structuredData')).toBeDefined();
          expect(_.get(result, 'structuredData.id')).toEqual(privateSDOId);
        });

        it('should update the private SDO by admin user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }
          result = await sdoHelper.helpCreateStructuredData(
            { gqlClient, options: adminOptions },
            {
              id: privateSDOId,
              schemaId: schemaId,
              data: { name: 'first regular user test SDO 1 updated by admin' }
            }
          );

          expect(_.get(result, 'createStructuredData')).toBeDefined();
          expect(_.get(result, 'createStructuredData.data.name')).toContain(
            `first regular user test SDO 1 updated by admin`
          );
          expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
            schemaId
          );
          expect(_.get(result, 'createStructuredData.id')).toEqual(
            privateSDOId
          );
        });

        it('should delete the private SDO by admin user', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
          }
          result = await sdoHelper.helpDeleteStructuredData(
            { gqlClient, options: adminOptions },
            { id: privateSDOId, schemaId: schemaId }
          );
          expect(result).toBeDefined();
          expect(_.get(result, 'deleteStructuredData')).toBeDefined();
          expect(_.get(result, 'deleteStructuredData.id')).toEqual(
            privateSDOId
          );
        });
      });

      it('should read existing SDO via query Schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await schemaHelper.helpGetSchema(
          { gqlClient, options: adminOptions },
          { id: schemaId }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'schema')).toBeDefined();
        expect(_.get(result, 'schema.id')).toEqual(schemaId);
        expect(_.get(result, 'schema.structuredDataObjects')).toBeDefined();
        expect(
          _.get(result, 'schema.structuredDataObjects.records')
        ).toBeDefined();
        expect(
          _.get(result, 'schema.structuredDataObjects.records.length')
        ).toEqual(1);
        expect(
          _.get(result, 'schema.structuredDataObjects.records[0].id')
        ).toEqual(sdoId1);
      });

      it('should create folder content template', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const folderIdRes = await createCmsFolderFlow(
          gqlClient,
          adminOptions,
          citestMarker
        );
        newFolderId = folderIdRes;

        result = await folderHelper.helpCreateFolderContentTemplate(
          { gqlClient, options: adminOptions },
          { folderId: newFolderId, sdoId: sdoId1, schemaId: schemaId }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'createFolderContentTemplate')).toBeDefined();
        expect(_.get(result, 'createFolderContentTemplate.id')).toBeDefined();
        contentTemplateId1 = _.get(result, 'createFolderContentTemplate.id');
        expect(_.get(result, 'createFolderContentTemplate.sdoId')).toEqual(
          sdoId1
        );
        expect(_.get(result, 'createFolderContentTemplate.schemaId')).toEqual(
          schemaId
        );
        newFolderId = _.get(result, 'createFolderContentTemplate.folderId');
      });

      it('should update folder content template', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await folderHelper.helpUpdateFolderContentTemplate(
          { gqlClient, options: adminOptions },
          { id: contentTemplateId1, sdoId: sdoId1, schemaId: schemaId }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'updateFolderContentTemplate')).toBeDefined();
        expect(_.get(result, 'updateFolderContentTemplate.id')).toBeDefined();
        expect(_.get(result, 'updateFolderContentTemplate.id')).toEqual(
          contentTemplateId1
        );
        expect(_.get(result, 'updateFolderContentTemplate.sdoId')).toEqual(
          sdoId1
        );
      });

      it('should query folder to get folder content template', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: newFolderId }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'folder')).toBeDefined();
        expect(_.get(result, 'folder.id')).toBeDefined();
        expect(_.get(result, 'folder.contentTemplates')).toBeDefined();
        expect(_.get(result, 'folder.contentTemplates.length')).toEqual(1);
        expect(_.get(result, 'folder.contentTemplates[0].id')).toEqual(
          contentTemplateId1
        );
        expect(_.get(result, 'folder.contentTemplates[0].sdoId')).toEqual(
          sdoId1
        );
        expect(_.get(result, 'folder.contentTemplates[0].schemaId')).toEqual(
          schemaId
        );
      });

      it('should create TDO with content template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                status: "uploaded",
                startDateTime: 1476726655,
                stopDateTime: 1476726755,
                contentTemplates: [{sdoId: "${sdoId1}", schemaId: "${schemaId}"}]
              }
            ) {
              id
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createTDO')).toBeDefined();
        expect(_.get(result, 'createTDO.id')).toBeDefined();
      });

      it('should delete the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await sdoHelper.helpDeleteStructuredData(
          { gqlClient, options: adminOptions },
          { id: sdoId1, schemaId: schemaId }
        );

        expect(_.get(result, 'deleteStructuredData')).toBeDefined();
        expect(_.get(result, 'deleteStructuredData.id')).toEqual(sdoId1);
      });
    });
  });

  describe('RBAC Auth Group and Permission Set Operations', () => {
    describe('with Admin user', () => {
      let result, error;
      let sdoId2;
      let newAuthGroup, newAuthPermissionSet;
      let authGroups, authPermissionSets;
      let cmsRootFolderId;
      let acl;
      let folderIds;
      beforeAll(async () => {
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
          { nameRegex: 'aiWARE', authClass: 'System' }
        );
        expect(authPermissionSets.length).toEqual(4);

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('Root Folder');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });

      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await rbacHelper.helpCreateAuthGroup(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-auth-group-${uuid.v4()}`,
            description: `${citestMarker}-auth-group`
          }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'name')).toContain(`${citestMarker}-auth-group`);
        newAuthGroup = result;
      });

      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await rbacHelper.helpCreateAuthPermissionSet(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-auth-permission-set-${uuid.v4()}`,
            description: `${citestMarker}-auth-permission-set`,
            permissions: [
              'AIWARE_SDO_CREATE',
              'AIWARE_SDO_DELETE',
              'AIWARE_SDO_READ',
              'AIWARE_SDO_UPDATE'
            ]
          }
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
      });

      it('should create Data Registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await dataRegistryHelper.helpCreateDataRegistry(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-data-registry-${uuid.v4()}`,
            description:
              'test data registry for rbac auth group and permission set operations',
            source: 'citest-source'
          }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'createDataRegistry')).toBeDefined();
        expect(_.get(result, 'createDataRegistry.name')).toContain(
          `${citestMarker}-data-registry`
        );
        testOrg.dataRegistryId = _.get(result, 'createDataRegistry.id');
      });

      it('should create Schema and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await schemaHelper.helpCreateSchema(
          { gqlClient, options: adminOptions },
          {
            id: uuid.v4(),
            dataRegistryId: testOrg.dataRegistryId,
            majorVersion: 1,
            minorVersion: 0,
            status: 'draft',
            definition: {
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                }
              }
            }
          }
        );
        expect(result).toBeDefined();
        expect(_.get(result, 'createSchema')).toBeDefined();
        expect(_.get(result, 'createSchema.id')).toBeDefined();
        createdSchemaId = _.get(result, 'createSchema.id');

        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'SDOSchema',
            ids: [createdSchemaId],
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
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(createdSchemaId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });

      it('should set status of the created schema to published', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        expect(createdSchemaId).toBeDefined();

        result = await schemaHelper.helpPublishSchema(
          { gqlClient, options: adminOptions },
          { id: createdSchemaId }
        );

        expect(_.get(result, 'updateSchemaState')).toBeDefined();
        expect(_.get(result, 'updateSchemaState.id')).toBeDefined();
        expect(_.get(result, 'updateSchemaState.status')).toEqual('published');
      });

      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: adminOptions },
          {
            schemaId: createdSchemaId,
            data: {
              name: 'admin user test SDO 2'
            }
          }
        );

        sdoId2 = _.get(result, 'createStructuredData.id');
        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `admin user test SDO 2`
        );
        expect(_.get(result, 'createStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
      });

      it('should add ACEs on SDO using addACEToResources', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();
        expect(sdoId2).toBeDefined();

        let error;
        try {
          result = await rbacHelper.helpAddACEsToResources(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'SDO',
              ids: [sdoId2],
              resourceTypeSchemaId: createdSchemaId,
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
        } catch (e) {
          error = e;
        }
        createACESforSDO = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of createACESforSDO) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(sdoId2) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });

      it('should throw error when add ACEs on SDO using addACEToResources with invalid schemaId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(sdoId2).toBeDefined();

        let error;
        try {
          result = await rbacHelper.helpAddACEsToResources(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'SDO',
              ids: [sdoId2],
              resourceTypeSchemaId: testOrg.dataRegistryId, // invalid schemaId, should be createdSchemaId instead dataRegistryId
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
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        const graphqlErrors = helpers.getErrorsFromGraphqlResponse(error);
        expect(graphqlErrors).toBeDefined();
        expect(graphqlErrors.length > 0).toEqual(true);
        expect(graphqlErrors[0].message).toEqual(
          'The requested object was not found'
        );
      });

      it('should remove ACEs from an SDO using removeACEsFromResource', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();
        expect(sdoId2).toBeDefined();
        expect(createACESforSDO).toBeDefined();
        const aceCount = createACESforSDO.length;
        expect(aceCount).toBeGreaterThan(0);
        const aceId = createACESforSDO[0].id;

        let error;
        try {
          result = await rbacHelper.helpRemoveRbac(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'SDO',
              resourceTypeSchemaId: createdSchemaId,
              ids: [aceId]
            }
          );
        } catch (e) {
          error = e;
        }

        const aces = _.get(result, 'removeACEsFromResource.records');
        expect(aces).toBeDefined();
        expect(aces.length).toEqual(aceCount - 1);
      });

      it('should throw error when remove ACEs from an SDO using removeACEsFromResource with invalid schemaId', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(sdoId2).toBeDefined();
        expect(createACESforSDO).toBeDefined();
        const aceCount = createACESforSDO.length;
        expect(aceCount).toBeGreaterThan(0);
        const aceId = createACESforSDO[0].id;

        let error;
        try {
          result = await rbacHelper.helpRemoveRbac(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'SDO',
              resourceTypeSchemaId: testOrg.dataRegistryId, // invalid schemaId, should be createdSchemaId instead dataRegistryId
              ids: [aceId]
            }
          );
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        const graphqlErrors = helpers.getErrorsFromGraphqlResponse(error);
        expect(graphqlErrors).toBeDefined();
        expect(graphqlErrors.length > 0).toEqual(true);
        expect(graphqlErrors[0].message).toEqual(
          'The requested object was not found'
        );
      });

      it('should create SDO without addACEs and add default ACEs automatically', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: adminOptions },
          {
            schemaId: createdSchemaId,
            data: {
              name: 'citest-sdo'
            }
          }
        );

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `citest-sdo`
        );

        let newSDOId = _.get(result, 'createStructuredData.id');

        const getResourcesACL = await gqlClient.query(
          `query getResourcesACL {
                  getACLForResources(
                    resourceType: SDO
                    ids: ["${newSDOId}"]
                  ) {
                    records {
                      id
                    }
                  }
                }`,
          {},
          adminOptions
        );

        const resourcesACL = _.get(getResourcesACL, 'getACLForResources');
        expect(_.get(resourcesACL, 'records')).toBeDefined();
        expect(_.get(resourcesACL, 'records[0].id')).toContain(newSDOId);

        // 1 owner ACE + 2 default ACEs (orgAdmin + aiWARE Full Access && orgUsers + aiWARE Read Only)
        expect(_.get(resourcesACL, 'records.length')).toEqual(3);
      });

      it('should create SDO with addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await sdoHelper.helpCreateStructuredData(
          { gqlClient, options: adminOptions },
          {
            schemaId: createdSchemaId,
            data: {
              name: 'citest-sdo'
            },
            addAcesEntries: [
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

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `citest-sdo`
        );
        const newSDOId = _.get(result, 'createStructuredData.id');
        acl = _.get(result, 'createStructuredData.addACEs.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newSDOId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 3 ACEs: 1 owner ACE + 1 new ACE + 1 default ACE (orgAdmin + aiWARE Full Access)
        expect(acl.length).toEqual(3);
      });

      it('should delete the created SDOs', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await sdoHelper.helpGetStructuredDataObjects(
          { gqlClient, options: adminOptions },
          { schemaId: createdSchemaId, offset: 0, limit: 50 }
        );

        const SDOs = _.get(result, 'structuredDataObjects.records');
        expect(SDOs.length).toBeGreaterThanOrEqual(2);
        let deletedCount = 0;
        for (var sdo of SDOs) {
          deletedCount++;
          result = await sdoHelper.helpDeleteStructuredData(
            { gqlClient, options: adminOptions },
            { id: sdo.id, schemaId: createdSchemaId }
          );

          result = await rbacHelper.helpGetAclForResources(
            { gqlClient, options: adminOptions },
            {
              ids: [sdo.id],
              resourceType: 'SDO',
              ownerOrganization: testOrg.guid
            }
          );

          const sdoACL = _.get(result, 'getACLForResources.records', []);
          expect(sdoACL.length).toEqual(0);
        }
        expect(deletedCount).toBeGreaterThanOrEqual(2);
      });

      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const authGroups = await rbacHelper.helpGetGroup({
          gqlClient,
          options: adminOptions
        });
        for (var g of authGroups) {
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
          { nameRegex: `${citestMarker}-auth-permission-set` }
        );
        for (var ps of permissionSets) {
          result = await rbacHelper.helpDeleteAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              id: ps.id
            }
          );
        }

        const permission = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: adminOptions },
          { nameRegex: `${citestMarker}-auth-permission-set` }
        );
        expect(permission.length).toEqual(0);
      });
    });
  });

  afterAll(async () => {
    // T22: Tear down the isolated superadmin's own org + user. cleanup() uses its own
    // captured bootstrapOptions internally and swallows its own errors, so it is valid
    // regardless of ordering or whether the testOrg delete below has already killed
    // session.token (superToken). Run it first so a later cleanup crash cannot orphan it.
    await session?.cleanup();
    // Restore a live session for any remaining implicit-auth cleanup call below
    // (e.g. userHelper.deleteMultiUser, which ignores its client's `options` field and
    // relies entirely on gqlClient.userAuth) — without this, gqlClient.userAuth still
    // points at the isolated superadmin's session, which cleanup() just deleted above, so
    // any implicit call would fail with "token not found".
    gqlClient.userAuth = bootstrapOptions;

    if (createdSDOId && createdSchemaIdForSDOOperation) {
      await safe('delete SDO', async () => {
        await sdoHelper.helpDeleteStructuredData(
          { gqlClient, options: adminOptions },
          { id: createdSDOId, schemaId: createdSchemaIdForSDOOperation }
        );
      });

      await safe('delete schema', async () => {
        await gqlClient.query(
          `mutation updateSchema {
              updateSchemaState(
                input: {
                  id: "${createdSchemaIdForSDOOperation}"
                  status: deleted
                }
              ) {
                id
                status
              }
            }`,
          {},
          adminOptions
        );
      });

      await safe('verify SDO ACL cleanup', async () => {
        const result = await rbacHelper.helpGetAclForResources(
          { gqlClient, options: adminOptions },
          {
            ids: [createdSDOId],
            resourceType: 'SDO'
          }
        );
      });
    }

    if (!_.isEmpty(testSetup.listOptions)) {
      await safe('delete users', async () => {
        const listUserIds = testSetup.listOptions.map((user) => user.userId);
        await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
      });
    }

    if (testOrg.id) {
      await safe('delete organization', async () => {
        await helpers.deleteOrganization(
          gqlClient.authUrl,
          testOrg.id,
          superToken
        );
      });
    }
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

async function createCmsFolderFlow(gqlClient, options, citestMarker) {
  let cmsRootFolderId;
  const rootFolders = await folderHelper.helpGetRootFolders(
    { gqlClient, options },
    'cms'
  );

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
