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
const admin = require('../../../routes/admin');
const itif = (condition, ...args) => (condition ? it(...args) : it.skip(...args));

const nameOrg = `${citestMarker}-application-roles`;
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
let useRBACFeature = false;

//Authorization Test grouping of applications
describe('citest_application: Application Roles', () => {
  let apiOptions;
  let applicationId7;
  let eventApplicationId;
  let applicationOrgId, applicationOrgGUID;
  let automaticPackageCreation;
  let adminOptions;
  let roleId;
  let userId;
  const uniqueId = Date.now().valueOf();
  const serviceToken = 'citest_service_token:dbd399ece3554c9d9fa3d1015e743b5858468ad2eeb540f2b58556ff69562c50';
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

    useRBACFeature = await isFullRBACFeature(adminOptions);
  });
  async function isFullRBACFeature(userOption) {
    const introspectionQuery = await gqlClient.query(
      `
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`,
      {},
      userOption
    );

    const result = await gqlClient.query(
      `
        query {
          me {
            id
            name
            organization {
              name
              id
              guid
              jsondata
            }
          }
      }`,
      {},
      userOption
    );

    const hasRBACAuthModule = _.has(introspectionQuery, '__type.name');
    const olpOrgEnabled = _.get(result, 'me.organization.jsondata.features.enableRBACFeature') === 'enabled';
    return hasRBACAuthModule && olpOrgEnabled;
  }
  describe('Application Roles', () => {
    const appRoles6 = [
      {
        id: uuid.v4(),
        name: `ci-test-app-role-${uuid.v4()}`,
        description: 'ci-test-app-role',
        isPrivate: false,
        isAppEventRole: false,
        permissions: ['SUPERADMIN', 'ADMIN_ORG_CREATE', 'CMS_ACCESS']
      }
    ];
    const appRoles7 = [
      {
        id: uuid.v4(),
        name: `ci-test-app-role-${uuid.v4()}`,
        description: 'ci-test-app-role',
        isPrivate: false,
        isAppEventRole: false,
        permissions: ['CMS_ACCESS']
      }
    ];

    let newRoleId, existingRoleId;
    let applicationForRole;
    let roleApplicationId;

    it('create an application for Roles', async () => {
      applicationForRole = {
        name: `${citestMarker} Citest App 11 - ${uniqueId}`,
        key: `${citestMarker} citest_app_11_${uniqueId}`,
        description: `${citestMarker} Citest App 11 - ${uniqueId}`,
        url: 'www.example.com',
        checkPermissions: false,
        status: 'active'
      };

      const roleAppResult = await appHelpers.helpCreateApp(
        { gqlClient, options: adminOptions },
        {
          name: applicationForRole.name,
          description: applicationForRole.description,
          url: applicationForRole.url,
          oauth2RedirectUrls: applicationForRole.oauth2RedirectUrls,
          checkPermissions: applicationForRole.checkPermissions,
          status: applicationForRole.status
        }
      );

      let app1 = _.get(roleAppResult, 'createApplication');
      roleApplicationId = _.get(app1, 'id');
      expect(roleApplicationId).toBeDefined();
    });

    it('active app with existing/new roles: only role upserts and skip role deletions', async () => {
      const payload = {
        id: roleApplicationId,
        status: 'active',
        description: applicationForRole.description + '_updated',
        applicationRoles: [
          {
            id: uuid.v4(),
            name: `${citestMarker}-app-role-${uuid.v4()}`,
            description: 'new role',
            isPrivate: false,
            isAppEventRole: false,
            permissions: ['CMS_ACCESS']
          },
          {
            id: uuid.v4(),
            name: `${citestMarker}-app-role-${uuid.v4()}`,
            description: 'existing role',
            isPrivate: false,
            isAppEventRole: false,
            permissions: ['CMS_ACCESS']
          }
        ]
      };

      const result = await appHelpers.helpUpdateApplication(
        { gqlClient, options: adminOptions },
        {
          input: payload
        }
      );

      expect(result.updateApplication.id).toEqual(roleApplicationId);
      expect(_.get(result, 'updateApplication.applicationRoles[0].isPrivate')).toEqual(false);
      expect(_.get(result, 'updateApplication.applicationRoles[0].isApplicationEventRole')).toEqual(false);
      newRoleId = result.updateApplication.applicationRoles[0].id;
      existingRoleId = result.updateApplication.applicationRoles[1].id;
    });

    it('should verify new application roles are included in organization roles', async () => {
      const resultOrg = await orgHelpers.helpFetchOrgAppsAndRoles(
        { gqlClient, options: adminOptions },
        applicationOrgId
      );

      const roles = resultOrg.organization.roles;
      expect(roles.find((item) => item.id === newRoleId)).toBeDefined();
    });

    it('active app with empty roles: skip role upserts and skip role deletions.', async () => {
      const payload = {
        id: roleApplicationId,
        status: 'active',
        description: applicationForRole.description + '_updated_1',
        applicationRoles: []
      };

      const result = await appHelpers.helpUpdateApplication(
        { gqlClient, options: adminOptions },
        {
          input: payload
        }
      );

      expect(result.updateApplication.id).toEqual(roleApplicationId);
      expect(result.updateApplication.description).toEqual(applicationForRole.description + '_updated_1');
      const appRoles = _.get(result, 'updateApplication.applicationRoles');
      expect(appRoles).toBeDefined();
      const filteredAppRoles = _.filter(appRoles, (r) => r.id === newRoleId || r.id === existingRoleId);
      expect(filteredAppRoles.length).toEqual(2);
    });

    it('disable an application', async () => {
      const result = await appHelpers.helpApplicationWorkflow(
        { gqlClient, options: superAdminOption },
        {
          id: roleApplicationId,
          action: 'disable'
        }
      );

      expect(result.applicationWorkflow.id).toEqual(roleApplicationId);
      expect(result.applicationWorkflow.status).toEqual('disabled');
    });

    it('non-active app with existing/new roles: implement role upserts and delete any roles not included in input', async () => {
      const payload = {
        id: roleApplicationId,
        status: 'active',
        description: applicationForRole.description + '_updated_2',
        applicationRoles: [
          {
            id: existingRoleId,
            description: 'existing role updated'
          }
        ]
      };

      const result = await appHelpers.helpUpdateApplication(
        { gqlClient, options: adminOptions },
        {
          input: payload
        }
      );

      expect(result.updateApplication.id).toEqual(roleApplicationId);
      expect(result.updateApplication.description).toEqual(applicationForRole.description + '_updated_2');
      const appRoles = _.get(result, 'updateApplication.applicationRoles');
      expect(appRoles).toBeDefined();
      const newRole = _.find(appRoles, { id: newRoleId });
      expect(newRole).toBeUndefined();
      const existingRole = _.find(appRoles, { id: existingRoleId });
      expect(existingRole).toBeDefined();
      expect(existingRole.description).toEqual('existing role updated');
    });

    it('non-active app with empty roles: delete all roles of the application ', async () => {
      const payload = {
        id: roleApplicationId,
        status: 'active',
        description: applicationForRole.description + '_updated_3',
        applicationRoles: []
      };

      const result = await appHelpers.helpUpdateApplication(
        { gqlClient, options: adminOptions },
        {
          input: payload
        }
      );

      expect(result.updateApplication.id).toEqual(roleApplicationId);
      expect(result.updateApplication.description).toEqual(applicationForRole.description + '_updated_3');
      const appRoles = _.get(result, 'updateApplication.applicationRoles');
      expect(appRoles).toBeDefined();
      const filteredAppRoles = _.filter(appRoles, (r) => r.id === newRoleId || r.id === existingRoleId);
      expect(filteredAppRoles.length).toEqual(0);
    });

    let applicationRoles7Id;
    it('create application should not throw an error if permissions in application roles are valid', async () => {
      const app = {
        id: uuid.v4(),
        name: `${citestMarker} App 7 - permissions is valid - ${uniqueId}`,
        key: `${citestMarker.replace(/-/g, '_')}_app-7_${uniqueId}`,
        description: `${citestMarker} App 7 - ${uniqueId}`,
        url: 'www.example.com',
        oauth2RedirectUrls: 'www.example.com/callback',
        checkPermissions: false,
        status: 'active',
        applicationRoles: appRoles7
      };

      try {
        const result = await appHelpers.helpCreateApp(
          { gqlClient, options: adminOptions },
          {
            id: app.id,
            name: app.name,
            description: app.description,
            url: app.url,
            checkPermissions: app.checkPermissions,
            applicationRoles: app.applicationRoles
          }
        );
        expect(result).toBeDefined();
        expect(result.createApplication).toBeDefined();
        expect(result.createApplication.id).toEqual(app.id);
        expect(result.createApplication.name).toEqual(app.name);
        expect(result.createApplication.applicationRoles).toBeDefined();
        expect(result.createApplication.applicationRoles.length).toEqual(1);
        expect(result.createApplication.applicationRoles[0].permissions).toBeDefined();
        expect(result.createApplication.applicationRoles[0].permissions.length).toEqual(1);
        expect(result.createApplication.applicationRoles[0].permissions[0]).toEqual(`CMS_ACCESS`);
        applicationId7 = app.id;
        roleId = result.createApplication.applicationRoles[0].id;
        applicationRoles7Id = result.createApplication.id;
      } catch (ex) {
        validateInvalidApplicationRoles(ex);
      }
    });

    it('should verify created applicationRoles is included in organization roles', async () => {
      const resultOrg = await orgHelpers.helpFetchOrgAppsAndRoles(
        { gqlClient, options: adminOptions },
        applicationOrgId
      );
      const roles = resultOrg.organization.roles;
      expect(roles.find((item) => item.id === roleId)).toBeDefined();
    });

    itif(global.enableAppEventFeature, 'get application field needed for updating application', async () => {
      const result = await appHelpers.helpGetApplication(
        { gqlClient, options: adminOptions },
        {
          id: eventApplicationId
        }
      );

      let app = _.get(result, 'application');
      expect(app.id).toEqual(eventApplicationId);
      expect(app.name).toEqual(application[2].name);
      expect(app.description).toEqual(application[2].description);
      expect(app.url).toEqual(application[2].url);
      application[2].iconUrl = app.iconUrl;
      application[2].deploymentModel = app.deploymentModel;
      application[2].ownerOrganizationId = app.ownerOrganizationId;
    });

    it('cleanup applicationRole application', async () => {
      const query = `
      mutation {
          appBase : deleteApplication(id: "${roleApplicationId}") {
          id
          message
        }
          appEvent: deleteApplication(id: "${applicationRoles7Id}") {
              id
              message
        }
      }`;
      try {
        const result = await gqlClient.query(query, null, adminOptions);
        expect(_.get(result, 'appBase.id')).toEqual(roleApplicationId);
        expect(_.get(result, 'appEvent.id')).toEqual(applicationRoles7Id);
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
