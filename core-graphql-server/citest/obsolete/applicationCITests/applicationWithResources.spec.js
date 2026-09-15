const helpers = require('../../helpers');
const appHelpers = require('../../helpers/application');
const packageHelpers = require('../../helpers/package');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;

const env = config.env;
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const gqlClient = new GraphqlClient(env);
const citestMarker = globalThis.citestMarker || 'citest-should-delete';
const DEFAULT_APP_EVENT_ROLE_NAME = 'Default App Access';
const chakram = require('chakram');
const { EntityTagType } = require('../../tools/graphql-api/src/gql/gql');
const itif = (condition, ...args) => (condition ? it(...args) : it.skip(...args));
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
console.log('isDesktopAppEnabled:', isDesktopAppEnabled);

const nameOrg = `${citestMarker}-application-resources`;

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);
let superAdminOption;
let useRBACFeature = false;

describe('citest_application: Application with resources', () => {
  let applicationOrgId, applicationOrgGUID;
  let appPackageId;
  let adminOptions;
  let userId;
  const uniqueId = Date.now().valueOf();
  const serviceToken = 'citest_service_token:dbd399ece3554c9d9fa3d1015e743b5858468ad2eeb540f2b58556ff69562c50';
  helpers.requestOptions(serviceToken);
  const componentIds = {
    engines: ['00f5fcf8-1ad5-4a24-9f56-877d398d5050', '002818f8-2ebd-44ba-9c46-d8e15eb21710'],
    dataRegistries: ['489a54a0-f594-4f99-b497-7c97652b14bd']
  };

  beforeAll(async () => {
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdminOption = helpers.requestOptions(result.token);

    const applicationOrganization = await getOrCreateOrganization(nameOrg);
    userId = await getOrCreateUser(applicationOrganization, uniqueId);

    applicationOrgId = applicationOrganization.id;
    applicationOrgGUID = applicationOrganization.guid;

    adminOptions = await impersonate(userId, applicationOrgGUID, result.token);
    // this feature is undefined in ai13s but the following code checks for "disabled" value
    _.get(applicationOrganization, 'jsondata.features.automaticPackageCreation');
  });

  describe('Application Lifecycle Approved with resources added at create', () => {
    let contextMenuExtensionPayload;
    let applicationConfigDefinitionPayload;
    let headerBarPayload;
    let applicationId;

    it('Prepare application context menu extension', async () => {
      const mentionId = '${mentionId}';
      const tdoId = '${tdoId}';
      const watchlistId = '${watchlistId}';
      const collectionId = '${collectionId}';
      contextMenuExtensionPayload = {
        mentions: [
          {
            id: `${uuid.v4()}`,
            label: `${citestMarker} citest mention`,
            url: `http://www.example.com/${mentionId}`,
            type: 'mention'
          }
        ],
        tdos: [
          {
            id: `${uuid.v4()}`,
            label: `${citestMarker} citest tdos`,
            url: `http://www.example.com/${tdoId}`,
            type: 'tdo'
          }
        ],
        watchlists: [
          {
            id: `${uuid.v4()}`,
            label: `${citestMarker} citest watchlists`,
            url: `http://www.example.com/${watchlistId}`,
            type: 'watchlist'
          }
        ],
        collections: [
          {
            id: `${uuid.v4()}`,
            label: `${citestMarker} citest collections`,
            url: `http://www.example.com/${collectionId}`,
            type: 'collection'
          }
        ]
      };
    });

    it('Prepare application config definition', async () => {
      applicationConfigDefinitionPayload = [
        {
          configKey: `${citestMarker} Hub Test ApplicationConfigDefinition - ${uuid.v4()}-org-key`,
          configType: 'String',
          configLevel: 'Organization',
          required: false,
          secured: false,
          description: 'Tests org-level config definition for Hub.'
        },
        {
          configKey: `${citestMarker} Hub Test ApplicationConfigDefinition - ${uuid.v4()}-org-key`,
          configType: 'String',
          configLevel: 'User',
          required: false,
          secured: false,
          description: 'Tests user-level config definition for Hub.'
        }
      ];
    });

    it('Prepare application header bar data', async () => {
      headerBarPayload = {
        name: `${citestMarker}-headerbar data`,
        config: {
          help: true,
          backgroundColor: '#0000FF',
          notification: false,
          logoSrc: 'www.example.com'
        }
      };
    });

    it('Create an application with multiple resources', async () => {
      const result = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker} all resources application - ${uniqueId} id`,
          description: `${citestMarker} all resources application - ${uniqueId} id`,
          url: 'www.example.com',
          oauth2RedirectUrls: 'www.example.com/callback',
          checkPermissions: true,
          iconUrl: 'http://abc.com/link-icon.png',
          contextMenuExtensions: contextMenuExtensionPayload,
          headerbarEnabled: true,
          headerbar: headerBarPayload,
          entityTags: [
            {
              tagKey: "${citestMarker} citest application tag key",
              tagValue: "${citestMarker} citest application tag value",
              entityType: 'app',
            }
          ],
          applicationConfigDefinition: applicationConfigDefinitionPayload
        }
      );
      let applicationResult = _.get(result, 'createApplication');
      applicationId = applicationResult.id;
      expect(applicationId).toBeDefined();
      expect(applicationResult.contextMenuExtensions).toBeDefined();
      expect(applicationResult.applicationConfigDefinition.count).toBeGreaterThan(0);
      expect(applicationResult.applicationHeaderbar).toBeDefined();
      expect(applicationResult.entityTags[0].entityType).toBe('app');
    });

    it('Query application', async () => {
      const result = await appHelpers.helpGetApplication(
        { gqlClient, options: adminOptions },
        {
          id: applicationId
        }
      );
      expect(result.application.id).toBeDefined();
    });

    it('Workflow application through cycle submit -> approve -> deploy', async () => {
      const actionAndStatusList = [
        ['submit', 'pending'],
        ['approve', 'approved'],
        ['deploy', 'active'],
        ['disable', 'disabled']
      ];
      for (let action of actionAndStatusList) {
        const result = await appHelpers.helpApplicationWorkflow(
          { gqlClient, options: adminOptions },
          {
            id: applicationId,
            action: action[0]
          }
        );
        expect(result.applicationWorkflow.id).toEqual(applicationId);
        expect(result.applicationWorkflow.status).toEqual(action[1]);
      }
    });

    it('Delete application', async () => {
      try {
        const result = await appHelpers.helpDeleteApplication(
          { gqlClient, options: adminOptions },
          {
            id: applicationId
          }
        );
        expect(_.get(result, 'deleteApplication.id')).toEqual(applicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  }); //Testing

  describe('Application Lifecycle Approved with resources added each update', () => {
    let applicationId;
    let contextMenuExtensionPayload;
    let headerBarPayload;
    let applicationData = {
      name: `${citestMarker} Citest Application Basics - ${uniqueId}`,
      description: `${citestMarker} Citest Application Basics`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      iconUrl: 'http://abc.com/link-icon.png'
    };
    it('Create a basic application', async () => {
      const basicAppResult = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        {
          name: applicationData.name,
          key: applicationData.key,
          description: applicationData.description,
          url: applicationData.url,
          oauth2RedirectUrls: applicationData.oauth2RedirectUrls,
          checkPermissions: applicationData.checkPermissions,
          iconUrl: applicationData.iconUrl
        }
      );

      let createdApplication = _.get(basicAppResult, 'createApplication');
      applicationId = _.get(createdApplication, 'id');
      expect(applicationId).toBeDefined();
      expect(createdApplication.oauth2RedirectUrls.length).toEqual(1);
    });

    it('Prepare application context menu extension', async () => {
      const mentionId = '${mentionId}';
      const tdoId = '${tdoId}';
      contextMenuExtensionPayload = {
        mentions: [
          {
            id: `${uuid.v4()}`,
            label: `${citestMarker} citest mention`,
            url: `http://www.example.com/${mentionId}`
          }
        ],
        tdos: [
          {
            id: `${uuid.v4()}`,
            label: `${citestMarker} citest tdos`,
            url: `http://www.example.com/${tdoId}`
          }
        ]
      };
    });

    it('Update application with context menu extension', async () => {
      const payload = {
        id: applicationId,
        contextMenuExtensions: contextMenuExtensionPayload
      };

      const result = await appHelpers.helpUpdateApplication(
        { gqlClient, options: superAdminOption },
        { input: payload }
      );
      expect(result.updateApplication.id).toEqual(applicationId);
      expect(result.updateApplication.contextMenuExtensions).toBeDefined();
    });

    it('Prepare application header bar data', async () => {
      headerBarPayload = {
        name: `${citestMarker}-headerbar data`,
        config: {
          help: true,
          backgroundColor: '#0000FF',
          notification: false,
          logoSrc: 'www.example.com'
        }
      };
    });

    it('Update application with header bar', async () => {
      const payload = {
        id: applicationId,
        headerbarEnabled: true,
        headerbar: headerBarPayload
      };

      const result = await appHelpers.helpUpdateApplication(
        { gqlClient, options: superAdminOption },
        {
          input: payload
        }
      );
      expect(result.updateApplication.id).toEqual(applicationId);
    });

    it.each(['engines', 'dataRegistries'])('Add %s application component', async (componentType) => {
      const componentIds = {
      engines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55', 'ea0ada2a-7571-4aa5-9172-b5a7d989b041'],
        dataRegistries: ['0b3ddb59-3252-4251-8c22-ea833984e60b']
      };
      const payload = {
        id: applicationId,
        type: componentType,
        componentIds: componentIds[componentType],
        action: 'add'
      };

      const result = await appHelpers.helpUpdateApplicationComponent({ gqlClient, options: adminOptions }, payload);

      expect(_.map(_.get(result, ['updateApplicationComponent', componentType, 'records']), 'id').sort()).toEqual(
        componentIds[componentType]
      );
    });

    it('Cycle application by status pending -> approved -> active', async () => {
      const actionAndStatusList = [
        ['submit', 'pending'],
        ['approve', 'approved'],
        ['deploy', 'active'],
        ['disable', 'disabled']
      ];
      for (let action of actionAndStatusList) {
        const result = await appHelpers.helpApplicationWorkflow(
          { gqlClient, options: adminOptions },
          {
            id: applicationId,
            action: action[0]
          }
        );
        expect(result.applicationWorkflow.id).toEqual(applicationId);
        expect(result.applicationWorkflow.status).toEqual(action[1]);
      }
    });

    it('Delete application', async () => {
      try {
        const result = await appHelpers.helpDeleteApplication(
          { gqlClient, options: adminOptions },
          {
            id: applicationId
          }
        );
        expect(_.get(result, 'deleteApplication.id')).toEqual(applicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  describe('Application Components', () => {
    let acApplicationId;
    const applicationComponentTypes = ['engines', 'dataRegistries'];

    it('create application for application components', async () => {
      let acApplication = {
        name: `${citestMarker} Citest App 3 - ${uniqueId}`,
        key: `${citestMarker} citest_app_3_${uniqueId}`,
        description: '${citestMarker} Citest App 3',
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false
      };

      const acApplicationresult = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        {
          name: acApplication.name,
          description: acApplication.description,
          url: acApplication.url,
          oauth2RedirectUrls: acApplication.oauth2RedirectUrls,
          checkPermissions: acApplication.checkPermissions
        }
      );

      let app1 = _.get(acApplicationresult, 'createApplication');
      acApplicationId = _.get(app1, 'id');
      expect(acApplicationId).toBeDefined();
      expect(app1.oauth2RedirectUrls.length).toEqual(1);
    });

    it.each(['engines', 'dataRegistries'])('add %s application component', async (componentType) => {
      const componentIds = {
      engines: ['d1bc57fe-675d-435d-9f4d-2f074485ec55', 'ea0ada2a-7571-4aa5-9172-b5a7d989b041'],
        dataRegistries: ['0b3ddb59-3252-4251-8c22-ea833984e60b']
      };
      const payload = {
        id: acApplicationId,
        type: componentType,
        componentIds: componentIds[componentType],
        action: 'add'
      };

      const result = await appHelpers.helpUpdateApplicationComponent({ gqlClient, options: adminOptions }, payload);
      expect(_.map(_.get(result, ['updateApplicationComponent', componentType, 'records']), 'id').sort()).toEqual(
        componentIds[componentType]
      );
    });

    it.each(applicationComponentTypes)('remove app component %s', async (componentType) => {
      const payload = {
        id: acApplicationId,
        type: componentType,
        componentIds: componentIds[componentType],
        action: 'remove'
      };

      const result = await appHelpers.helpUpdateApplicationComponent({ gqlClient, options: adminOptions }, payload);

      const data = _.get(result, 'updateApplicationComponent');
      const recordIds = _.map(_.get(data, [componentType, 'records']), 'id');
      expect(recordIds).toEqual(expect.not.arrayContaining(componentIds[componentType]));
    });

    it('cleanup application component application', async () => {
      try {
        const result = await appHelpers.helpDeleteApplication(
          { gqlClient, options: adminOptions },
          {
            id: acApplicationId
          }
        );
        expect(_.get(result, 'deleteApplication.id')).toEqual(acApplicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  describe('Application Automatic Package', () => {
    let apApplicationId;

    it('create application for application package', async () => {
      let apApplication = {
        name: `${citestMarker} Citest App 5 - ${uniqueId}`,
        key: `${citestMarker} citest_app_5_${uniqueId}`,
        description: '${citestMarker} Citest App 5',
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false
      };

      const apApplicationResult = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        {
          name: apApplication.name,
          description: apApplication.description,
          url: apApplication.url,
          oauth2RedirectUrls: apApplication.oauth2RedirectUrls,
          checkPermissions: apApplication.checkPermissions
        }
      );

      let app1 = _.get(apApplicationResult, 'createApplication');
      apApplicationId = _.get(app1, 'id');
      expect(apApplicationId).toBeDefined();
      expect(app1.oauth2RedirectUrls.length).toEqual(1);
    });

    it('creates an application package when creating an application', async () => {
      const result = await packageHelpers.helpGetPackages(
        { gqlClient, options: adminOptions },
        { primaryResourceId: apApplicationId }
      );

      expect(result.packages).toBeDefined();
      expect(result.packages.records).toBeDefined();
      expect(result.packages.records.length).toBeGreaterThan(0);
      expect(result.packages.records[0].id).toBeDefined();
      expect(result.packages.records[0].primaryResource).toBeDefined();
      expect(result.packages.records[0].primaryResource.resourceId).toEqual(apApplicationId);
      expect(result.packages.records[0].primaryResource.resourceType).toEqual('application');

      appPackageId = result.packages.records[0].id;
    });

    it('delete application package', async () => {
      const result = await packageHelpers.helpDeletePackage({ gqlClient, options: adminOptions }, { id: appPackageId });
      expect(result.packageDelete).toBeDefined();
      expect(result.packageDelete.success).toEqual(true);
    });

    it('cleanup application package application', async () => {
      try {
        const result = await appHelpers.helpDeleteApplication(
          { gqlClient, options: adminOptions },
          {
            id: apApplicationId
          }
        );
        expect(_.get(result, 'deleteApplication.id')).toEqual(apApplicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  describe('Application Context Menu Extension', () => {
    let cmeApplicationId;
    let contextMenuExtensionId;
    it('create application for context menu extension', async () => {
      let cmeApplication = {
        name: `${citestMarker} Citest App 2 - ${uniqueId}`,
        key: `${citestMarker} citest_app_2_${uniqueId}`,
        description: '${citestMarker} Citest App 2',
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false
      };

      const cmeApplicationresult = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        {
          name: cmeApplication.name,
          description: cmeApplication.description,
          url: cmeApplication.url,
          oauth2RedirectUrls: cmeApplication.oauth2RedirectUrls,
          checkPermissions: cmeApplication.checkPermissions
        }
      );

      let app1 = _.get(cmeApplicationresult, 'createApplication');
      cmeApplicationId = _.get(app1, 'id');
      expect(cmeApplicationId).toBeDefined();
      expect(app1.oauth2RedirectUrls.length).toEqual(1);
    });

    it('create context menu extension', async () => {
      const payload = {
        id: cmeApplicationId,
        label: 'Foo Mention',
        url: 'http://www.example.com/${mentionId}',
        type: 'mention'
      };

      const result = await appHelpers.helpCreateContextMenuExtension({ gqlClient, options: adminOptions }, payload);

      expect(result.createContextMenuExtension).toEqual(expect.objectContaining(_.omit(payload, 'id')));
      expect(result.createContextMenuExtension.id).toBeDefined();
      expect(result.createContextMenuExtension.id).not.toEqual(cmeApplicationId);

      contextMenuExtensionId = result.createContextMenuExtension.id;
    });

    it('delete context menu extension', async () => {
      const payload = {
        id: contextMenuExtensionId
      };

      const result = await appHelpers.helpDeleteContextMenuExtension({ gqlClient, options: adminOptions }, payload);
      expect(result.deleteContextMenuExtension).toEqual(expect.objectContaining(payload));
    });

    it.each(['id', 'label', 'url', 'type'])('createContextMenuExtension throws if %s is missing', async (field) => {
      const payload = {
        id: cmeApplicationId,
        label: 'Foo Mention',
        url: 'http://www.example.com/${mentionId}',
        type: 'mention'
      };

      await expect(
        appHelpers.helpCreateContextMenuExtension({ gqlClient, options: adminOptions }, _.omit(payload, field))
      ).rejects.toThrow(field);
    });

    it('cleanup application context menu application', async () => {
      try {
        const result = await appHelpers.helpDeleteApplication(
          { gqlClient, options: adminOptions },
          {
            id: cmeApplicationId
          }
        );
        expect(_.get(result, 'deleteApplication.id')).toEqual(cmeApplicationId);
      } catch (ex) {
        expect(ex).toBeUndefined();
      }
    });
  });

  afterAll(async () => {
    try {
      // Delete user created in beforeAll
      if (userId) {
        const deleteUserQuery = `mutation {
          deleteUser(id: "${userId}") {
            id
          }
        }`;
        await gqlClient.query(deleteUserQuery);
      }
    } catch (error) {
      console.error('Error deleting user in afterAll:', error.message);
    }

    try {
      // Mark organization as deleted
      if (applicationOrgId) {
        const deleteOrgQuery = `mutation {
          updateOrganization(input: {
            id: "${applicationOrgId}"
            status: "deleted"
          }) {
            id
            status
          }
        }`;
        await gqlClient.query(deleteOrgQuery);
      }
    } catch (error) {
      console.error('Error deleting organization in afterAll:', error.message);
    }
  });
});

async function getOrganization(name, ignoreExpect) {
  const getOrgQuery = `
      query getOrganization {
        organizations(
          name: "${name}"
          nameMatch: contains
          status: active
        ) {
          records {
            id
            guid
            name
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
        }
      }`;

  const resultOrg = await gqlClient.query(getOrgQuery);
  const applicationOrg = _.get(resultOrg, 'organizations.records[0]');

  if (!ignoreExpect) {
    expect(applicationOrg).toBeDefined();
    expect(applicationOrg.name).toContain(name);
  }

  return applicationOrg;
}

async function setupTestOrganization(prefixName) {
  // create organization
  const queryOrg = `mutation ($kvp: JSONData!, $apps: JSONData) {
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
      test: 'value',
      features: {
        automaticPackageCreation: 'enabled'
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
  };
  const resultOrg = await gqlClient.query(queryOrg, variables);
  expect(resultOrg.createOrganization.type).toEqual(expect.arrayContaining(['Agency', 'Broadcaster']));
  expect(resultOrg.createOrganization.id).toBeDefined();
  expect(resultOrg.createOrganization.guid).toBeDefined();

  return await getOrganization(prefixName);
}

async function createUser(uniqueId, orgId) {
  const query = `mutation {
    createUser(input: {
    name: "${uniqueId}-admin-user-${uuid.v4()}@localhost"
      organizationId: "${orgId}"
      firstName: "Flow-User"
      lastName: "Admin"
      jsondata: {
        firstName: "Flow-User"
        lastName: "Admin"
      }
      roleIds: ${JSON.stringify(ROLES_IDS)}
    })  {
      id
      name
      firstName
      lastName
      jsondata
    }
  }

  `;
  const result = await gqlClient.query(query);
  return _.get(result, 'createUser.id');
}

async function getOrCreateOrganization(nameOrg) {
  let applicationOrganization = await setupTestOrganization(nameOrg);

  const automaticPackageCreation = _.get(applicationOrganization, 'jsondata.features.automaticPackageCreation');
  if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
    applicationOrganization = await updateOrganization(applicationOrganization.id);
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

async function getOrCreateUser(applicationOrganization, uniqueId) {
  const users = _.get(applicationOrganization, 'users.records', []);
  const activeUsers = users.filter(
    (user) =>
      user.status === 'active' &&
      user.organizationGuids.length === 1 &&
      _.every(ROLES_IDS, (roleId) => user.roles.some((role) => role.id === roleId))
  );
  let userId;
  if (activeUsers.length === 0) {
    userId = await createUser(uniqueId, applicationOrganization.id);
  } else {
    const adminUser = _.find(activeUsers, (user) => _.includes(user.name, 'admin'));
    userId = adminUser ? adminUser.id : users[0].id;
  }
  return userId;
}

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

/**
 * Because this depends on the config (whitelist, blacklist) from the server
 So we have a special check here
 * @param {*} graphqlError the errors from graphql
 */
function validateInvalidApplicationRoles(graphqlError) {
  const errs = helpers.getErrorsFromGraphqlResponse(graphqlError);
  expect(errs.length > 0).toEqual(true);
  const err = errs[0];
  expect(err).toBeDefined();
  expect(err.message).toContain(`the application roles are invalid. Some permissions are not allowed`);

  expect(err.data.applicationRoles).toBeDefined();
  expect(err.data.applicationRoles.length > 0).toEqual(true);
  const roleWhitelist = _.get(err.data, 'roles.whitelist', []);
  const roleBlacklist = _.get(err.data, 'roles.blacklist', []);
  err.data.applicationRoles.forEach((o) => {
    expect(o.invalidPermissions).toBeDefined();
    expect(_.isArray(o.invalidPermissions)).toBe(true);
    expect(o.invalidPermissions.length > 0).toEqual(true);
    if (err.data.roles) {
      o.invalidPermissions.forEach((ip) => {
        expect((!_.isEmpty(roleWhitelist) && !roleWhitelist.includes(ip)) || roleBlacklist.includes(ip)).toEqual(true);
      });
    }
  });
}
