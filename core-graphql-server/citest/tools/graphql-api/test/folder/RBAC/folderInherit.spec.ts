import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';
import { setupTestOrgAndUser } from '../../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../../helpers/superadminSession';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  RootFolderType
} from '../../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
let testSetup: any;

describe('citest_folder: folder inherit', () => {
  let superOrgGuid: any, superOrgId: any, superUserId: any, superToken: any;
  let testOrg: any, testUsers: any, adminUser: any, regularUser: any;
  let restrictUser: any, secondRestrictUser: any;
  let adminOptions: any;
  let regularOptions: any;
  let restrictOptions: any, secondRestrictOptions: any;
  let useRBACFeature: boolean;
  let result: any;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    // T24: create the test org via an ISOLATED throwaway superadmin rather than
    // the shared session. The isolated SA becomes the auto-enrolled member of
    // the test org, so deleting the test org in afterAll kills only the
    // isolated session — the shared session (used by every other spec in the
    // shard) is untouched. See test/helpers/superadminSession.ts.
    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    const isoClient = isolatedSuperadmin.client;

    const meRes = await isoClient.sdk.me();
    expect(meRes?.data?.me).toBeDefined();
    superToken = isolatedSuperadmin.token;

    const introspectionRes = await gqlClient.sdk.graphqlServiceInfo();
    useRBACFeature = !!introspectionRes?.data?.graphqlServiceInfo;

    superOrgGuid = meRes?.data?.me?.organization?.guid;
    superOrgId = meRes?.data?.me?.organization?.id;
    superUserId = meRes?.data?.me?.id;

    testSetup = await setupTestOrgAndUser(isoClient, createOrgAndUserInput);

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    testUsers = testSetup.listOptions ?? [];

    adminUser = (testSetup.listOptions ?? []).find((u: any) =>
      u.userName?.includes('admin-')
    );
    adminOptions = adminUser?.requestOptions;

    regularUser = (testSetup.listOptions ?? []).find((u: any) =>
      u.userName?.includes('regular-')
    );
    regularOptions = regularUser?.requestOptions;

    restrictUser = (testSetup.listOptions ?? []).find((u: any) =>
      u.userName?.includes('restrict-')
    );
    restrictOptions = restrictUser?.requestOptions;

    secondRestrictUser = (testSetup.listOptions ?? []).find((u: any) =>
      u.userName?.includes('second-restrict')
    );
    secondRestrictOptions = secondRestrictUser?.requestOptions;
  });

  describe('ACE Inheritance with ace inherit flag', () => {
    let parentFolderId: any, childFolderId: any, childTDOId: any;
    let testAuthGroupId: any, testPermissionSetId: any;
    let adminUserId: any, regularUserId: any;
    let cmsRootFolderId: any, newFolderId: any;

    describe('with Admin user', () => {
      beforeAll(async () => {
        const meRes = await gqlClient.sdk.me({}, adminOptions);
        expect(meRes?.data?.me?.name).toContain(`${citestMarker}-admin-user`);
        adminUserId = meRes?.data?.me?.id;

        const regularMeRes = await gqlClient.sdk.me({}, regularOptions);
        expect(regularMeRes?.data?.me?.name).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = regularMeRes?.data?.me?.id;

        const authGroupRes = await gqlClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-inherit-test-group-${uuidv4()}`,
              description: 'Test group for inheritance testing'
            }
          },
          adminOptions
        );
        testAuthGroupId = authGroupRes?.data?.authGroupCreate?.id;
        expect(testAuthGroupId).toBeDefined();

        const permRes = await gqlClient.sdk.authPermissionSetCreate(
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
        testPermissionSetId = permRes?.data?.authPermissionSetCreate?.id;
        expect(testPermissionSetId).toBeDefined();

        const rfRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rfRes?.data?.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        cmsRootFolderId = rootFolders[0]?.id;
      });

      it('should create parent folder with ACE having inherit', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const createFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-parent-folder-inherit-${uuidv4()}`,
              description: 'Parent folder with inherit ACE',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        const createFolder = createFolderRes?.data?.createFolder;
        newFolderId = createFolder?.id;

        await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [newFolderId],
            entries: [
              {
                member: {
                  id: testAuthGroupId,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: testPermissionSetId,
                options: ['inherit']
              },
              {
                member: {
                  id: regularUserId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: testPermissionSetId,
                options: ['inherit']
              }
            ]
          },
          adminOptions
        );

        parentFolderId = createFolderRes?.data?.createFolder?.id;
        expect(parentFolderId).toBeDefined();
      });

      it('should verify parent folder ACE has options: inherit', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const aclRes = await gqlClient.sdk.GetResourcesACL(
          { ids: [parentFolderId], resourceType: AuthResourceType.Folder },
          adminOptions
        );
        const acl = aclRes?.data?.getACLForResources?.records ?? [];
        const inheritACE = acl.find(
          (ace: any) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritACE).toBeDefined();
        expect(inheritACE?.options).toContain('inherit');
      });

      it("should create parent folder with user private group ACE having options: ['inherit']", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const addAceRes = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [parentFolderId],
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
        const acl = addAceRes?.data?.addACEsToResources?.records ?? [];
        const userPrivateACE = acl.find(
          (ace: any) =>
            ace.options?.includes('inherit') &&
            (ace.member.id === adminUserId ||
              ace.member.name?.includes(
                `Default Private Group for User ${adminUserId}`
              ))
        );
        expect(userPrivateACE).toBeDefined();
        expect(userPrivateACE?.options).toContain('inherit');
      });

      it('should create child folder and verify ACE inheritance with inherit flag', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const createChildRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-child-folder-${uuidv4()}`,
              description: 'Child folder to test inheritance',
              parentId: parentFolderId
            }
          },
          adminOptions
        );
        childFolderId = createChildRes?.data?.createFolder?.id;
        expect(childFolderId).toBeDefined();

        const childAclRes = await gqlClient.sdk.GetResourcesACL(
          { ids: [childFolderId], resourceType: AuthResourceType.Folder },
          adminOptions
        );
        const childACL = childAclRes?.data?.getACLForResources?.records ?? [];

        const inheritedTestGroupACE = childACL.find((ace: any) => {
          return (
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
          );
        });
        expect(inheritedTestGroupACE).toBeDefined();
        expect(inheritedTestGroupACE?.options).toContain('inherit');

        const inheritedUserPrivateACE = childACL.find((ace: any) => {
          const hasInheritFlag = ace.options?.includes('inherit');
          const hasTestPermission =
            ace.permissionSet?.id === testPermissionSetId;
          const isEmptyMemberOrMatchesAdmin =
            (ace.member?.id === undefined &&
              Object.keys(ace.member || {}).length === 0) ||
            ace.member?.id === adminUserId ||
            ace.member?.name?.includes(
              `Default Private Group for User ${adminUserId}`
            );

          return (
            hasInheritFlag && hasTestPermission && isEmptyMemberOrMatchesAdmin
          );
        });
        expect(inheritedUserPrivateACE).toBeDefined();
        expect(inheritedUserPrivateACE?.options).toContain('inherit');
      });

      it('should create TDO in child folder and verify ACE inheritance without inherit flag', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const createTdoRes = await gqlClient.sdk.createTDO(
          {
            input: {
              name: `${citestMarker}-child-tdo-${uuidv4()}`,
              description: 'Child TDO to test inheritance',
              parentFolderId: childFolderId,
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          adminOptions
        );
        childTDOId = createTdoRes?.data?.createTDO?.id;
        expect(childTDOId).toBeDefined();

        const tdoAclRes = await gqlClient.sdk.GetResourcesACL(
          { ids: [childTDOId], resourceType: AuthResourceType.Tdo },
          adminOptions
        );
        const tdoACL = tdoAclRes?.data?.getACLForResources?.records ?? [];

        const inheritedTestGroupACE = tdoACL.find(
          (ace: any) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedTestGroupACE).toBeDefined();

        const inheritedUserPrivateACE = tdoACL.find((ace: any) => {
          const hasTestPermission =
            ace.permissionSet?.id === testPermissionSetId;
          const isEmptyMemberOrMatchesAdmin =
            (ace.member?.id === undefined &&
              Object.keys(ace.member || {}).length === 0) ||
            ace.member?.id === adminUserId ||
            ace.member?.name?.includes(
              `Default Private Group for User ${adminUserId}`
            );

          return hasTestPermission && isEmptyMemberOrMatchesAdmin;
        });
        expect(inheritedUserPrivateACE).toBeDefined();
      });

      it('should verify regular user can access resources through inherited ACE', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: childTDOId },
          regularOptions
        );
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(childTDOId);
      });

      afterAll(async () => {
        if (childTDOId) {
          await gqlClient.sdk.deleteTDO({ id: childTDOId }, adminOptions);
        }

        if (childFolderId) {
          await gqlClient.sdk.deleteFolder(
            { input: { id: childFolderId, orderIndex: 0 } },
            adminOptions
          );
        }

        if (parentFolderId) {
          await gqlClient.sdk.deleteFolder(
            { input: { id: parentFolderId, orderIndex: 0 } },
            adminOptions
          );
        }

        if (testAuthGroupId) {
          await gqlClient.sdk.authGroupDelete(
            { id: testAuthGroupId },
            adminOptions
          );
        }

        if (testPermissionSetId) {
          await gqlClient.sdk.authPermissionSetDelete(
            { id: testPermissionSetId },
            adminOptions
          );
        }
      });

      describe('Folder without inherit flag comparison', () => {
        let parentFolderNoInheritId: any, childFolderNoInheritId: any;

        beforeAll(async () => {
          if (!useRBACFeature) return;

          const createFolderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-parent-folder-no-inherit-${uuidv4()}`,
                description: 'Parent folder without inherit ACE',
                parentId: cmsRootFolderId,
                rootFolderType: RootFolderType.Cms
              }
            },
            adminOptions
          );
          const createFolder = createFolderRes?.data?.createFolder;
          newFolderId = createFolder?.id;

          await gqlClient.sdk.addACEsToResources(
            {
              resourceType: AuthResourceType.Folder,
              ids: [newFolderId],
              entries: [
                {
                  member: {
                    id: testAuthGroupId,
                    memberType: AuthGroupMemberType.Group
                  },
                  permissionSetID: testPermissionSetId
                }
              ]
            },
            adminOptions
          );

          parentFolderNoInheritId = createFolderRes?.data?.createFolder?.id;
          expect(parentFolderNoInheritId).toBeDefined();
        });

        it('should verify parent folder ACE does NOT have inherit flag', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
            return;
          }

          const aclRes = await gqlClient.sdk.GetResourcesACL(
            {
              ids: [parentFolderNoInheritId],
              resourceType: AuthResourceType.Folder
            },
            adminOptions
          );
          const acl = aclRes?.data?.getACLForResources?.records ?? [];
          const userPrivateACE = acl.find((ace: any) => {
            return (
              ace.member?.id === adminUserId ||
              ace.member?.name?.includes(
                `Default Private Group for User ${adminUserId}`
              ) ||
              (ace.member?.id === undefined &&
                Object.keys(ace.member || {}).length === 0)
            );
          });
          expect(userPrivateACE).toBeDefined();
          expect(userPrivateACE?.options).not.toContain('inherit');
        });

        it('should create child folder and verify user private group ACE is NOT inherited', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
            return;
          }

          const createChildNoInheritRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-child-folder-no-inherit-${uuidv4()}`,
                description: 'Child folder to test no inheritance',
                parentId: parentFolderNoInheritId
              }
            },
            adminOptions
          );
          childFolderNoInheritId =
            createChildNoInheritRes?.data?.createFolder?.id;
          expect(childFolderNoInheritId).toBeDefined();

          const childAclRes = await gqlClient.sdk.GetResourcesACL(
            {
              ids: [childFolderNoInheritId],
              resourceType: AuthResourceType.Folder
            },
            adminOptions
          );
          const childACL = childAclRes?.data?.getACLForResources?.records ?? [];

          const notInheritedUserPrivateACE = childACL.find(
            (ace: any) =>
              ace.member.id === regularUserId &&
              ace.permissionSet.id === testPermissionSetId
          );
          expect(notInheritedUserPrivateACE).toBeUndefined();
        });

        afterAll(async () => {
          if (childFolderNoInheritId) {
            await gqlClient.sdk.deleteFolder(
              { input: { id: childFolderNoInheritId, orderIndex: 1 } },
              adminOptions
            );
          }

          if (parentFolderNoInheritId) {
            await gqlClient.sdk.deleteFolder(
              { input: { id: parentFolderNoInheritId, orderIndex: 1 } },
              adminOptions
            );
          }

          if (testSetup.listOptions && testSetup.listOptions.length > 0) {
            const listUserIds = testSetup.listOptions.map(
              (user: any) => user.userId
            );
            for (const id of listUserIds) {
              try {
                await gqlClient.sdk.deleteUser(
                  { id },
                  helpers.requestOptions(superToken).headers
                );
              } catch (e) {
                // ignore
              }
            }
          }

          if (testOrg.id) {
            await helpers.deleteOrganization(
              gqlClient.authUrl,
              testOrg.id,
              superToken
            );
          }
        });
      });
    });
  });

  // T24: tear down the isolated throwaway superadmin org/user LAST — after the
  // spec's own test-org teardown (in the innermost afterAll above) has run.
  // cleanup() uses the shared session and a soft-delete, so it never kills the
  // shared session. See test/helpers/superadminSession.ts.
  afterAll(async () => {
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });
});

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-inherit-' + uuidv4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    metadata: { features: { enableRBACFeature: 'enabled' } },
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
        '032218c3-d47e-4287-9d16-7bb867c01266',
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
      ]
    },
    {
      name: `${citestMarker}-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: []
    },
    {
      name: `${citestMarker}-restrict-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: []
    },
    {
      name: `${citestMarker}-second-restrict-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: []
    }
  ]
};
