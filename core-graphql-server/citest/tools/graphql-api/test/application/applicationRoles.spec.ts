import * as uuid from 'uuid';
import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  ApplicationStatus,
  ApplicationWorkflowAction,
  AuthPermissionType,
  OrganizationStatus
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
  RequestOptions
} from '../helpers/application.helper';

/**
 * Feature-flag globals: under jest (how the cirunner CI job runs these specs,
 * via `npm run citest`) they are published by citest/jest.global.setup.js
 * before any spec loads; under local `bun test` the preload in test/setup.ts
 * (wired via bunfig.toml) fetches the same live
 * `graphqlServiceInfo.featureFlags` and publishes identical globals — without
 * it every gated test silently skipped under bun. Reading them synchronously
 * keeps this file free of top-level await, which ts-jest (CommonJS) cannot
 * compile; the gates still resolve before test registration in both runners.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';

const isDesktopAppEnabled = citestGlobals.enableDefaultDesktopApp ?? true;
const enableAppEventFeature = citestGlobals.enableAppEventFeature ?? false;

const itif = (
  condition: boolean | undefined,
  name: string,
  fn: () => Promise<void>
) => (condition ? it(name, fn) : it.skip(name, fn));

const nameOrg = `${citestMarker}-application-roles`;

const ROLES_IDS = buildApplicationTestRoleIds(isDesktopAppEnabled);

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

const appRoles7 = [
  {
    id: uuid.v4(),
    name: `ci-test-app-role-${uuid.v4()}`,
    description: 'ci-test-app-role',
    isPrivate: false,
    isAppEventRole: false,
    permissions: [AuthPermissionType.CmsAccess]
  }
];

// Authorization Test grouping of applications
describe('citest_application: Application Roles', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: IsolatedSuperadmin;
  let superAdminOptions: RequestOptions;
  let adminOptions: RequestOptions;
  let applicationOrgId: string;
  let applicationOrgGUID: string;
  let userId: string;
  const uniqueId = Date.now().valueOf();

  beforeAll(async () => {
    /**
     * Create the test org via an ISOLATED throwaway superadmin instead of the
     * shared CI superadmin session, so this spec's org lifecycle can never
     * enroll — nor collaterally log out — the session shared by every other
     * spec (see test/helpers/superadminSession.ts and PR #4238).
     */
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
    expect(gqlClient.sessionToken).toBeDefined();
    superAdminOptions = isolatedSuperadmin.options;

    const applicationOrganization = await getOrCreateOrganization(
      gqlClient,
      nameOrg,
      { isDesktopAppEnabled }
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
  });

  describe('Application Roles', () => {
    let newRoleId: string;
    let existingRoleId: string;
    let roleId: string | undefined;
    let applicationForRoleId: string;
    let applicationForRoleDescription: string;
    let eventApplicationId: string | undefined;
    let applicationRoles7Id: string;

    it('create an application for Roles', async () => {
      applicationForRoleDescription = `${citestMarker} Citest App 11 - ${uniqueId}`;
      const result = await gqlClient.sdk.createApplication(
        {
          input: {
            name: `${citestMarker} Citest App 11 - ${uniqueId}`,
            description: applicationForRoleDescription,
            url: 'www.example.com',
            checkPermissions: false,
            status: ApplicationStatus.Active
          }
        },
        getRequestHeaders(adminOptions)
      );

      applicationForRoleId = result.data.createApplication?.id ?? '';
      expect(applicationForRoleId).toBeDefined();
    });

    it('active app with existing/new roles: only role upserts and skip role deletions', async () => {
      const result = await gqlClient.sdk.updateApplication(
        {
          input: {
            id: applicationForRoleId,
            status: ApplicationStatus.Active,
            description: `${applicationForRoleDescription}_updated`,
            applicationRoles: [
              {
                id: uuid.v4(),
                name: `${citestMarker}-app-role-${uuid.v4()}`,
                description: 'new role',
                isPrivate: false,
                isAppEventRole: false,
                permissions: [AuthPermissionType.CmsAccess]
              },
              {
                id: uuid.v4(),
                name: `${citestMarker}-app-role-${uuid.v4()}`,
                description: 'existing role',
                isPrivate: false,
                isAppEventRole: false,
                permissions: [AuthPermissionType.CmsAccess]
              }
            ]
          }
        },
        getRequestHeaders(adminOptions)
      );

      const updated = result.data.updateApplication;
      expect(updated?.id).toEqual(applicationForRoleId);
      expect(updated?.applicationRoles[0]?.isPrivate).toEqual(false);
      expect(updated?.applicationRoles[0]?.isApplicationEventRole).toEqual(false);
      newRoleId = updated?.applicationRoles[0]?.id ?? '';
      existingRoleId = updated?.applicationRoles[1]?.id ?? '';
    });

    it('should verify new application roles are included in organization roles', async () => {
      const result = await gqlClient.sdk.fetchOrgAppsAndRoles(
        { id: applicationOrgId },
        getRequestHeaders(adminOptions)
      );

      const roles = result.data.organization?.roles ?? [];
      expect(roles.find((item) => item?.id === newRoleId)).toBeDefined();
    });

    it('active app with empty roles: skip role upserts and skip role deletions.', async () => {
      const result = await gqlClient.sdk.updateApplication(
        {
          input: {
            id: applicationForRoleId,
            status: ApplicationStatus.Active,
            description: `${applicationForRoleDescription}_updated_1`,
            applicationRoles: []
          }
        },
        getRequestHeaders(adminOptions)
      );

      const updated = result.data.updateApplication;
      expect(updated?.id).toEqual(applicationForRoleId);
      expect(updated?.description).toEqual(`${applicationForRoleDescription}_updated_1`);
      const appRoles = updated?.applicationRoles ?? [];
      expect(appRoles).toBeDefined();
      const filteredAppRoles = appRoles.filter(
        (r) => r.id === newRoleId || r.id === existingRoleId
      );
      expect(filteredAppRoles.length).toEqual(2);
    });

    it('disable an application', async () => {
      const result = await gqlClient.sdk.applicationWorkflow(
        {
          input: {
            id: applicationForRoleId,
            action: ApplicationWorkflowAction.Disable
          }
        },
        getRequestHeaders(superAdminOptions)
      );

      expect(result.data.applicationWorkflow?.id).toEqual(applicationForRoleId);
      expect(result.data.applicationWorkflow?.status).toEqual(
        ApplicationStatus.Disabled
      );
    });

    it('non-active app with existing/new roles: implement role upserts and delete any roles not included in input', async () => {
      const result = await gqlClient.sdk.updateApplication(
        {
          input: {
            id: applicationForRoleId,
            status: ApplicationStatus.Active,
            description: `${applicationForRoleDescription}_updated_2`,
            applicationRoles: [
              {
                id: existingRoleId,
                description: 'existing role updated'
              }
            ]
          }
        },
        getRequestHeaders(adminOptions)
      );

      const updated = result.data.updateApplication;
      expect(updated?.id).toEqual(applicationForRoleId);
      expect(updated?.description).toEqual(`${applicationForRoleDescription}_updated_2`);
      const appRoles = updated?.applicationRoles ?? [];
      expect(appRoles).toBeDefined();
      const newRole = appRoles.find((r) => r.id === newRoleId);
      expect(newRole).toBeUndefined();
      const existingRole = appRoles.find((r) => r.id === existingRoleId);
      expect(existingRole).toBeDefined();
      expect(existingRole?.description).toEqual('existing role updated');
    });

    it('non-active app with empty roles: delete all roles of the application ', async () => {
      const result = await gqlClient.sdk.updateApplication(
        {
          input: {
            id: applicationForRoleId,
            status: ApplicationStatus.Active,
            description: `${applicationForRoleDescription}_updated_3`,
            applicationRoles: []
          }
        },
        getRequestHeaders(adminOptions)
      );

      const updated = result.data.updateApplication;
      expect(updated?.id).toEqual(applicationForRoleId);
      expect(updated?.description).toEqual(`${applicationForRoleDescription}_updated_3`);
      const appRoles = updated?.applicationRoles ?? [];
      expect(appRoles).toBeDefined();
      const filteredAppRoles = appRoles.filter(
        (r) => r.id === newRoleId || r.id === existingRoleId
      );
      expect(filteredAppRoles.length).toEqual(0);
    });

    it('create application should not throw an error if permissions in application roles are valid', async () => {
      const appId = uuid.v4();
      const appName = `${citestMarker} App 7 - permissions is valid - ${uniqueId}`;
      const appDescription = `${citestMarker} App 7 - ${uniqueId}`;

      try {
        const result = await gqlClient.sdk.createApplication(
          {
            input: {
              id: appId,
              name: appName,
              description: appDescription,
              url: 'www.example.com',
              checkPermissions: false,
              applicationRoles: appRoles7
            }
          },
          getRequestHeaders(adminOptions)
        );

        const created = result.data.createApplication;
        expect(result).toBeDefined();
        expect(created).toBeDefined();
        expect(created?.id).toEqual(appId);
        expect(created?.name).toEqual(appName);
        expect(created?.applicationRoles).toBeDefined();
        expect(created?.applicationRoles.length).toEqual(1);
        expect(created?.applicationRoles[0]?.permissions).toBeDefined();
        expect(created?.applicationRoles[0]?.permissions?.length).toEqual(1);
        expect(created?.applicationRoles[0]?.permissions?.[0]).toEqual(
          AuthPermissionType.CmsAccess
        );
        roleId = created?.applicationRoles[0]?.id;
        applicationRoles7Id = created?.id ?? '';
      } catch (ex) {
        validateInvalidApplicationRoles(ex);
      }
    });

    it('should verify created applicationRoles is included in organization roles', async () => {
      const result = await gqlClient.sdk.fetchOrgAppsAndRoles(
        { id: applicationOrgId },
        getRequestHeaders(adminOptions)
      );
      const roles = result.data.organization?.roles ?? [];
      expect(roles.find((item) => item?.id === roleId)).toBeDefined();
    });

    /**
     * Requires the server to run with featureFlags.enableAppEventFeature=true
     * (in both core-graphql and core-admin config); skipped otherwise.
     */
    itif(
      enableAppEventFeature,
      'get application field needed for updating application',
      async () => {
        const result = await gqlClient.sdk.application(
          { id: eventApplicationId ?? '' },
          getRequestHeaders(adminOptions)
        );

        const app = result.data.application;
        expect(app?.id).toEqual(eventApplicationId);
      }
    );

    it('cleanup applicationRole application', async () => {
      const [appBase, appEvent] = await Promise.all([
        gqlClient.sdk.deleteApplication(
          { id: applicationForRoleId },
          getRequestHeaders(adminOptions)
        ),
        gqlClient.sdk.deleteApplication(
          { id: applicationRoles7Id },
          getRequestHeaders(adminOptions)
        )
      ]);

      expect(appBase.data.deleteApplication?.id).toEqual(applicationForRoleId);
      expect(appEvent.data.deleteApplication?.id).toEqual(applicationRoles7Id);
    });
  });

  afterAll(async () => {
    try {
      if (userId) {
        await gqlClient.sdk.deleteUser({ id: userId });
      }
    } catch (error) {
      console.error('Error deleting user in afterAll:', error);
    }

    try {
      if (applicationOrgId) {
        await gqlClient.sdk.updateOrganization({
          input: {
            id: applicationOrgId,
            status: OrganizationStatus.Deleted
          }
        });
      }
    } catch (error) {
      console.error('Error deleting organization in afterAll:', error);
    }

    /**
     * Tear down the throwaway superadmin org/user last — it uses the shared
     * bootstrap session internally, so it works even after the spec's own
     * teardown; failures are swallowed and logged by the helper.
     */
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });
});
