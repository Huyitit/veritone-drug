import * as _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  buildRequestHeaders,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  OrganizationType,
  StringMatch,
  ApplicationConfigValueEnum,
  ApplicationConfigLevelEnum,
  EngineDistributionType,
  PackageResourceType,
  PackageResourceAction
} from '../../src/gql';
import type { OrganizationsQuery, UpdateOrganizationMutation } from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

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
const DESKTOP_SA = 'cb18eb9c-3264-434a-8a8d-e6b2d680f66e';
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
// Set by jest.global.setup.js under jest (CI) and by the test/setup.ts
// preload under `bun test` (see bunfig.toml).
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const ORG_ADMIN_ROLE = isDesktopAppEnabled
  ? '032218c3-d47e-4287-9d16-7bb867c01266'
  : 'ddca9b68-d775-4934-8ffd-7aecc779b652';

let sdkClient: GraphqlClient;
let adminOptions: Record<string, string>;
let sa: IsolatedSuperadmin;

async function getOrganization(
  name: string,
  ignoreExpect?: boolean,
  nameMatch: StringMatch = StringMatch.Contains
): Promise<OrganizationRecord | null> {
  const res = await sdkClient.sdk.organizations(
    { name, nameMatch },
    adminOptions
  );
  const org = _.get(res, 'data.organizations.records[0]', null);

  if (!ignoreExpect) {
    expect(org).toBeDefined();
    expect(org?.name).toContain(name);
    expect(org?.users).toBeDefined();
  }

  return org;
}

async function setupTestOrganization(
  prefixName: string,
  useEngineGrant?: boolean
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
    },
    {
      applicationId: '674c5d24-6c80-4106-8f34-cb1d19cdc1d5',
      applicationKey: 'CI Test'
    }
  ].filter((app) => app);

  const res = await sdkClient.sdk.createOrganization(
    {
      input: {
        name,
        businessUnit: 'Legal',
        metadata: {
          features: {
            enableRBACFeature: 'disabled',
            useEngineGrant: useEngineGrant ? 'enabled' : 'disabled'
          }
        },
        applications: apps
      }
    },
    adminOptions
  );

  const createdName = res?.data?.createOrganization?.name ?? null;
  if (!createdName) {
    throw new Error(`Failed to create test organization "${name}"`);
  }

  return await getOrganization(createdName, true, StringMatch.Exact);
}

async function updateOrganizationFeatures(
  orgId: string
): Promise<UpdatedOrganizationRecord | null> {
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

async function getOrCreateOrganization(
  nameOrg: string
): Promise<OrganizationOrUpdatedRecord | null> {
  let applicationOrganization: OrganizationOrUpdatedRecord | null =
    await setupTestOrganization(nameOrg);
  if (!applicationOrganization) {
    return null;
  }

  const automaticPackageCreation = _.get(
    applicationOrganization,
    'jsondata.features.automaticPackageCreation',
    null
  );
  if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
    applicationOrganization = await updateOrganizationFeatures(
      applicationOrganization.id
    );
  }
  return applicationOrganization;
}

interface LoggedInUser {
  id: string;
  options: Record<string, string>;
}

async function createAndLoginUser(
  userName: string,
  password: string,
  orgId: string,
  orgGuid: string,
  roleIds: string[]
): Promise<LoggedInUser> {
  const createRes = await sdkClient.sdk.createUser(
    {
      input: {
        name: userName,
        password,
        organizationId: orgId,
        roleIds,
        firstName: 'First',
        lastName: 'Last',
        jsondata: { foo: 'bar' }
      }
    },
    adminOptions
  );
  const userId = createRes?.data?.createUser?.id ?? null;
  if (!userId) {
    throw new Error(`Failed to create user ${userName}`);
  }

  const options = await buildRequestHeaders(sdkClient, {
    userName,
    password,
    organizationGuid: orgGuid
  });

  return { id: userId, options };
}

describe('citest_application: ApplicationConfig', () => {
  let testOrg: OrganizationOrUpdatedRecord;
  let applicationId: string;
  let packageId: string;
  let superAdminUser: LoggedInUser;
  let orgAdminUser: LoggedInUser;
  let nonAdminUser: LoggedInUser;

  const uniqueId = Date.now().valueOf();
  const superAdminUserName = `${citestMarker}-test_user_${uuidv4()}@localhost`;
  const superAdminPassword = `${Date.now()}`;
  const orgAdminUserName = `${citestMarker}-test_user_${uuidv4()}@localhost`;
  const orgAdminPassword = `${Date.now()}`;
  const nonAdminUserName = `${citestMarker}-test_user_${uuidv4()}@localhost`;
  const nonAdminPassword = `${Date.now()}`;

  const application = {
    name: `${citestMarker}-Citest App 1 - ${uniqueId}`,
    description: 'Citest App 1',
    url: 'www.example.com',
    oauth2RedirectUrls: 'www.example.com/callback',
    checkPermissions: false
  };

  const userAppConfigDefinition = {
    configKey: 'UserTestConfig',
    configType: ApplicationConfigValueEnum.Boolean,
    configLevel: ApplicationConfigLevelEnum.User,
    required: false,
    secured: false,
    description: 'Citest App 1'
  };

  const orgAppConfigDefinition = {
    configKey: 'OrgTestConfig',
    configType: ApplicationConfigValueEnum.Boolean,
    configLevel: ApplicationConfigLevelEnum.Organization,
    required: false,
    secured: false,
    description: 'Citest App 1'
  };

  const instanceAppConfigDefinition = {
    configKey: 'InstanceTestConfig',
    configType: ApplicationConfigValueEnum.Boolean,
    configLevel: ApplicationConfigLevelEnum.Instance,
    required: false,
    secured: false,
    description: 'Citest App 1'
  };

  beforeAll(async () => {
    // Bootstrap an ISOLATED superadmin (see test/helpers/superadminSession.ts,
    // PR #4238): this spec creates and soft-deletes its own test org, so all
    // org/user setup and teardown runs as a throwaway superadmin instead of
    // enrolling the shared CI session into the test org.
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(bootstrapClient.sessionToken).toBeDefined();
    sa = await createIsolatedSuperadmin(bootstrapClient);
    sdkClient = sa.client;
    adminOptions = sa.options;

    const nameOrg = `${citestMarker}-no-engine-grant-org-app-config-${uniqueId}`;
    const org = await getOrCreateOrganization(nameOrg);
    if (!org || !org.guid) {
      throw new Error(`Failed to set up test organization "${nameOrg}"`);
    }
    testOrg = org;

    superAdminUser = await createAndLoginUser(
      superAdminUserName,
      superAdminPassword,
      testOrg.id,
      testOrg.guid,
      [DESKTOP_SA]
    );

    nonAdminUser = await createAndLoginUser(
      nonAdminUserName,
      nonAdminPassword,
      testOrg.id,
      testOrg.guid,
      []
    );

    orgAdminUser = await createAndLoginUser(
      orgAdminUserName,
      orgAdminPassword,
      testOrg.id,
      testOrg.guid,
      [ORG_ADMIN_ROLE]
    );

    const createAppResult = await sdkClient.sdk.createApplication(
      {
        input: {
          name: application.name,
          description: application.description,
          url: application.url,
          oauth2RedirectUrls: application.oauth2RedirectUrls,
          checkPermissions: application.checkPermissions,
          disableAutoPackageCreation: true
        }
      },
      superAdminUser.options
    );
    const createdApplicationId = createAppResult?.data?.createApplication?.id ?? null;
    expect(createdApplicationId).toBeDefined();
    if (!createdApplicationId) {
      throw new Error('Failed to create test application');
    }
    applicationId = createdApplicationId;

    const createPackageResult = await sdkClient.sdk.packageCreate(
      {
        input: {
          name: `${citestMarker} test package 2`,
          version: '1.0',
          distributionType: EngineDistributionType.Public,
          primaryResourceId: applicationId,
          resources: [
            {
              resourceId: applicationId,
              resourceType: PackageResourceType.Application,
              action: PackageResourceAction.Add
            }
          ]
        }
      },
      superAdminUser.options
    );
    const createdPackageId = createPackageResult?.data?.packageCreate?.id ?? null;
    expect(createdPackageId).toBeDefined();
    if (!createdPackageId) {
      throw new Error('Failed to create test package');
    }
    packageId = createdPackageId;
  });

  //////////////////////////////////////
  // applicationConfigDefinitionCreate
  //////////////////////////////////////

  it('should successfully create user-level config definition for non-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionCreate(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: userAppConfigDefinition.configKey,
          configType: userAppConfigDefinition.configType,
          configLevel: userAppConfigDefinition.configLevel,
          required: userAppConfigDefinition.required,
          secured: userAppConfigDefinition.secured,
          description: userAppConfigDefinition.description,
          packageId
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigDefinitionCreate?.records;
    expect(applicationId).toEqual(configRecord?.[0]?.applicationId);
    expect(packageId).toEqual(configRecord?.[0]?.packageId);
    expect(configRecord?.length).toEqual(1);
  });

  it('should throw error when non-admin user attempts to create org-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionCreate(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey,
          configType: orgAppConfigDefinition.configType,
          configLevel: orgAppConfigDefinition.configLevel,
          required: orgAppConfigDefinition.required,
          secured: orgAppConfigDefinition.secured,
          description: orgAppConfigDefinition.description,
          packageId
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins/orgAdmins can create or update application configuration definitions at the organization config level.'
    );
  });

  it('should throw error when non-admin user attempts to create instance-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionCreate(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey,
          configType: instanceAppConfigDefinition.configType,
          configLevel: instanceAppConfigDefinition.configLevel,
          required: instanceAppConfigDefinition.required,
          secured: instanceAppConfigDefinition.secured,
          description: instanceAppConfigDefinition.description,
          packageId
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can create or update application configuration definitions at the instance config level.'
    );
  });

  it('should successfully create org-level config definition for org-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionCreate(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey,
          configType: orgAppConfigDefinition.configType,
          configLevel: orgAppConfigDefinition.configLevel,
          required: orgAppConfigDefinition.required,
          secured: orgAppConfigDefinition.secured,
          description: orgAppConfigDefinition.description,
          packageId
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigDefinitionCreate?.records;
    expect(applicationId).toEqual(configRecord?.[0]?.applicationId);
    expect(packageId).toEqual(configRecord?.[0]?.packageId);
    expect(configRecord?.length).toEqual(1);
  });

  it('should throw error when org-admin user attempts to create instance-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionCreate(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey,
          configType: instanceAppConfigDefinition.configType,
          configLevel: instanceAppConfigDefinition.configLevel,
          required: instanceAppConfigDefinition.required,
          secured: instanceAppConfigDefinition.secured,
          description: instanceAppConfigDefinition.description,
          packageId
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can create or update application configuration definitions at the instance config level.'
    );
  });

  it('should successfully create instance-level config definition for super-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionCreate(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey,
          configType: instanceAppConfigDefinition.configType,
          configLevel: instanceAppConfigDefinition.configLevel,
          required: instanceAppConfigDefinition.required,
          secured: instanceAppConfigDefinition.secured,
          description: instanceAppConfigDefinition.description,
          packageId
        },
        superAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigDefinitionCreate?.records;
    expect(applicationId).toEqual(configRecord?.[0]?.applicationId);
    expect(packageId).toEqual(configRecord?.[0]?.packageId);
    expect(configRecord?.length).toEqual(1);
  });

  //////////////////////////////////////
  // applicationConfigDefinitionUpdate
  //////////////////////////////////////

  it('should successfully update user-level config definition for non-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionUpdate(
        {
          appId: applicationId,
          configKey: userAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigDefinitionUpdate?.records;
    expect(configRecord?.[0]?.configType).toEqual(
      ApplicationConfigValueEnum.String
    );
  });

  it('should throw an error when non-admin attempts to update user-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionUpdate(
        {
          appId: applicationId,
          configKey: orgAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins/orgAdmins can create or update application configuration definitions at the organization config level.'
    );
  });

  it('should throw an error when non-admin attempts to update instance-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionUpdate(
        {
          appId: applicationId,
          configKey: instanceAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can create or update application configuration definitions at the instance config level.'
    );
  });

  it('should successfully update org-level config definition for org-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionUpdate(
        {
          appId: applicationId,
          configKey: orgAppConfigDefinition.configKey
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigDefinitionUpdate?.records;
    expect(configRecord?.[0]?.configType).toEqual(
      ApplicationConfigValueEnum.String
    );
  });

  it('should throw an error when org-admin attempts to update instance-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionUpdate(
        {
          appId: applicationId,
          configKey: instanceAppConfigDefinition.configKey
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can create or update application configuration definitions at the instance config level.'
    );
  });

  it('should successfully update instance-level config definition for super-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionUpdate(
        {
          appId: applicationId,
          configKey: instanceAppConfigDefinition.configKey
        },
        superAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigDefinitionUpdate?.records;
    expect(configRecord?.[0]?.configType).toEqual(
      ApplicationConfigValueEnum.String
    );
  });

  //////////////////////////
  // applicationConfigSet
  //////////////////////////

  it('should successfully set user-level config for non-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigSet(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            { configKey: userAppConfigDefinition.configKey, configValue: 'true' }
          ]
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigSet?.records;
    expect(configRecord?.[0]?.value).toBeTruthy();
  });

  it('should throw error when non-admin attempts to set org-level config', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigSet(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            { configKey: orgAppConfigDefinition.configKey, configValue: 'true' }
          ]
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins/orgAdmins can edit/delete application settings at the organization config level.'
    );
  });

  it('should throw error when non-admin attempts to set instance-level config', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigSet(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: instanceAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully set org-level config for org-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigSet(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            { configKey: orgAppConfigDefinition.configKey, configValue: 'true' }
          ]
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigSet?.records;
    expect(configRecord?.[0]?.value).toBeTruthy();
  });

  it('should throw error when org-admin attempts to set instance-level config', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigSet(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: instanceAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully set instance-level config for instance-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigSet(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: instanceAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        },
        superAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    const configRecord = result?.data?.applicationConfigSet?.records;
    expect(configRecord?.[0]?.value).toBeTruthy();
  });

  /////////////////////////////
  // applicationConfigDelete
  /////////////////////////////

  it('should successfully delete user-level config for non-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: userAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(result?.data?.applicationConfigDelete?.success).toBeTruthy();
  });

  it('should throw error when non-admin attempts to delete org-level config', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins/orgAdmins can edit/delete application settings at the organization config level.'
    );
  });

  it('should throw error when non-admin attempts to delete instance-level config', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully delete org-level config for org-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(result?.data?.applicationConfigDelete?.success).toBeTruthy();
  });

  it('should throw error when org-admin attempts to delete instance-level config', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully delete instance-level config for super-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        },
        superAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(result?.data?.applicationConfigDelete?.success).toBeTruthy();
  });

  //////////////////////////////////////
  // applicationConfigDefinitionDelete
  //////////////////////////////////////

  it('should successfully delete user-level config definition for non-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: userAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(
      result?.data?.applicationConfigDefinitionDelete?.success
    ).toBeTruthy();
  });

  it('should throw error when non-admin attempts to delete org-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins/orgAdmins can edit/delete application settings at the organization config level.'
    );
  });

  it('should throw error when non-admin attempts to delete instance-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        },
        nonAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully delete org-level config definition for org-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(
      result?.data?.applicationConfigDefinitionDelete?.success
    ).toBeTruthy();
  });

  it('should throw error when org-admin attempts to delete instance-level config definition', async () => {
    let error: any;
    try {
      await sdkClient.sdk.applicationConfigDefinitionDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        },
        orgAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    const message = error?.response?.errors?.[0]?.message ?? error?.message;
    expect(message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully delete instance-level config definition for super-admin', async () => {
    let result: any, error: any;
    try {
      result = await sdkClient.sdk.applicationConfigDefinitionDelete(
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        },
        superAdminUser.options
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(
      result?.data?.applicationConfigDefinitionDelete?.success
    ).toBeTruthy();
  });

  it('should cleanup the rest of test data', async () => {
    const packageDeleteResult = await sdkClient.sdk.packageDelete(
      { id: packageId },
      adminOptions
    );
    expect(packageDeleteResult?.data?.packageDelete?.success).toBeTruthy();

    const deleteAppResult = await sdkClient.sdk.deleteApplication(
      { id: applicationId },
      adminOptions
    );
    expect(deleteAppResult?.data?.deleteApplication?.id).toEqual(applicationId);

    const deleteSuperAdminResult = await sdkClient.sdk.deleteUser(
      { id: superAdminUser.id },
      adminOptions
    );
    expect(deleteSuperAdminResult?.data?.deleteUser?.id).toEqual(
      superAdminUser.id
    );

    const deleteNonAdminResult = await sdkClient.sdk.deleteUser(
      { id: nonAdminUser.id },
      adminOptions
    );
    expect(deleteNonAdminResult?.data?.deleteUser?.id).toEqual(nonAdminUser.id);

    const deleteOrgAdminResult = await sdkClient.sdk.deleteUser(
      { id: orgAdminUser.id },
      adminOptions
    );
    expect(deleteOrgAdminResult?.data?.deleteUser?.id).toEqual(
      orgAdminUser.id
    );

    const updateOrgResult = await sdkClient.sdk.updateOrganization(
      { input: { id: testOrg.id, status: 'deleted' } },
      adminOptions
    );
    expect(updateOrgResult?.data?.updateOrganization?.status).toEqual(
      'deleted'
    );
  });

  afterAll(async () => {
    // Tear down the throwaway superadmin identity itself — must run last,
    // after the spec's own test-org cleanup above.
    if (sa) {
      await sa.cleanup();
    }
  });
});
