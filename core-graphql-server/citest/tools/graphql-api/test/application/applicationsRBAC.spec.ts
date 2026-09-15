import * as _ from 'lodash';
import * as uuid from 'uuid';
import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  ApplicationConfigLevelEnum,
  ApplicationConfigValueEnum,
  AuthPermissionType,
  AuthResourceType,
  AuthGroupMemberType,
  OrganizationStatus,
  RootFolderType
} from '../../src/gql/gql';
import type { ServerFeatureFlags } from '../helpers/featureFlags';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';
import {
  buildApplicationTestRoleIds,
  getOrCreateOrganization,
  getOrCreateUser,
  getRequestHeaders,
  impersonate,
  pollUntil,
  RequestOptions
} from '../helpers/application.helper';

/**
 * Feature-flag globals: under jest (how the cirunner CI job runs these specs,
 * via `npm run citest`) they are published by citest/jest.global.setup.js
 * before any spec loads; under local `bun test` the preload in test/setup.ts
 * (wired via bunfig.toml) fetches the same live
 * `graphqlServiceInfo.featureFlags` and publishes identical globals. Before
 * that preload existed, enableRBACFeature was always undefined under bun,
 * which silently skipped this ENTIRE suite regardless of the server's real
 * configuration. Reading the globals synchronously keeps this file free of
 * top-level await, which ts-jest (CommonJS) cannot compile; the gates still
 * resolve before test registration in both runners.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';

const isDesktopAppEnabled = citestGlobals.enableDefaultDesktopApp ?? true;
const enableRBACFeature = citestGlobals.enableRBACFeature ?? false;

const describeif = (
  condition: boolean | undefined,
  name: string,
  fn: () => void
) => (condition ? describe(name, fn) : describe.skip(name, fn));

const nameOrg = `${citestMarker}-rbac`;

const ROLES_IDS = buildApplicationTestRoleIds(isDesktopAppEnabled);

interface OrgInfo {
  orgGuid: string;
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  isOLPEnabled: boolean;
}

async function getOrgInfo(
  gqlClient: GraphqlClient,
  userOptions: RequestOptions
): Promise<OrgInfo> {
  const result = await gqlClient.sdk.me({}, getRequestHeaders(userOptions));
  const me = result.data.me;
  expect(me).toBeDefined();
  return {
    orgGuid: me?.organization?.guid ?? '',
    orgId: me?.organization?.id ?? '',
    orgName: me?.organization?.name ?? '',
    userId: me?.id ?? '',
    userName: me?.name ?? '',
    isOLPEnabled:
      _.get(me, 'organization.jsondata.features.enableRBACFeature') ===
      'enabled'
  };
}

interface OlpObjectIds {
  authGroupId: string;
  permissionId: string;
}

async function setOLPPermissions(
  gqlClient: GraphqlClient,
  orgInfo: OrgInfo,
  permissions: AuthPermissionType[]
): Promise<OlpObjectIds> {
  const groupResult = await gqlClient.sdk.CreateAuthGroup({
    input: {
      name: `${citestMarker}-auth-group-engine-test-${uuid.v4()}`,
      description: 'desc',
      ownerOrganization: orgInfo.orgGuid,
      members: [{ id: orgInfo.userId, memberType: AuthGroupMemberType.User }]
    }
  });
  const authGroupId = groupResult.data.authGroupCreate?.id;
  expect(authGroupId).toBeDefined();
  if (!authGroupId) {
    throw new Error('Failed to create auth group');
  }

  const permissionSetResult = await gqlClient.sdk.authPermissionSetCreate({
    input: {
      name: `${citestMarker}-engine-test-${uuid.v4()}`,
      description: 'desc',
      organizationID: orgInfo.orgId,
      permissions
    }
  });
  const permissionId = permissionSetResult.data.authPermissionSetCreate?.id;
  expect(permissionId).toBeDefined();
  if (!permissionId) {
    throw new Error('Failed to create auth permission set');
  }

  const acesResult = await gqlClient.sdk.addACEsToResources({
    ids: [orgInfo.orgId],
    resourceType: AuthResourceType.Organization,
    ownerOrganization: orgInfo.orgGuid,
    entries: [
      {
        member: { id: authGroupId, memberType: AuthGroupMemberType.Group },
        permissionSetID: permissionId
      }
    ]
  });
  expect(
    (acesResult.data.addACEsToResources?.records?.length ?? 0) > 0
  ).toBeTruthy();

  return { authGroupId, permissionId };
}

/**
 * Because this depends on the config (whitelist, blacklist) from the server
 * so we have a special check here
 */
function validateInvalidApplicationRoles(graphqlError: unknown): void {
  const errs = helpers.getErrorsFromGraphqlResponse(graphqlError) as Array<{
    message: string;
    data: {
      applicationRoles: Array<{ invalidPermissions: string[] }>;
      roles?: { whitelist?: string[]; blacklist?: string[] };
    };
  }>;
  expect(errs.length > 0).toEqual(true);
  const err = errs[0];
  expect(err).toBeDefined();
  expect(err.message).toContain(
    'the application roles are invalid. Some permissions are not allowed'
  );

  expect(err.data.applicationRoles).toBeDefined();
  expect(err.data.applicationRoles.length > 0).toEqual(true);
  const roleWhitelist = err.data.roles?.whitelist ?? [];
  const roleBlacklist = err.data.roles?.blacklist ?? [];
  err.data.applicationRoles.forEach((o) => {
    expect(o.invalidPermissions).toBeDefined();
    expect(Array.isArray(o.invalidPermissions)).toBe(true);
    expect(o.invalidPermissions.length > 0).toEqual(true);
    if (err.data.roles) {
      o.invalidPermissions.forEach((ip) => {
        expect(
          (roleWhitelist.length > 0 && !roleWhitelist.includes(ip)) ||
            roleBlacklist.includes(ip)
        ).toEqual(true);
      });
    }
  });
}

/**
 * NOTE: keep the role name SHORT (legacy used `-${uniqueId}`, a 13-char epoch
 * stamp, not a 36-char uuid). The eventing service names the async-created
 * appRole auth group "<application name> - <role name>", and
 * rbac_auth_group.auth_group_name is varchar(100) — a uuid here pushes that
 * over the limit and authGroupCreate fails server-side with SQL 22001, so the
 * 'Check authGroups'/'Check permissionSets' tests never see their records.
 */
const appRoleNameSuffix = Date.now().valueOf();
const appRolesToOrganization = [
  {
    id: uuid.v4(),
    name: `${citestMarker}-app-role-${appRoleNameSuffix}`,
    description: `${citestMarker}-app-role`,
    isPrivate: false,
    isAppEventRole: false,
    permissions: [AuthPermissionType.CmsAccess]
  }
];

const appConfigDefinitionKeySuffix = Date.now().valueOf();
const appConfigDefinition = [
  {
    configKey: `${citestMarker} Citest App 8 - application to organization - ${appConfigDefinitionKeySuffix} -org-key`,
    configType: ApplicationConfigValueEnum.String,
    configLevel: ApplicationConfigLevelEnum.Organization,
    required: false,
    secured: false,
    description: 'Tests org-level config definition.'
  },
  {
    configKey: `${citestMarker} Citest App 8 - application to organization - ${appConfigDefinitionKeySuffix} -user-key`,
    configType: ApplicationConfigValueEnum.String,
    configLevel: ApplicationConfigLevelEnum.User,
    required: false,
    secured: false,
    description: 'Tests user-level config definition.'
  }
];

// Core operations of base applications
describe('citest_application: Application With RBAC', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: IsolatedSuperadmin;
  let superAdminOptions: RequestOptions;
  let adminOptions: RequestOptions;
  let applicationOrgId: string;
  let applicationOrgGUID: string;
  let userId: string;
  let authGroupId: string | undefined;
  let authPermissionId: string | undefined;
  const uniqueId = Date.now().valueOf();

  beforeAll(async () => {
    /**
     * The whole suite is gated on enableRBACFeature (see describeif below);
     * skip the expensive org/user setup when the server has it disabled so a
     * gated run doesn't leak an orphaned test org (the cleanup tests inside
     * the gated describe would be skipped too and never delete it).
     */
    if (!enableRBACFeature) return;

    /**
     * Create the test org via an ISOLATED throwaway superadmin instead of the
     * shared CI superadmin session, so this spec's org lifecycle can never
     * enroll — nor collaterally log out — the session shared by every other
     * spec (see test/helpers/superadminSession.ts and PR #4238; the legacy
     * applicationsRBAC.spec.js was one of the perpetrator specs fixed there).
     */
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
    expect(gqlClient.sessionToken).toBeDefined();
    superAdminOptions = isolatedSuperadmin.options;

    const applicationOrganization = await getOrCreateOrganization(
      gqlClient,
      nameOrg,
      {
        isDesktopAppEnabled,
        extraFeatures: { enableRBACFeature: 'enabled' },
        exactLookup: true
      }
    );
    userId = await getOrCreateUser(
      gqlClient,
      applicationOrganization,
      uniqueId,
      ROLES_IDS
    );

    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid ?? '';

    adminOptions = await impersonate(
      userId,
      applicationOrgGUID,
      isolatedSuperadmin.token
    );

    const userOrgInfo = await getOrgInfo(gqlClient, adminOptions);

    const olpObjectIds = await setOLPPermissions(gqlClient, userOrgInfo, [
      AuthPermissionType.AiwareSchemaCreate,
      AuthPermissionType.DeveloperEngineCreate,
      AuthPermissionType.DeveloperEngineRead,
      AuthPermissionType.DeveloperEngineUpdate,
      AuthPermissionType.DeveloperEngineEnable,
      AuthPermissionType.DeveloperAccess, // for headerbar app access
      AuthPermissionType.DeveloperEngineDelete
    ]);
    authGroupId = olpObjectIds.authGroupId;
    authPermissionId = olpObjectIds.permissionId;

    // re-login to reset permission
    adminOptions = await impersonate(
      userId,
      applicationOrgGUID,
      isolatedSuperadmin.token
    );
  });

  afterAll(async () => {
    /**
     * Tear down the throwaway superadmin org/user (the spec org itself is
     * deleted by the cleanup tests inside the gated describe). Uses the shared
     * bootstrap session internally; safe to call unconditionally, and skipped
     * when the gated setup never ran.
     */
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  describeif(
    enableRBACFeature,
    'add application to an organization - create default appRole AG and appRole PS',
    () => {
      let applicationIdToOrg: string;
      let roleId: string | undefined;
      let rootFolderId: string;
      let folderId: string;
      let tdoID: string;
      let jwtToken: string | undefined;

      it('Create Application with applicationRoles and application config definition', async () => {
        try {
          const result = await gqlClient.sdk.createApplication(
            {
              input: {
                name: `${citestMarker} App RBAC - ${uniqueId}`,
                description: `${citestMarker} App RBAC - ${uniqueId}`,
                url: 'www.example.com',
                checkPermissions: false,
                applicationRoles: appRolesToOrganization,
                applicationConfigDefinition: appConfigDefinition
              }
            },
            getRequestHeaders(adminOptions)
          );

          const created = result.data.createApplication;
          expect(created).toBeDefined();
          expect(created?.id).toBeDefined();
          expect(created?.name).toEqual(`${citestMarker} App RBAC - ${uniqueId}`);
          expect(created?.applicationRoles).toBeDefined();
          expect(created?.applicationRoles.length).toEqual(1);
          expect(created?.applicationRoles[0]?.id).toBeDefined();
          expect(created?.applicationRoles[0]?.permissions).toBeDefined();
          expect(created?.applicationRoles[0]?.permissions?.length).toEqual(1);
          expect(created?.applicationRoles[0]?.permissions?.[0]).toEqual(
            AuthPermissionType.CmsAccess
          );
          expect(created?.applicationRoles[0]?.isPrivate).toEqual(false);
          expect(created?.applicationRoles[0]?.isApplicationEventRole).toEqual(
            false
          );
          applicationIdToOrg = created?.id ?? '';
          roleId = created?.applicationRoles[0]?.id;
        } catch (ex) {
          validateInvalidApplicationRoles(ex);
        }
      });

      it('Add application to organization', async () => {
        const result = await gqlClient.sdk.addAppToOrg(
          {
            orgId: applicationOrgId,
            appId: applicationIdToOrg,
            configs: [
              {
                configKey: appConfigDefinition[0].configKey,
                configValue: 'test'
              }
            ]
          },
          getRequestHeaders(superAdminOptions)
        );

        expect(result.data.applicationAddToOrg.id).toEqual(applicationIdToOrg);
        await helpers.sleep(1000);
      });

      it('Check application config', async () => {
        const result = await gqlClient.sdk.applicationConfig(
          {
            appId: applicationIdToOrg,
            orgId: applicationOrgId,
            configKeyRegexp: appConfigDefinition[0].configKey
          },
          getRequestHeaders(adminOptions)
        );

        const userIdInAppConfig = result.data.applicationConfig.records[0]?.userId;
        // userId field of a config at org level must be null.
        expect(userIdInAppConfig).toEqual(null);
      });

      it('Check authGroups', async () => {
        /**
         * The appRole auth group is created asynchronously (eventing) after
         * applicationAddToOrg — poll instead of racing it with a fixed sleep.
         */
        const result = await pollUntil(
          () =>
            gqlClient.sdk.authGroups(
              {
                appRoleID: roleId,
                ownerOrganization: applicationOrgGUID
              },
              getRequestHeaders(superAdminOptions)
            ),
          (res) => (res.data.authGroups.records?.length ?? 0) > 0
        );

        const resAuthGroups = result.data.authGroups.records;
        expect(resAuthGroups[0]?.id).toBeDefined();
        expect(resAuthGroups[0]?.appRole?.id).toEqual(roleId);
      });

      it('Check permissionSets', async () => {
        // Async-created alongside the auth group above — same polling rationale.
        const result = await pollUntil(
          () =>
            gqlClient.sdk.authPermissionSets(
              {
                roleID: roleId,
                ownerOrganization: applicationOrgId
              },
              getRequestHeaders(superAdminOptions)
            ),
          (res) => (res.data.authPermissionSets.records?.length ?? 0) > 0
        );

        const records = result.data.authPermissionSets.records;
        expect(records[0]?.id).toBeDefined();
        expect(records[0]?.applicationRole?.id).toEqual(roleId);
      });

      it('should create a root folder', async () => {
        const result = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Cms },
          getRequestHeaders(adminOptions)
        );

        rootFolderId = result.data.createRootFolders[1]?.id ?? '';
        expect(rootFolderId).toBeDefined();
      });

      it('should create a folder under root folder', async () => {
        const name = `${citestMarker}-graphql-folders-name`;
        const description = `${citestMarker}-graphql-folders-description`;

        const result = await gqlClient.sdk.createFolder(
          {
            input: {
              name,
              parentId: rootFolderId,
              rootFolderType: RootFolderType.Cms,
              description
            }
          },
          getRequestHeaders(adminOptions)
        );

        folderId = result.data.createFolder?.id ?? '';
        expect(folderId).toBeDefined();
      });

      it('should create a TDO inside folder', async () => {
        const result = await gqlClient.sdk.createTDO(
          {
            input: {
              stopDateTime: '2025-10-16T15:28:37.663Z',
              startDateTime: '2025-10-16T15:24:37.663Z',
              name: `${citestMarker}-tdo-${uuid.v4()}`,
              isPublic: false,
              addToIndex: true,
              parentFolderId: folderId
            }
          },
          getRequestHeaders(adminOptions)
        );

        tdoID = result.data.createTDO?.id ?? '';
        expect(tdoID).toBeDefined();
      });

      it('should generate JWT token for application', async () => {
        const result = await gqlClient.sdk.getApplicationJWT(
          {
            input: {
              appId: applicationIdToOrg,
              orgId: applicationOrgId,
              roleIds: ['6d982ee9-ff07-499f-a182-03457a6187f6']
            }
          },
          getRequestHeaders(adminOptions)
        );

        jwtToken = result.data.getApplicationJWT?.token;
        expect(jwtToken).toBeDefined();
      });

      it('should retrieve TDO with folder using user token', async () => {
        const result = await gqlClient.sdk.temporalDataObject(
          { id: tdoID },
          getRequestHeaders(adminOptions)
        );

        const folderIds = (result.data.temporalDataObject?.folders ?? []).map(
          (f) => f?.id
        );
        expect(folderIds).toContain(folderId);
        expect(folderIds.length).toBeGreaterThan(0);
        expect(result.data.temporalDataObject?.id).toBeDefined();
      });

      it('should retrieve TDO with folder using JWT token', async () => {
        const jwtRequestHeaders = getRequestHeaders(
          helpers.requestOptions(jwtToken ?? '')
        );
        const result = await gqlClient.sdk.temporalDataObject(
          { id: tdoID },
          jwtRequestHeaders
        );

        const folderIds = (result.data.temporalDataObject?.folders ?? []).map(
          (f) => f?.id
        );
        expect(folderIds).toContain(folderId);
        expect(folderIds.length).toBeGreaterThan(0);
        expect(result.data.temporalDataObject?.id).toBeDefined();
      });

      describe('Cleanup test resources', () => {
        it('delete application', async () => {
          const result = await gqlClient.sdk.deleteApplication(
            { id: applicationIdToOrg },
            getRequestHeaders(adminOptions)
          );
          expect(result.data.deleteApplication?.id).toEqual(applicationIdToOrg);
        });

        it('delete authPermission', async () => {
          if (authPermissionId) {
            const result = await gqlClient.sdk.authPermissionSetDelete(
              { id: authPermissionId },
              getRequestHeaders(adminOptions)
            );
            expect(result.data.authPermissionSetDelete?.id).toEqual(
              authPermissionId
            );
          }
        });

        it('delete authGroup', async () => {
          if (authGroupId) {
            const result = await gqlClient.sdk.authGroupDelete(
              { id: authGroupId },
              getRequestHeaders(adminOptions)
            );
            expect(result.data.authGroupDelete?.id).toEqual(authGroupId);
          }
        });

        it('delete user', async () => {
          const result = await gqlClient.sdk.deleteUser({ id: userId });
          expect(result.data.deleteUser?.id).toEqual(userId);
        });

        it('update oganization - status to deleted', async () => {
          const result = await gqlClient.sdk.updateOrganization({
            input: {
              id: applicationOrgId,
              status: OrganizationStatus.Deleted
            }
          });
          expect(result.data.updateOrganization?.status).toEqual(
            OrganizationStatus.Deleted
          );
        });
      });
    }
  );
});
