import * as _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import chakram from 'chakram';
import jwt from 'jsonwebtoken';
import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';
import {
  ApplicationWorkflowAction,
  ApplicationStatus,
  OrganizationType,
  StringMatch,
  CreateApplicationRole,
  AppCreateContextMenuExtensions,
  ApplicationConfigDefinitionInput,
  ContextMenuExtensionType,
  AuthPermissionType,
  ApplicationConfigValueEnum,
  ApplicationConfigLevelEnum,
  ApplicationConfigDefinitionUpdateApp
} from '../../src/gql';
import type {
  OrganizationsQuery,
  UpdateOrganizationMutation,
  ApplicationsQuery,
  CreateApplicationMutation,
  UpdateApplicationMutation
} from '../../src/gql';

// The organization record shape returned by GET_ORGANIZATIONS — derived from
// the generated query type since `extracted/organizations.ts` has no named
// fragment for a single record.
type OrganizationRecord = NonNullable<
  NonNullable<
    NonNullable<OrganizationsQuery['organizations']>['records']
  >[number]
>;
// `getOrCreateOrganization` returns either the freshly-queried organization
// (above) or, when the automaticPackageCreation feature had to be toggled,
// the record straight off the `updateOrganization` mutation response — the
// two selections aren't identical, so this is a genuine union, not an `any`.
type UpdatedOrganizationRecord = NonNullable<
  UpdateOrganizationMutation['updateOrganization']
>;
type OrganizationOrUpdatedRecord =
  | OrganizationRecord
  | UpdatedOrganizationRecord;

const config = helpers.config;
const env = config.env;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';

// Feature-flag globals: under jest (CI) they are set by jest.global.setup.js;
// under `bun test` they are set by the preload in test/setup.ts (wired via
// bunfig.toml), which fetches the same live `graphqlServiceInfo.featureFlags`.
// Without the preload the Bun runner left them all `undefined`, silently
// skipping every `itif(...)`-gated test below on every environment.
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const enableAppEventFeature = (global as any).enableAppEventFeature ?? false;
const isHubResourceTestEnabled = Boolean(
  config.apiInternalOrgLessToken && config.apiAIDataOrgToken
);

const DEFAULT_APP_EVENT_ROLE_NAME = 'Default App Access';

const itif = (condition: unknown, name: string, fn: () => Promise<void>) =>
  condition ? it(name, fn) : it.skip(name, fn);

const nameOrg = `${citestMarker}-application-basics`;

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId): roleId is string => Boolean(roleId));

let sdkClient: GraphqlClient;
let adminToken: string;
let adminOptions: Record<string, string>;

async function impersonate(
  userId: string,
  applicationOrgGUID: string,
  token: string
): Promise<Record<string, string>> {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const impersonatedToken = _.get(impersonated, 'body.token', null);
  if (!impersonatedToken) {
    throw new Error(
      `impersonate: no token returned for user ${userId} in org ${applicationOrgGUID}`
    );
  }
  return helpers.requestOptions(impersonatedToken).headers as Record<
    string,
    string
  >;
}

async function getOrganization(
  name: string,
  ignoreExpect?: boolean
): Promise<OrganizationRecord | null> {
  const res = await sdkClient.sdk.organizations(
    { name, nameMatch: StringMatch.Contains },
    adminOptions
  );
  const applicationOrg = _.get(res, 'data.organizations.records[0]', null);

  if (!ignoreExpect) {
    expect(applicationOrg).toBeDefined();
    expect(applicationOrg?.name).toContain(name);
  }

  return applicationOrg;
}

async function setupTestOrganization(
  prefixName: string
): Promise<OrganizationRecord | null> {
  const name = `${prefixName}-${uuidv4()}`;
  const apps = [
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
  ].filter((app) => app);

  const res = await sdkClient.sdk.createOrganization(
    {
      input: {
        name,
        businessUnit: 'Legal',
        types: [OrganizationType.Agency, OrganizationType.Broadcaster],
        metadata: {
          test: 'value',
          features: {
            automaticPackageCreation: 'enabled'
          }
        },
        applications: apps
      }
    },
    adminOptions
  );

  const createdOrganization = res?.data?.createOrganization;
  expect(createdOrganization?.type).toEqual(
    expect.arrayContaining(['Agency', 'Broadcaster'])
  );
  expect(createdOrganization?.id).toBeDefined();
  expect(createdOrganization?.guid).toBeDefined();

  return await getOrganization(name);
}

async function createUser(uniqueId: string | number, orgId: string) {
  const res = await sdkClient.sdk.createUser(
    {
      input: {
        name: `${uniqueId}-admin-user-${uuidv4()}@localhost`,
        organizationId: orgId,
        firstName: 'Flow-User',
        lastName: 'Admin',
        jsondata: {
          firstName: 'Flow-User',
          lastName: 'Admin'
        },
        roleIds: ROLES_IDS
      }
    },
    adminOptions
  );

  return _.get(res, 'data.createUser.id', null);
}

async function getOrCreateOrganization(
  name: string
): Promise<OrganizationOrUpdatedRecord | null> {
  let applicationOrganization: OrganizationOrUpdatedRecord | null =
    await setupTestOrganization(name);

  const automaticPackageCreation = _.get(
    applicationOrganization,
    'jsondata.features.automaticPackageCreation',
    null
  );
  if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
    applicationOrganization = await updateOrganizationFeatures(
      applicationOrganization?.id ?? null
    );
  }
  return applicationOrganization;
}

async function updateOrganizationFeatures(
  orgId: string | null
): Promise<UpdatedOrganizationRecord | null> {
  if(!orgId) return null
  const res = await sdkClient.sdk.updateOrganization(
    {
      input: {
        id: orgId,
        metadata: {
          features: {
            automaticPackageCreation: 'enabled'
          }
        }
      }
    },
    adminOptions
  );

  return _.get(res, 'data.updateOrganization', null);
}

async function getOrCreateUser(
  applicationOrganization: OrganizationOrUpdatedRecord,
  uniqueId: string | number
) {
  const users = _.get(applicationOrganization, 'users.records', []);
  const activeUsers = users.filter(
    (user) =>
      user?.status === 'active' &&
      user?.organizationGuids?.length === 1 &&
      _.every(ROLES_IDS, (roleId) =>
        user?.roles?.some((role) => role?.id === roleId)
      )
  );
  let userId: string | null = null;
  if (activeUsers.length === 0) {
    userId = await createUser(uniqueId, applicationOrganization.id);
  } else {
    const adminUser = _.find(activeUsers, (user) =>
      _.includes(user?.name, 'admin')
    );
    userId = adminUser ? adminUser.id : users?.[0]?.id ?? null;
  }
  return userId;
}

/**
 * Because this depends on the config (whitelist, blacklist) from the server
 * so we have a special check here
 */
function validateInvalidApplicationRoles(error: any) {
  const errs = error?.response?.errors ?? [];
  expect(errs.length > 0).toEqual(true);
  const err = errs[0];
  expect(err).toBeDefined();
  expect(err.message).toContain(
    `the application roles are invalid. Some permissions are not allowed`
  );

  expect(err.data?.applicationRoles).toBeDefined();
  expect(err.data.applicationRoles.length > 0).toEqual(true);
  const roleWhitelist = _.get(err.data, 'roles.whitelist', []);
  const roleBlacklist = _.get(err.data, 'roles.blacklist', []);
  err.data.applicationRoles.forEach((o: any) => {
    expect(o.invalidPermissions).toBeDefined();
    expect(_.isArray(o.invalidPermissions)).toBe(true);
    expect(o.invalidPermissions.length > 0).toEqual(true);
    if (err.data.roles) {
      o.invalidPermissions.forEach((ip: string) => {
        expect(
          (!_.isEmpty(roleWhitelist) && !roleWhitelist.includes(ip)) ||
            roleBlacklist.includes(ip)
        ).toEqual(true);
      });
    }
  });
}

describe('citest_application: Application Basics', () => {
  let applicationId: string;
  let eventApplicationId: string;
  let roleIds: string[], orgId: string, userId: string;
  let applicationOrgId: string, applicationOrgGUID: string;
  let sa: IsolatedSuperadmin;
  const uniqueId = Date.now().valueOf();

  const appRolesToOrganization: CreateApplicationRole[] = [
    {
      id: uuidv4(),
      name: `${citestMarker}-app-role-${uuidv4()}`,
      description: `${citestMarker}-app-role`,
      isPrivate: false,
      isAppEventRole: false,
      permissions: [AuthPermissionType.CmsAccess]
    }
  ];
  const appConfigDefinition: ApplicationConfigDefinitionInput[] = [
    {
      configKey: `${citestMarker} Citest App 8 - application to organization - ${uniqueId} -org-key`,
      configType: ApplicationConfigValueEnum.String,
      configLevel: ApplicationConfigLevelEnum.Organization,
      required: false,
      secured: false,
      description: 'Tests org-level config definition.'
    },
    {
      configKey: `${citestMarker} Citest App 8 - application to organization - ${uniqueId} -user-key`,
      configType: ApplicationConfigValueEnum.String,
      configLevel: ApplicationConfigLevelEnum.User,
      required: false,
      secured: false,
      description: 'Tests user-level config definition.'
    }
  ];
  const application = [
    {
      name: `${citestMarker} App 1 - ${uniqueId}`,
      key: `citest_app_1_${uniqueId}`,
      description: `${citestMarker} App 1`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false
    },
    {
      name: `${citestMarker} App 2 - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_2_${uniqueId}`,
      description: `${citestMarker} App 2 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: true
    },
    {
      name: `${citestMarker} TestAppEvent - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_test_app_event_${uniqueId}`,
      description: `${citestMarker} TestAppEvent - ${uniqueId}`,
      url: 'https://dev-local.aiware.run',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    },
    {
      id: uuidv4(),
      name: `${citestMarker} App 3 - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_3_${uniqueId}`,
      description: `${citestMarker} App 3 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false
    },
    {
      id: uuidv4(),
      name: `${citestMarker} App 4 - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_4_${uniqueId}`,
      description: `${citestMarker} App 4 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    },
    {
      id: uuidv4(),
      name: `${citestMarker} Citest App 8 - app to org - ${uniqueId}`,
      key: `${citestMarker} citest_app_8_${uniqueId}`,
      description: `${citestMarker} Citest App 8 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active',
      applicationRoles: appRolesToOrganization,
      appConfigDefinition: appConfigDefinition
    },
    {
      id: uuidv4(),
      name: `${citestMarker} App 9 - add to org - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_9_${uniqueId}`,
      description: `${citestMarker} App 9 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active',
      appConfigDefinition: appConfigDefinition
    }
  ];

  beforeAll(async () => {
    // Bootstrap an ISOLATED superadmin (see test/helpers/superadminSession.ts,
    // PR #4238): the spec creates and deletes its own test org, and doing that
    // under the shared CI superadmin session enrolls the shared identity into
    // the org — deleting the org can then kill the shared session for every
    // concurrently running spec. All org/user setup and teardown below runs as
    // the throwaway superadmin instead; the shared session is only used to
    // create (and later clean up) the throwaway identity itself.
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(bootstrapClient.sessionToken).toBeDefined();
    sa = await createIsolatedSuperadmin(bootstrapClient);
    sdkClient = sa.client;
    adminToken = sa.token;
    adminOptions = sa.options;

    const applicationOrganization = await getOrCreateOrganization(nameOrg);
    if (!applicationOrganization) {
      throw new Error(`Failed to set up test organization "${nameOrg}"`);
    }
    if (!applicationOrganization.guid) {
      throw new Error(
        `Test organization ${applicationOrganization.id} has no guid`
      );
    }

    const createdUserId = await getOrCreateUser(
      applicationOrganization,
      uniqueId
    );
    if (!createdUserId) {
      throw new Error(
        `Failed to set up test user for organization ${applicationOrganization.id}`
      );
    }
    userId = createdUserId;

    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid;

    adminOptions = await impersonate(userId, applicationOrgGUID, adminToken);
  });

  describe('Applications LifeCycle Approved', () => {
    let basicApplicationId: string;
    const basicApplication = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };

    it('Create multiple applications', async () => {
      const application1 = {
        name: `${citestMarker} Citest Application Basics 1- ${uniqueId}`,
        description: basicApplication.description,
        url: basicApplication.url,
        oauth2RedirectUrls: [basicApplication.oauth2RedirectUrls],
        checkPermissions: false,
        iconUrl: basicApplication.iconUrl
      };

      const application2 = {
        name: `${citestMarker} Citest Application Basics 2- ${uniqueId}`,
        description: basicApplication.description,
        url: basicApplication.url,
        oauth2RedirectUrls: [basicApplication.oauth2RedirectUrls],
        checkPermissions: false,
        iconUrl: basicApplication.iconUrl
      };

      const appRes1 = await sdkClient.sdk.createApplication(
        { input: application1 },
        adminOptions
      );
      const createdApplication1 = appRes1?.data?.createApplication;
      const basicApplicationId1 = createdApplication1?.id as string;
      expect(basicApplicationId1).toBeDefined();
      expect(createdApplication1?.oauth2RedirectUrls?.length).toEqual(1);
      expect(createdApplication1?.name).toEqual(application1.name);

      const appRes2 = await sdkClient.sdk.createApplication(
        { input: application2 },
        adminOptions
      );
      const createdApplication2 = appRes2?.data?.createApplication;
      const basicApplicationId2 = createdApplication2?.id as string;
      expect(basicApplicationId2).toBeDefined();
      expect(createdApplication2?.oauth2RedirectUrls?.length).toEqual(1);
      expect(createdApplication2?.name).toEqual(application2.name);

      // Cleanup: delete created applications
      await sdkClient.sdk.deleteApplication(
        { id: basicApplicationId1 },
        adminOptions
      );
      await sdkClient.sdk.deleteApplication(
        { id: basicApplicationId2 },
        adminOptions
      );
    });

    it('Create an application', async () => {
      const appInput = {
        name: basicApplication.name,
        description: basicApplication.description,
        url: basicApplication.url,
        oauth2RedirectUrls: [basicApplication.oauth2RedirectUrls],
        checkPermissions: basicApplication.checkPermissions,
        iconUrl: basicApplication.iconUrl
      };

      const basicAppResult = await sdkClient.sdk.createApplication(
        { input: appInput },
        adminOptions
      );
      const createdApplication = basicAppResult?.data?.createApplication;
      basicApplicationId = createdApplication?.id as string;
      expect(basicApplicationId).toBeDefined();
      expect(createdApplication?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('Query and Check created application', async () => {
      const result = await sdkClient.sdk.application(
        { id: basicApplicationId },
        adminOptions
      );
      const application = result?.data?.application;
      expect(application).toBeDefined();
      expect(application?.id).toEqual(basicApplicationId);
      expect(application?.name).toEqual(basicApplication.name);
      expect(application?.description).toEqual(basicApplication.description);
      expect(application?.url).toEqual(basicApplication.url);
      expect(application?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('Update application', async () => {
      const payload = {
        id: basicApplicationId,
        name: basicApplication.name + '_updated',
        description: basicApplication.description,
        iconUrl: basicApplication.iconUrl,
        url: basicApplication.url
      };

      const result = await sdkClient.sdk.updateApplication(
        { input: payload },
        adminOptions
      );
      const updateApplication = result?.data?.updateApplication;
      expect(updateApplication?.id).toEqual(basicApplicationId);
      expect(updateApplication?.iconUrl).toEqual(payload.iconUrl);
      expect(updateApplication?.signedIconUrl).toEqual(payload.iconUrl);
      basicApplication.name = payload.name;
    });

    it('Query and Check created application after update', async () => {
      const result = await sdkClient.sdk.application(
        { id: basicApplicationId },
        adminOptions
      );
      const application = result?.data?.application;
      expect(application).toBeDefined();
      expect(application?.id).toEqual(basicApplicationId);
      expect(application?.name).toEqual(basicApplication.name);
      expect(application?.description).toEqual(basicApplication.description);
      expect(application?.url).toEqual(basicApplication.url);
      expect(application?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('Workflow application through cycle submit -> approve -> deploy', async () => {
      const actionAndStatusList: Array<[ApplicationWorkflowAction, string]> = [
        [ApplicationWorkflowAction.Submit, 'pending'],
        [ApplicationWorkflowAction.Approve, 'approved'],
        [ApplicationWorkflowAction.Deploy, 'active'],
        [ApplicationWorkflowAction.Disable, 'disabled']
      ];
      for (const [action, expectedStatus] of actionAndStatusList) {
        const result = await sdkClient.sdk.applicationWorkflow(
          { input: { id: basicApplicationId, action } },
          adminOptions
        );
        const workflow = result?.data?.applicationWorkflow;
        expect(workflow?.id).toEqual(basicApplicationId);
        expect(workflow?.status).toEqual(expectedStatus);
      }
    });

    it('Delete application', async () => {
      const result = await sdkClient.sdk.deleteApplication(
        { id: basicApplicationId },
        adminOptions
      );
      expect(_.get(result, 'data.deleteApplication.id')).toEqual(
        basicApplicationId
      );
    });
  });

  describe('Applications Lifecycle Rejected then Approved', () => {
    let rejectApplicationId: string;
    const rejectApplication = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: ['www.example.com/callback'],
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };

    it('Create an application', async () => {
      const appInput = {
        name: rejectApplication.name,
        description: rejectApplication.description,
        url: rejectApplication.url,
        oauth2RedirectUrls: rejectApplication.oauth2RedirectUrls,
        checkPermissions: rejectApplication.checkPermissions,
        iconUrl: rejectApplication.iconUrl
      };

      const basicAppResult = await sdkClient.sdk.createApplication(
        { input: appInput },
        adminOptions
      );
      const createdApplication = basicAppResult?.data?.createApplication;
      rejectApplicationId = createdApplication?.id as string;
      expect(rejectApplicationId).toBeDefined();
      expect(createdApplication?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('Query and Check created application', async () => {
      const result = await sdkClient.sdk.application(
        { id: rejectApplicationId },
        adminOptions
      );
      const application = result?.data?.application;

      expect(application).toBeDefined();
      expect(application?.id).toEqual(rejectApplicationId);
      expect(application?.name).toEqual(rejectApplication.name);
      expect(application?.description).toEqual(rejectApplication.description);
      expect(application?.url).toEqual(rejectApplication.url);
      expect(application?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('Update application', async () => {
      const payload = {
        id: rejectApplicationId,
        name: rejectApplication.name + '_updated',
        description: rejectApplication.description,
        iconUrl: rejectApplication.iconUrl,
        url: rejectApplication.url
      };

      const result = await sdkClient.sdk.updateApplication(
        { input: payload },
        adminOptions
      );
      const updateApplication = result?.data?.updateApplication;
      expect(updateApplication?.id).toEqual(rejectApplicationId);
      expect(updateApplication?.iconUrl).toEqual(payload.iconUrl);
      expect(updateApplication?.signedIconUrl).toEqual(payload.iconUrl);
      rejectApplication.name = payload.name;
    });

    it('Query and Check created application after update', async () => {
      const result = await sdkClient.sdk.application(
        { id: rejectApplicationId },
        adminOptions
      );
      const application = result?.data?.application;

      expect(application).toBeDefined();
      expect(application?.id).toEqual(rejectApplicationId);
      expect(application?.name).toEqual(rejectApplication.name);
      expect(application?.description).toEqual(rejectApplication.description);
      expect(application?.url).toEqual(rejectApplication.url);
      expect(application?.oauth2RedirectUrls?.length).toEqual(1);
    });

    it('Workflow application through cycle submit -> reject -> submit -> approve -> deploy -> disabled -> enabled', async () => {
      const actionAndStatusList: Array<[ApplicationWorkflowAction, string]> = [
        [ApplicationWorkflowAction.Submit, 'pending'],
        [ApplicationWorkflowAction.Reject, 'rejected'],
        [ApplicationWorkflowAction.Submit, 'pending'],
        [ApplicationWorkflowAction.Approve, 'approved'],
        [ApplicationWorkflowAction.Deploy, 'active'],
        [ApplicationWorkflowAction.Disable, 'disabled'],
        [ApplicationWorkflowAction.Enable, 'approved']
      ];
      for (const [action, expectedStatus] of actionAndStatusList) {
        const result = await sdkClient.sdk.applicationWorkflow(
          { input: { id: rejectApplicationId, action } },
          adminOptions
        );
        const workflow = result?.data?.applicationWorkflow;
        expect(workflow?.id).toEqual(rejectApplicationId);
        expect(workflow?.status).toEqual(expectedStatus);
      }
    });

    it('Delete application', async () => {
      const result = await sdkClient.sdk.deleteApplication(
        { id: rejectApplicationId },
        adminOptions
      );
      expect(_.get(result, 'data.deleteApplication.id')).toEqual(
        rejectApplicationId
      );
    });
  });

  describe('Application Errors', () => {
    const baseApplication = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: ['www.example.com/callback'],
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };
    let baseApplicationId: string;

    it('Create base application', async () => {
      const appInput = {
        name: baseApplication.name,
        description: baseApplication.description,
        url: baseApplication.url,
        oauth2RedirectUrls: baseApplication.oauth2RedirectUrls,
        checkPermissions: baseApplication.checkPermissions,
        iconUrl: baseApplication.iconUrl
      };

      const basicAppResult = await sdkClient.sdk.createApplication(
        { input: appInput },
        adminOptions
      );
      const createdApplication = basicAppResult?.data?.createApplication;
      baseApplicationId = createdApplication?.id as string;
      expect(baseApplicationId).toBeDefined();
    });

    it('Create application with duplicate name', async () => {
      const appInput = {
        name: baseApplication.name,
        description: baseApplication.description,
        url: baseApplication.url,
        oauth2RedirectUrls: baseApplication.oauth2RedirectUrls,
        checkPermissions: baseApplication.checkPermissions,
        iconUrl: baseApplication.iconUrl
      };

      try {
        await sdkClient.sdk.createApplication(
          { input: appInput },
          adminOptions
        );
      } catch (ex: any) {
        // The server reports this as a field-level validation error rather
        // than a top-level GraphQL error message.
        const validationErrors =
          ex?.response?.errors?.[0]?.data?.validationErrors ?? [];
        const nameError = validationErrors.find(
          (e: any) => e.fieldName === 'name'
        );
        expect(nameError?.message).toContain(
          'An application with this name already exists'
        );
      }
    });

    // Live-verified 2026-07-31 (local-compose): createApplication with a
    // duplicate explicit id fails with the raw Postgres unique-constraint
    // violation (`duplicate key value violates unique constraint
    // "_pk_application@application_id"`, sqlstate 23505) surfaced as
    // INTERNAL_SERVER_ERROR — the server has no friendly "An application with
    // this id already exists" validation like it has for duplicate names.
    // Enabling this test as written would pin a raw DB error message, so the
    // skip stays until server-side duplicate-id validation is implemented.
    it.skip('Create application with duplicate id', async () => {
      const appInput = {
        id: baseApplicationId,
        name: baseApplication.name + ' + duplicate',
        description: baseApplication.description,
        url: baseApplication.url,
        oauth2RedirectUrls: baseApplication.oauth2RedirectUrls,
        checkPermissions: baseApplication.checkPermissions,
        iconUrl: baseApplication.iconUrl
      };

      try {
        await sdkClient.sdk.createApplication(
          { input: appInput },
          adminOptions
        );
      } catch (ex: any) {
        const message = ex?.response?.errors?.[0]?.message ?? ex?.message;
        expect(message).toContain('An application with this id already exists');
      }
    });

    it('Application workflow invalid action', async () => {
      try {
        await sdkClient.sdk.applicationWorkflow(
          {
            input: {
              id: baseApplicationId,
              action: 'invalid_action' as ApplicationWorkflowAction
            }
          },
          adminOptions
        );
      } catch (ex: any) {
        const message = ex?.response?.errors?.[0]?.message ?? ex?.message;
        expect(message).toContain('invalid_action');
      }
    });

    it('Cleanup base application', async () => {
      try {
        const result = await sdkClient.sdk.deleteApplication(
          { id: baseApplicationId },
          adminOptions
        );
        expect(_.get(result, 'data.deleteApplication.id')).toEqual(
          baseApplicationId
        );
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  it('get dailyTaskMetrics', async () => {
    // The legacy spec xit'd this with an application id hardcoded from some
    // long-gone environment, so it could never run anywhere else. The field
    // itself works on any application (live-verified: returns an empty
    // records list for a fresh app) — create a throwaway app so the test is
    // self-contained, and clean it up afterwards.
    const createRes = await sdkClient.sdk.createApplication(
      {
        input: {
          name: `${citestMarker} DailyTaskMetrics - ${uniqueId}-${uuidv4()}`,
          url: 'www.example.com',
          checkPermissions: false
        }
      },
      adminOptions
    );
    const id = createRes?.data?.createApplication?.id ?? null;
    if (!id) {
      throw new Error(
        'createApplication returned no id for the dailyTaskMetrics probe app'
      );
    }
    try {
      const result = await sdkClient.sdk.application({ id }, adminOptions);
      expect(
        _.get(result, 'data.application.dailyTaskMetrics.records.length')
      ).toBeDefined();
    } finally {
      await sdkClient.sdk.deleteApplication({ id }, adminOptions);
    }
  });

  describe('Applications with enableAppEventFeature flag', () => {
    // `applicationId`/`eventApplicationId` are read by every test below but
    // nothing in the legacy test ever created an application and assigned
    // them — a latent bug that only surfaces once `enableAppEventFeature` is
    // actually on. `application[2]` ("TestAppEvent") is clearly the app this
    // section was meant to exercise (see its name/url), so create it here
    // and use it for both ids.
    let eventTestApplicationId: string | null = null;

    beforeAll(async () => {
      if (!enableAppEventFeature) return;
      const testApp = application[2];
      const result = await sdkClient.sdk.createApplication(
        {
          input: {
            name: testApp.name,
            description: testApp.description,
            url: testApp.url,
            checkPermissions: testApp.checkPermissions,
            iconUrl: testApp.iconUrl
          }
        },
        adminOptions
      );
      const createdId = result?.data?.createApplication?.id ?? null;
      if (!createdId) {
        throw new Error(
          'Failed to create the TestAppEvent application for the enableAppEventFeature tests'
        );
      }
      eventTestApplicationId = createdId;
      applicationId = createdId;
      eventApplicationId = createdId;
    });

    afterAll(async () => {
      if (!eventTestApplicationId) return;
      try {
        await sdkClient.sdk.deleteApplication(
          { id: eventTestApplicationId },
          adminOptions
        );
      } catch (error: any) {
        console.error(
          'Error deleting TestAppEvent application in afterAll:',
          error?.message
        );
      }
    });

    itif(
      enableAppEventFeature,
      'get roleIds of current user (for adding to application JWT token)',
      async () => {
        const result = await sdkClient.sdk.me({}, adminOptions);
        const me = result?.data?.me;
        const roles = _.get(me, 'roles', null);

        const currentOrgId = _.get(me, 'organizationId', null);
        const currentUserId = _.get(me, 'id', null);
        if (!currentOrgId || !currentUserId) {
          throw new Error('me query returned no organizationId/id');
        }
        orgId = currentOrgId;
        userId = currentUserId;
        expect(roles).toBeDefined();
        expect(orgId).toBeDefined();
        expect(userId).toBeDefined();
        expect(_.isArray(roles)).toEqual(true);
        expect(_.isEmpty(roles)).toEqual(false);
        roleIds = _.map(roles, (role: any) => role.id);
      }
    );

    itif(
      enableAppEventFeature,
      'get JWT token for application',
      async () => {
        const result = await sdkClient.sdk.getApplicationJWT(
          {
            input: {
              appId: applicationId,
              orgId: orgId,
              roleIds: roleIds
            }
          },
          adminOptions
        );
        const getApplicationJWT = result?.data?.getApplicationJWT;

        expect(getApplicationJWT).toBeDefined();
        expect(getApplicationJWT?.applicationId).toEqual(applicationId);
        expect(getApplicationJWT?.organizationId).toEqual(orgId);
        expect(getApplicationJWT?.token).toBeDefined();
        expect(jwt.decode(getApplicationJWT!.token as string)).toEqual({
          contentApplicationId: expect.any(String),
          contentOrganizationId: parseInt(orgId, 10),
          tokenApplicationId: applicationId,
          userId: userId,
          scope: [
            {
              actions: expect.any(Array),
              resources: { applicationId: applicationId }
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
        const result = await sdkClient.sdk.updateOrganization(
          {
            input: {
              id: orgId,
              applicationAccess: [
                {
                  applicationId: eventApplicationId,
                  enable: true
                }
              ]
            }
          },
          adminOptions
        );
        const updateOrg = result?.data?.updateOrganization;

        expect(updateOrg?.id).toEqual(orgId);
        expect(updateOrg?.name).toBeDefined();
        expect(
          (updateOrg?.applications?.records?.length ?? 0)
        ).toBeGreaterThan(0);
      }
    );

    itif(
      enableAppEventFeature,
      'add an endpoint to the application',
      async () => {
        const testEventEndpoint = 'https://dev-local.aiware.run/event-endpoint';

        const result = await sdkClient.sdk.updateApplicationEventEndpoint(
          {
            input: {
              id: eventApplicationId,
              eventEndpoint: testEventEndpoint
            }
          },
          adminOptions
        );

        const app = result?.data?.updateApplicationEventEndpoint;
        expect(app?.id).toEqual(eventApplicationId);
        expect(app?.eventEndpoint).toEqual(testEventEndpoint);
        application[2].eventEndpoint = testEventEndpoint;
      }
    );

    itif(
      enableAppEventFeature,
      'check application event endpoint is set',
      async () => {
        const result = await sdkClient.sdk.application(
          { id: eventApplicationId },
          adminOptions
        );

        const app = result?.data?.application;
        expect(app?.id).toEqual(eventApplicationId);
        expect(app?.eventEndpoint).toEqual(application[2].eventEndpoint);
      }
    );

    itif(
      enableAppEventFeature,
      'remove event endpoint from application',
      async () => {
        const result = await sdkClient.sdk.removeApplicationEventEndpoint(
          { id: eventApplicationId },
          adminOptions
        );

        const deleteResult = result?.data?.removeApplicationEventEndpoint;
        expect(deleteResult?.id).toEqual(eventApplicationId);
        expect(deleteResult?.message).toBeDefined();
      }
    );

    // feature flag enableAppEventFeature must be enabled in both core-admin and core-graphql
    // when adding an app to the org, the appRole auth group is created async via eventing.
    itif(
      enableAppEventFeature,
      'add application to an organization with defaultAppAccess role creation',
      async () => {
        const app = application[6];
        const appInput = {
          id: app.id,
          name: app.name,
          key: app.key,
          description: app.description,
          url: app.url,
          checkPermissions: app.checkPermissions,
          applicationConfigDefinition: app.appConfigDefinition
        };

        const resultApp = await sdkClient.sdk.createApplication(
          { input: appInput },
          adminOptions
        );
        const createdApplication = resultApp?.data?.createApplication;
        expect(resultApp).toBeDefined();
        expect(createdApplication).toBeDefined();
        expect(createdApplication?.id).toEqual(app.id);
        expect(createdApplication?.name).toEqual(app.name);
        // createApplication without applicationRoles
        expect(createdApplication?.applicationRoles?.length).toEqual(0);
        const applicationIdToOrg = app.id;

        const inputAppAddToOrg = {
          orgId: applicationOrgId,
          appId: applicationIdToOrg,
          configs: [
            {
              configKey: app.appConfigDefinition[0].configKey,
              configValue: 'test'
            }
          ]
        };
        const resultAddToOrg = await sdkClient.sdk.addAppToOrg(
          inputAppAddToOrg,
          adminOptions
        );
        const addApplicationToOrganization =
          resultAddToOrg?.data?.applicationAddToOrg;
        expect(addApplicationToOrganization?.id).toEqual(applicationIdToOrg);
        // A defaultAppAccess role will be created when adding app to org
        expect(addApplicationToOrganization?.applicationRoles).toBeDefined();
        expect(
          addApplicationToOrganization?.applicationRoles?.length
        ).toEqual(1);
        expect(
          addApplicationToOrganization?.applicationRoles?.[0]?.name
        ).toEqual(DEFAULT_APP_EVENT_ROLE_NAME);
        expect(
          addApplicationToOrganization?.applicationRoles?.[0]?.permissions
        ).toBeDefined();
        expect(
          addApplicationToOrganization?.applicationRoles?.[0]?.permissions
            ?.length
        ).toBeGreaterThan(0);
        expect(
          addApplicationToOrganization?.applicationRoles?.[0]
            ?.isApplicationEventRole
        ).toEqual(true);

        // Wait for application add to organization to propagate
        await helpers.sleep(1000);

        const resultGetAppConfig = await sdkClient.sdk.applicationConfig(
          {
            appId: applicationIdToOrg,
            orgId: applicationOrgId,
            configKeyRegexp: app.appConfigDefinition[0].configKey
          },
          adminOptions
        );
        const userIdInAppConfig = _.get(
          resultGetAppConfig,
          'data.applicationConfig.records[0].userId'
        );
        // userId field of a config at org level must be null.
        expect(userIdInAppConfig).toEqual(null);

        const res = await sdkClient.sdk.deleteApplication(
          { id: applicationIdToOrg },
          adminOptions
        );
        expect(_.get(res, 'data.deleteApplication.id')).toEqual(
          applicationIdToOrg
        );
      }
    );
  });

  afterAll(async () => {
    // Teardown must NOT use `adminOptions`: since beforeAll it holds the
    // IMPERSONATED test-org user's token, and the deleteUser below destroys
    // that very user — killing the impersonated session, so the org
    // soft-delete that follows would fail with "token not found" (this was a
    // conversion bug: the legacy spec tore down with the superadmin client's
    // own token). Use the isolated superadmin's options instead; its session
    // survives because the org is only soft-deleted.
    try {
      // Delete user created in beforeAll
      if (userId) {
        await sdkClient.sdk.deleteUser({ id: userId }, sa.options);
      }
    } catch (error: any) {
      // User deletion may fail if already deleted or if user doesn't exist
      console.error('Error deleting user in afterAll:', error?.message);
    }

    try {
      // Mark organization as deleted
      if (applicationOrgId) {
        await sdkClient.sdk.updateOrganization(
          { input: { id: applicationOrgId, status: 'deleted' } },
          sa.options
        );
      }
    } catch (error: any) {
      // Organization deletion may fail if already deleted
      console.error('Error deleting organization in afterAll:', error?.message);
    }

    // Tear down the throwaway superadmin identity itself — must run last.
    if (sa) {
      await sa.cleanup();
    }
  });
});

/*
  These tests ensure that the application queries and mutations
  that Hub uses work as expected with their api tokens.
 */
(isHubResourceTestEnabled ? describe : describe.skip)('Application - Hub', () => {
  let simpleApplicationId: string;
  let cmeApplicationId: string;
  let appRolesApplicationId: string;
  let headerbarApplicationId: string;
  let appConfigApplicationId: string;
  let hubUserId: string;
  let hubOrgId: string;
  let hubSa: IsolatedSuperadmin;
  let aiDataOrgClient: GraphqlClient;
  let internalOrglessClient: GraphqlClient;
  const uniqueId = Date.now().valueOf();
  const application = {
    simple: {
      name: `${citestMarker} Hub Test Application - ${uniqueId}`,
      description: `${citestMarker} Hub Test Application`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png',
      status: 'active'
    },
    cme: {
      name: `${citestMarker} Hub Test ContextMenuExtensions - ${uniqueId}`,
      description: `${citestMarker} Hub Test ContextMenuExtensions`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    },
    appRoles: {
      name: `${citestMarker} Hub Test ApplicationRoles - ${uniqueId}`,
      description: `${citestMarker} Hub Test ApplicationRoles`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: true,
      status: 'active'
    },
    headerbar: {
      id: uuidv4(),
      name: `${citestMarker} Hub Test Headerbar - ${uniqueId}`,
      description: `${citestMarker} Hub Test Headerbar`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    },
    appConfig: {
      id: uuidv4(),
      name: `${citestMarker} Hub Test ApplicationConfigDefinition - ${uniqueId}`,
      description: `${citestMarker} Hub Test ApplicationConfigDefinition`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    }
  };
  _.forEach(_.keys(application), (property) => {
    application[property].key = _.snakeCase(application[property].name);
  });
  const cmeTypes: Array<keyof AppCreateContextMenuExtensions> = [
    'mentions',
    'tdos',
    'watchlists',
    'collections'
  ];

  beforeAll(async () => {
    // Same isolation rationale as the "Application Basics" describe above:
    // this suite creates and soft-deletes its own test org, so it gets its own
    // throwaway superadmin rather than enrolling the shared CI session.
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(bootstrapClient.sessionToken).toBeDefined();
    hubSa = await createIsolatedSuperadmin(bootstrapClient);
    sdkClient = hubSa.client;
    adminOptions = hubSa.options;

    aiDataOrgClient = await createGraphqlClient(AuthType.API_KEY, env);
    internalOrglessClient = await createGraphqlClient(
      AuthType.ORGLESS_API_KEY,
      env
    );

    const applicationOrganization = await getOrCreateOrganization(nameOrg);
    if (!applicationOrganization) {
      throw new Error(`Failed to set up test organization "${nameOrg}"`);
    }

    const createdUserId = await getOrCreateUser(
      applicationOrganization,
      uniqueId
    );
    if (!createdUserId) {
      throw new Error(
        `Failed to set up test user for organization ${applicationOrganization.id}`
      );
    }

    // Store for cleanup in afterAll
    hubUserId = createdUserId;
    hubOrgId = applicationOrganization.id;
  });

  /*
    Mutations - Create
  */

  it('should create a simple application using Hub token with automatic package creation disabled', async () => {
    const result = await aiDataOrgClient.sdk.createApplication({
      input: {
        name: application.simple.name,
        description: application.simple.description,
        url: application.simple.url,
        oauth2RedirectUrls: application.simple.oauth2RedirectUrls,
        checkPermissions: application.simple.checkPermissions,
        status: application.simple.status,
        disableAutoPackageCreation: true
      }
    });
    const createdApplication = result?.data?.createApplication;
    expect(createdApplication).toBeDefined();

    simpleApplicationId = createdApplication?.id as string;
    expect(simpleApplicationId).toBeDefined();

    expect(createdApplication?.oauth2RedirectUrls?.length).toEqual(1);

    expect(
      _.omit(createdApplication, ['id', 'oauth2RedirectUrls'])
    ).toEqual(
      expect.objectContaining(
        _.omit(application.simple, [
          'id',
          'key',
          'checkPermissions',
          'oauth2RedirectUrls',
          'iconUrl'
        ])
      )
    );
  });

  it('should not have created an application package when creating an application', async () => {
    const result = await internalOrglessClient.sdk.queryPackages({
      primaryResourceId: simpleApplicationId
    });

    expect(result?.data?.packages).toBeDefined();
    expect(result?.data?.packages?.records).toBeDefined();
    expect(result?.data?.packages?.records?.length).toEqual(0);
  });

  // createApplication.contextMenuExtensions
  it('should create an application with context menu extensions using Hub token', async () => {
    const payload: AppCreateContextMenuExtensions = {
      mentions: [
        { id: uuidv4(), label: 'Foo Mention', url: 'http://www.example.com/${mentionId}', type: ContextMenuExtensionType.Mention }
      ],
      tdos: [
        { id: uuidv4(), label: 'Foo TDO', url: 'http://www.example.com/${tdoId}', type: ContextMenuExtensionType.Tdo }
      ],
      watchlists: [
        { id: uuidv4(), label: 'Foo Watchlist', url: 'http://www.example.com/${watchlistId}', type: ContextMenuExtensionType.Watchlist }
      ],
      collections: [
        { id: uuidv4(), label: 'Foo Collection', url: 'http://www.example.com/${collectionId}', type: ContextMenuExtensionType.Collection }
      ]
    };

    const result = await aiDataOrgClient.sdk.createApplication({
      input: {
        name: application.cme.name,
        description: application.cme.description,
        url: application.cme.url,
        oauth2RedirectUrls: application.cme.oauth2RedirectUrls,
        checkPermissions: application.cme.checkPermissions,
        status: application.cme.status,
        contextMenuExtensions: payload
      }
    });

    const createdApplication = result?.data?.createApplication;
    expect(result).toBeDefined();

    cmeApplicationId = createdApplication?.id as string;
    expect(cmeApplicationId).toBeDefined();

    expect(createdApplication?.oauth2RedirectUrls?.length).toEqual(1);

    expect(
      _.omit(createdApplication, ['id', 'oauth2RedirectUrls', 'contextMenuExtensions'])
    ).toEqual(
      expect.objectContaining(
        _.omit(application.cme, [
        'id',
        'key',
        'checkPermissions',
        'oauth2RedirectUrls'
      ])
      )
    );

    _.forEach(cmeTypes, (field) => {
      expect(createdApplication?.contextMenuExtensions?.[field]?.[0]).toEqual(
        expect.objectContaining(payload[field]![0])
      );
    });

    application.cme.contextMenuExtensions = createdApplication?.contextMenuExtensions;
  });

  // createApplication.applicationRoles
  it('should create an application with application roles using Hub token', async () => {
    const payload: CreateApplicationRole[] = [
      {
        id: uuidv4(),
        name: `${citestMarker}-app-role-${uuidv4()}`,
        description: `${citestMarker}-app-role`,
        isPrivate: false,
        isAppEventRole: false,
        permissions: [
          AuthPermissionType.DeveloperAccess,
          AuthPermissionType.DeveloperBuildApprove
        ]
      }
    ];

    try {
      const result = await aiDataOrgClient.sdk.createApplication({
        input: {
          name: application.appRoles.name,
          description: application.appRoles.description,
          url: application.appRoles.url,
          oauth2RedirectUrls: application.appRoles.oauth2RedirectUrls,
          checkPermissions: application.appRoles.checkPermissions,
          status: application.appRoles.status,
          applicationRoles: payload
        }
      });
      const createdApplication = result?.data?.createApplication;
      expect(result).toBeDefined();

      appRolesApplicationId = createdApplication?.id as string;
      expect(appRolesApplicationId).toBeDefined();

      expect(createdApplication?.name).toEqual(application.appRoles.name);
      expect(createdApplication?.applicationRoles).toBeDefined();
      expect(createdApplication?.applicationRoles?.length).toEqual(1);
      expect(
        createdApplication?.applicationRoles?.[0]?.permissions
      ).toBeDefined();
      expect(
        createdApplication?.applicationRoles?.[0]?.permissions?.length
      ).toEqual(2);
      expect(createdApplication?.applicationRoles?.[0]?.permissions).toEqual(
        payload[0].permissions
      );

      application.appRoles.applicationRoles =
        createdApplication?.applicationRoles;
    } catch (ex) {
      validateInvalidApplicationRoles(ex);
    }
  });

  // createApplication.headerbar
  it('should create an application with a headerbar using Hub token', async () => {
    const payload = {
      name: `${application.headerbar.name}-headerbar`,
      config: {
        backgroundColor: '#0000FF',
        help: true,
        notification: false,
        logoSrc: 'www.example.com'
      }
    };

    const result = await aiDataOrgClient.sdk.createApplication({
      input: {
        name: application.headerbar.name,
        description: application.headerbar.description,
        url: application.headerbar.url,
        oauth2RedirectUrls: application.headerbar.oauth2RedirectUrls,
        checkPermissions: application.headerbar.checkPermissions,
        status: application.headerbar.status,
        headerbar: payload
      }
    });
    const createdApplication = result?.data?.createApplication;
    expect(result).toBeDefined();

    headerbarApplicationId = createdApplication?.id as string;
    expect(headerbarApplicationId).toBeDefined();

    expect(createdApplication?.name).toEqual(application.headerbar.name);
    expect(createdApplication?.applicationHeaderbar).toBeDefined();
    expect(createdApplication?.applicationHeaderbar).toEqual(payload);

    application.headerbar.applicationHeaderbar =
      createdApplication?.applicationHeaderbar;
  });

  // createApplication.applicationConfigDefinition
  it('should create an application with config definitions using Hub token', async () => {
    const payload: ApplicationConfigDefinitionInput[] = [
      {
        configKey: `${application.appConfig.name}-org-key`,
        configType: ApplicationConfigValueEnum.String,
        configLevel: ApplicationConfigLevelEnum.Organization,
        required: false,
        secured: false,
        description: 'Tests org-level config definition for Hub.'
      },
      {
        configKey: `${application.appConfig.name}-user-key`,
        configType: ApplicationConfigValueEnum.String,
        configLevel: ApplicationConfigLevelEnum.User,
        required: false,
        secured: false,
        description: 'Tests user-level config definition for Hub.'
      }
    ];

    const result = await aiDataOrgClient.sdk.createApplication({
      input: {
        name: application.appConfig.name,
        description: application.appConfig.description,
        url: application.appConfig.url,
        oauth2RedirectUrls: application.appConfig.oauth2RedirectUrls,
        checkPermissions: application.appConfig.checkPermissions,
        status: application.appConfig.status,
        applicationConfigDefinition: payload
      }
    });
    const createdApplication = result?.data?.createApplication;
    expect(result).toBeDefined();

    appConfigApplicationId = createdApplication?.id as string;
    expect(appConfigApplicationId).toBeDefined();

    expect(createdApplication?.name).toEqual(application.appConfig.name);
    expect(createdApplication?.applicationConfigDefinition).toBeDefined();
    expect(
      createdApplication?.applicationConfigDefinition?.count
    ).toEqual(2);
    expect(
      createdApplication?.applicationConfigDefinition?.records
    ).toBeDefined();

    expect(
      createdApplication?.applicationConfigDefinition?.records?.[0]
    ).toEqual(expect.objectContaining(payload[0]));
    expect(
      createdApplication?.applicationConfigDefinition?.records?.[0]
        ?.applicationId
    ).toEqual(appConfigApplicationId);

    expect(
      createdApplication?.applicationConfigDefinition?.records?.[1]
    ).toEqual(expect.objectContaining(payload[1]));
    expect(
      createdApplication?.applicationConfigDefinition?.records?.[1]
        ?.applicationId
    ).toEqual(appConfigApplicationId);

    application.appConfig.applicationConfigDefinitions =
      createdApplication?.applicationConfigDefinition?.records;
  });

  /*
    Mutations - Update
  */

  // updateApplication
  it('should update an application using Hub token', async () => {
    const payload = {
      id: simpleApplicationId,
      status: ApplicationStatus.Active,
      name: application.simple.name + '_updated',
      description: application.simple.description,
      iconUrl: application.simple.iconUrl,
      url: application.simple.url
    };

    const result = await aiDataOrgClient.sdk.updateApplication({
      input: payload
    });
    const updateApplication = result?.data?.updateApplication;
    expect(updateApplication?.id).toEqual(simpleApplicationId);
    expect(updateApplication?.iconUrl).toEqual(payload.iconUrl);
    expect(updateApplication?.signedIconUrl).toEqual(payload.iconUrl);
    application.simple.name = payload.name;
  });

  // updateApplication.contextMenuExtensions
  it('should update context menu extensions through updateApplication using Hub token', async () => {
    const mentionId = _.get(
      application.cme.contextMenuExtensions,
      'mentions[0].id',
      null
    );
    const tdoId = _.get(
      application.cme.contextMenuExtensions,
      'tdos[0].id',
      null
    );
    const watchlistId = _.get(
      application.cme.contextMenuExtensions,
      'watchlists[0].id',
      null
    );
    const collectionId = _.get(
      application.cme.contextMenuExtensions,
      'collections[0].id',
      null
    );
    if (!mentionId || !tdoId || !watchlistId || !collectionId) {
      throw new Error(
        'Missing context menu extension id(s) from the earlier create step'
      );
    }

    const payload = {
      id: cmeApplicationId,
      contextMenuExtensions: {
        mentions: [
          {
            id: mentionId,
            label: 'FooBar Mention',
            url: 'http://www.example.com/${mentionId}'
          }
        ],
        tdos: [
          {
            id: tdoId,
            label: 'FooBar TDO',
            url: 'http://www.example.com/${tdoId}'
          }
        ],
        watchlists: [
          {
            id: watchlistId,
            label: 'FooBar Watchlist',
            url: 'http://www.example.com/${watchlistId}'
          }
        ],
        collections: [
          {
            id: collectionId,
            label: 'FooBar Collection',
            url: 'http://www.example.com/${collectionId}'
          }
        ]
      }
    };

    const result = await aiDataOrgClient.sdk.updateApplication({
      input: payload
    });
    const updateApplication = result?.data?.updateApplication;
    expect(updateApplication?.id).toEqual(cmeApplicationId);

    _.forEach(cmeTypes, (cmeType) => {
      const updatedExtensions = updateApplication?.contextMenuExtensions?.[
        cmeType
      ];
      expect(updatedExtensions?.length).toEqual(1);

      expect(updatedExtensions?.[0]).toEqual(
        expect.objectContaining(payload.contextMenuExtensions[cmeType][0])
      );

      expect(updatedExtensions?.[0]?.type).toEqual(
        cmeType.substring(0, cmeType.length - 1)
      );
    });

    application.cme.contextMenuExtensions =
      updateApplication?.contextMenuExtensions;
  });

  // updateApplicationRole TODO: Enable when updateApplicationRole has been
  // implemented server-side — re-verified 2026-07-31: the mutation still does
  // not exist in schema/schema.graphql, so this cannot be enabled yet.
  it.skip('should update application role using Hub token', async () => {
    const payload = {
      id: application.appRoles.applicationRoles[0].id,
      description: 'ci-hub-test-app-role-updated',
      permissions: [AuthPermissionType.AiwareFlowRead]
    };

    // `updateApplicationRole` is not implemented server-side (see TODO above)
    // and has no extracted operation / generated SDK method — left untyped
    // rather than cast to `any` so this surfaces as a compiler error until
    // the operation actually exists.
    const result = await aiDataOrgClient.sdk.updateApplicationRole({
      input: payload
    });
    expect(result).toBeDefined();

    const updateApplicationRole = result?.data?.updateApplicationRole;
    expect(updateApplicationRole?.name).toEqual(application.appRoles.name);

    expect(updateApplicationRole?.permissions).toBeDefined();
    expect(updateApplicationRole?.permissions?.length).toEqual(3);
    expect(updateApplicationRole?.permissions).toEqual([
      ...application.appRoles.applicationRoles[0].permissions,
      ...payload.permissions
    ]);
  });

  // updateApplication.headerbar
  it('should update headerbar through updateApplication using Hub token', async () => {
    const payload = {
      id: headerbarApplicationId,
      headerbar: {
        name: `${application.headerbar.applicationHeaderbar.name}-updated`,
        config: {
          backgroundColor: '#000000',
          help: true,
          notification: false,
          logoSrc: 'www.other-example.com'
        }
      }
    };

    const result = await aiDataOrgClient.sdk.updateApplication({
      input: payload
    });
    const updateApplication = result?.data?.updateApplication;
    expect(updateApplication?.id).toEqual(headerbarApplicationId);
    expect(updateApplication?.name).toEqual(application.headerbar.name);
    expect(updateApplication?.applicationHeaderbar).toEqual(payload.headerbar);

    application.headerbar.applicationHeaderbar =
      updateApplication?.applicationHeaderbar;
  });

  it('should update config definitions through updateApplication using Hub token', async () => {
    const payload: { id: string; applicationConfigDefinition: ApplicationConfigDefinitionUpdateApp[] } = {
      id: appConfigApplicationId,
      applicationConfigDefinition: [
        {
          configKey:
            application.appConfig.applicationConfigDefinitions[0].configKey,
          update: {
            configKey: `${application.appConfig.applicationConfigDefinitions[0].configKey}-updated`
          }
        },
        {
          configKey:
            application.appConfig.applicationConfigDefinitions[1].configKey,
          update: {
            configKey: `${application.appConfig.applicationConfigDefinitions[1].configKey}-updated`
          }
        }
      ]
    };

    const expectedAppConfigDefinitions = [
      {
        ...application.appConfig.applicationConfigDefinitions[0],
        configKey: payload.applicationConfigDefinition[0].update.configKey
      },
      {
        ...application.appConfig.applicationConfigDefinitions[1],
        configKey: payload.applicationConfigDefinition[1].update.configKey
      }
    ];

    const result = await aiDataOrgClient.sdk.updateApplication({
      input: payload
    });
    expect(result).toBeDefined();
    const updateApplication = result?.data?.updateApplication;
    expect(updateApplication).toBeDefined();
    expect(updateApplication?.applicationConfigDefinition).toBeDefined();
    expect(updateApplication?.applicationConfigDefinition?.count).toEqual(2);
    expect(
      updateApplication?.applicationConfigDefinition?.records
    ).toBeDefined();

    expect(updateApplication?.applicationConfigDefinition?.records).toEqual(
      expect.arrayContaining(expectedAppConfigDefinitions)
    );

    application.appConfig.applicationConfigDefinitions =
      updateApplication?.applicationConfigDefinition?.records;
  });

  /*
    Queries
  */

  it('retrieve an application using Hub token', async () => {
    const result = await internalOrglessClient.sdk.applications({
      id: simpleApplicationId
    });
    const records = result?.data?.applications?.records ?? [];
    expect(records.length).toEqual(1);
    expect(records[0]?.id).toEqual(simpleApplicationId);
    expect(records[0]?.name).toEqual(application.simple.name);
  });

  it('retrieve multiple applications by IDs using Hub token', async () => {
    const appIds = [simpleApplicationId, cmeApplicationId].filter(Boolean);
    const result = await internalOrglessClient.sdk.applications({
      ids: appIds
    });
    const records = result?.data?.applications?.records ?? [];
    expect(records.length).toEqual(appIds.length);
    const returnedIds = records.map((r: any) => r.id);
    expect(returnedIds).toEqual(expect.arrayContaining(appIds));
  });

  it('retrieve multiple applications using both id and ids filters using Hub token', async () => {
    const appIds = [cmeApplicationId].filter((id) => id);
    const result = await internalOrglessClient.sdk.applications({
      id: simpleApplicationId,
      ids: appIds
    });
    const expectedIds = [simpleApplicationId, ...appIds];
    const records = result?.data?.applications?.records ?? [];
    expect(records.length).toEqual(expectedIds.length);
    const returnedIds = records.map((r: any) => r.id);
    expect(returnedIds).toEqual(expect.arrayContaining(expectedIds));
  });

  it('retrieve multiple applications using Hub token', async () => {
    const result = await internalOrglessClient.sdk.applications({});
    expect((result?.data?.applications?.records ?? []).length).toBeGreaterThan(
      1
    );
  });

  it('retrieve an application with context menu extensions using Hub token', async () => {
    const result = await internalOrglessClient.sdk.applications({
      id: cmeApplicationId
    });
    const records = result?.data?.applications?.records ?? [];
    expect(records.length).toEqual(1);
    expect(records[0]?.id).toEqual(cmeApplicationId);
    expect(records[0]?.contextMenuExtensions).toEqual(
      application.cme.contextMenuExtensions
    );
  });

  it('retrieve an application with application roles using Hub token', async () => {
    if (!appRolesApplicationId) {
      return;
    }

    const result = await internalOrglessClient.sdk.applications({
      id: appRolesApplicationId
    });
    const records = result?.data?.applications?.records ?? [];
    expect(records.length).toEqual(1);
    expect(records[0]?.id).toEqual(appRolesApplicationId);
    expect(records[0]?.applicationRoles).toEqual(
      application.appRoles.applicationRoles
    );
  });

  it('retrieve an application with headerbar using Hub token', async () => {
    const result = await internalOrglessClient.sdk.applicationHeaderbar({
      id: headerbarApplicationId
    });
    const records = result?.data?.applications?.records ?? [];
    expect(records.length).toEqual(1);
    expect(records[0]?.id).toEqual(headerbarApplicationId);
    expect(records[0]?.applicationHeaderbar).toEqual(
      application.headerbar.applicationHeaderbar
    );
  });

  it('retrieve an application with config definitions using Hub token', async () => {
    const result = await internalOrglessClient.sdk.applications({
      id: appConfigApplicationId
    });
    const records = result?.data?.applications?.records ?? [];
    expect(records.length).toEqual(1);
    expect(records[0]?.id).toEqual(appConfigApplicationId);
    expect(records[0]?.applicationConfigDefinition).toBeDefined();
    expect(
      records[0]?.applicationConfigDefinition?.records?.length
    ).toEqual(2);
    expect(records[0]?.applicationConfigDefinition?.records).toEqual(
      expect.arrayContaining(application.appConfig.applicationConfigDefinitions)
    );
  });

  /*
    Clean Up
  */

  it('delete applications that were created using Hub token', async () => {
    const ids = [
      simpleApplicationId,
      cmeApplicationId,
      appRolesApplicationId,
      headerbarApplicationId,
      appConfigApplicationId
    ].filter(Boolean);

    for (const id of ids) {
      const result = await sdkClient.sdk.deleteApplication(
        { id },
        adminOptions
      );
      expect(_.get(result, 'data.deleteApplication.id')).toEqual(id);
    }
  });

  afterAll(async () => {
    try {
      if (hubUserId) {
        await sdkClient.sdk.deleteUser({ id: hubUserId }, adminOptions);
      }
    } catch (error: any) {
      console.error('Error deleting Hub user in afterAll:', error?.message);
    }

    try {
      if (hubOrgId) {
        await sdkClient.sdk.updateOrganization(
          { input: { id: hubOrgId, status: 'deleted' } },
          adminOptions
        );
      }
    } catch (error: any) {
      console.error(
        'Error deleting Hub organization in afterAll:',
        error?.message
      );
    }

    // Tear down the throwaway superadmin identity itself — must run last.
    if (hubSa) {
      await hubSa.cleanup();
    }
  });
});
