const helpers = require('../../helpers');
const appHelpers = require('../../helpers/application');
const orgHelpers = require('../../helpers/organization');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;

const env = config.env;
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';
const DEFAULT_APP_EVENT_ROLE_NAME = 'Default App Access';
const chakram = require('chakram');
const itif = (condition, ...args) => (condition ? it(...args) : it.skip(...args));

const nameOrg = `${citestMarker}-application-rbac`;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
console.log('isDesktopAppEnabled:', isDesktopAppEnabled);

const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);
let superAdminOption;

//Core operations of base applications
describe('citest_application: Application Basics', () => {
  let applicationId;
  let eventApplicationId;
  let roleIds, orgId, userId;
  let applicationOrgId, applicationOrgGUID;
  let automaticPackageCreation;
  let adminOptions;
  let roleId;
  const uniqueId = Date.now().valueOf();
  const appRolesToOrganization = [
    {
      id: uuid.v4(),
      name: `${citestMarker}-app-role-${uuid.v4()}`,
      description: `${citestMarker}-app-role`,
      isPrivate: false,
      isAppEventRole: false,
      permissions: ['CMS_ACCESS']
    }
  ];
  const appConfigDefinition = [
    {
      configKey: `${citestMarker} Citest App 8 - application to organization - ${uniqueId} -org-key`,
      configType: 'String',
      configLevel: 'Organization',
      required: false,
      secured: false,
      description: 'Tests org-level config definition.'
    },
    {
      configKey: `${citestMarker} Citest App 8 - application to organization - ${uniqueId} -user-key`,
      configType: 'String',
      configLevel: 'User',
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
      id: uuid.v4(),
      name: `${citestMarker} App 3 - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_3_${uniqueId}`,
      description: `${citestMarker} App 3 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false
    },
    {
      id: uuid.v4(),
      name: `${citestMarker} App 4 - ${uniqueId}`,
      key: `${citestMarker.replace(/-/g, '_')}_app_4_${uniqueId}`,
      description: `${citestMarker} App 4 - ${uniqueId}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    },
    {
      id: uuid.v4(),
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
      id: uuid.v4(),
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
  const appReturnFields = ['id', 'name', 'key', 'description', 'url', 'oauth2RedirectUrls'];

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
    automaticPackageCreation = _.get(applicationOrganization, 'jsondata.features.automaticPackageCreation');
    //adminOption is the current userOption
  });

  describe('Applications with enableAppEventFeature flag', () => {
    itif(
      global.enableAppEventFeature,
      'get roleIds of current user (for adding to application JWT token)',
      async () => {
        const query = `
      query {
        me {
          id
          organizationId
          roles {
            id
          }
        }
      }
    `;
        const result = await gqlClient.query(query, null, adminOptions);
        const roles = _.get(result, 'me.roles');

        orgId = _.get(result, 'me.organizationId');
        userId = _.get(result, 'me.id');
        expect(roles).toBeDefined();
        expect(orgId).toBeDefined();
        expect(userId).toBeDefined();
        expect(_.isArray(roles)).toEqual(true);
        expect(_.isEmpty(roles)).toEqual(false);
        roleIds = _.map(roles, (role) => role.id);
      }
    );

    itif(global.enableAppEventFeature, 'get JWT token for application', async () => {
      const result = await appHelpers.helpGetApplicationJWT(
        { gqlClient, options: adminOptions },
        {
          appId: applicationId,
          orgId: orgId,
          roleIds: roleIds
        }
      );
      const getApplicationJWT = _.get(result, 'getApplicationJWT');
      expect(getApplicationJWT).toBeDefined();
      expect(getApplicationJWT.applicationId).toEqual(applicationId);
      expect(getApplicationJWT.organizationId).toEqual(orgId);
      expect(getApplicationJWT.token).toBeDefined();
      expect(jwt.decode(getApplicationJWT.token)).toEqual({
        contentApplicationId: expect.any(String),
        contentOrganizationId: parseInt(orgId),
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
    });

    itif(global.enableAppEventFeature, 'add application for organization', async () => {
      let payload = {
        id: orgId,
        applicationAccess: [
          {
            applicationId: eventApplicationId,
            enable: true
          }
        ]
      };

      const result = await orgHelpers.updateOrganization({ gqlClient, options: adminOptions }, payload);
      const updateOrganization = _.get(result, 'updateOrganization');
      expect(updateOrganization.id).toEqual(orgId);
      expect(updateOrganization.name).toBeDefined();
      expect(updateOrganization.applications.records.length).toBeGreaterThan(0);
    });

    itif(global.enableAppEventFeature, 'add an endpoint to the application', async () => {
      const result = await appHelpers.helpUpdateApplicationEventEndpoint(
        { gqlClient, options: adminOptions },
        {
          id: eventApplicationId,
          eventEndpoint: testEventEndpoint
        }
      );
      const app = _.get(result, 'updateApplicationEventEndpoint');
      expect(app.id).toEqual(eventApplicationId);
      expect(app.eventEndpoint).toEqual(testEventEndpoint);
      application[2].eventEndpoint = testEventEndpoint;
    });

    itif(global.enableAppEventFeature, 'check application event endpoint is set', async () => {
      const result = await appHelpers.helpGetApplication(
        { gqlClient, options: adminOptions },
        {
          id: eventApplicationId
        }
      );
      const app = _.get(result, 'application');
      expect(app.id).toEqual(eventApplicationId);
      expect(app.eventEndpoint).toEqual(application[2].eventEndpoint);
    });

    itif(global.enableAppEventFeature, 'remove event endpoint from application', async () => {
      const result = await appHelpers.helpRemoveApplicationEventEndpoint(
        { gqlClient, options: adminOptions },
        {
          id: eventApplicationId
        }
      );
      const deleteResult = _.get(result, 'removeApplicationEventEndpoint');
      expect(deleteResult.id).toEqual(eventApplicationId);
      expect(deleteResult.message).toBeDefined();
    });

    // feature flag enableAppEventFeature must be enabled in both core-admin and core-graphql
    // when adding an app to the org, the appRole auth group is created async via eventing.
    itif(
      global.enableAppEventFeature,
      'add application to an organization with defaultAppAccess role creation',
      async () => {
        // create application
        const app = application[8];
        let createAppInput = {
          id: app.id,
          name: app.name,
          key: app.key,
          description: app.description,
          url: app.url,
          checkPermissions: app.checkPermissions,
          applicationConfigDefinition: app.appConfigDefinition
        };

        const resultApp = await appHelpers.helpCreateApp({ gqlClient, options: adminOptions }, createAppInput);
        expect(resultApp).toBeDefined();
        expect(resultApp.createApplication).toBeDefined();
        expect(resultApp.createApplication.id).toEqual(app.id);
        expect(resultApp.createApplication.name).toEqual(app.name);
        // createApplication without applicationRoles
        expect(resultApp.createApplication.applicationRoles.length).toEqual(0);
        const applicationIdToOrg = app.id;

        // add app to org
        let inputAppAddToOrg = {
          orgId: applicationOrgId,
          appId: applicationIdToOrg,
          configs: [
            {
              configKey: app.appConfigDefinition[0].configKey,
              configValue: 'test'
            }
          ]
        };
        const resultAddToOrg = await appHelpers.helpApplicationAddToOrg(
          { gqlClient, options: adminOptions },
          inputAppAddToOrg
        );
        const addApplicationToOrganization = _.get(resultAddToOrg, 'applicationAddToOrg');
        expect(addApplicationToOrganization.id).toEqual(applicationIdToOrg);
        // A defaultAppAccess role will be created when adding app to org
        expect(resultAddToOrg.applicationAddToOrg.applicationRoles).toBeDefined();
        expect(resultAddToOrg.applicationAddToOrg.applicationRoles.length).toEqual(1);
        expect(resultAddToOrg.applicationAddToOrg.applicationRoles[0].name).toEqual(DEFAULT_APP_EVENT_ROLE_NAME);
        expect(resultAddToOrg.applicationAddToOrg.applicationRoles[0].permissions).toBeDefined();
        expect(resultAddToOrg.applicationAddToOrg.applicationRoles[0].permissions.length).toBeGreaterThan(0);
        expect(resultAddToOrg.applicationAddToOrg.applicationRoles[0].isApplicationEventRole).toEqual(true);

        // Wait for application add to organization to propagate
        await helpers.sleep(1000);

        // getApplicationConfig
        let appConfigInput = {
          orgId: applicationOrgId,
          appId: applicationIdToOrg,
          configKeyRegexp: app.appConfigDefinition[0].configKey
        };
        const resultGetAppConfig = await appHelpers.helpGetApplicationConfig(
          { gqlClient, options: adminOptions },
          appConfigInput
        );
        const userIdInAppConfig = _.get(resultGetAppConfig, 'applicationConfig.records[0].userId');
        // userId field of a config at org level must be null.
        expect(userIdInAppConfig).toEqual(null);

        // delete test application
        const resultAppDelete = await appHelpers.helpDeleteApplication(
          { gqlClient, options: adminOptions },
          {
            id: applicationIdToOrg
          }
        );
        expect(_.get(resultAppDelete, 'deleteApplication.id')).toEqual(applicationIdToOrg);
      }
    );
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
