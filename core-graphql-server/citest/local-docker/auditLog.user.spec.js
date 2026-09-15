const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const { safe } = require('../helpers/cleanup/utils');
const _ = require('lodash');
const uuid = require('uuid');

const OPTIONS = {
  configurableEvents: [
    'UserCreate',
    'UserUpdate',
    'UserDelete',
    'UserPermissionsUpdate',
    'TrialSignUp'
  ]
};

let organizationId;
const cleanupResources = {
  users: [],
  organizations: []
};

let configuredUserOrgGuid;
let connectId;
let scimConnectUserId;

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-user', () => {
  let helpersAuditLog,
    CONFIG_ADMIN_API_TOKEN,
    CONFIG_ADMIN_TOKEN,
    CONFIG_API_TOKEN;
  const roleCollectionsEditor = 'e9c2c71a-80dd-4a35-af68-cbc256bb23a6';
  const roleCSMEditor = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';
  const roleIds = [roleCollectionsEditor, roleCSMEditor];
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    configuredUserOrgGuid = result.userLogin.organization.guid;
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    CONFIG_API_TOKEN = config.apiAIDataOrgToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
  });

  afterAll(async () => {
    // Remove events added by initAuditLogConfigurableEvents so subsequent local
    // runs don't see stale configured_events in the shared Postgres volume
    if (helpersAuditLog) {
      await safe('remove configured audit events', async () => {
        await helpersAuditLog._gqlClient.query(`mutation {
          updateInstanceAuditLogConfig(input: {
            removeAuditEvents: [${OPTIONS.configurableEvents}]
          }) {
            configurableEvents
          }
        }`);
      });
    }
    // TODO: cleanup resources stored in the cleanupResources object
  });

  it('should index audit log events UserCreate WHEN creating a new user', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);

    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId,
      correlationID
    );
    cleanupResources.users.push(result.createUser.id);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        eventType: 'user',
        eventName: 'UserCreate',
        actionName: 'create',
        actionDetails: 'Created user First Last',
        organizationId,
        userName: helpers.config.userName
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  // core-admin endpoint test
  it('should index audit log event UserCreate WHEN creating a new user POSTing to core-admin /users endpoint - success', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    const newUser = await helpersAuditLog.coreAdminRequest(
      '/admin/users',
      'POST',
      CONFIG_ADMIN_TOKEN,
      {
        ...userData,
        userName: userData.email,
        orgId: organizationId
      },
      null,
      correlationID
    );
    cleanupResources.users.push(newUser.userId);

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      newUser
    );
    const expectedAuditLogItems = [
      {
        eventName: 'UserCreate',
        actionName: 'create',
        actionResult: 'success',
        organizationId,
        userName: helpers.config.userName
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });
  it('should index audit log event UserCreate WHEN creating a new user POSTing to core-admin /users endpoint - failure', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    const newUser = await helpersAuditLog.coreAdminRequest(
      '/admin/users',
      'POST',
      CONFIG_ADMIN_TOKEN,
      {
        ...userData,
        userName: userData.email
        // orgId: organizationId - missing orgId will cause 400
      },
      null,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      newUser
    );
    const expectedAuditLogItems = [
      {
        eventName: 'UserCreate',
        actionName: 'create',
        actionResult: 'failure',
        userName: helpers.config.userName
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });
  it('should index audit log event UserCreate WHEN creating a new user POSTing to core-admin /signup endpoint - success', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    const newUser = await helpersAuditLog.coreAdminRequest(
      '/admin/signup',
      'POST',
      CONFIG_ADMIN_TOKEN,
      userData,
      null,
      correlationID
    );
    cleanupResources.users.push(newUser.userId);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      newUser
    );
    const expectedAuditLogItems = [
      {
        eventName: 'UserCreate',
        actionName: 'create',
        actionResult: 'success'
      },
      {
        eventName: 'TrialSignUp',
        actionName: 'create',
        actionResult: 'success'
      },
      {
        eventName: 'OrganizationCreate',
        actionName: 'create',
        actionResult: 'success'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    // UserCreate, TrialSignUp, and OrganizationCreate events should be indexed
    expect(auditLogItems.length).toBeGreaterThanOrEqual(3);
    const orgCreateEvent = auditLogItems
      ? auditLogItems.find((item) => item.eventName === 'OrganizationCreate')
      : null;
    if (orgCreateEvent) {
      cleanupResources.organizations.push(orgCreateEvent.targetId);
    }
    
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event UserCreate WHEN creating a new user POSTing to core-admin /signup endpoint - failure', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    delete userData.email; // remove email to cause 400 error
    const newUser = await helpersAuditLog.coreAdminRequest(
      '/admin/signup',
      'POST',
      CONFIG_ADMIN_TOKEN,
      userData,
      null,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      newUser
    );
    const expectedAuditLogItems = [
      {
        eventName: 'TrialSignUp',
        actionName: 'create',
        actionResult: 'failure'
      },
      {
        eventName: 'UserCreate',
        actionName: 'create',
        actionResult: 'failure'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    
    // failed signup and failed user creation    
    expect(auditLogItems.length).toBe(2);

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event UserCreate WHEN creating a new user POSTing to core-admin /api/admin/scim/:connectId/users endpoint - success', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    userData.emails = [
      {
        primary: true,
        type: 'work',
        value: userData.email
      }
    ];
    delete userData.email;
    connectId = await helpersAuditLog.createTestConnectId(
      configuredUserOrgGuid
    );
    const newUser = await helpersAuditLog.coreAdminRequest(
      `/admin/scim/${connectId}/users`,
      'POST',
      CONFIG_ADMIN_TOKEN,
      userData,
      null,
      correlationID
    );
    cleanupResources.users.push(newUser.id);
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      newUser
    );
    const expectedAuditLogItems = [
      {
        eventName: 'UserCreate',
        actionName: 'create',
        actionResult: 'success',
        actionDetails: `Created SCIM user ${userData.firstName} ${userData.lastName}`
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event UserCreate WHEN creating a new user POSTing to core-admin /api/admin/scim/:connectId/users endpoint - failure', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    userData.emails = [
      {
        primary: true,
        type: 'work',
        value: userData.email
      }
    ];
    delete userData.email;
    const newUser = await helpersAuditLog.coreAdminRequest(
      `/admin/scim/abc/users`, // invalid connectId to cause 400 error
      'POST',
      CONFIG_ADMIN_TOKEN,
      userData,
      null,
      correlationID
    );

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      newUser
    );
    const expectedAuditLogItems = [
      {
        eventName: 'UserCreate',
        actionName: 'create',
        actionResult: 'failure',
        actionDetails: `Failed to create SCIM user ${userData.firstName} ${userData.lastName} due to invalid connectid!`
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      []
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events UserUpdated WHEN updating a new user', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    cleanupResources.users.push(result.createUser.id);
    const userId = result.createUser.id;
    const userDataUpdate = helpersAuditLog.createRandomUserData();
    result = await helpersAuditLog.updateUser(
      CONFIG_ADMIN_TOKEN,
      userId,
      userDataUpdate.firstName,
      userDataUpdate.lastName,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user ${userDataUpdate.firstName} ${userDataUpdate.lastName}`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserUpdate'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events UserUpdated and UserPermissionsUpdate WHEN updating a new user and adding roles', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    const userId = result.createUser.id;
    cleanupResources.users.push(userId);
    const userDataUpdate = helpersAuditLog.createRandomUserData();
    result = await helpersAuditLog.updateUser(
      CONFIG_ADMIN_TOKEN,
      userId,
      userDataUpdate.firstName,
      userDataUpdate.lastName,
      correlationID,
      roleIds
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        // first and last names 'First'/'Last' are set in the helpers -> buildMutationcreateUser
        actionDetails: `Updated user ${userDataUpdate.firstName} ${userDataUpdate.lastName}`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserUpdate'
      },
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user permissions for ${userDataUpdate.firstName} ${userDataUpdate.lastName}`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserPermissionsUpdate'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it("should index audit log UserPermissionsUpdate WHEN POST'ing /api/admin/users/:userId/roles/:roleId", async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    const userId = result.createUser.id;
    cleanupResources.users.push(userId);

    result = await helpersAuditLog.coreAdminRequest(
      `/admin/users/${userId}/roles/${roleIds[0]}`,
      'POST',
      CONFIG_ADMIN_TOKEN,
      null,
      null,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user permissions for First Last`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserPermissionsUpdate'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it("should index audit log UserPermissionsUpdate WHEN PUT'ting /api/admin/users/:id", async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    const userId = result.createUser.id;
    cleanupResources.users.push(userId);

    result = await helpersAuditLog.coreAdminRequest(
      `/admin/users/${userId}`,
      'PUT',
      CONFIG_ADMIN_TOKEN,
      {
        roles: [roleCollectionsEditor]
      },
      null,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user permissions for ${userId}`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserPermissionsUpdate'
      },
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user ${userId}`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserUpdate'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it("should index audit log event UserDelete WHEN removing a role DELETE'ting /api/admin/users/:userId/roles/:roleId - success", async () => {
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );

    const userId = result.createUser.id;
    cleanupResources.users.push(userId);
    // add a role to the user first
    await helpersAuditLog.coreAdminRequest(
      `/admin/users/${userId}`,
      'PUT',
      CONFIG_ADMIN_TOKEN,
      {
        roles: [roleCollectionsEditor]
      },
      null
    );
    // now remove the role
    const correlationID = helpersAuditLog.buildCorrelationID();
    result = await helpersAuditLog.coreAdminRequest(
      `/admin/users/${userId}/roles/${roleCollectionsEditor}`,
      'DELETE',
      CONFIG_ADMIN_TOKEN,
      null,
      null,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user permissions for ${userId}`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserPermissionsUpdate'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it("should index audit log event UserDelete WHEN removing a role DELETE'ting /api/admin/users/:userId/roles/:roleId - failure", async () => {
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    const userId = result.createUser.id;
    cleanupResources.users.push(userId);
    const correlationID = helpersAuditLog.buildCorrelationID();
    result = await helpersAuditLog.coreAdminRequest(
      `/admin/users/${userId}/roles/abc`, // invalid roleId to cause 400 error
      'DELETE',
      CONFIG_ADMIN_TOKEN,
      null,
      null,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'failure',
        actionDetails: `Failed to update user permissions for First Last due to invalid role identifier`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserPermissionsUpdate'
      }
    ];

    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  describe('UserUpdate core-admin endpoints tests', () => {
    // /users/:id
    it('should index audit log event UserUpdate WHEN updating a user using core-admin PUT /users/:id endpoint - success', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const userData = helpersAuditLog.createRandomUserData();
      let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
      organizationId = result.createOrganization.id;
      cleanupResources.organizations.push(organizationId);
      result = await helpersAuditLog.createUser(
        CONFIG_ADMIN_TOKEN,
        userData.email,
        config.password,
        organizationId
      );
      const userId = result.createUser.id;
      cleanupResources.users.push(userId);

      const updatedUser = await helpersAuditLog.coreAdminRequest(
        `/admin/users/${userId}`,
        'PUT',
        CONFIG_ADMIN_TOKEN,
        {
          kvp: { firstName: 'Updated first name' }
        },
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        updatedUser
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          targetId: userId,
          eventType: 'user',
          eventName: 'UserUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });
    it('should index audit log event UserUpdate WHEN updating a user using core-admin PUT /users/:id endpoint - failure', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const fakeUserId = uuid.v4(); // generate a random UUID to simulate an invalid userId
      const updatedUser = await helpersAuditLog.coreAdminRequest(
        `/admin/users/${fakeUserId}`, //invalid userId to cause 400 error
        'PUT',
        CONFIG_ADMIN_TOKEN,
        {
          kvp: { firstName: 'Updated first name' }
        },
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        updatedUser
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          eventType: 'user',
          targetId: fakeUserId,
          eventName: 'UserUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );

      expect(auditLogItems.length).toBe(1);
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    // /scim/:connectId/groups
    it('should index audit log event UserUpdate WHEN updating a user using core-admin POST /scim/:connectId/groups endpoint - success', async () => {
      if (!scimConnectUserId) {
        // previous test should have created a user and set scimConnectUserId, but if it didn't, we need to create a new user
        const userData = helpersAuditLog.createRandomUserData();
        userData.emails = [
          {
            primary: true,
            type: 'work',
            value: userData.email
          }
        ];
        delete userData.email;
        connectId = await helpersAuditLog.createTestConnectId(
          configuredUserOrgGuid
        );

        const newUser = await helpersAuditLog.coreAdminRequest(
          `/admin/scim/${connectId}/users`,
          'POST',
          CONFIG_ADMIN_TOKEN,
          userData
        );
        cleanupResources.users.push(newUser.id);
        const { connectUserId } = await helpersAuditLog.getConnectUserId(
          connectId
        );
        scimConnectUserId = connectUserId;
      }
      const correlationID = helpersAuditLog.buildCorrelationID();

      // this operation creates a scim group and adds the user to it invoking user update
      const updatedUser = await helpersAuditLog.coreAdminRequest(
        `/admin/scim/${connectId}/groups`,
        'POST',
        CONFIG_API_TOKEN,
        {
          displayName: 'SCIM citest group',
          members: [
            {
              value: scimConnectUserId
            }
          ]
        },
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        updatedUser
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          eventType: 'user',
          eventName: 'UserUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    // /scim/:connectId/groups/:groupName
    it('should index audit log event UserUpdate WHEN updating a user using core-admin PUT /scim/:connectId/groups endpoint - success', async () => {
      if (!scimConnectUserId) {
        // previous test should have created a user and set scimConnectUserId, but if it didn't, we need to create a new user
        const userData = helpersAuditLog.createRandomUserData();
        userData.emails = [
          {
            primary: true,
            type: 'work',
            value: userData.email
          }
        ];
        delete userData.email;
        connectId = await helpersAuditLog.createTestConnectId(
          configuredUserOrgGuid
        );

        const newUser = await helpersAuditLog.coreAdminRequest(
          `/admin/scim/${connectId}/users`,
          'POST',
          CONFIG_ADMIN_TOKEN,
          userData
        );
        cleanupResources.users.push(newUser.id);
        const { connectUserId } = await helpersAuditLog.getConnectUserId(
          connectId
        );
        scimConnectUserId = connectUserId;
      }
      const correlationID = helpersAuditLog.buildCorrelationID();

      // this operation creates a scim group and adds the user to it invoking user update
      const updatedUser = await helpersAuditLog.coreAdminRequest(
        `/admin/scim/${connectId}/groups/scim-citest-group-${uuid.v4()}`,
        'PUT',
        CONFIG_API_TOKEN,
        {
          Operations: [
            {
              op: 'Add',
              path: 'members',
              value: [
                {
                  value: scimConnectUserId
                }
              ]
            }
          ]
        },
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        updatedUser
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          eventType: 'user',
          eventName: 'UserUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });
    it('should index audit log event UserUpdate WHEN updating a user using core-admin PATCH /scim/:connectId/groups endpoint - success', async () => {
      if (!scimConnectUserId) {
        // previous test should have created a user and set scimConnectUserId, but if it didn't, we need to create a new user
        const userData = helpersAuditLog.createRandomUserData();
        userData.emails = [
          {
            primary: true,
            type: 'work',
            value: userData.email
          }
        ];
        delete userData.email;
        connectId = await helpersAuditLog.createTestConnectId(
          configuredUserOrgGuid
        );

        const newUser = await helpersAuditLog.coreAdminRequest(
          `/admin/scim/${connectId}/users`,
          'POST',
          CONFIG_ADMIN_TOKEN,
          userData
        );
        cleanupResources.users.push(newUser.id);
        const { connectUserId } = await helpersAuditLog.getConnectUserId(
          connectId
        );
        scimConnectUserId = connectUserId;
      }
      const correlationID = helpersAuditLog.buildCorrelationID();

      // this operation creates a scim group and adds the user to it invoking user update
      const updatedUser = await helpersAuditLog.coreAdminRequest(
        `/admin/scim/${connectId}/groups/scim-citest-group-${uuid.v4()}`,
        'PATCH',
        CONFIG_API_TOKEN,
        {
          Operations: [
            {
              op: 'Add',
              path: 'members',
              value: [
                {
                  value: scimConnectUserId
                }
              ]
            }
          ]
        },
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        updatedUser
      );

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          eventType: 'user',
          eventName: 'UserUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    // Test for permission updates via SCIM PATCH
    it('should index audit log event UserPermissionsUpdate WHEN updating user roles using core-admin PATCH /scim/:connectId/users/:identifierId endpoint - success', async () => {
      const correlationID = helpersAuditLog.buildCorrelationID();
      const userData = helpersAuditLog.createRandomUserData();
      userData.emails = [
        {
          primary: true,
          type: 'work',
          value: userData.email
        }
      ];
      delete userData.email;
      connectId = await helpersAuditLog.createTestConnectId(
        configuredUserOrgGuid
      );

      const newUser = await helpersAuditLog.coreAdminRequest(
        `/admin/scim/${connectId}/users`,
        'POST',
        CONFIG_ADMIN_TOKEN,
        userData,
        null,
        correlationID
      );
      
      if (!newUser || !newUser.id) {
        throw new Error(`Failed to create SCIM user: ${JSON.stringify(newUser)}`);
      }
      
      cleanupResources.users.push(newUser.id);

      // Update user roles via PATCH
      const updatedUser = await helpersAuditLog.coreAdminRequest(
        `/admin/scim/${connectId}/users/${newUser.id}`,
        'PATCH',
        CONFIG_API_TOKEN,
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            {
              op: 'Replace',
              path: 'roles',
              value: [
                {
                  value: JSON.stringify({
                    value: 'aiware_collections_editor',
                    displayName: 'aiware_collections_editor'
                  })
                }
              ]
            }
          ]
        },
        null,
        correlationID
      );
      
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        updatedUser
      );
      
      // Check if request was successful
      if (!updatedUser || (updatedUser.error && updatedUser.error.status >= 400)) {
        console.error('PATCH request failed:', updatedUser);
        throw new Error(`PATCH request failed: ${JSON.stringify(updatedUser)}`);
      }

      // Add small delay to allow async operations to complete
      await helpersAuditLog.sleep(2000);

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'success',
          eventType: 'user',
          eventName: 'UserPermissionsUpdate'
        }
      ];
      
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });

    it('should index audit log event UserPermissionsUpdate WHEN updating user roles using core-admin PATCH /scim/:connectId/users/:identifierId endpoint - failure', async () => {
      connectId = await helpersAuditLog.createTestConnectId(
        configuredUserOrgGuid
      );
      const correlationID = helpersAuditLog.buildCorrelationID();
      const fakeUserId = 'invalid-user-id';

      // Try to update roles for non-existent user
      const updatedUser = await helpersAuditLog.coreAdminRequest(
        `/admin/scim/${connectId}/users/${fakeUserId}`,
        'PATCH',
        CONFIG_API_TOKEN,
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            {
              op: 'Replace',
              path: 'roles',
              value: [
                {
                  value: JSON.stringify({
                    value: 'aiware_collections_editor',
                    displayName: 'aiware_collections_editor'
                  })
                }
              ]
            }
          ]
        },
        null,
        correlationID
      );
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        updatedUser
      );

      // Add small delay to allow async operations to complete
      await helpersAuditLog.sleep(2000);

      const expectedAuditLogItems = [
        {
          actionName: 'update',
          actionResult: 'failure',
          eventType: 'user',
          eventName: 'UserPermissionsUpdate'
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
      
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    });
  });

  it('should index audit log events UserUpdated WHEN updating a new user and deleting role', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId,
      null,
      roleIds
    );
    const userId = result.createUser.id;
    cleanupResources.users.push(userId);
    const userDataUpdate = helpersAuditLog.createRandomUserData();
    result = await helpersAuditLog.updateUser(
      CONFIG_ADMIN_TOKEN,
      userId,
      userDataUpdate.firstName,
      userDataUpdate.lastName,
      correlationID,
      []
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user ${userDataUpdate.firstName} ${userDataUpdate.lastName}`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserUpdate'
      },
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user permissions for ${userDataUpdate.firstName} ${userDataUpdate.lastName}`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserPermissionsUpdate'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });
  it('should index audit log events UserPermissionsUpdate when user is updated with new role using admin api', async () => {
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    const userId = result.createUser.id;
    cleanupResources.users.push(userId);
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userRoleUpdated = await helpersAuditLog.addRoleToUser(
      CONFIG_ADMIN_TOKEN,
      correlationID,
      userId,
      roleCollectionsEditor
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      userRoleUpdated
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user permissions for First Last`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserPermissionsUpdate'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events UserPermissionsUpdate when user is updated with existing role removed using admin api', async () => {
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    const userId = result.createUser.id;
    cleanupResources.users.push(userId);
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userRoleUpdated = await helpersAuditLog.removeRoleToUser(
      CONFIG_ADMIN_TOKEN,
      correlationID,
      userId,
      roleCollectionsEditor
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      userRoleUpdated
    );

    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated user permissions for First Last`,
        targetId: userId,
        targetType: 'tt_User',
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserPermissionsUpdate'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events UserDelete WHEN deleting a user', async () => {
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    const userId = result.createUser.id;
    const correlationID = helpersAuditLog.buildCorrelationID();
    cleanupResources.users.push(userId);
    result = await helpersAuditLog.deleteUser(
      CONFIG_ADMIN_TOKEN,
      userId,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'delete',
        actionResult: 'success',
        actionDetails: 'Deleted user First Last',
        targetId: userId,
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserDelete'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  // DELETE /api/admin/users/:id
  it('should index audit log events UserDelete WHEN deleting a user - success', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const userData = helpersAuditLog.createRandomUserData();
    let result = await helpersAuditLog.createOrganization(CONFIG_ADMIN_TOKEN);
    organizationId = result.createOrganization.id;
    cleanupResources.organizations.push(organizationId);
    result = await helpersAuditLog.createUser(
      CONFIG_ADMIN_TOKEN,
      userData.email,
      config.password,
      organizationId
    );
    const userId = result.createUser.id;
    cleanupResources.users.push(userId);
    result = await helpersAuditLog.coreAdminRequest(
      `/admin/users/${userId}`,
      'DELETE',
      CONFIG_ADMIN_TOKEN,
      {},
      null,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'delete',
        actionResult: 'success',
        actionDetails: 'Deleted user First Last',
        targetId: userId,
        userName: helpers.config.userName,
        organizationId: _.toString(organizationId),
        eventType: 'user',
        eventName: 'UserDelete'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events UserDelete WHEN deleting a user - failure', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    let result;
    result = await helpersAuditLog.coreAdminRequest(
      `/admin/users/abc`, // invalid userId to cause 400 error
      'DELETE',
      CONFIG_ADMIN_TOKEN,
      {},
      null,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'delete',
        actionResult: 'failure',
        actionDetails: 'Failed to delete user abc',
        targetId: 'abc',
        userName: helpers.config.userName,
        organizationId: _.toString(helpersAuditLog._organizationID), // in this case organizationId belongs to the running user, since target user does not exist
        eventType: 'user',
        eventName: 'UserDelete'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  // DELETE /api/admin/scim/:connectId/users/:identifierId
  it('should index audit log events UserDelete WHEN deleting a user using scim connectId - success', async () => {
    const userData = helpersAuditLog.createRandomUserData();
    userData.emails = [
      {
        primary: true,
        type: 'work',
        value: userData.email
      }
    ];
    delete userData.email;
    connectId = await helpersAuditLog.createTestConnectId(
      configuredUserOrgGuid
    );
    const newUser = await helpersAuditLog.coreAdminRequest(
      `/admin/scim/${connectId}/users`,
      'POST',
      CONFIG_ADMIN_TOKEN,
      userData
    );
    cleanupResources.users.push(newUser.id);
    const { userId } = await helpersAuditLog.getConnectUserId(connectId);

    const correlationID = helpersAuditLog.buildCorrelationID();
    const deletedUser = await helpersAuditLog.coreAdminRequest(
      `/admin/scim/${connectId}/users/${newUser.id}`,
      'DELETE',
      CONFIG_API_TOKEN,
      null,
      null,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      deletedUser
    );
    const expectedAuditLogItems = [
      {
        eventName: 'UserDelete',
        actionName: 'delete',
        actionResult: 'success',
        actionDetails: `Deleted SCIM user ${userId}`
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events UserDelete WHEN deleting a user using scim connectId - failure', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    connectId = await helpersAuditLog.createTestConnectId(
      configuredUserOrgGuid
    );
    const fakeId = 'abc';
    const deletedUser = await helpersAuditLog.coreAdminRequest(
      `/admin/scim/${connectId}/users/${fakeId}`, // invalid userId to cause 400 error
      'DELETE',
      CONFIG_API_TOKEN,
      null,
      null,
      correlationID
    );
    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      deletedUser
    );
    const expectedAuditLogItems = [
      {
        eventName: 'UserDelete',
        actionName: 'delete',
        actionResult: 'failure',
        actionDetails: `Failed to delete SCIM user connectUserId ${fakeId}`
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });
});
