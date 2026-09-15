import * as _ from 'lodash';
import * as uuid from 'uuid';
import jwt from 'jsonwebtoken';
import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  ApplicationConfigLevelEnum,
  ApplicationConfigValueEnum,
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

interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';
const DEFAULT_APP_EVENT_ROLE_NAME = 'Default App Access';

/**
 * Feature-flag globals: under jest (how the cirunner CI job runs these specs,
 * via `npm run citest`) they are published by citest/jest.global.setup.js
 * before any spec loads; under local `bun test` the preload in test/setup.ts
 * (wired via bunfig.toml) publishes the same live flags — before it existed,
 * enableAppEventFeature was always undefined under bun, which skipped every
 * test below regardless of the server's real configuration. Reading the
 * globals synchronously keeps this file free of top-level await, which
 * ts-jest (CommonJS) cannot compile. NOTE: every test in this spec stays
 * skipped unless the server runs with
 * featureFlags.enableAppEventFeature=true in BOTH core-graphql and core-admin
 * config (not enabled in the default local runall config).
 */
const isDesktopAppEnabled = citestGlobals.enableDefaultDesktopApp ?? true;
const enableAppEventFeature = citestGlobals.enableAppEventFeature ?? false;

const itif = (
  condition: boolean | undefined,
  name: string,
  fn: () => Promise<void>
) => (condition ? it(name, fn) : it.skip(name, fn));

const nameOrg = `${citestMarker}-application-rbac`;

const ROLES_IDS = buildApplicationTestRoleIds(isDesktopAppEnabled);

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

const application = [
  {
    id: uuid.v4(),
    name: `${citestMarker} Citest App 8 - app to org - ${appConfigDefinitionKeySuffix}`,
    key: `${citestMarker.replace(/-/g, '_')}_citest_app_8_${appConfigDefinitionKeySuffix}`,
    description: `${citestMarker} Citest App 8 - ${appConfigDefinitionKeySuffix}`,
    url: 'www.example.com',
    checkPermissions: false,
    status: 'active',
    appConfigDefinition
  }
];

// Core operations of base applications
describe('citest_application: Application Basics', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: IsolatedSuperadmin;
  let adminOptions: RequestOptions;
  let applicationOrgId: string;
  let applicationOrgGUID: string;
  let userId: string;
  const uniqueId = Date.now().valueOf();

  beforeAll(async () => {
    /**
     * Every test below is gated on enableAppEventFeature (see itif calls);
     * skip the expensive org/user setup entirely when the server has it
     * disabled so a fully-skipped run doesn't create (and then delete) an
     * unused test org.
     */
    if (!enableAppEventFeature) return;

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

  describe('Applications with enableAppEventFeature flag', () => {
    let applicationId: string | undefined;
    let eventApplicationId: string | undefined;
    let orgId: string | undefined;
    let roleIds: string[] = [];
    let expectedEventEndpoint: string | undefined;
    const testEventEndpoint = 'https://dev-local.aiware.run/event-endpoint';

    itif(
      enableAppEventFeature,
      'get roleIds of current user (for adding to application JWT token)',
      async () => {
        const result = await gqlClient.sdk.me({}, getRequestHeaders(adminOptions));
        const me = result.data.me;
        const roles = me?.roles ?? [];

        orgId = me?.organizationId ?? undefined;
        userId = me?.id ?? userId;
        expect(roles).toBeDefined();
        expect(orgId).toBeDefined();
        expect(userId).toBeDefined();
        expect(Array.isArray(roles)).toEqual(true);
        expect(roles.length === 0).toEqual(false);
        roleIds = roles.map((role) => role?.id).filter((id): id is string => !!id);
      }
    );

    itif(
      enableAppEventFeature,
      'get JWT token for application',
      async () => {
        const result = await gqlClient.sdk.getApplicationJWT(
          {
            input: {
              appId: applicationId ?? '',
              orgId: orgId ?? '',
              roleIds
            }
          },
          getRequestHeaders(adminOptions)
        );
        const tokenInfo = result.data.getApplicationJWT;
        expect(tokenInfo).toBeDefined();
        expect(tokenInfo?.applicationId).toEqual(applicationId);
        expect(tokenInfo?.organizationId).toEqual(orgId);
        expect(tokenInfo?.token).toBeDefined();
        expect(jwt.decode(tokenInfo?.token ?? '')).toEqual({
          contentApplicationId: expect.any(String),
          contentOrganizationId: parseInt(orgId ?? '0'),
          tokenApplicationId: applicationId,
          userId,
          scope: [
            {
              actions: expect.any(Array),
              resources: { applicationId }
            }
          ],
          iat: expect.any(Number),
          exp: expect.any(Number),
          sub: 'engine-run',
          jti: expect.any(String)
        });
      }
    );

    itif(
      enableAppEventFeature,
      'add application for organization',
      async () => {
        const result = await gqlClient.sdk.updateOrganization(
          {
            input: {
              id: orgId ?? '',
              applicationAccess: [
                {
                  applicationId: eventApplicationId ?? '',
                  enable: true
                }
              ]
            }
          },
          getRequestHeaders(adminOptions)
        );

        const updated = result.data.updateOrganization;
        expect(updated?.id).toEqual(orgId);
        expect(updated?.name).toBeDefined();
        expect(
          (updated?.applications?.records?.length ?? 0) > 0
        ).toBeTruthy();
      }
    );

    itif(
      enableAppEventFeature,
      'add an endpoint to the application',
      async () => {
        const result = await gqlClient.sdk.updateApplicationEventEndpoint(
          {
            input: {
              id: eventApplicationId ?? '',
              eventEndpoint: testEventEndpoint
            }
          },
          getRequestHeaders(adminOptions)
        );

        const updated = result.data.updateApplicationEventEndpoint;
        expect(updated?.id).toEqual(eventApplicationId);
        expect(updated?.eventEndpoint).toEqual(testEventEndpoint);
        expectedEventEndpoint = testEventEndpoint;
      }
    );

    itif(
      enableAppEventFeature,
      'check application event endpoint is set',
      async () => {
        const result = await gqlClient.sdk.application(
          { id: eventApplicationId ?? '' },
          getRequestHeaders(adminOptions)
        );
        const app = result.data.application;
        expect(app?.id).toEqual(eventApplicationId);
        expect(app?.eventEndpoint).toEqual(expectedEventEndpoint);
      }
    );

    itif(
      enableAppEventFeature,
      'remove event endpoint from application',
      async () => {
        const result = await gqlClient.sdk.removeApplicationEventEndpoint(
          { id: eventApplicationId ?? '' },
          getRequestHeaders(adminOptions)
        );
        const deleteResult = result.data.removeApplicationEventEndpoint;
        expect(deleteResult?.id).toEqual(eventApplicationId);
        expect(deleteResult?.message).toBeDefined();
      }
    );

    /**
     * feature flag enableAppEventFeature must be enabled in both core-admin and core-graphql
     * when adding an app to the org, the appRole auth group is created async via eventing.
     */
    itif(
      enableAppEventFeature,
      'add application to an organization with defaultAppAccess role creation',
      async () => {
        const app = application[0];
        const createResult = await gqlClient.sdk.createApplication(
          {
            input: {
              id: app.id,
              name: app.name,
              description: app.description,
              url: app.url,
              checkPermissions: app.checkPermissions,
              applicationConfigDefinition: app.appConfigDefinition
            }
          },
          getRequestHeaders(adminOptions)
        );

        const created = createResult.data.createApplication;
        expect(created).toBeDefined();
        expect(created?.id).toEqual(app.id);
        expect(created?.name).toEqual(app.name);
        // createApplication without applicationRoles
        expect(created?.applicationRoles.length).toEqual(0);
        const applicationIdToOrg = app.id;

        const addToOrgResult = await gqlClient.sdk.addAppToOrg(
          {
            orgId: applicationOrgId,
            appId: applicationIdToOrg,
            configs: [
              {
                configKey: app.appConfigDefinition[0].configKey,
                configValue: 'test'
              }
            ]
          },
          getRequestHeaders(adminOptions)
        );
        const addedApplication = addToOrgResult.data.applicationAddToOrg;
        expect(addedApplication.id).toEqual(applicationIdToOrg);
        // A defaultAppAccess role will be created when adding app to org
        expect(addedApplication.applicationRoles).toBeDefined();
        expect(addedApplication.applicationRoles.length).toEqual(1);
        expect(addedApplication.applicationRoles[0]?.name).toEqual(
          DEFAULT_APP_EVENT_ROLE_NAME
        );
        expect(addedApplication.applicationRoles[0]?.permissions).toBeDefined();
        expect(
          (addedApplication.applicationRoles[0]?.permissions?.length ?? 0) > 0
        ).toBeTruthy();
        expect(
          addedApplication.applicationRoles[0]?.isApplicationEventRole
        ).toEqual(true);

        // Wait for application add to organization to propagate
        await helpers.sleep(1000);

        const appConfigResult = await gqlClient.sdk.applicationConfig(
          {
            appId: applicationIdToOrg,
            orgId: applicationOrgId,
            configKeyRegexp: app.appConfigDefinition[0].configKey
          },
          getRequestHeaders(adminOptions)
        );
        const userIdInAppConfig =
          appConfigResult.data.applicationConfig.records[0]?.userId;
        // userId field of a config at org level must be null.
        expect(userIdInAppConfig).toEqual(null);

        const deleteResult = await gqlClient.sdk.deleteApplication(
          { id: applicationIdToOrg },
          getRequestHeaders(adminOptions)
        );
        expect(deleteResult.data.deleteApplication?.id).toEqual(
          applicationIdToOrg
        );
      }
    );
  });

  afterAll(async () => {
    // Mirrors the beforeAll gate — nothing to clean up when setup never ran.
    if (!enableAppEventFeature) return;

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
