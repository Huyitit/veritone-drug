const helpers = require('../../helpers');
const appHelpers = require('../../helpers/application');
const packageHelpers = require('../../helpers/package');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');

const DESKTOP_SA = 'cb18eb9c-3264-434a-8a8d-e6b2d680f66e';
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const ORG_ADMIN_ROLE = isDesktopAppEnabled
  ? '032218c3-d47e-4287-9d16-7bb867c01266'
  : 'ddca9b68-d775-4934-8ffd-7aecc779b652';

let gqlClient;
let testOrg;
let applicationId;
let packageId;
let superAdminUser,
  superAdminUserName = `${citestMarker}-test_user_${uuid.v4()}@localhost`,
  superAdminPassword = `${Date.now()}`;
let orgAdminUser,
  orgAdminUserName = `${citestMarker}-test_user_${uuid.v4()}@localhost`,
  orgAdminPassword = `${Date.now()}`;
let nonAdminUser,
  nonAdminUserName = `${citestMarker}-test_user_${uuid.v4()}@localhost`,
  nonAdminPassword = `${Date.now()}`;

describe('citest_application: ApplicationConfig', () => {
  let resultApp, resultPackage;
  const uniqueId = Date.now().valueOf();
  const application = {
    name: `${citestMarker}-Citest App 1 - ${uniqueId}`,
    key: `${citestMarker}-citest-app-1-${uniqueId}`,
    description: 'Citest App 1',
    url: 'www.example.com',
    oauth2RedirectUrls: 'www.example.com/callback',
    checkPermissions: false
  };

  const userAppConfigDefinition = {
    configKey: 'UserTestConfig',
    configType: 'Boolean',
    configLevel: 'User',
    required: false,
    secured: false,
    description: 'Citest App 1'
  };

  const orgAppConfigDefinition = {
    configKey: 'OrgTestConfig',
    configType: 'Boolean',
    configLevel: 'Organization',
    required: false,
    secured: false,
    description: 'Citest App 1'
  };

  const instanceAppConfigDefinition = {
    configKey: 'InstanceTestConfig',
    configType: 'Boolean',
    configLevel: 'Instance',
    required: false,
    secured: false,
    description: 'Citest App 1'
  };

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    await gqlClient.connect();

    let nameOrg = citestMarker + '-no-engine-grant-org-app-config-' + uniqueId;
    testOrg = await getOrCreateOrganization(gqlClient, nameOrg);

    // Create super-admin, non-admin, and org-admin users
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
      ORG_ADMIN_ROLE
    );

    // Create the application for testing
    let createAppInput = {
      name: application.name,
      description: application.description,
      url: application.url,
      oauth2RedirectUrls: application.oauth2RedirectUrls,
      checkPermissions: application.checkPermissions,
      disableAutoPackageCreation: true
    };

    resultApp = await appHelpers.helpCreateApp(
      { gqlClient, options: superAdminUser.options },
      createAppInput
    );
    let app1 = _.get(resultApp, 'createApplication');
    applicationId = _.get(app1, 'id');
    expect(applicationId).toBeDefined();

    // Create the application package for testing
    let packageCreateInput = {
      name: `${citestMarker} test package 2`,
      version: '1.0',
      distributionType: 'public',
      primaryResourceId: applicationId,
      resources: [
        {
          resourceId: applicationId,
          resourceType: 'application',
          action: 'ADD'
        }
      ]
    };

    resultPackage = await packageHelpers.helpCreatePackage(
      { gqlClient, options: superAdminUser.options },
      packageCreateInput
    );
    const packageCreated = _.get(resultPackage, 'packageCreate');
    packageId = _.get(packageCreated, 'id');
    expect(packageId).toBeDefined();
  });

  //////////////////////////////////////
  // applicationConfigDefinitionCreate
  //////////////////////////////////////

  it('should successfully create user-level config definition for non-admin', async () => {
    let result, error;

    let createACDInput = [
      {
        appId: applicationId,
        orgId: testOrg.id,
        configKey: userAppConfigDefinition.configKey,
        configType: userAppConfigDefinition.configType,
        configLevel: userAppConfigDefinition.configLevel,
        required: userAppConfigDefinition.required,
        secured: userAppConfigDefinition.secured,
        description: userAppConfigDefinition.description,
        packageId: packageId
      }
    ];

    try {
      result = await appHelpers.helpCreateApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        createACDInput
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(
      result,
      'applicationConfigDefinitionCreate.records'
    );
    expect(applicationId).toEqual(_.get(configRecord[0], 'applicationId'));
    expect(packageId).toEqual(_.get(configRecord[0], 'packageId'));
    expect(configRecord.length).toEqual(1);
  });

  it('should throw error when non-admin user attempts to create org-level config definition', async () => {
    let result, error;

    let createACDInput = {
      appId: applicationId,
      orgId: testOrg.id,
      configKey: orgAppConfigDefinition.configKey,
      configType: orgAppConfigDefinition.configType,
      configLevel: orgAppConfigDefinition.configLevel,
      required: orgAppConfigDefinition.required,
      secured: orgAppConfigDefinition.secured,
      description: orgAppConfigDefinition.description,
      packageId: packageId
    };

    try {
      result = await appHelpers.helpCreateApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        createACDInput
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins/orgAdmins can create or update application configuration definitions at the organization config level.'
    );
  });

  it('should throw error when non-admin user attempts to create instance-level config definition', async () => {
    let result, error;

    let createACDInput = {
      appId: applicationId,
      orgId: testOrg.id,
      configKey: instanceAppConfigDefinition.configKey,
      configType: instanceAppConfigDefinition.configType,
      configLevel: instanceAppConfigDefinition.configLevel,
      required: instanceAppConfigDefinition.required,
      secured: instanceAppConfigDefinition.secured,
      description: instanceAppConfigDefinition.description,
      packageId: packageId
    };

    try {
      result = await appHelpers.helpCreateApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        createACDInput
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can create or update application configuration definitions at the instance config level.'
    );
  });

  it('should successfully create org-level config definition for org-admin', async () => {
    let result, error;

    let createACDInput = {
      appId: applicationId,
      orgId: testOrg.id,
      configKey: orgAppConfigDefinition.configKey,
      configType: orgAppConfigDefinition.configType,
      configLevel: orgAppConfigDefinition.configLevel,
      required: orgAppConfigDefinition.required,
      secured: orgAppConfigDefinition.secured,
      description: orgAppConfigDefinition.description,
      packageId: packageId
    };

    try {
      result = await appHelpers.helpCreateApplicationConfigDefinition(
        { gqlClient, options: orgAdminUser.options },
        createACDInput
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(
      result,
      'applicationConfigDefinitionCreate.records'
    );
    expect(applicationId).toEqual(_.get(configRecord[0], 'applicationId'));
    expect(packageId).toEqual(_.get(configRecord[0], 'packageId'));
    expect(configRecord.length).toEqual(1);
  });

  it('should throw error when org-admin user attempts to create instance-level config definition', async () => {
    let result, error;

    let createACDInput = {
      appId: applicationId,
      orgId: testOrg.id,
      configKey: instanceAppConfigDefinition.configKey,
      configType: instanceAppConfigDefinition.configType,
      configLevel: instanceAppConfigDefinition.configLevel,
      required: instanceAppConfigDefinition.required,
      secured: instanceAppConfigDefinition.secured,
      description: instanceAppConfigDefinition.description,
      packageId: packageId
    };

    try {
      result = await appHelpers.helpCreateApplicationConfigDefinition(
        { gqlClient, options: orgAdminUser.options },
        createACDInput
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can create or update application configuration definitions at the instance config level.'
    );
  });

  it('should successfully create instance-level config definition for super-admin', async () => {
    let result, error;

    let createACDInput = {
      appId: applicationId,
      orgId: testOrg.id,
      configKey: instanceAppConfigDefinition.configKey,
      configType: instanceAppConfigDefinition.configType,
      configLevel: instanceAppConfigDefinition.configLevel,
      required: instanceAppConfigDefinition.required,
      secured: instanceAppConfigDefinition.secured,
      description: instanceAppConfigDefinition.description,
      packageId: packageId
    };

    try {
      result = await appHelpers.helpCreateApplicationConfigDefinition(
        { gqlClient, options: superAdminUser.options },
        createACDInput
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(
      result,
      'applicationConfigDefinitionCreate.records'
    );
    expect(applicationId).toEqual(_.get(configRecord[0], 'applicationId'));
    expect(packageId).toEqual(_.get(configRecord[0], 'packageId'));
    expect(configRecord.length).toEqual(1);
  });

  //////////////////////////////////////
  // applicationConfigDefinitionUpdate
  //////////////////////////////////////

  it('should successfully update user-level config definition for non-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpUpdateApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          configKey: userAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(
      result,
      'applicationConfigDefinitionUpdate.records'
    );
    expect(_.get(configRecord[0], 'configType')).toEqual('String');
  });

  it('should throw an error when non-admin attempts to update user-level config definition', async () => {
    let result, error;
    try {
      result = await appHelpers.helpUpdateApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          configKey: orgAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins/orgAdmins can create or update application configuration definitions at the organization config level.'
    );
  });

  it('should throw an error when non-admin attempts to update instance-level config definition', async () => {
    let result, error;
    try {
      result = await appHelpers.helpUpdateApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can create or update application configuration definitions at the instance config level.'
    );
  });

  it('should successfully update org-level config definition for org-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpUpdateApplicationConfigDefinition(
        { gqlClient, options: orgAdminUser.options },
        {
          appId: applicationId,
          configKey: orgAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(
      result,
      'applicationConfigDefinitionUpdate.records'
    );
    expect(_.get(configRecord[0], 'configType')).toEqual('String');
  });

  it('should throw an error when org-admin attempts to update instance-level config definition', async () => {
    let result, error;
    try {
      result = await appHelpers.helpUpdateApplicationConfigDefinition(
        { gqlClient, options: orgAdminUser.options },
        {
          appId: applicationId,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can create or update application configuration definitions at the instance config level.'
    );
  });

  it('should successfully update instance-level config definition for super-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpUpdateApplicationConfigDefinition(
        { gqlClient, options: superAdminUser.options },
        {
          appId: applicationId,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(
      result,
      'applicationConfigDefinitionUpdate.records'
    );
    expect(_.get(configRecord[0], 'configType')).toEqual('String');
  });

  //////////////////////////
  // applicationConfigSet
  //////////////////////////

  it('should successfully set user-level config for non-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpSetApplicationConfig(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: userAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(result, 'applicationConfigSet.records');
    expect(_.get(configRecord[0], 'value')).toBeTruthy();
  });

  it('should throw error when non-admin attempts to set org-level config', async () => {
    let result, error;
    try {
      result = await appHelpers.helpSetApplicationConfig(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: orgAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins/orgAdmins can edit/delete application settings at the organization config level.'
    );
  });

  it('should throw error when non-admin attempts to set instance-level config', async () => {
    let result, error;
    try {
      result = await appHelpers.helpSetApplicationConfig(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: instanceAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully set org-level config for org-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpSetApplicationConfig(
        { gqlClient, options: orgAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: orgAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(result, 'applicationConfigSet.records');
    expect(_.get(configRecord[0], 'value')).toBeTruthy();
  });

  it('should throw error when org-admin attempts to set instance-level config', async () => {
    let result, error;
    try {
      result = await appHelpers.helpSetApplicationConfig(
        { gqlClient, options: orgAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: instanceAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully set instance-level config for instance-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpSetApplicationConfig(
        { gqlClient, options: superAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configs: [
            {
              configKey: instanceAppConfigDefinition.configKey,
              configValue: 'true'
            }
          ]
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    let configRecord = _.get(result, 'applicationConfigSet.records');
    expect(_.get(configRecord[0], 'value')).toBeTruthy();
  });

  /////////////////////////////
  // applicationConfigDelete
  /////////////////////////////

  it('should successfully delete user-level config for non-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfig(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: userAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(_.get(result, 'applicationConfigDelete.success')).toBeTruthy();
  });

  it('should throw error when non-admin attempts to delete org-level config', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfig(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins/orgAdmins can edit/delete application settings at the organization config level.'
    );
  });

  it('should throw error when non-admin attempts to delete instance-level config', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfig(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully delete org-level config for org-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfig(
        { gqlClient, options: orgAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(_.get(result, 'applicationConfigDelete.success')).toBeTruthy();
  });

  it('should throw error when org-admin attempts to delete instance-level config', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfig(
        { gqlClient, options: orgAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully delete instance-level config for super-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfig(
        { gqlClient, options: superAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(_.get(result, 'applicationConfigDelete.success')).toBeTruthy();
  });

  //////////////////////////////////////
  // applicationConfigDefinitionDelete
  //////////////////////////////////////

  it('should successfully delete user-level config definition for non-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: userAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(
      _.get(result, 'applicationConfigDefinitionDelete.success')
    ).toBeTruthy();
  });

  it('should throw error when non-admin attempts to delete org-level config definition', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins/orgAdmins can edit/delete application settings at the organization config level.'
    );
  });

  it('should throw error when non-admin attempts to delete instance-level config definition', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfigDefinition(
        { gqlClient, options: nonAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully delete org-level config definition for org-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfigDefinition(
        { gqlClient, options: orgAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: orgAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(
      _.get(result, 'applicationConfigDefinitionDelete.success')
    ).toBeTruthy();
  });

  it('should throw error when org-admin attempts to delete instance-level config definition', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfigDefinition(
        { gqlClient, options: orgAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(
      'Only superadmins can edit/delete application settings at the instance config level.'
    );
  });

  it('should successfully delete instance-level config definition for super-admin', async () => {
    let result, error;
    try {
      result = await appHelpers.helpDeleteApplicationConfigDefinition(
        { gqlClient, options: superAdminUser.options },
        {
          appId: applicationId,
          orgId: testOrg.id,
          configKey: instanceAppConfigDefinition.configKey
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeUndefined();
    expect(result).toBeDefined();
    expect(
      _.get(result, 'applicationConfigDefinitionDelete.success')
    ).toBeTruthy();
  });

  it('should cleanup the rest of test data', async () => {
    const query = `
    mutation {
      packageDelete(id: "${packageId}") {
        success
      }
      deleteApplication(id: "${applicationId}") {
        id
      }
      deleteSuperAdminUser: deleteUser(id: "${superAdminUser.id}") {
        id
      }
      deleteNonAdminUser: deleteUser(id: "${nonAdminUser.id}") {
        id
      }
      deleteOrgAdminUser: deleteUser(id: "${orgAdminUser.id}") {
        id
      }
      updateOrganization(input: {
        id: "${testOrg.id}"
        status: "deleted"
      }) {
        id
        status
      }
    }`;

    let result = await gqlClient.query(query);
    expect(result.packageDelete.success).toBeTruthy();
    expect(result.deleteApplication.id).toEqual(applicationId);
    expect(result.deleteSuperAdminUser.id).toEqual(superAdminUser.id);
    expect(result.deleteNonAdminUser.id).toEqual(nonAdminUser.id);
    expect(result.deleteOrgAdminUser.id).toEqual(orgAdminUser.id);
    expect(result.updateOrganization.status).toEqual('deleted');
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

  async function setupTestOrganization(client, prefixName, useEngineGrant) {
    // set up organization
    const createOrgGql = `mutation ($kvp: JSONData!, $apps: JSONData) {
    createOrganization (input: {
      name: "${prefixName}-${uuid.v4()}"
      businessUnit: "Legal"
      types: [agency, broadcaster]
      metadata: $kvp
      applications: $apps
    }) {
      id
      guid
      name
      type
      jsondata 
    }
  }`;

    const variables = {
      kvp: {
        features: {
          enableRBACFeature: 'disabled',
          useEngineGrant: useEngineGrant ? 'enabled' : 'disabled'
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
        },
        {
          applicationId: '674c5d24-6c80-4106-8f34-cb1d19cdc1d5',
          applicationKey: 'CI Test'
        }
      ].filter((app) => app)
    };
    const org = await client.query(createOrgGql, variables);
    let newName = _.get(org, 'createOrganization.name');

    return await getOrganization(newName, true, 'exact');
  }

  async function getOrganization(name, ignoreExpect, nameMatch = 'contains') {
    const getOrgGQL = `
      query getOrganization {
        organizations(
          name: "${name}"
          nameMatch: ${nameMatch}
        ) {
          records {
            id
            guid
            name
            status
            rootFolder {
              id
              name
              description
            }
            users {
              records {
                name
                id
                organizationGuid
                organizationId
                authGroups {
                  records {
                    id
                    name
                    description
                  }
                }
              }
            }
          }
        }
      }`;
    const resultOrgGql = await gqlClient.query(getOrgGQL);
    const engineGrantOrg = _.get(resultOrgGql, 'organizations.records[0]');

    if (!ignoreExpect) {
      expect(engineGrantOrg).toBeDefined();
      expect(engineGrantOrg.name).toContain(name);
      expect(engineGrantOrg.users).toBeDefined();
    }

    return engineGrantOrg;
  }

  async function getOrCreateOrganization(client, nameOrg) {
    let applicationOrganization = await setupTestOrganization(client, nameOrg);

    const automaticPackageCreation = _.get(
      applicationOrganization,
      'jsondata.features.automaticPackageCreation'
    );
    if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
      applicationOrganization = await updateOrganization(
        applicationOrganization.id
      );
    }
    return applicationOrganization;
  }

  async function updateOrganization(orgId) {
    const query = `mutation {
    updateOrganization(input: {
      id: "${orgId}"
      metadata: {
        features: {
          automaticPackageCreation: "enabled"
        }
      }
    }) {
      id
      guid
      name
      type
      jsondata
      users {
        records {
          name
          id
          organizationGuid
          organizationId
          organizationGuids
          authGroups {
            records {
              id
              name
              description
            }
          }
          roles{
            id
          }
          status
        }
      }
    }
  }`;

    const resultOrg = await gqlClient.query(query);
    return _.get(resultOrg, 'updateOrganization');
  }

  async function updateUserRole(userId, orgId, roleIds = []) {
    const createResourceMutation = `
  mutation updateUser ($userId: ID!, $orgId: ID!, $roleIds: [ID!]) {
    updateUser(
      input: {
        id: $userId
        roleIds: $roleIds
        organizationId: $orgId
      }
    ) {
      id
    }
  }
  `;

    const result = await gqlClient.query(createResourceMutation, {
      userId,
      orgId,
      roleIds
    });
    expect(result.updateUser.id).toBeDefined();
  }

  async function createAndLoginUser(
    userName,
    password,
    orgId,
    orgGuid,
    roleIds
  ) {
    const returnObject = {
      id: null,
      token: null,
      options: null
    };

    let query = `mutation($userName: String!, $password: String, $orgId: ID!, $roleIds: [ID!]) {
        createUser(input: {
          name: $userName
          password: $password
          organizationId: $orgId
          roleIds: $roleIds
          firstName: "First"
          lastName: "Last"
          jsondata: {
            foo: "bar"
          }
        })  {
          id
          name
        }
      }`;
    let result = await gqlClient.query(query, {
      userName,
      password,
      orgId,
      roleIds
    });
    expect(result.createUser.id).toBeDefined();
    expect(result.createUser.name).toBeDefined();
    returnObject.userId = result.createUser.id;

    query = `mutation($userName: String!, $password: String!, $orgGuid: ID) {
            userLogin(input: {
              userName: $userName
              password: $password
              organizationGuid: $orgGuid
            }) {
              token
              user {
                id
                name
              }
              organization {
                id
                guid
              }
            }
          }`;
    result = await gqlClient.query(query, {
      userName,
      password,
      orgGuid
    });
    expect(result.userLogin.token).toBeDefined();
    expect(result.userLogin.organization).toBeDefined();
    expect(result.userLogin.organization.id).toBeDefined();
    expect(result.userLogin.organization.guid).toBeDefined();
    expect(result.userLogin.user.id).toBeDefined();
    expect(result.userLogin.user.name).toBeDefined();

    returnObject.id = result.userLogin.user.id;
    returnObject.token = result.userLogin.token;
    returnObject.options = helpers.requestOptions(returnObject.token);

    return returnObject;
  }
});
