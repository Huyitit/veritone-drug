/* global pending */
import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  AuthResourceType,
  AuthGroupMemberType,
  OrganizationStatus,
  RootFolderType,
  SchemaStatus,
  AuthObjectClass,
  AuthPermissionType,
  PackageResourceType,
  PackageResourceAction,
  PackageGrantAction,
  PackageGrantType,
  StringMatch
} from '../../src/gql/gql';
import { safe, impersonateUser } from '../../src/helpers/commonHelper';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';
import { setupTestOrgAndUser } from '../helpers/organization.helper';

// Straight TS/Bun-tool port of the legacy citest/rbacAuth.spec.js. See that
// file's own T14/T15/T16 comments for the isolated-superadmin rationale this
// conversion preserves (see test/helpers/superadminSession.ts here).

const citestGlobals = globalThis as any;
const citestMarker = citestGlobals.citestMarker ?? 'citest-should-delete';
const isDesktopAppEnabled = citestGlobals.enableDefaultDesktopApp ?? true;

let gqlClient: GraphqlClient;

// Field-name translation from the legacy `createOrgAndUserInput`: legacy
// `kvp` -> `metadata`, legacy `apps` -> `applications` (setupTestOrgAndUser
// passes `orgInput` straight through as `input:` to `sdk.createOrganization`,
// so these must already be in the GraphQL `CreateOrganization` input shape).
// The legacy `key: 'adminUser'` field on each userInput is dropped — it was
// only used by the OLD helper's substring-matching return shape, which
// `setupTestOrgAndUser`'s index-ordered `listOptions` replaces (see below).
const createOrgAndUserInput = {
  orgInput: {
    name: `${citestMarker}-org-folder-rbac-${uuidv4()}`,
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    metadata: {
      features: {
        enableRBACFeature: 'enabled',
        enableRBACFeatureForSDO: 'enabled'
      }
    },
    applications: [
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
      name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      name: `${citestMarker}-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      name: `${citestMarker}-second-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      name: `${citestMarker}-first-restrict-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [] as string[]
    },
    {
      name: `${citestMarker}-second-restrict-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [] as string[]
    }
  ]
};

function extractPackageIdsFromResults(results: any, type: string = 'packages') {
  if (type === 'packages') {
    return _.map(_.get(results, 'packages.records'), 'id');
  } else {
    return _.map(_.get(results, 'packageGrants.records'), (r) =>
      _.get(r, 'package.id')
    );
  }
}

const getGrantedPackageIds = async (orgId: string, userOptions: any) => {
  const grantsRes = await gqlClient.sdk.packageGrants(
    { orgId, limit: 1000 },
    userOptions
  );
  return extractPackageIdsFromResults(grantsRes.data, 'grants');
};

const getPackagesByIds = async (ids: string[], userOptions: any) => {
  const idList = ids.map((id) => `"${id}"`).join(', ');

  const packagesRes = await gqlClient.sdk.queryPackages(
    { ids: ids, limit: 1000 },
    userOptions
  );

  return extractPackageIdsFromResults(packagesRes.data, 'packages');
};

describe('citest_auth: rbacAuth', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let superOrgGuid: string,
    superOrgId: string,
    superUserId: string,
    superToken: string;
  let testOrg: any,
    testUsers: any[],
    adminUser: any,
    regularUser: any,
    secondRegularUser: any;
  let restrictUser: any, secondRestrictUser: any;
  let privateAuthGroupId: string;
  let adminOptions: any;
  let regularOptions: any;
  let restrictOptions: any, secondRestrictOptions: any;
  let useRBACFeature: boolean;
  let superAdminOptions: any;
  let secondRegularOptions: any;

  let createdSDOId: string, createACESforSDO: any[], createdSchemaId: string;

  beforeAll(async () => {
    // T16 (legacy) / superadminSession.ts (here): use a throwaway superadmin
    // identity for this spec's org/session lifecycle so this spec can never
    // enroll -- nor collaterally log out -- the shared CI superadmin session
    // used by every other spec.
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
    expect(gqlClient.sessionToken).toBeDefined();
    superToken = isolatedSuperadmin.token;

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    // Since this test creates new org, we only need to check for env setting
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    let result = await gqlClient.sdk.me();

    expect(result.data.me).toBeDefined();
    superOrgGuid = _.get(result, 'data.me.organization.guid', '');
    superOrgId = _.get(result, 'data.me.organization.id', '');
    superUserId = _.get(result, 'data.me.id', '');

    const { org, listOptions } = await setupTestOrgAndUser(gqlClient, {
      orgInput: createOrgAndUserInput.orgInput,
      userInputs: createOrgAndUserInput.userInputs
    });

    testOrg = org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');
    // test users + isolated superadmin who created the org
    expect(testUsers.length).toEqual(6);

    // listOptions is index-ordered to match userInputs above, so destructure
    // by position instead of the legacy substring-matching by name.
    [
      adminUser,
      regularUser,
      secondRegularUser,
      restrictUser,
      secondRestrictUser
    ] = listOptions;

    // Login for super Admin user (re-impersonate the isolated superadmin's
    // OWN identity into the newly-created testOrg context)
    superAdminOptions = (
      await impersonateUser(superToken, superUserId, superOrgGuid)
    ).requestOptions;

    // Logins for the five test users -- setupTestOrgAndUser already logged
    // each in and returned ready-to-use requestOptions, so no separate
    // impersonateUser calls are needed here.
    adminOptions = adminUser.requestOptions;
    regularOptions = regularUser.requestOptions;
    restrictOptions = restrictUser.requestOptions;
    secondRestrictOptions = secondRestrictUser.requestOptions;
    secondRegularOptions = secondRegularUser.requestOptions;
  });

  describe('Object operations', () => {
    let contentFolderTemplateId: string;
    describe('with Admin user', () => {
      let result: any,
        cmsRootFolderId: string,
        newFolderId: string,
        newTDOId: string;
      beforeAll(async () => {
        // check admin logins
        result = await gqlClient.sdk.me({}, adminOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });
      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'test folder for rbac created by admin user',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createFolder')).toBeDefined();
        expect(_.get(result, 'data.createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'data.createFolder.id');
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: newFolderId,
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createTDO')).toBeDefined();
        expect(_.get(result, 'data.createTDO.id')).toBeDefined();
        expect(_.get(result, 'data.createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'data.createTDO.id');
      });
      it('should verify access to the folder and the tdo', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        result = await gqlClient.sdk.folder({ id: newFolderId }, adminOptions);
        expect(_.get(result, 'data.folder.id')).toBeDefined();
        expect(_.get(result, 'data.folder.name')).toContain(
          `${citestMarker}-folder`
        );
        // TDO
        result = await gqlClient.sdk.temporalDataObject(
          { id: newTDOId },
          adminOptions
        );
        expect(_.get(result, 'data.temporalDataObject.id')).toBeDefined();
        expect(_.get(result, 'data.temporalDataObject.name')).toContain(
          `${citestMarker}-tdo`
        );
      });
      xit('should remove orgAllAccess ACE from admin created folder and tdo', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        result = await gqlClient.sdk.removeACEsFromResource(
          {
            resourceType: AuthResourceType.Folder,
            ids: [newFolderId]
          },
          adminOptions
        );
        // TDO
        result = await gqlClient.sdk.removeACEsFromResource(
          {
            resourceType: AuthResourceType.Tdo,
            ids: [newTDOId]
          },
          adminOptions
        );
      });
      xit('should create a new auth group for regular user', () => {});
      xit('should add regular user to new auth group', () => {});
      it('should create Data Registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createDataRegistry(
          {
            input: {
              id: uuidv4(),
              name: `${citestMarker}-data-registry-${uuidv4()}`,
              description:
                'test data registry for rbac auth group and permission set operations',
              source: 'citest-source'
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createDataRegistry')).toBeDefined();
        expect(_.get(result, 'data.createDataRegistry.name')).toContain(
          `${citestMarker}-data-registry`
        );
        testOrg.dataRegistryId = _.get(result, 'data.createDataRegistry.id');
      });
      it('should create schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.createSchema(
          {
            input: {
              id: uuidv4(),
              dataRegistryId: testOrg.dataRegistryId,
              majorVersion: 1,
              minorVersion: 0,
              status: SchemaStatus.Draft,
              definition: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string'
                  }
                }
              }
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createSchema')).toBeDefined();
        expect(_.get(result, 'data.createSchema.id')).toBeDefined();

        createdSchemaId = _.get(result, 'data.createSchema.id');
      });
      it('should set status of the created schema to published', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await gqlClient.sdk.updateSchemaState(
          {
            input: {
              id: createdSchemaId,
              status: SchemaStatus.Published
            }
          },
          adminOptions
        );

        expect(_.get(result, 'data.updateSchemaState.id')).toBeDefined();
        expect(_.get(result, 'data.updateSchemaState.status')).toEqual(
          'published'
        );
      });
      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createStructuredData(
          {
            input: {
              schemaId: createdSchemaId,
              data: {
                name: 'test SDO'
              }
            }
          },
          adminOptions
        );

        createdSDOId = _.get(result, 'data.createStructuredData.id');

        expect(_.get(result, 'data.createStructuredData')).toBeDefined();
        expect(_.get(result, 'data.createStructuredData.data.name')).toContain(
          `test SDO`
        );
        expect(_.get(result, 'data.createStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
      });
      it('should get the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.structuredData(
          {
            id: createdSDOId,
            schemaId: createdSchemaId
          },
          adminOptions
        );
        expect(_.get(result, 'data.structuredData.id')).toBeDefined();
        expect(_.get(result, 'data.structuredData.schemaId')).toEqual(
          createdSchemaId
        );
        expect(_.get(result, 'data.structuredData.data.name')).toContain(
          `test SDO`
        );
      });
    });
    describe('with Regular user', () => {
      let result: any,
        cmsRootFolderId: string,
        newFolderId: string,
        newTDOId: string;
      beforeAll(async () => {
        // Login as Regular user
        result = await gqlClient.sdk.me({}, regularOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-regular-user`
        );
      });
      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          regularOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'test folder for rbac created by regular user',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          regularOptions
        );
        expect(_.get(result, 'data.createFolder')).toBeDefined();
        expect(_.get(result, 'data.createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'data.createFolder.id');
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: newFolderId,
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          regularOptions
        );
        expect(_.get(result, 'data.createTDO')).toBeDefined();
        expect(_.get(result, 'data.createTDO.id')).toBeDefined();
        expect(_.get(result, 'data.createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'data.createTDO.id');
      });
      it('should get the folder and the tdo by id', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        result = await gqlClient.sdk.folder(
          { id: newFolderId },
          regularOptions
        );
        expect(_.get(result, 'data.folder.id')).toBeDefined();
        expect(_.get(result, 'data.folder.name')).toContain(
          `${citestMarker}-folder`
        );
        // TDO
        result = await gqlClient.sdk.temporalDataObject(
          { id: newTDOId },
          regularOptions
        );
        expect(_.get(result, 'data.temporalDataObject.id')).toBeDefined();
        expect(_.get(result, 'data.temporalDataObject.name')).toContain(
          `${citestMarker}-tdo`
        );
      });
      it('should be able to do getACLForResources on the owned objects', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO ACEs

        const getResourcesACL = await gqlClient.sdk.GetResourcesACL(
          {
            resourceType: AuthResourceType.Tdo,
            ids: [newTDOId]
          },
          regularOptions
        );

        const resourcesACL = _.get(getResourcesACL, 'data.getACLForResources');
        expect(_.get(resourcesACL, 'records')).toBeDefined();
        expect(_.get(resourcesACL, 'records[0].id')).toContain(newTDOId);

        const members = _.map(resourcesACL?.records, 'member');
        const findUser = _.find(members, { id: regularUser.userId });
        expect(findUser).toBeDefined();
      });

      xit('should get tdo through scrolling all temporal data objects (should have only 1)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.sdk.temporalDataObjects(
          { offset: 0, limit: 50 },
          regularOptions
        );
        const TDOs = _.get(result, 'data.temporalDataObjects.records');
        expect(TDOs.length).toEqual(1);
      });
      xit('should get tdo through search (should be only 1)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.sdk.temporalDataObjects(
          { offset: 0, limit: 50 },
          regularOptions
        );
        const TDOs = _.get(result, 'data.temporalDataObjects.records');
        expect(TDOs.length).toEqual(1);
      });
      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createStructuredData(
          {
            input: {
              schemaId: createdSchemaId,
              data: {
                name: 'test SDO'
              }
            }
          },
          regularOptions
        );

        createdSDOId = _.get(result, 'data.createStructuredData.id');

        expect(_.get(result, 'data.createStructuredData')).toBeDefined();
        expect(_.get(result, 'data.createStructuredData.data.name')).toContain(
          `test SDO`
        );
        expect(_.get(result, 'data.createStructuredData.schemaId')).toEqual(
          createdSchemaId
        );
      });
      it('should get the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // Re-impersonate the regular user to ensure the token is fresh
        const impersonated = await impersonateUser(
          superToken,
          regularUser.userId,
          testOrg.guid
        );
        regularOptions = impersonated.requestOptions;

        result = await gqlClient.sdk.structuredData(
          {
            id: createdSDOId,
            schemaId: createdSchemaId
          },
          regularOptions
        );
        expect(_.get(result, 'data.structuredData.id')).toBeDefined();
        expect(_.get(result, 'data.structuredData.schemaId')).toEqual(
          createdSchemaId
        );
        expect(_.get(result, 'data.structuredData.data.name')).toContain(
          `test SDO`
        );
      });
      it('should be able to create Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createFolderContentTemplate(
          {
            input: {
              folderId: newFolderId,
              sdoId: createdSDOId,
              schemaId: createdSchemaId
            }
          },
          regularOptions
        );
        const folderContentTemplate = _.get(
          result,
          'data.createFolderContentTemplate'
        );
        expect(folderContentTemplate.id).toBeDefined();
        expect(folderContentTemplate.sdoId).toEqual(createdSDOId);
        contentFolderTemplateId = folderContentTemplate.id;
      });
      it('should be able to update Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.updateFolderContentTemplate(
          {
            input: {
              id: contentFolderTemplateId,
              sdoId: createdSDOId
            }
          },
          regularOptions
        );
        const folderContentTemplate = _.get(
          result,
          'data.updateFolderContentTemplate'
        );
        expect(folderContentTemplate.id).toBeDefined();
        expect(folderContentTemplate.sdoId).toEqual(createdSDOId);
      });
      it('should be able to create TDO with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              startDateTime: 1476726655,
              stopDateTime: 1476726755,
              contentTemplates: [
                { sdoId: createdSDOId, schemaId: createdSchemaId }
              ]
            }
          },
          regularOptions
        );
        const tdo = _.get(result, 'data.createTDO');
        expect(tdo.id).toBeDefined();
      });
      it('should get all sdos under a schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.schema(
          { id: createdSchemaId },
          regularOptions
        );
        const sdos = _.get(result, 'data.schema.structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos.length).toBe(2);
      });
    });
    describe('with Admin user to clean up test data', () => {
      let result: any;
      let folderIds: string[], TDOIds: string[];
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.sdk.me({}, adminOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });
      it('should get all tdos (should be 3)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.sdk.temporalDataObjects(
          { offset: 0, limit: 50 },
          adminOptions
        );
        expect(_.get(result, 'data.temporalDataObjects.records')).toBeDefined();
        TDOIds = _.get(result, 'data.temporalDataObjects.records').map(
          (tdo: any) => tdo.id
        );
        expect(TDOIds.length).toEqual(3);
      });
      it('should get all folders (should be 2)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // childFolders selection (status/description/treeObjectId) is
        // covered by the generated rootFolders operation, so this stays
        // raw-vs-sdk-equivalent but converted to the SDK call.
        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(
          result,
          'data.rootFolders[0].childFolders.records'
        );
        folderIds = childFolders.map(
          (childFolder: any) => childFolder.treeObjectId
        );
        expect(childFolders.length).toBeGreaterThanOrEqual(2);
      });
      it('should delete all folders and tdos', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let deletedCount = 0;
        // Clean up TDOs
        for (const TDOId of TDOIds) {
          // delete TDO
          deletedCount++;
          result = await gqlClient.sdk.deleteTDO({ id: TDOId }, adminOptions);
        }
        expect(deletedCount).toEqual(3);
        deletedCount = 0;
        for (const folderId of folderIds) {
          // delete Folders
          deletedCount++;
          // Get ACL for folder before remove
          const getFolderACL = await gqlClient.sdk.GetResourcesACL(
            {
              resourceType: AuthResourceType.Folder,
              ids: [folderId]
            },
            adminOptions
          );
          const folderACL = _.get(
            getFolderACL,
            'data.getACLForResources.records',
            []
          );

          for (const ace of folderACL) {
            result = await gqlClient.sdk.removeACEsFromResource(
              {
                resourceType: AuthResourceType.Folder,
                ids: [ace?.id!]
              },
              adminOptions
            );
          }
          result = await gqlClient.sdk.deleteFolder(
            {
              input: {
                id: folderId,
                orderIndex: 0
              }
            },
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('RBAC Auth Group and Permission Set Operations', () => {
    describe('with Admin user', () => {
      let result: any, error: any;
      let newAuthGroup: any, newAuthPermissionSet: any;
      let adminUserId: string, regularUserId: string;
      let authGroups: any[], authPermissionSets: any[];
      let cmsRootFolderId: string, newFolderId: string;
      let acl: any[];
      let folderIds: string[];
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.sdk.me({}, adminOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-admin-user`
        );
        adminUserId = _.get(result, 'data.me.id');
        // Login as Regular user
        result = await gqlClient.sdk.me({}, regularOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = _.get(result, 'data.me.id');

        result = await gqlClient.query(
          `query authGroup {
            authGroups(
              nameRegex: "${testOrg.name}"
            ) {
              records {
                id
                name
                memberCount
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
          expect(users.length).toEqual(g.memberCount);
          hasSuperAdminMember = _.some(
            users,
            (u) => _.get(u, 'member.id', '') === superUserId
          );
        }
        expect(hasSuperAdminMember).toEqual(true);

        result = await gqlClient.sdk.authPermissionSets(
          {
            nameRegex: 'aiWARE',
            authClass: AuthObjectClass.System
          },
          adminOptions
        );
        authPermissionSets = _.get(result, 'data.authPermissionSets.records');
        expect(authPermissionSets.length).toEqual(4);

        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should NOT delete default auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Try delete default auth groups
        result = null;
        error = null;
        try {
          result = await gqlClient.sdk.authGroupDelete(
            { id: authGroups[0].id },
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(_.toString(error)).toContain(
          'This auth group is a protected group.'
        );
      });
      it('should NOT delete default permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Try delete default auth groups
        let error: any;
        try {
          result = await gqlClient.sdk.authPermissionSetDelete(
            { id: authPermissionSets[0].id },
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(_.toString(error)).toContain(
          'You cannot delete this permission set.'
        );
      });
      it('should NOT modify default permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const authPermissionSet = authPermissionSets[0];
        result = null;
        error = null;
        try {
          result = await gqlClient.sdk.authPermissionSetUpdate(
            {
              input: {
                id: authPermissionSet.id,
                name: authPermissionSet.name + ' - citest'
              }
            },
            adminOptions
          );
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        expect(_.toString(error)).toContain(
          'You cannot update this permission set.'
        );
      });
      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-auth-group-${uuidv4()}`,
              description: `${citestMarker}-auth-group`
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.authGroupCreate')).toBeDefined();
        expect(_.get(result, 'data.authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = _.get(result, 'data.authGroupCreate');
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareTdoDelete,
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoSearch,
                AuthPermissionType.AiwareTdoUpdate
              ]
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'data.authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = _.get(result, 'data.authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description:
                'test folder for rbac created by admin for auth group and permission set operations',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createFolder')).toBeDefined();
        expect(_.get(result, 'data.createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'data.createFolder.id');
        result = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [newFolderId],
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        acl = _.get(result, 'data.addACEsToResources.records');
        let checkGroupAdded = false;
        for (const ace of acl) {
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
      it('should create Folder with addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuidv4()}"
                description: "test folder for rbac with addACEs nested mutation"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms

              }
            ) {
              id
              name
              addACEs(
                entries: [
                  {
                    member: {
                      id: "${newAuthGroup.id}"
                      memberType: Group
                    }
                    permissionSetID: "${newAuthPermissionSet.id}"
                  }
                ]
              ) {
                records {
                  id
                  objectID
                  objectType
                }
                count
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'createFolder.id');
        acl = _.get(result, 'createFolder.addACEs.records');
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 1 default ACEs (orgAdmin + aiWARE Full Access) + 1 new ACE, ignore inheritance + 1 owner ACE
        expect(acl.length).toEqual(3);
      });
      it('should create Data Registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createDataRegistry(
          {
            input: {
              id: uuidv4(),
              name: `${citestMarker}-data-registry-${uuidv4()}`,
              description:
                'test data registry for rbac auth group and permission set operations',
              source: 'citest-source'
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createDataRegistry')).toBeDefined();
        expect(_.get(result, 'data.createDataRegistry.name')).toContain(
          `${citestMarker}-data-registry`
        );
        testOrg.dataRegistryId = _.get(result, 'data.createDataRegistry.id');
      });
      it('should create Schema and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.createSchema(
          {
            input: {
              id: uuidv4(),
              dataRegistryId: testOrg.dataRegistryId,
              majorVersion: 1,
              minorVersion: 0,
              status: SchemaStatus.Draft,
              definition: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string'
                  }
                }
              }
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createSchema')).toBeDefined();
        expect(_.get(result, 'data.createSchema.id')).toBeDefined();

        createdSchemaId = _.get(result, 'data.createSchema.id');

        result = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.SdoSchema,
            ids: [createdSchemaId],
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        acl = _.get(result, 'data.addACEsToResources.records');
        let checkGroupAdded = false;
        for (const ace of acl) {
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

        result = await gqlClient.sdk.updateSchemaState(
          {
            input: {
              id: createdSchemaId,
              status: SchemaStatus.Published
            }
          },
          adminOptions
        );

        expect(_.get(result, 'data.updateSchemaState.id')).toBeDefined();
        expect(_.get(result, 'data.updateSchemaState.status')).toEqual(
          'published'
        );
      });
      it('should add ACEs on SDO using addACEToResources', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();
        expect(createdSDOId).toBeDefined();

        try {
          result = await gqlClient.sdk.addACEsToResources(
            {
              resourceType: AuthResourceType.Sdo,
              resourceTypeSchemaId: createdSchemaId,
              ids: [createdSDOId],
              entries: [
                {
                  member: {
                    id: newAuthGroup.id,
                    memberType: AuthGroupMemberType.Group
                  },
                  permissionSetID: newAuthPermissionSet.id
                }
              ]
            },
            adminOptions
          );
        } catch (e) {
          // handled via createACESforSDO/assertions below
        }

        createACESforSDO = _.get(result, 'data.addACEsToResources.records');
        let checkGroupAdded = false;
        for (const ace of createACESforSDO) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(createdSDOId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });
      it('should remove ACEs from an SDO using removeACEsFromResource', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();
        expect(createdSDOId).toBeDefined();
        expect(createACESforSDO).toBeDefined();
        const aceCount = createACESforSDO.length;
        expect(aceCount).toBeGreaterThan(0);
        const aceId = createACESforSDO[0].id;

        try {
          result = await gqlClient.sdk.removeACEsFromResource(
            {
              resourceType: AuthResourceType.Sdo,
              resourceTypeSchemaId: createdSchemaId,
              ids: [aceId]
            },
            adminOptions
          );
        } catch (e) {
          // handled via assertions below
        }

        const aces = _.get(result, 'data.removeACEsFromResource.records');
        expect(aces).toBeDefined();
        expect(aces.length).toEqual(aceCount - 1);
      });
      it('should create SDO without addACEs and add default ACEs automatically', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        expect(createdSchemaId).toBeDefined();

        result = await gqlClient.sdk.createStructuredData(
          {
            input: {
              schemaId: createdSchemaId,
              data: {
                name: 'citest-sdo'
              }
            }
          },
          adminOptions
        );

        expect(_.get(result, 'data.createStructuredData')).toBeDefined();
        expect(_.get(result, 'data.createStructuredData.data.name')).toContain(
          `citest-sdo`
        );

        const newSDOId = _.get(result, 'data.createStructuredData.id');

        const getResourcesACL = await gqlClient.sdk.GetResourcesACL(
          {
            resourceType: AuthResourceType.Sdo,
            ids: [newSDOId]
          },
          adminOptions
        );

        const resourcesACL = _.get(getResourcesACL, 'data.getACLForResources');
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

        result = await gqlClient.query(
          `mutation createSDO {
            createStructuredData(
              input: {
                schemaId: "${createdSchemaId}"
                data: {
                  name: "citest-sdo"
                }
              }
            ) {
              id
              data
              schemaId
              addACEs(
                entries: [
                  {
                    member: {
                      id: "${newAuthGroup.id}"
                      memberType: Group
                    }
                    permissionSetID: "${newAuthPermissionSet.id}"
                  }
                ]
              ) {
                records {
                  id
                  objectID
                  objectType
                }
                count
              }
            }
          }`,
          {},
          adminOptions
        );

        expect(_.get(result, 'createStructuredData')).toBeDefined();
        expect(_.get(result, 'createStructuredData.data.name')).toContain(
          `citest-sdo`
        );
        const newSDOId = _.get(result, 'createStructuredData.id');
        acl = _.get(result, 'createStructuredData.addACEs.records');
        let checkGroupAdded = false;
        for (const ace of acl) {
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

        result = await gqlClient.sdk.structuredDataObjects(
          {
            schemaId: createdSchemaId,
            offset: 0,
            limit: 50
          },
          adminOptions
        );
        const SDOs = _.get(result, 'data.structuredDataObjects.records');
        expect(SDOs.length).toBeGreaterThanOrEqual(2);
        let deletedCount = 0;
        for (const sdo of SDOs) {
          deletedCount++;
          result = await gqlClient.sdk.deleteStructuredData(
            {
              input: {
                id: sdo.id,
                schemaId: createdSchemaId
              }
            },
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(2);
      });
      it('should get all folders (should be 2 created by admin)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(
          result,
          'data.rootFolders[0].childFolders.records'
        );
        folderIds = childFolders.map(
          (childFolder: any) => childFolder.treeObjectId
        );
        expect(childFolders.length).toEqual(2);
      });
      it('should delete these folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let deletedCount = 0;
        for (const folderId of folderIds) {
          // delete Folders
          deletedCount++;
          result = await gqlClient.sdk.deleteFolder(
            {
              input: {
                id: folderId,
                orderIndex: 0
              }
            },
            adminOptions
          );
        }
        expect(deletedCount).toEqual(2);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.authGroups({}, adminOptions);
        const groups = _.get(result, 'data.authGroups.records');
        for (const g of groups) {
          let error: any;
          try {
            result = await gqlClient.sdk.authGroupDelete(
              { id: g.id },
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
        result = await gqlClient.sdk.authGroups({}, adminOptions);
        expect(
          _.get(result, 'data.authGroups.records').length
        ).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        const permissionSets = _.get(result, 'data.authPermissionSets.records');
        for (const ps of permissionSets) {
          result = await gqlClient.sdk.authPermissionSetDelete(
            { id: ps.id },
            adminOptions
          );
        }
        result = await gqlClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        expect(_.get(result, 'data.authPermissionSets.records').length).toEqual(
          0
        );
      });
    });
  });

  describe('JWT Token Operations', () => {
    let jwtToken: string, jwtTokenOption: any;
    let result: any;
    let newAuthGroup: any, newAuthPermissionSet: any;
    let adminUserId: string, regularUserId: string;
    let cmsRootFolderId: string, newTDOId: string, newFolderId: string;
    let acl: any[];
    describe('on normal operations', () => {
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.sdk.me({}, adminOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-admin-user`
        );
        adminUserId = _.get(result, 'data.me.id');
        // Login as Regular user
        result = await gqlClient.sdk.me({}, regularOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = _.get(result, 'data.me.id');

        result = await gqlClient.sdk.authGroups(
          { nameRegex: testOrg.name },
          adminOptions
        );
        const authGroups = _.get(result, 'data.authGroups.records');
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

        result = await gqlClient.sdk.authPermissionSets(
          {
            nameRegex: 'aiWARE',
            authClass: AuthObjectClass.System
          },
          adminOptions
        );
        const authPermissionSets = _.get(
          result,
          'data.authPermissionSets.records'
        );
        expect(authPermissionSets.length).toEqual(4);

        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-auth-group-${uuidv4()}`,
              description: `${citestMarker}-auth-group`
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.authGroupCreate')).toBeDefined();
        expect(_.get(result, 'data.authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = _.get(result, 'data.authGroupCreate');
      });
      it('should add regular user to the new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.authGroupAddMembers(
          {
            id: newAuthGroup.id,
            members: [
              {
                id: regularUserId,
                memberType: AuthGroupMemberType.User
              }
            ]
          },
          adminOptions
        );
        expect(_.get(result, 'data.authGroupAddMembers')).toBeDefined();
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareTdoDelete,
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoSearch,
                AuthPermissionType.AiwareTdoUpdate,
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.RecordingRead
              ]
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'data.authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = _.get(result, 'data.authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'test folder for rbac by admin for JWT token test',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createFolder')).toBeDefined();
        expect(_.get(result, 'data.createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'data.createFolder.id');
        result = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [newFolderId],
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        acl = _.get(result, 'data.addACEsToResources.records');
        let checkGroupAdded = false;
        for (const ace of acl) {
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
        result = await gqlClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: newFolderId,
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          regularOptions
        );
        expect(_.get(result, 'data.createTDO')).toBeDefined();
        expect(_.get(result, 'data.createTDO.id')).toBeDefined();
        expect(_.get(result, 'data.createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'data.createTDO.id');
        result = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Tdo,
            ids: [newTDOId],
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        acl = _.get(result, 'data.addACEsToResources.records');
        let checkGroupAdded = false;
        for (const ace of acl) {
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
      it('Should create JWT token and query regular user', async () => {
        result = await gqlClient.sdk.authGroups({}, adminOptions);
        // Assign Payload for JWT token
        result = await gqlClient.sdk.getEngineJWT(
          {
            input: {
              resource: {
                userId: regularUserId,
                tdoId: newTDOId
              }
            }
          },
          adminOptions
        );
        jwtToken = _.get(result, 'data.getEngineJWT.token');
        expect(jwtToken).toBeDefined();
        jwtTokenOption = helpers.requestOptions(jwtToken).headers;
      });
      it('Should query new TDO using JWT token', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.temporalDataObject(
          { id: newTDOId },
          jwtTokenOption
        );
        expect(_.get(result, 'data.temporalDataObject.id')).toEqual(newTDOId);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.authGroups({}, adminOptions);
        const authGroups = _.get(result, 'data.authGroups.records');
        for (const g of authGroups) {
          let error: any;
          try {
            result = await gqlClient.sdk.authGroupDelete(
              { id: g.id },
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
        result = await gqlClient.sdk.authGroups({}, adminOptions);
        expect(
          _.get(result, 'data.authGroups.records').length
        ).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        const permissionSets = _.get(result, 'data.authPermissionSets.records');
        for (const ps of permissionSets) {
          result = await gqlClient.sdk.authPermissionSetDelete(
            { id: ps.id },
            adminOptions
          );
        }
        result = await gqlClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        expect(_.get(result, 'data.authPermissionSets.records').length).toEqual(
          0
        );
      });
      it('Should NOT query new folder using JWT token', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let error: any;
        try {
          result = await gqlClient.sdk.temporalDataObject(
            { id: newTDOId },
            jwtTokenOption
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
      });
      it('Should delete new folder', async () => {
        result = await gqlClient.sdk.deleteFolder(
          {
            input: {
              id: newFolderId,
              orderIndex: 0
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.deleteFolder.id')).toEqual(newFolderId);
      });
      it('Should delete new TDO', async () => {
        result = await gqlClient.sdk.deleteTDO({ id: newTDOId }, adminOptions);
        expect(_.get(result, 'data.deleteTDO.id')).toEqual(newTDOId);
      });
    });
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'ownerOrganization operations - %s uses OLP features on OLP organization',
    (tokenType) => {
      let result: any;
      let tokenOptions: any;
      let newAuthGroup: any, newAuthPermissionSet: any;
      let cmsRootFolderId: string, newFolderId: string;
      let acl: any[];
      let folderIds: string[];

      beforeAll(async () => {
        // superAdmin can use OLP features on other OLP organizations, whether they belong to OLP or non-OLP.
        tokenOptions =
          tokenType === 'superAdmin'
            ? helpers.requestOptions(superToken).headers
            : adminOptions;
      });

      it('should get cms root folder via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });

      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-auth-group-${uuidv4()}`,
              description: `${citestMarker}-auth-group`,
              ownerOrganization: testOrg.guid
            }
          },
          tokenOptions
        );
        expect(_.get(result, 'data.authGroupCreate')).toBeDefined();
        expect(_.get(result, 'data.authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        expect(_.get(result, 'data.authGroupCreate.organization.id')).toEqual(
          testOrg.id
        );
        newAuthGroup = _.get(result, 'data.authGroupCreate');
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareTdoDelete,
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoSearch,
                AuthPermissionType.AiwareTdoUpdate
              ],
              organizationID: testOrg.id // this is ownerOrganization
            }
          },
          tokenOptions
        );
        expect(_.get(result, 'data.authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'data.authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        expect(
          _.get(result, 'data.authPermissionSetCreate.organization.id')
        ).toEqual(testOrg.id);
        newAuthPermissionSet = _.get(result, 'data.authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // should create Folder in OLP org via adminOrg
        result = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description:
                'test folder for rbac created by admin for auth group and permission set operations',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.createFolder')).toBeDefined();
        expect(_.get(result, 'data.createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        newFolderId = _.get(result, 'data.createFolder.id');

        // superAdmin adds ACE to resource with specific ownerOrganization
        result = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [newFolderId],
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ],
            ownerOrganization: testOrg.guid
          },
          tokenOptions
        );
        acl = _.get(result, 'data.addACEsToResources.records');
        let checkGroupAdded = false;
        for (const ace of acl) {
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
      it('should get all folders (should be more than 1 created by admin) via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(
          result,
          'data.rootFolders[0].childFolders.records'
        );
        folderIds = childFolders.map(
          (childFolder: any) => childFolder.treeObjectId
        );
        expect(childFolders.length).toBeGreaterThanOrEqual(1);
      });
      it('should get ACL for organization resource', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.GetResourcesACL(
          {
            ids: [testOrg.id],
            resourceType: AuthResourceType.Organization,
            ownerOrganization: testOrg.guid
          },
          tokenOptions
        );
        const acls = _.get(result, 'data.getACLForResources.records');
        expect(acls.length).toBeGreaterThan(0);
        expect(_.get(acls, '[0].organization.id')).toEqual(testOrg.id);
        expect(_.get(acls, '[0].permissionSet.organization.id')).toEqual(
          testOrg.id
        );
        expect(_.get(acls, '[0].member.organization.id')).toEqual(testOrg.id);
      });
      it('should delete these folders via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        let deletedCount = 0;
        for (const folderId of folderIds) {
          // delete Folders
          deletedCount++;
          result = await gqlClient.sdk.deleteFolder(
            {
              input: {
                id: folderId,
                orderIndex: 0
              }
            },
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(1);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.authGroups(
          { ownerOrganization: testOrg.guid },
          tokenOptions
        );

        const authGroups = _.get(result, 'data.authGroups.records');
        for (const g of authGroups) {
          expect(_.get(g, 'organization.id')).toEqual(testOrg.id);
          let error: any;
          try {
            result = await gqlClient.sdk.authGroupDelete(
              { id: g.id, ownerOrganization: testOrg.guid },
              tokenOptions
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
        result = await gqlClient.sdk.authGroups(
          { ownerOrganization: testOrg.guid },
          tokenOptions
        );
        expect(
          _.get(result, 'data.authGroups.records').length
        ).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.sdk.authPermissionSets(
          {
            nameRegex: `${citestMarker}-auth-permission-set`,
            ownerOrganization: testOrg.guid
          },
          tokenOptions
        );

        const permissionSets = _.get(result, 'data.authPermissionSets.records');
        for (const ps of permissionSets) {
          expect(_.get(ps, 'organization.id')).toEqual(testOrg.id);
          result = await gqlClient.sdk.authPermissionSetDelete(
            { id: ps.id, ownerOrganization: testOrg.guid },
            tokenOptions
          );
        }
        result = await gqlClient.sdk.authPermissionSets(
          {
            nameRegex: `${citestMarker}-auth-permission-set`,
            ownerOrganization: testOrg.guid
          },
          tokenOptions
        );
        expect(_.get(result, 'data.authPermissionSets.records').length).toEqual(
          0
        );
      });
    }
  );

  describe('Manage access to resources', () => {
    let result: any;
    let defaultAGsToRemoveMember: any[] = [];
    let acl: any[];
    let cmsRootFolderId: string;
    let folderIds: string[] = [];
    let newAuthPermissionSet: any;
    let restrictedFolderId: string;
    let restrictedFolderName: string;
    let schemaId: string, sdoFolderId: string, sdoId: string;

    beforeAll(async () => {
      // check restrictUser logins
      result = await gqlClient.sdk.me({}, restrictOptions);
      expect(_.get(result, 'data.me.name')).toContain(
        `${citestMarker}-first-restrict-user`
      );
      defaultAGsToRemoveMember = _.get(
        result,
        'data.me.authGroups.records',
        []
      );
      result = await gqlClient.sdk.rootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOptions
      );
      const rootFolders = _.get(result, 'data.rootFolders');
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
        const results = await Promise.all(
          authGroupIds.map((id) =>
            gqlClient.sdk.authGroupRemoveMembers(
              {
                id,
                memberIds: [restrictUser.userId, secondRestrictUser.userId]
              },
              adminOptions
            )
          )
        );
        expect(results.length).toEqual(authGroupIds.length);
      }
    });

    it('should not be able to create Folder Content Template without AIWARE_SDO_READ permission', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.sdk.createDataRegistry(
        {
          input: {
            id: uuidv4(),
            name: `${citestMarker}-data-registry-${uuidv4()}`,
            description:
              'test data registry for rbac auth group and permission set operations',
            source: 'citest-source'
          }
        },
        adminOptions
      );
      expect(_.get(result, 'data.createDataRegistry')).toBeDefined();
      expect(_.get(result, 'data.createDataRegistry.name')).toContain(
        `${citestMarker}-data-registry`
      );
      testOrg.dataRegistryId = _.get(result, 'data.createDataRegistry.id');
      result = await gqlClient.sdk.createSchema(
        {
          input: {
            id: uuidv4(),
            dataRegistryId: testOrg.dataRegistryId,
            majorVersion: 1,
            minorVersion: 0,
            status: SchemaStatus.Draft,
            definition: {
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                }
              }
            }
          }
        },
        adminOptions
      );
      expect(_.get(result, 'data.createSchema')).toBeDefined();
      expect(_.get(result, 'data.createSchema.id')).toBeDefined();

      schemaId = _.get(result, 'data.createSchema.id');

      expect(schemaId).toBeDefined();

      result = await gqlClient.sdk.updateSchemaState(
        {
          input: {
            id: schemaId,
            status: SchemaStatus.Published
          }
        },
        adminOptions
      );

      expect(_.get(result, 'data.updateSchemaState.id')).toBeDefined();
      expect(_.get(result, 'data.updateSchemaState.status')).toEqual(
        'published'
      );
      result = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'test folder for rbac created by regular user',
            parentId: cmsRootFolderId,
            rootFolderType: RootFolderType.Cms
          }
        },
        regularOptions
      );
      expect(_.get(result, 'data.createFolder')).toBeDefined();
      expect(_.get(result, 'data.createFolder.name')).toContain(
        `${citestMarker}-folder`
      );
      sdoFolderId = _.get(result, 'data.createFolder.id');

      // grant access folder to restrictUser
      const folderPermissionRes = await gqlClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-folder-permission-set-${uuidv4()}`,
            description: `${citestMarker}-folder-permission-set`,
            permissions: [AuthPermissionType.AiwareFolderUpdate]
          }
        },
        adminOptions
      );
      expect(
        _.get(folderPermissionRes, 'data.authPermissionSetCreate')
      ).toBeDefined();
      expect(
        _.get(folderPermissionRes, 'data.authPermissionSetCreate.name')
      ).toContain(`${citestMarker}-folder-permission-set`);
      const folderPermissionSets = _.get(
        folderPermissionRes,
        'data.authPermissionSetCreate'
      );

      // Legacy `rbacHelper.helpAddACEsToResources` -> the generated SDK's
      // `addACEsToResources` field selection is at least as rich as the
      // legacy hand-written query, and this call site's result is unused
      // (only the side effect matters), so the SDK is a clean drop-in here.
      await gqlClient.sdk.addACEsToResources(
        {
          resourceType: AuthResourceType.Folder,
          ids: [sdoFolderId],
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: folderPermissionSets.id
            }
          ]
        },
        adminOptions
      );

      result = await gqlClient.sdk.createStructuredData(
        {
          input: {
            schemaId,
            data: {
              name: 'test SDO'
            }
          }
        },
        regularOptions
      );

      sdoId = _.get(result, 'data.createStructuredData.id');
      // Login for Restrict user
      const impersonated = await impersonateUser(
        superToken,
        restrictUser.userId,
        testOrg.guid
      );
      restrictOptions = impersonated.requestOptions;

      await expect(
        gqlClient.sdk.createFolderContentTemplate(
          {
            input: {
              folderId: sdoFolderId,
              sdoId,
              schemaId
            }
          },
          restrictOptions
        )
      ).rejects.toThrow(
        /No authorization access role found for Mutation.createFolderContentTemplate/
      );
    });

    it('should be able to create Folder Content Template with AIWARE_SDO_READ permission', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
            description: `${citestMarker}-auth-permission-set`,
            permissions: [AuthPermissionType.AiwareSdoRead]
          }
        },
        adminOptions
      );
      expect(_.get(result, 'data.authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'data.authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      const sdoPermissionSets = _.get(result, 'data.authPermissionSetCreate');
      result = await gqlClient.sdk.addACEsToResources(
        {
          resourceType: AuthResourceType.SdoSchema,
          ids: [schemaId],
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: sdoPermissionSets.id
            }
          ]
        },
        adminOptions
      );

      // re impersonateUser to reset role
      const impersonated = await impersonateUser(
        superToken,
        restrictUser.userId,
        testOrg.guid
      );
      restrictOptions = impersonated.requestOptions;

      result = await gqlClient.sdk.createFolderContentTemplate(
        {
          input: {
            folderId: sdoFolderId,
            sdoId,
            schemaId
          }
        },
        restrictOptions
      );

      const folderContentTemplate = _.get(
        result,
        'data.createFolderContentTemplate'
      );
      expect(folderContentTemplate.id).toBeDefined();
      expect(folderContentTemplate.sdoId).toEqual(sdoId);
    });

    it('should create a new permission set', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
            description: `${citestMarker}-auth-permission-set`,
            permissions: [
              AuthPermissionType.AiwareFolderUpdate,
              AuthPermissionType.AiwareFolderRead,
              AuthPermissionType.AiwareFolderDelete,
              AuthPermissionType.AiwareFolderCreate,
              AuthPermissionType.AiwareFolderFile
            ]
          }
        },
        adminOptions
      );
      expect(_.get(result, 'data.authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'data.authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      newAuthPermissionSet = _.get(result, 'data.authPermissionSetCreate');
    });

    it('should share Root Folder Access with restrict users', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.sdk.addACEsToResources(
        {
          resourceType: AuthResourceType.Folder,
          ids: [cmsRootFolderId],
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: newAuthPermissionSet.id
            },
            {
              member: {
                id: secondRestrictUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: newAuthPermissionSet.id
            }
          ]
        },
        adminOptions
      );

      acl = _.get(result, 'data.addACEsToResources.records');
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
        const impersonated = await impersonateUser(
          superToken,
          restrictUser.userId,
          testOrg.guid
        );
        restrictOptions = impersonated.requestOptions;

        await expect(
          gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-folder-${uuidv4()}`,
                description:
                  'test folder for rbac created by admin for auth group and permission set operations',
                parentId: cmsRootFolderId,
                rootFolderType: RootFolderType.Cms
              }
            },
            restrictOptions
          )
        ).rejects.toThrow(
          /No authorization access role found for Mutation.createFolder/
        );
      });

      it('should be able to create Folder with AIWARE_FOLDER_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [AuthPermissionType.AiwareFolderCreate]
            }
          },
          adminOptions
        );
        expect(_.get(result, 'data.authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'data.authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        const folderPermissionSets = _.get(
          result,
          'data.authPermissionSetCreate'
        );
        result = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Organization,
            ids: [testOrg.id],
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: folderPermissionSets.id
              }
            ]
          },
          adminOptions
        );

        result = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description:
                'test folder for rbac created by admin for auth group and permission set operations',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          restrictOptions
        );
        expect(_.get(result, 'data.createFolder')).toBeDefined();
        expect(_.get(result, 'data.createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        restrictedFolderName = _.get(result, 'data.createFolder.name');
        restrictedFolderId = _.get(result, 'data.createFolder.id');
        folderIds.push(restrictedFolderId);
      });
      it('should verify owner access', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(
          superToken,
          restrictUser.userId,
          testOrg.guid
        );
        restrictOptions = impersonated.requestOptions;

        result = await gqlClient.sdk.folder(
          { id: restrictedFolderId },
          restrictOptions
        );
        expect(_.get(result, 'data.folder.id')).toEqual(restrictedFolderId);
      });
      it('should allow a restricted user to update a folder they created', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const impersonated = await impersonateUser(
          superToken,
          restrictUser.userId,
          testOrg.guid
        );
        restrictOptions = impersonated.requestOptions;
        const updateResult = await gqlClient.sdk.updateFolder(
          {
            input: {
              id: restrictedFolderId,
              name: `${restrictedFolderName}-updated`
            }
          },
          restrictOptions
        );
        expect(_.get(updateResult, 'data.updateFolder')).toBeDefined();
        expect(_.get(updateResult, 'data.updateFolder.name')).toContain(
          `${restrictedFolderName}-updated`
        );
      });
      it('should verify user access when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(
          superToken,
          secondRestrictUser.userId,
          testOrg.guid
        );
        secondRestrictOptions = impersonated.requestOptions;

        await expect(
          gqlClient.sdk.folder(
            { id: restrictedFolderId },
            secondRestrictOptions
          )
        ).rejects.toThrow();
        //The folder was not found. It either does not exist or you or your organization do not have access to it./
      });
      it('should verify user access for updating folder when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(
          superToken,
          secondRestrictUser.userId,
          testOrg.guid
        );
        secondRestrictOptions = impersonated.requestOptions;

        await expect(
          gqlClient.sdk.updateFolder(
            {
              input: {
                id: restrictedFolderId,
                name: `${restrictedFolderName}-updated`
              }
            },
            secondRestrictOptions
          )
        ).rejects.toThrow();
        //The folder was not found. It either does not exist or you or your organization do not have access to it./
      });
      it('admin shares Private Resource Access with user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [restrictedFolderId],
            entries: [
              {
                member: {
                  id: secondRestrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        acl = _.get(result, 'data.addACEsToResources.records');
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 owner + 1 ACE on user level
        expect(acl.length).toEqual(4);
      });
      it('should verify user access when grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(
          superToken,
          secondRestrictUser.userId,
          testOrg.guid
        );
        secondRestrictOptions = impersonated.requestOptions;

        result = await gqlClient.sdk.folder(
          { id: restrictedFolderId },
          secondRestrictOptions
        );
        expect(_.get(result, 'data.folder.id')).toEqual(restrictedFolderId);
      });
    });

    describe('should grant the user access to specific resources', () => {
      let restrictedFolderId1: string, restrictedFolderId2: string;
      it('should create folder', async () => {
        const createResult = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description:
                'test folder for rbac created by admin for auth group and permission set operations',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(_.get(createResult, 'data.createFolder')).toBeDefined();
        expect(_.get(createResult, 'data.createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        restrictedFolderId1 = _.get(createResult, 'data.createFolder.id', '');
        folderIds.push(restrictedFolderId1);
      });
      it('should verify user access when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(
          superToken,
          restrictUser.userId,
          testOrg.guid
        );
        restrictOptions = impersonated.requestOptions;

        await expect(
          gqlClient.sdk.folder({ id: restrictedFolderId1 }, restrictOptions)
        ).rejects.toThrow();
        //The folder was not found. It either does not exist or you or your organization do not have access to it./
      });
      it('should share Folder Resource Access with user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [restrictedFolderId1],
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        acl = _.get(result, 'data.addACEsToResources.records');
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 owner ACE + 1 ACE on user level
        expect(acl.length).toEqual(4);
      });
      it('should create Folder and share Folder Resource Access with user - by addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-folder-${uuidv4()}"
                description: "test folder for rbac with addACEs nested mutation"
                parentId: "${cmsRootFolderId}"
                rootFolderType: cms
              }
            ) {
              id
              name
              addACEs(
                entries: [
                   {
                    member: {
                      id: "${restrictUser.userId}"
                      memberType: User
                    }
                    permissionSetID: "${newAuthPermissionSet.id}"
                  }
                ]
              ) {
                records {
                  id
                  objectID
                  objectType
                }
                count
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createFolder')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toContain(
          `${citestMarker}-folder`
        );
        restrictedFolderId2 = _.get(result, 'createFolder.id');
        folderIds.push(restrictedFolderId2);

        acl = _.get(result, 'createFolder.addACEs.records');
        // 1 default ACEs (orgAdmin + aiWARE Full Access) + 1 ACE on user level, ignore inheritance + 1 owner ACE
        expect(acl.length).toEqual(3);
      });
      it('should verify user access when grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        const impersonated = await impersonateUser(
          superToken,
          restrictUser.userId,
          testOrg.guid
        );
        restrictOptions = impersonated.requestOptions;

        result = await gqlClient.sdk.folder(
          { id: restrictedFolderId1 },
          restrictOptions
        );
        expect(_.get(result, 'data.folder.id')).toEqual(restrictedFolderId1);

        result = await gqlClient.sdk.folder(
          { id: restrictedFolderId2 },
          restrictOptions
        );
        expect(_.get(result, 'data.folder.id')).toEqual(restrictedFolderId2);
      });
    });
    it('should delete these folders', async () => {
      let deletedCount = 0;
      for (const folderId of folderIds) {
        // delete Folders
        deletedCount++;
        result = await gqlClient.sdk.deleteFolder(
          {
            input: {
              id: folderId,
              orderIndex: 0
            }
          },
          adminOptions
        );
      }
      expect(deletedCount).toEqual(3);
    });

    describe('should not be accessible to User Default Private AG via the regular groups APIs', () => {
      it("the user's default private AG cannot be listed", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // authGroups API.
        result = await gqlClient.sdk.authGroups(
          { ids: [privateAuthGroupId] },
          adminOptions
        );
        expect(_.get(result, 'data.authGroups.records')).toBeDefined();
        expect(result.data.authGroups.records.length).toEqual(0);

        // authGroups in User type -- refresh the restrict user's session.
        const impersonated = await impersonateUser(
          superToken,
          restrictUser.userId,
          testOrg.guid
        );
        expect(impersonated.token).toBeDefined();
        result = await gqlClient.sdk.me({}, restrictOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-first-restrict-user`
        );
        const defaultAGs = _.get(result, 'data.me.authGroups.records', []);
        const defaultAGIds = _.map(defaultAGs, 'id');
        expect(defaultAGIds.includes(privateAuthGroupId)).toEqual(false);
      });
      it("the user's default private AG cannot be updated", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        await expect(async () =>
          gqlClient.sdk.authGroupUpdate(
            {
              input: {
                id: privateAuthGroupId,
                description: 'test2',
                name: 'test2'
              }
            },
            adminOptions
          )
        ).rejects.toThrow('Authorization group not found');
      });
      it("the user's default private AG cannot be deleted", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(async () =>
          gqlClient.sdk.authGroupDelete(
            { id: privateAuthGroupId },
            adminOptions
          )
        ).rejects.toThrow('This auth group is a protected group.');
      });
      it("the user's default private AG cannot be added members to it", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(async () =>
          gqlClient.sdk.authGroupAddMembers(
            {
              id: privateAuthGroupId,
              members: [
                { id: regularUser.userId, memberType: AuthGroupMemberType.User }
              ]
            },
            adminOptions
          )
        ).rejects.toThrow('Authorization group not found');
      });
      it("members cannot be added to the user's default private AG", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(async () =>
          gqlClient.sdk.authGroupAddMembers(
            {
              id: privateAuthGroupId,
              members: [
                { id: regularUser.userId, memberType: AuthGroupMemberType.User }
              ]
            },
            adminOptions
          )
        ).rejects.toThrow('Authorization group not found');
      });
      it("members cannot be removed from the user's default private AG", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(async () =>
          gqlClient.sdk.authGroupRemoveMembers(
            {
              id: privateAuthGroupId,
              memberIds: [restrictUser.userId]
            },
            adminOptions
          )
        ).rejects.toThrow('Authorization group not found');
      });
    });
    it('should only delete non-protected auth groups', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.sdk.authGroups({}, adminOptions);
      const authGroups = _.get(result, 'data.authGroups.records');
      for (const g of authGroups) {
        let error: any;
        try {
          result = await gqlClient.sdk.authGroupDelete(
            { id: g.id },
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
      result = await gqlClient.sdk.authGroups({}, adminOptions);
      expect(
        _.get(result, 'data.authGroups.records').length
      ).toBeGreaterThanOrEqual(2);
    });
    it('should only delete non-protected permission sets', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      result = await gqlClient.sdk.authPermissionSets(
        { nameRegex: `${citestMarker}-auth-permission-set` },
        adminOptions
      );
      const permissionSets = _.get(result, 'data.authPermissionSets.records');

      for (const ps of permissionSets) {
        result = await gqlClient.sdk.authPermissionSetDelete(
          { id: ps.id },
          adminOptions
        );
      }
      result = await gqlClient.sdk.authPermissionSets(
        { nameRegex: `${citestMarker}-auth-permission-set` },
        adminOptions
      );
    });
  });

  describe('RBAC for get packages', () => {
    let ci_app_grant_package: any;
    const app_uuid = uuidv4();
    let testAppId: string;
    const testApp = {
      id: uuidv4(),
      name: `${citestMarker} Package App - ${app_uuid}}`,
      key: `citest-package-app ${app_uuid}`,
      description: `Citest Package App - ${app_uuid}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    };
    let ci_app_owned_package: any;
    let newAuthPermissionSet: any;
    it('should create application', async () => {
      const query = `
          mutation createApp {
            createApplication(
              input: {
                name: "${testApp.name}"
                key: "${testApp.key}"
                description: "${testApp.description}"
                url: "${testApp.url}"
                oauth2RedirectUrls: "${testApp.oauth2RedirectUrls}"
                checkPermissions: ${testApp.checkPermissions}
                status: ${testApp.status}
                disableAutoPackageCreation: true # disable auto package creation for createPackage below
              }
            ) {
              id
              name
              status
            }
          }
        `;
      const result = await gqlClient.query(query, {}, superAdminOptions);
      testAppId = _.get(result, 'createApplication.id');
      expect(testAppId).toBeDefined();
    });
    it('should create package with application resource', async () => {
      const resultAppGrantPackageMutation = await gqlClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker} citest appGrant test package`,
            version: '1.0',
            primaryResourceId: testAppId,
            resources: [
              {
                resourceId: testAppId,
                resourceType: PackageResourceType.Application,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        superAdminOptions
      );
      ci_app_grant_package = _.get(
        resultAppGrantPackageMutation,
        'data.packageCreate'
      );
    });
    it('should grant package to organization with VIEW access', async () => {
      const result = await gqlClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: ci_app_grant_package.id,
            packageGrants: [
              {
                organizationId: testOrg.id,
                action: PackageGrantAction.Add,
                grantType: PackageGrantType.View
              }
            ]
          }
        },
        superAdminOptions
      );
      expect(_.get(result, 'data.packageUpdateGrants.id')).toEqual(
        ci_app_grant_package.id
      );
    });

    it('should create a package owned by organization', async () => {
      const resultAppGrantPackageMutation = await gqlClient.sdk.packageCreate(
        {
          input: {
            name: `${citestMarker} citest org owned packages`,
            version: '1.0',
            organizationId: testOrg.id
          }
        },
        adminOptions
      );
      ci_app_owned_package = _.get(
        resultAppGrantPackageMutation,
        'data.packageCreate'
      );
    });

    it('admin user should fetch both granted and org-owned packages', async () => {
      const packagesResult = await gqlClient.sdk.queryPackages(
        { ids: [ci_app_grant_package.id, ci_app_owned_package.id] },
        adminOptions
      );
      const packages = _.get(packagesResult, 'data.packages.records');
      expect(packages?.length).toEqual(2);
    });

    it('regular user with AIWARE_DEVELOPER_ENGINE_READ should fetch both granted and org-owned packages', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const result = await gqlClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
            description: `${citestMarker}-auth-permission-set`,
            permissions: [AuthPermissionType.DeveloperEngineRead]
          }
        },
        adminOptions
      );

      expect(_.get(result, 'data.authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'data.authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      newAuthPermissionSet = _.get(result, 'data.authPermissionSetCreate');

      await gqlClient.sdk.addACEsToResources(
        {
          resourceType: AuthResourceType.Organization,
          ids: [testOrg.id],
          entries: [
            {
              member: {
                id: secondRegularUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: newAuthPermissionSet.id
            }
          ]
        },
        adminOptions
      );

      // re-impersonate secondRegularUser for the freshly granted permission
      const impersonated = await impersonateUser(
        superToken,
        secondRegularUser.userId,
        testOrg.guid
      );
      secondRegularOptions = impersonated.requestOptions;

      const packagesResult = await gqlClient.sdk.queryPackages(
        { ids: [ci_app_grant_package.id, ci_app_owned_package.id] },
        secondRegularOptions
      );
      const packages = _.get(packagesResult, 'data.packages.records');
      expect(packages?.length).toEqual(2);
    });

    it('regular user without AIWARE_DEVELOPER_ENGINE_READ should fetch only granted packages', async () => {
      const packagesResult = await gqlClient.sdk.queryPackages(
        { ids: [ci_app_grant_package.id, ci_app_owned_package.id] },
        regularOptions
      );
      const packages = _.get(packagesResult, 'data.packages.records');
      expect(packages?.length).toEqual(1);
    });

    it('superadmin should see same packages via packages query and packageGrants', async () => {
      const grantedIds = await getGrantedPackageIds(
        testOrg.id,
        superAdminOptions
      );
      const fetchedPackages = await getPackagesByIds(
        grantedIds,
        superAdminOptions
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('developer user should see same packages from packages and packageGrants', async () => {
      const grantedIds = await getGrantedPackageIds(
        testOrg.id,
        secondRegularOptions
      );
      const fetchedPackages = await getPackagesByIds(
        grantedIds,
        secondRegularOptions
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('regular user without developer permission should see same granted packages from both APIs', async () => {
      const grantedIds = await getGrantedPackageIds(testOrg.id, regularOptions);
      const fetchedPackages = await getPackagesByIds(
        grantedIds,
        regularOptions
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('should delete multiple packages sequentially', async () => {
      const packageIdsToDelete = [
        ci_app_grant_package.id,
        ci_app_owned_package.id
      ];

      for (const id of packageIdsToDelete) {
        const result = await gqlClient.sdk.packageDelete(
          { id },
          superAdminOptions
        );
        expect(result.data.packageDelete!.success).toBe(true);
      }
    });
    it('should delete application', async () => {
      const result = await gqlClient.sdk.deleteApplication({ id: testAppId });
      const deletedApp = _.get(result, 'data.deleteApplication');
      expect(deletedApp!.id).toEqual(testAppId);
    });
  });

  describe('ACE Inheritance with ace inherit flag', () => {
    let parentFolderId: string, childFolderId: string, childTDOId: string;
    let testAuthGroupId: string, testPermissionSetId: string;
    let adminUserId: string, regularUserId: string;
    let cmsRootFolderId: string;
    let result: any;

    describe('with Admin user', () => {
      beforeAll(async () => {
        // Verify admin login
        result = await gqlClient.sdk.me({}, adminOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-admin-user`
        );
        adminUserId = _.get(result, 'data.me.id');

        result = await gqlClient.sdk.me({}, regularOptions);
        expect(_.get(result, 'data.me.name')).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = _.get(result, 'data.me.id');
        // Create test auth group
        result = await gqlClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-inherit-test-group-${uuidv4()}`,
              description: 'Test group for inheritance testing'
            }
          },
          adminOptions
        );
        testAuthGroupId = _.get(result, 'data.authGroupCreate.id');
        expect(testAuthGroupId).toBeDefined();

        // Create test permission set
        result = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-inherit-test-permissions-${uuidv4()}`,
              description: 'Test permissions for inheritance testing',
              permissions: [
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.AiwareFolderUpdate,
                AuthPermissionType.AiwareTdoRead
              ]
            }
          },
          adminOptions
        );
        testPermissionSetId = _.get(result, 'data.authPermissionSetCreate.id');
        expect(testPermissionSetId).toBeDefined();

        result = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = _.get(result, 'data.rootFolders');
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });

      it('should create parent folder with ACE having inherit', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const createResult = await gqlClient.query(
          `mutation createFolder {
            createFolder(
              input: {
                name: "${citestMarker}-parent-folder-inherit-${uuidv4()}"
                description: "Parent folder with inherit ACE"
                parentId: "${cmsRootFolderId}"
              }
            ) {
              id
              name
              addACEs(entries: [
                  {
                    member: {
                      id: "${testAuthGroupId}"
                      memberType: Group
                    }
                    permissionSetID: "${testPermissionSetId}"
                    options: ["inherit"]
                  },
                  {
                    member: {
                      id: "${regularUserId}"
                      memberType: User
                    }
                    permissionSetID: "${testPermissionSetId}"
                    options: ["inherit"]
                  }
                ]) {
                    records { id options }
                  }
            }
          }`,
          {},
          adminOptions
        );
        parentFolderId = _.get(createResult, 'createFolder.id');
        expect(parentFolderId).toBeDefined();
      });

      it('should verify parent folder ACE has options: inherit', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const aclResult = await gqlClient.sdk.GetResourcesACL(
          {
            ids: [parentFolderId],
            resourceType: AuthResourceType.Folder
          },
          adminOptions
        );
        const acl = _.get(aclResult, 'data.getACLForResources.records', []);
        const inheritACE = acl.find(
          (ace: any) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritACE).toBeDefined();
        expect(inheritACE!.options).toContain('inherit');
      });

      it("should create parent folder with user private group ACE having options: ['inherit']", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const addResult = await gqlClient.sdk.addACEsToResources(
          {
            ids: [parentFolderId],
            resourceType: AuthResourceType.Folder,
            entries: [
              {
                member: {
                  id: adminUserId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: testPermissionSetId,
                options: ['inherit']
              }
            ]
          },
          adminOptions
        );
        const acl = _.get(addResult, 'data.addACEsToResources.records');
        const userPrivateACE = acl.find(
          (ace: any) =>
            ace.options.includes('inherit') &&
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`)
        );
        expect(userPrivateACE).toBeDefined();
        expect(userPrivateACE!.options).toContain('inherit');
      });

      it('should create child folder and verify ACE inheritance with inherit flag', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        result = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-child-folder-${uuidv4()}`,
              description: 'Child folder to test inheritance',
              parentId: parentFolderId
            }
          },
          adminOptions
        );
        childFolderId = _.get(result, 'data.createFolder.id');
        expect(childFolderId).toBeDefined();

        // Verify that ACEs with inherit flag are inherited
        result = await gqlClient.sdk.GetResourcesACL(
          {
            ids: [childFolderId],
            resourceType: AuthResourceType.Folder
          },
          adminOptions
        );
        const childACL = _.get(result, 'data.getACLForResources.records', []);

        // Should inherit the regular test group ACE with inherit flag
        const inheritedTestGroupACE = childACL.find(
          (ace: any) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedTestGroupACE).toBeDefined();
        expect(inheritedTestGroupACE.options).toContain('inherit');

        // Should inherit the user private group ACE with inherit flag (this normally wouldn't inherit)
        const inheritedUserPrivateACE = childACL.find(
          (ace: any) =>
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`) &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedUserPrivateACE).toBeDefined();
        expect(inheritedUserPrivateACE.options).toContain('inherit');
      });

      it('should create TDO in child folder and verify ACE inheritance without inherit flag', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        result = await gqlClient.sdk.createTDO(
          {
            input: {
              name: `${citestMarker}-child-tdo-${uuidv4()}`,
              description: 'Child TDO to test inheritance',
              parentFolderId: childFolderId,
              startDateTime: '2025-08-26T00:00:00Z',
              stopDateTime: '2025-08-26T00:00:00Z'
            }
          },
          adminOptions
        );
        childTDOId = _.get(result, 'data.createTDO.id');
        expect(childTDOId).toBeDefined();

        // Verify that ACEs are inherited to TDO (TDOs don't have inherit flag since they're not containers)
        result = await gqlClient.sdk.GetResourcesACL(
          {
            ids: [childTDOId],
            resourceType: AuthResourceType.Tdo
          },
          adminOptions
        );
        const tdoACL = _.get(result, 'data.getACLForResources.records', []);

        // Should inherit the regular test group ACE
        const inheritedTestGroupACE = tdoACL.find(
          (ace: any) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedTestGroupACE).toBeDefined();

        // Should inherit the user private group ACE (because parent had inherit flag)
        const inheritedUserPrivateACE = tdoACL.find(
          (ace: any) =>
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`) &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedUserPrivateACE).toBeDefined();
      });

      it('should verify regular user can access resources through inherited ACE', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        // Regular user should be able to access child TDO through inherited user private group ACE
        result = await gqlClient.sdk.temporalDataObject(
          { id: childTDOId },
          regularOptions
        );
        expect(_.get(result, 'data.temporalDataObject.id')).toEqual(childTDOId);

        // TODO: For some reason the following always fails. If the test cleanup is disabled executing the same
        // query manually works as expected. For some reason this only happens with folders and not TDOs. It is possible
        // to have a stale rbac cache somewhere?

        // Regular user should be able to access child folder through inherited user private group ACE
        /*
        result = await gqlClient.query(
          `query folder {
            folder(id: "${parentFolderId}") {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'folder.id')).toEqual(parentFolderId);
        */
      });

      afterAll(async () => {
        if (!useRBACFeature) {
          return;
        }

        // Clean up test resources
        await safe('delete childTDOId', async () => {
          if (childTDOId) {
            await gqlClient.sdk.deleteTDO({ id: childTDOId }, adminOptions);
          }
        });

        await safe('delete childFolderId', async () => {
          if (childFolderId) {
            await gqlClient.sdk.deleteFolder(
              { input: { id: childFolderId, orderIndex: 0 } },
              adminOptions
            );
          }
        });

        await safe('delete parentFolderId', async () => {
          if (parentFolderId) {
            await gqlClient.sdk.deleteFolder(
              { input: { id: parentFolderId, orderIndex: 0 } },
              adminOptions
            );
          }
        });

        await safe('delete testAuthGroupId', async () => {
          if (testAuthGroupId) {
            await gqlClient.sdk.authGroupDelete(
              { id: testAuthGroupId },
              adminOptions
            );
          }
        });

        await safe('delete testPermissionSetId', async () => {
          if (testPermissionSetId) {
            await gqlClient.sdk.authPermissionSetDelete(
              { id: testPermissionSetId },
              adminOptions
            );
          }
        });
      });

      describe('Folder without inherit flag comparison', () => {
        let parentFolderNoInheritId: string, childFolderNoInheritId: string;

        beforeAll(async () => {
          if (!useRBACFeature) {
            return;
          }

          // Create parent folder WITHOUT inherit flag on user private group ACE
          result = await gqlClient.query(
            `mutation createFolder {
              createFolder(
                input: {
                  name: "${citestMarker}-parent-folder-no-inherit-${uuidv4()}"
                  description: "Parent folder without inherit ACE"
                  parentId: "${cmsRootFolderId}"
                }
              ) {
                id
                name
                addACEs (entries: [
                    {
                      member: {
                        id: "${testAuthGroupId}"
                        memberType: Group
                      }
                      permissionSetID: "${testPermissionSetId}"
                    }
                  ]) {
                      records { id options }
                    }
              }
            }`,
            {},
            adminOptions
          );
          parentFolderNoInheritId = _.get(result, 'createFolder.id');
          expect(parentFolderNoInheritId).toBeDefined();
        });

        it('should verify parent folder ACE does NOT have inherit flag', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
            return;
          }

          result = await gqlClient.sdk.GetResourcesACL(
            {
              ids: [parentFolderNoInheritId],
              resourceType: AuthResourceType.Folder
            },
            adminOptions
          );
          const acl = _.get(result, 'data.getACLForResources.records', []);
          const userPrivateACE = acl.find(
            (ace: any) =>
              ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`
          );
          expect(userPrivateACE).toBeDefined();
          expect(userPrivateACE.options).not.toContain('inherit');
        });

        it('should create child folder and verify user private group ACE is NOT inherited', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
            return;
          }

          result = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-child-folder-no-inherit-${uuidv4()}`,
                description: 'Child folder to test no inheritance',
                parentId: parentFolderNoInheritId
              }
            },
            adminOptions
          );
          childFolderNoInheritId = _.get(result, 'data.createFolder.id');
          expect(childFolderNoInheritId).toBeDefined();

          // Verify that user private group ACE is NOT inherited (due to authGroupClass restriction)
          result = await gqlClient.sdk.GetResourcesACL(
            {
              ids: [childFolderNoInheritId],
              resourceType: AuthResourceType.Folder
            },
            adminOptions
          );
          const childACL = _.get(result, 'data.getACLForResources.records', []);

          // Should NOT inherit the user private group ACE (due to authGroupClass restriction)
          const notInheritedUserPrivateACE = childACL.find(
            (ace: any) =>
              ace.member.id === regularUserId &&
              ace.permissionSet.id === testPermissionSetId
          );
          expect(notInheritedUserPrivateACE).toBeUndefined();
        });

        afterAll(async () => {
          if (!useRBACFeature) {
            return;
          }

          // Clean up test resources
          await safe('delete childFolderNoInheritId', async () => {
            if (childFolderNoInheritId) {
              await gqlClient.sdk.deleteFolder(
                { input: { id: childFolderNoInheritId, orderIndex: 1 } },
                adminOptions
              );
            }
          });

          await safe('delete parentFolderNoInheritId', async () => {
            if (parentFolderNoInheritId) {
              await gqlClient.sdk.deleteFolder(
                { input: { id: parentFolderNoInheritId, orderIndex: 1 } },
                adminOptions
              );
            }
          });
        });
      });
    });
  });

  describe('Evaluate OLP Migration of Organization', () => {
    async function setOrgOLPFlag(orgId: string, enabled: boolean) {
      return gqlClient.sdk.updateOrganization(
        {
          input: {
            id: orgId,
            metadata: {
              features: {
                enableRBACFeature: enabled ? 'enabled' : 'disabled'
              }
            }
          }
        },
        helpers.requestOptions(superToken).headers
      );
    }

    it('olpMigration should be removed', async () => {
      // Disable org enableRBACFeature
      let result = await setOrgOLPFlag(testOrg.id, false);
      const updateOrganization = _.get(result, 'data.updateOrganization');
      expect(updateOrganization).toBeDefined();
      expect(updateOrganization!.id).toBeDefined();

      const _elasticRetryAttempts = 5;
      // retry 5 times to ensure olpMigration is removed
      for (let i = 0; i < _elasticRetryAttempts + 1; i++) {
        await helpers.sleep(1000);
        const orgsResult = await gqlClient.sdk.organizations(
          {
            kvpProperty: 'features.olpMigration',
            name: testOrg.name,
            nameMatch: StringMatch.Exact,
            limit: 1,
            offset: 0
          },
          helpers.requestOptions(superToken).headers
        );

        const organizations = _.get(orgsResult, 'data.organizations');
        expect(organizations).toBeDefined();
        try {
          expect(organizations!.count).toEqual(0);
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

      const getSchema = await gqlClient.sdk.schema(
        { id: createdSchemaId },
        restrictOptions
      );

      const getSDOs = await gqlClient.sdk.structuredDataObjects(
        { schemaId: createdSchemaId },
        restrictOptions
      );

      const schemaId = _.get(getSchema, 'data.schema.id');
      expect(schemaId).toBeDefined();
      expect(schemaId).toEqual(createdSchemaId);

      const sdos = _.get(getSDOs, 'data.structuredDataObjects.records');
      expect(sdos).toBeDefined();
      expect(sdos!.length).toBeGreaterThanOrEqual(0);
    });

    describe('olp enabled', () => {
      beforeAll(async () => {
        // enable OLP
        const result = await setOrgOLPFlag(testOrg.id, true);
        expect(result.data.updateOrganization!.id).toEqual(testOrg.id);
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

        const getSchema = await gqlClient.sdk.schema(
          { id: createdSchemaId },
          restrictOptions
        );

        const getSDOs = await gqlClient.sdk.structuredDataObjects(
          { schemaId: createdSchemaId },
          restrictOptions
        );

        const schemaId = _.get(getSchema, 'data.schema.id');
        expect(schemaId).toBeDefined();
        expect(schemaId).toEqual(createdSchemaId);

        const sdos = _.get(getSDOs, 'data.structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos!.length).toBeGreaterThanOrEqual(0);
      });

      afterAll(async () => {
        // disable OLP to cleanup the created default objects
        await safe('disable OLP flag', async () => {
          const result = await setOrgOLPFlag(testOrg.id, false);
          expect(result.data.updateOrganization!.id).toEqual(testOrg.id);
        });
      });
    });
  });

  afterAll(async () => {
    // Soft-delete testOrg (consistent with the rest of this tool's converted
    // specs) instead of the legacy REST hard-delete -- every member of
    // testOrg here is throwaway (the 5 test users + the isolated
    // superadmin), so there is no shared session to protect either way.
    await safe('delete testOrg', async () => {
      await gqlClient.sdk.updateOrganization({
        input: { id: testOrg.id, status: OrganizationStatus.Deleted }
      });
    });

    // Tear down the throwaway superadmin org/user last -- it uses the shared
    // bootstrap session internally, so it works even after the spec's own
    // teardown; failures are swallowed and logged by the helper.
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });
});
