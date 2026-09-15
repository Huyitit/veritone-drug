const uuid = require('uuid');
const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents,
} = require('./helpers.auditLog.js');
const _ = require('lodash');

const OPTIONS = {
  baselineEvents: [
    'auth_group_create',
    'auth_group_update',
    'auth_group_delete',
    'auth_group_member_add',
    'auth_group_member_remove',
  ],
  configurableEvents: [
    'LoginSucceeded'
  ],
};

const citestMarker = global.citestMarker || 'citest-should-delete';

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

let testAGId, testAGName;
let currentUser;
let organizationId;
let multiUsers = [];
let multiMemberAuthGroupId;
let acePermissionSetId;

function asArray(value) {
  return _.isArray(value) ? value : [value];
}

function getUserDisplayName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id;
}

function buildAuthGroupMemberInputs(users) {
  return asArray(users)
    .map(
      (user) => `{
        id: "${user.id}"
        memberType: User
      }`,
    )
    .join(',\n');
}

function buildMemberIdsInput(users) {
  return asArray(users)
    .map((user) => `"${user.id}"`)
    .join(', ');
}

function buildMemberActionDetails({
  action,
  authGroupId,
  users,
  useIds = false,
  orderInsensitive = false,
}) {
  const actionPrefixByAction = {
    add: 'Added to',
    addFailure: 'Failed to add to',
    remove: 'Removed from',
    removeFailure: 'Failed to remove from',
  };

  const prefix = `${actionPrefixByAction[action]} AuthGroup ${authGroupId} the users: `;
  const values = asArray(users).map((user) =>
    useIds ? user.id : getUserDisplayName(user),
  );

  if (!orderInsensitive) {
    return `${prefix}${values.join(', ')}`;
  }

  const lookaheads = values
    .map((value) => `(?=.*${_.escapeRegExp(value)})`)
    .join('');

  return expect.stringMatching(
    new RegExp(`^${_.escapeRegExp(prefix)}${lookaheads}.*$`),
  );
}

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-auth-group',
  () => {
    let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;

    // Helpers for this audit log test suite
    async function createAuthGroupForMultiMemberTest() {
      const query = `mutation authGroupCreate {
        authGroupCreate(
          input: { 
            name: "${citestMarker}-multi-member-auth-group-${Date.now()}",
            description: "test auth group for multiple member audit",
          }
        ) { id, name }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        correlationID,
      );

      const result = await helpersAuditLog._gqlClient.query(query, null, headers);
      return result.authGroupCreate.id;
    }

    const UUID_PATTERN =
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

    function buildPrivateUserAuthGroupCreateActionDetails(firstName, lastName) {
      return expect.stringMatching(
        new RegExp(
          `^Automatically created private user AuthGroup ${UUID_PATTERN} for ${_.escapeRegExp(
            `${firstName} ${lastName}`,
          )}$`,
        ),
      );
    }

    async function createPermissionSetForACE(helpersAuditLog, token, organizationId) {
      const query = `mutation authPermissionSetCreate {
        authPermissionSetCreate(
          input: {
            organizationID: "${organizationId}"
            name: "${citestMarker}-private-user-ace-permission-set-${Date.now()}"
            description: "permission set for private user auth group audit test"
            permissions: [ADMIN_ORG_UPDATE]
          }
        ) {
          id
          name
          permissions
        }
      }`;

      const correlationID = helpersAuditLog.buildCorrelationID();
      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        token,
        correlationID,
      );

      const result = await helpersAuditLog._gqlClient.query(query, null, headers);

      expect(result).toBeDefined();
      expect(result.authPermissionSetCreate).toBeDefined();
      expect(result.authPermissionSetCreate.id).toBeDefined();

      return result.authPermissionSetCreate.id;
    }

    function buildAddOrganizationACEForUserMutation({
      organizationId,
      userId,
      permissionSetId,
    }) {
      return `mutation addACEsToResources {
        addACEsToResources(
          ownerOrganization: "${organizationId}"
          resourceType: Organization
          ids: ["${organizationId}"]
          entries: [
            {
              member: {
                id: "${userId}"
                memberType: User
              }
              permissionSetID: "${permissionSetId}"
            }
          ]
        ) {
          records {
            objectID
          }
        }
      }`;
    }

    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(
        config,
        OPTIONS,
      );
      const result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();

      currentUser = result.userLogin.user;
      organizationId = result.userLogin.organization.id;

      multiUsers = await helpersAuditLog.createUsers(
        CONFIG_ADMIN_TOKEN,
        2,
        organizationId,
        `${citestMarker}-auth-group-multi-user`,
        config.password,
      );

      multiMemberAuthGroupId = await createAuthGroupForMultiMemberTest();

      acePermissionSetId = await createPermissionSetForACE(
        helpersAuditLog,
        CONFIG_ADMIN_TOKEN,
        organizationId,
      );
    });

    describe('should index audit log when', () => {
      // Create/Update/Delete AuthGroup
      it('creating an auth group - success', async () => {
        const query = `mutation authGroupCreate {
          authGroupCreate(
            input: { 
              name: "${citestMarker}-auth-group-${Date.now()}",
              description: "test auth group",
            }
          ) { id, name }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );
        testAGId = result.authGroupCreate.id;
        testAGName = result.authGroupCreate.name;
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupCreate',
            actionResult: 'success',
            actionDetails: `Created AuthGroup ${testAGId}`,
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('creating an auth group - failure (duplicate name)', async () => {
        const query = `mutation authGroupCreate {
          authGroupCreate(
            input: { 
              name: "${testAGName}", # same name - should conflict
              description: "test auth group",
            }
          ) { id, name }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('resource_conflict');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupCreate',
            actionResult: 'failure',
            actionDetails: `Failed to create AuthGroup`,
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('automatically creating a private user auth group - success', async () => {
        const firstName = 'PrivateAuditFirst';
        const lastName = 'PrivateAuditLast';
        const email = `${citestMarker}-private-user-auth-group-${Date.now()}-${uuid.v4()}@localhost.com`;

        const createUserResult = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          email,
          config.password,
          organizationId,
          null,
          null,
          {
            firstName,
            lastName,
          },
        );

        expect(createUserResult).toBeDefined();
        expect(createUserResult.createUser).toBeDefined();

        const user = createUserResult.createUser;
        expect(user.id).toBeDefined();

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        const query = buildAddOrganizationACEForUserMutation({
          organizationId,
          userId: user.id,
          permissionSetId: acePermissionSetId,
        });

        const result = await helpersAuditLog._gqlClient.query(query, null, headers);
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupCreate',
            actionResult: 'success',
            actionDetails: buildPrivateUserAuthGroupCreateActionDetails(
              firstName,
              lastName,
            ),
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('updating an auth group - success', async () => {
        const query = `mutation authGroupUpdate {
          authGroupUpdate(
            input: { 
              id: "${testAGId}",
              description: "test update auth group",
            }
          ) { id, description }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupUpdate',
            actionResult: 'success',
            actionDetails: `Updated AuthGroup ${testAGId}`,
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('updating an auth group - failure', async () => {
        const missingAGId = uuid.v4();
        const query = `mutation authGroupUpdate {
          authGroupUpdate(
            input: { 
              id: "${missingAGId}", # not found id - should fail
              description: "test update auth group should fail",
            }
          ) { id, description }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('Authorization group not found');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupUpdate',
            actionResult: 'failure',
            actionDetails: `Failed to update AuthGroup ${missingAGId}`,
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('creating an auth group with initial member - success', async () => {
        const query = `mutation authGroupCreate {
          authGroupCreate(
            input: { 
              name: "${citestMarker}-auth-group-${Date.now()}",
              description: "test auth group with initial member",
              members: [${buildAuthGroupMemberInputs(currentUser)}]
            }
          ) { id, name }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();
        const authGroupWithMemberId = result.authGroupCreate.id;

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupCreate',
            actionResult: 'success',
            actionDetails: `Created AuthGroup ${authGroupWithMemberId}`,
          },
          {
            eventType: 'olp',
            eventName: 'AuthGroupMemberAdd',
            actionResult: 'success',
            actionDetails: buildMemberActionDetails({
              action: 'add',
              authGroupId: authGroupWithMemberId,
              users: currentUser,
              useIds: true,
            }),
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('creating an auth group with initial member - failure', async () => {
        const query = `mutation authGroupCreate {
          authGroupCreate(
            input: { 
              name: "${testAGName}", # same name - should fail before members are added
              description: "test duplicate auth group with initial member",
              members: [${buildAuthGroupMemberInputs(currentUser)}]
            }
          ) { id, name }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('resource_conflict');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupCreate',
            actionResult: 'failure',
            actionDetails: `Failed to create AuthGroup`,
          }
          // we don't have an audit log for the member add because the auth group creation failed before it could be added
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('creating an auth group with multiple initial members - success', async () => {
        const query = `mutation authGroupCreate {
          authGroupCreate(
            input: { 
              name: "${citestMarker}-auth-group-multi-initial-members-${Date.now()}",
              description: "test auth group with multiple initial members",
              members: [
                ${buildAuthGroupMemberInputs(multiUsers)}
              ]
            }
          ) { id, name }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        const result = await helpersAuditLog._gqlClient.query(query, null, headers);
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const authGroupWithMembersId = result.authGroupCreate.id;

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupCreate',
            actionResult: 'success',
            actionDetails: `Created AuthGroup ${authGroupWithMembersId}`,
          },
          {
            eventType: 'olp',
            eventName: 'AuthGroupMemberAdd',
            actionResult: 'success',
            actionDetails: buildMemberActionDetails({
              action: 'add',
              authGroupId: authGroupWithMembersId,
              users: multiUsers,
              useIds: true,
              orderInsensitive: true,
            }),
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      // Add/Remove Members
      it('adding a single member into an auth group - success', async () => {
        const query = `mutation authGroupAddMembers {
        authGroupAddMembers(
          id: "${testAGId}"
          members: [${buildAuthGroupMemberInputs(currentUser)}]
        ) { id }
      }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupMemberAdd',
            actionResult: 'success',
            actionDetails: buildMemberActionDetails({
              action: 'add',
              authGroupId: testAGId,
              users: currentUser,
            }),
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('adding a single member into an auth group - failure', async () => {
        const missingAGId = uuid.v4();
        const query = `mutation authGroupAddMembers {
        authGroupAddMembers(
          id: "${missingAGId}"
          members: [${buildAuthGroupMemberInputs(currentUser)}]
        ) { id }
      }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('Authorization group not found');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupMemberAdd',
            actionResult: 'failure',
            actionDetails: buildMemberActionDetails({
              action: 'addFailure',
              authGroupId: missingAGId,
              users: currentUser,
              useIds: true,
            }),
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('removing a single member from an auth group - success', async () => {
        const query = `mutation authGroupRemoveMembers {
        authGroupRemoveMembers(
          id: "${testAGId}"
          memberIds: [${buildMemberIdsInput(currentUser)}]
        ) { id }
      }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupMemberRemove',
            actionResult: 'success',
            actionDetails: buildMemberActionDetails({
              action: 'remove',
              authGroupId: testAGId,
              users: currentUser,
            }),
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('removing a single member from an auth group - failure', async () => {
        const missingAGId = uuid.v4();
        const query = `mutation authGroupRemoveMembers {
        authGroupRemoveMembers(
          id: "${missingAGId}"
          memberIds: [${buildMemberIdsInput(currentUser)}]
        ) { id }
      }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('Authorization group not found');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupMemberRemove',
            actionResult: 'failure',
            actionDetails: buildMemberActionDetails({
              action: 'removeFailure',
              authGroupId: missingAGId,
              users: currentUser,
              useIds: true,
            }),
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('adding multiple members into an auth group - success', async () => {
        const query = `mutation authGroupAddMembers {
          authGroupAddMembers(
            id: "${multiMemberAuthGroupId}"
            members: [
              ${buildAuthGroupMemberInputs(multiUsers)}
            ]
          ) { id }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        const result = await helpersAuditLog._gqlClient.query(query, null, headers);
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupMemberAdd',
            actionResult: 'success',
            actionDetails: buildMemberActionDetails({
              action: 'add',
              authGroupId: multiMemberAuthGroupId,
              users: multiUsers,
              orderInsensitive: true,
            }),
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('removing multiple members from an auth group - success', async () => {
        const query = `mutation authGroupRemoveMembers {
          authGroupRemoveMembers(
            id: "${multiMemberAuthGroupId}"
            memberIds: [${buildMemberIdsInput(multiUsers)}]
          ) { id }
        }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        const result = await helpersAuditLog._gqlClient.query(query, null, headers);
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupMemberRemove',
            actionResult: 'success',
            actionDetails: buildMemberActionDetails({
              action: 'remove',
              authGroupId: multiMemberAuthGroupId,
              users: multiUsers,
              orderInsensitive: true,
            }),
          },
        ];

        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      // Deletion
      it('deleting an auth group - success', async () => {
        const query = `mutation authGroupDelete {
        authGroupDelete(
          id: "${testAGId}"
        ) { id }
      }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          headers,
        );
        testAGId = result.authGroupDelete.id;
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupDelete',
            actionResult: 'success',
            actionDetails: `Deleted AuthGroup ${testAGId}`,
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });

      it('deleting an auth group - failure', async () => {
        const query = `mutation authGroupUpdate {
        authGroupDelete(
          id: "uuid-invalid" # not found id - should fail
        ) { id }
      }`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;

        try {
          result = await helpersAuditLog._gqlClient.query(query, null, headers);
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('Provide a valid object ID to continue.');

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthGroupDelete',
            actionResult: 'failure',
            actionDetails: `Failed to delete AuthGroup uuid-invalid`,
          },
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems,
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse,
        });
      });
    }) 
  },
);
