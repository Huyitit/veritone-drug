const uuid = require('uuid');
const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents,
} = require('./helpers.auditLog.js');
const { safe } = require('../helpers/cleanup/utils');
const _ = require('lodash');

// ace_grant / ace_revoke / default_ace_policy_update are immutable (baseline);
// ACEQuery is configurable and default OFF (enabled here for the test);
// AuthorizationDenied is configurable and default ON.
const OPTIONS = {
  baselineEvents: ['ace_grant', 'ace_revoke', 'default_ace_policy_update'],
  configurableEvents: ['ACEQuery', 'AuthorizationDenied', 'LoginSucceeded'],
};

const citestMarker = global.citestMarker || 'citest-should-delete';

// Build a valid SDO `data` object literal from a schema's property definitions
// (mirrors auditLog.structuredData.spec.js) so createStructuredData passes schema
// validation.
function assembleSdoInputData(properties) {
  const data = {};
  _.forEach(properties, (property, key) => {
    if (property.type === 'string') {
      data[key] = key === 'url' ? 'https://api.stage.us-1.veritone.com/v3/graphiql' : 'test';
    }
    if (property.type === 'number') {
      data[key] = 1;
    }
    if (property.type === 'boolean') {
      data[key] = true;
    }
    if (property.type === 'array') {
      data[key] = ['test'];
    }
    if (property.type === 'object') {
      data[key] = { test: 'test' };
    }
  });
  let dataString = '';
  _.forEach(data, (property, key) => {
    dataString += `${key}: ${JSON.stringify(property)},`;
  });
  return dataString.slice(0, -1);
}

const config = helpers.config;
const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);

describeif(
  config.env === DEFAULT_ENV_TO_RUN_IN,
  'audit-log-ace',
  () => {
    let helpersAuditLog, CONFIG_ADMIN_TOKEN, CONFIG_ADMIN_API_TOKEN;
    let organizationId;
    let rbacOrgId;

    async function createAcePermissionSet(permissions, orgId = organizationId) {
      const query = `mutation authPermissionSetCreate {
        authPermissionSetCreate(
          input: {
            organizationID: "${orgId}"
            name: "${citestMarker}-ace-permission-set-${Date.now()}-${uuid.v4()}"
            description: "permission set for ACE audit citest"
            permissions: [${permissions.join(', ')}]
          }
        ) { id name }
      }`;

      const headers = helpersAuditLog.buildHeadersWithBearerToken(
        CONFIG_ADMIN_TOKEN,
        helpersAuditLog.buildCorrelationID(),
      );
      const result = await helpersAuditLog._gqlClient.query(query, null, headers);

      expect(result.authPermissionSetCreate).toBeDefined();
      return result.authPermissionSetCreate.id;
    }

    function buildGrantOrganizationACEMutation({
      userId,
      permissionSetId,
      orgId = organizationId,
    }) {
      return `mutation addACEsToResources {
        addACEsToResources(
          ownerOrganization: "${orgId}"
          resourceType: Organization
          ids: ["${orgId}"]
          entries: [
            {
              member: { id: "${userId}", memberType: User }
              permissionSetID: "${permissionSetId}"
            }
          ]
        ) { records { objectID } }
      }`;
    }

    async function expectAuditLogItems({
      correlationID,
      correlationIDResponse,
      expectedAuditLogItems,
      filterItems,
    }) {
      // Retrieval can filter on a stable subset (e.g. eventName/actionResult)
      // while the full assertion runs in validateExpectedEvents. This keeps a
      // content mismatch (e.g. actionDetails) surfacing as a printed diff rather
      // than an opaque "not enough items" Elastic-retry timeout.
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        filterItems || expectedAuditLogItems,
      );

      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse,
      });
    }

    beforeAll(async () => {
      helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);

      const result = await helpersAuditLog.loginWithConfiguredUser();
      CONFIG_ADMIN_TOKEN = result.userLogin.token;
      CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
      organizationId = result.userLogin.organization.id;

      expect(CONFIG_ADMIN_TOKEN).toBeDefined();
      expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
      expect(organizationId).toBeDefined();

      // Provision a dedicated org with enableRBACFeature enabled for the revoke
      // (and future OLP) flows that require guard #2 to pass.
      const orgResult = await helpersAuditLog.createOrganizationWithOLPEnabled(
        CONFIG_ADMIN_TOKEN,
        helpersAuditLog.buildCorrelationID(),
        `${citestMarker}-ace-rbac-org-${Date.now()}`,
      );
      rbacOrgId = orgResult.createOrganization.id;
      expect(rbacOrgId).toBeDefined();
    });

    afterAll(async () => {
      if (!helpersAuditLog || !CONFIG_ADMIN_TOKEN) return;
      await safe('restore ACEQuery to default OFF', async () => {
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          helpersAuditLog.buildCorrelationID(),
        );
        await helpersAuditLog._gqlClient.query(
          `mutation {
            updateInstanceAuditLogConfig(input: {
              removeAuditEvents: [ACEQuery]
            }) {
              configurableEvents
            }
          }`,
          null,
          headers,
        );
      });
    });

    describe('ACEGrant', () => {
      it('should index ACEGrant when granting an ACE to a user - success', async () => {
        const permissionSetId = await createAcePermissionSet(['ADMIN_ORG_READ']);
        const [user] = await helpersAuditLog.createUsers(
          CONFIG_ADMIN_TOKEN,
          1,
          organizationId,
          `${citestMarker}-ace-grant-user`,
        );

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        const result = await helpersAuditLog._gqlClient.query(
          buildGrantOrganizationACEMutation({
            userId: user.id,
            permissionSetId,
          }),
          null,
          headers,
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result.addACEsToResources).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'ACEGrant',
            actionResult: 'success',
            actionDetails: `Granted ${permissionSetId} to ${user.id} (User) on Organization ${organizationId}`,
          },
        ];

        await expectAuditLogItems({
          correlationID,
          correlationIDResponse,
          expectedAuditLogItems,
        });
      });

      it('should index ACEGrant when the grant fails - failure', async () => {
        const missingPermissionSetId = uuid.v4();
        const [user] = await helpersAuditLog.createUsers(
          CONFIG_ADMIN_TOKEN,
          1,
          organizationId,
          `${citestMarker}-ace-grant-fail-user`,
        );

        const correlationID = helpersAuditLog.buildCorrelationID();
        const headers = helpersAuditLog.buildHeadersWithBearerToken(
          CONFIG_ADMIN_TOKEN,
          correlationID,
        );

        let error;
        let result;
        try {
          result = await helpersAuditLog._gqlClient.query(
            buildGrantOrganizationACEMutation({
              userId: user.id,
              permissionSetId: missingPermissionSetId,
            }),
            null,
            headers,
          );
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();

        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'ACEGrant',
            actionResult: 'failure',
            actionDetails: `Failed to grant ${missingPermissionSetId} to ${user.id} (User) on Organization ${organizationId}`,
          },
        ];

        await expectAuditLogItems({
          correlationID,
          correlationIDResponse,
          expectedAuditLogItems,
        });
      });
    });

    describe('ACERevoke', () => {
      it('should index ACERevoke when removing an ACE - success', async () => {
        // Runs in rbacOrgId (enableRBACFeature ON) so removeACEsFromResources'
        // guard #2 passes and the delete + audit block executes.
        const permissionSetId = await createAcePermissionSet(
          ['ADMIN_ORG_READ'],
          rbacOrgId,
        );
        const [user] = await helpersAuditLog.createUsers(
          CONFIG_ADMIN_TOKEN,
          1,
          rbacOrgId,
          `${citestMarker}-ace-revoke-user`,
        );

        // Grant, then look up the created ACE id and remove it.
        await helpersAuditLog._gqlClient.query(
          buildGrantOrganizationACEMutation({
            userId: user.id,
            permissionSetId,
            orgId: rbacOrgId,
          }),
          null,
          helpersAuditLog.buildHeadersWithBearerToken(
            CONFIG_ADMIN_TOKEN,
            helpersAuditLog.buildCorrelationID(),
          ),
        );

        const aclQuery = `query getACLForResources {
          getACLForResources(ownerOrganization: "${rbacOrgId}", resourceType: Organization, ids: ["${rbacOrgId}"], limit: 100) {
            records { id permissionSet { id } }
          }
        }`;
        const aclResult = await helpersAuditLog._gqlClient.query(
          aclQuery,
          null,
          helpersAuditLog.buildHeadersWithBearerToken(
            CONFIG_ADMIN_TOKEN,
            helpersAuditLog.buildCorrelationID(),
          ),
        );
        const aceRecord = _.find(
          _.get(aclResult, 'getACLForResources.records', []),
          (r) => _.get(r, 'permissionSet.id') === permissionSetId,
        );
        expect(aceRecord).toBeDefined();
        const aceId = aceRecord.id;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const removeQuery = `mutation removeACEsFromResource {
          removeACEsFromResource(
            ownerOrganization: "${rbacOrgId}"
            resourceType: Organization
            ids: ["${aceId}"]
          ) { records { objectID } }
        }`;
        const result = await helpersAuditLog._gqlClient.query(
          removeQuery,
          null,
          helpersAuditLog.buildHeadersWithBearerToken(
            CONFIG_ADMIN_TOKEN,
            correlationID,
          ),
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        // The revoke audit derives member/permissionSet from the ACE id
        // (objectType::objectID::authGroupId::permissionSetId). The user grant is
        // stored against the user's private (User-class) auth group, which
        // _resolveRevokeAuditMembers resolves back to the owning user, so the
        // revoke records that user with memberType 'User' — symmetric with the
        // ACEGrant above.
        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'ACERevoke',
            actionResult: 'success',
            actionDetails: `Revoked ${permissionSetId} from ${user.id} (User) on Organization ${rbacOrgId}`,
          },
        ];

        await expectAuditLogItems({
          correlationID,
          correlationIDResponse,
          expectedAuditLogItems,
          // Filter retrieval on stable fields; assert actionDetails in
          // validateExpectedEvents so a mismatch prints a diff, not a timeout.
          filterItems: [{ eventName: 'ACERevoke', actionResult: 'success' }],
        });
      });

      it('should index ACERevoke when the revoke fails - failure', async () => {
        // Force the delete to fail: an ACE id whose object type (TDO) does not
        // match the mutation's resourceType (Organization) makes
        // deleteACLForResources throw InvalidInput, so removeACEsFromResources
        // emits an ACERevoke failure (per parsed ace id) then re-throws.
        const fakeGroupId = uuid.v4();
        const fakePermissionSetId = uuid.v4();
        const mismatchedAceId = `TDO::${rbacOrgId}::${fakeGroupId}::${fakePermissionSetId}`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const removeQuery = `mutation removeACEsFromResource {
          removeACEsFromResource(
            ownerOrganization: "${rbacOrgId}"
            resourceType: Organization
            ids: ["${mismatchedAceId}"]
          ) { records { objectID } }
        }`;

        let error;
        try {
          await helpersAuditLog._gqlClient.query(
            removeQuery,
            null,
            helpersAuditLog.buildHeadersWithBearerToken(
              CONFIG_ADMIN_TOKEN,
              correlationID,
            ),
          );
        } catch (err) {
          error = err; // expected: InvalidInput (ace id / object-type mismatch)
        }
        expect(error).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'ACERevoke',
            actionResult: 'failure',
            actionDetails: `Failed to revoke ${fakePermissionSetId} from ${fakeGroupId} (Group) on Organization ${rbacOrgId}`,
          },
        ];

        await expectAuditLogItems({
          correlationID,
          expectedAuditLogItems,
        });
      });

      it('should index ACERevoke when validation fails before the RBAC-flag block - failure', async () => {
        // A well-formed SDO ACE id with no resourceTypeSchemaId trips the pre-flag
        // InvalidInput ("resourceTypeSchemaId is required ..."), thrown before the
        // enableRBACFeature block. The wrapper still audits the attempt from the
        // ace id snapshotted up front.
        const fakeSdoId = uuid.v4();
        const fakeGroupId = uuid.v4();
        const fakePermissionSetId = uuid.v4();
        const aceId = `SDO::${fakeSdoId}::${fakeGroupId}::${fakePermissionSetId}`;

        const correlationID = helpersAuditLog.buildCorrelationID();
        const removeQuery = `mutation removeACEsFromResource {
          removeACEsFromResource(
            ownerOrganization: "${rbacOrgId}"
            resourceType: SDO
            ids: ["${aceId}"]
          ) { records { objectID } }
        }`;

        let error;
        try {
          await helpersAuditLog._gqlClient.query(
            removeQuery,
            null,
            helpersAuditLog.buildHeadersWithBearerToken(
              CONFIG_ADMIN_TOKEN,
              correlationID,
            ),
          );
        } catch (err) {
          error = err; // expected: InvalidInput (resourceTypeSchemaId required)
        }
        expect(error).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'ACERevoke',
            actionResult: 'failure',
            actionDetails: `Failed to revoke ${fakePermissionSetId} from ${fakeGroupId} (Group) on SDO ${fakeSdoId}`,
          },
        ];

        await expectAuditLogItems({
          correlationID,
          expectedAuditLogItems,
        });
      });
    });

    describe('ACEQuery', () => {
      it('should index ACEQuery for a caller-facing hasPermissions check in an OLP org', async () => {
        // RBAC-native non-superadmin actor: a user who belongs to an auth group
        // holding a permission set with AIWARE_PERMISSIONS_GET (to satisfy the
        // hasPermissions directive) + ADMIN_ORG_READ (the permission actually
        // checked) on the org. Runs in rbacOrgId so hasPermissions reaches the
        // OLP branch.
        const password = `Aa1!${uuid.v4()}`;
        const username = `${citestMarker}-ace-query-user-${Date.now()}@localhost.com`;
        const createResult = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          username,
          password,
          rbacOrgId,
          helpersAuditLog.buildCorrelationID(),
        );
        const user = createResult.createUser;
        expect(user).toBeDefined();

        // Grant a permission set carrying AIWARE_PERMISSIONS_GET (to satisfy the
        // hasPermissions directive) + ADMIN_ORG_READ (the permission checked) to
        // the user on the org. Granting to a User member attaches the ACE to the
        // user's auto-created private auth group (RBAC-native), which the OLP
        // permission check then resolves through.
        const permissionSetId = await createAcePermissionSet(
          ['ADMIN_ORG_READ', 'AIWARE_PERMISSIONS_GET'],
          rbacOrgId,
        );
        await helpersAuditLog._gqlClient.query(
          buildGrantOrganizationACEMutation({
            userId: user.id,
            permissionSetId,
            orgId: rbacOrgId,
          }),
          null,
          helpersAuditLog.buildHeadersWithBearerToken(
            CONFIG_ADMIN_TOKEN,
            helpersAuditLog.buildCorrelationID(),
          ),
        );

        // Query as the non-superadmin user.
        const login = await helpersAuditLog.loginUser(user.name, password);
        const userToken = login.userLogin.token;
        expect(userToken).toBeDefined();

        const correlationID = helpersAuditLog.buildCorrelationID();
        const query = `query hasPermissions {
          hasPermissions(
            resourceType: Organization
            ids: ["${rbacOrgId}"]
            permissions: [ADMIN_ORG_READ]
          ) { id resourceType hasPermission }
        }`;
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          helpersAuditLog.buildHeadersWithBearerToken(userToken, correlationID),
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);

        expect(result.hasPermissions).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'ACEQuery',
            actionResult: 'success',
            actionDetails: expect.stringMatching(
              new RegExp(
                `^Checked permissions for ${_.escapeRegExp(
                  user.id,
                )} \\(User\\) on Organization ${_.escapeRegExp(rbacOrgId)}$`,
              ),
            ),
          },
        ];

        await expectAuditLogItems({
          correlationID,
          correlationIDResponse,
          expectedAuditLogItems,
        });
      });

      it('should fold a multi-id hasPermissions check into one batched ACEQuery event', async () => {
        // A fresh user with no TDO access checks several TDO ids at once. All
        // resolve to denied, so they fold into a single batched ACEQuery whose
        // actionDetails lists every id (proving fan-out is capped, not 1/id).
        const password = `Aa1!${uuid.v4()}`;
        const username = `${citestMarker}-ace-query-batch-user-${Date.now()}@localhost.com`;
        const createResult = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          username,
          password,
          rbacOrgId,
          helpersAuditLog.buildCorrelationID(),
        );
        const user = createResult.createUser;
        expect(user).toBeDefined();

        // hasPermissions is gated by AIWARE_PERMISSIONS_GET; grant it on the org.
        const permissionSetId = await createAcePermissionSet(
          ['AIWARE_PERMISSIONS_GET'],
          rbacOrgId,
        );
        await helpersAuditLog._gqlClient.query(
          buildGrantOrganizationACEMutation({
            userId: user.id,
            permissionSetId,
            orgId: rbacOrgId,
          }),
          null,
          helpersAuditLog.buildHeadersWithBearerToken(
            CONFIG_ADMIN_TOKEN,
            helpersAuditLog.buildCorrelationID(),
          ),
        );

        const login = await helpersAuditLog.loginUser(user.name, password);
        const userToken = login.userLogin.token;
        expect(userToken).toBeDefined();

        const tdoIds = [uuid.v4(), uuid.v4(), uuid.v4()];
        const correlationID = helpersAuditLog.buildCorrelationID();
        const query = `query hasPermissions {
          hasPermissions(
            resourceType: TDO
            ids: ${JSON.stringify(tdoIds)}
            permissions: [RECORDING_READ]
          ) { id resourceType hasPermission }
        }`;
        const result = await helpersAuditLog._gqlClient.query(
          query,
          null,
          helpersAuditLog.buildHeadersWithBearerToken(userToken, correlationID),
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);
        expect(result.hasPermissions).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'ACEQuery',
            actionResult: 'success',
            // One batched event listing all three ids, joined "a, b and c".
            actionDetails: expect.stringMatching(
              new RegExp(
                `^Checked permissions for ${_.escapeRegExp(
                  user.id,
                )} \\(User\\) on TDO ${_.escapeRegExp(
                  tdoIds[0],
                )}, TDO ${_.escapeRegExp(tdoIds[1])} and TDO ${_.escapeRegExp(
                  tdoIds[2],
                )}$`,
              ),
            ),
          },
        ];

        await expectAuditLogItems({
          correlationID,
          correlationIDResponse,
          expectedAuditLogItems,
        });
      });
    });

    describe('DefaultACEPolicyUpdate', () => {
      it('should index DefaultACEPolicyUpdate when the addACEs nested mutation succeeds on an SDO - success', async () => {
        const ADMIN_ROLE_IDS = [
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ];
        const adminPassword = `Aa1!${uuid.v4()}`;
        const adminUsername = `${citestMarker}-dacepu-admin-${Date.now()}@localhost.com`;
        const adminCreate = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          adminUsername,
          adminPassword,
          rbacOrgId,
          helpersAuditLog.buildCorrelationID(),
          ADMIN_ROLE_IDS,
        );
        const adminUser = adminCreate.createUser;
        expect(adminUser).toBeDefined();
        const adminLogin = await helpersAuditLog.loginUser(
          adminUser.name,
          adminPassword,
        );
        const adminToken = adminLogin.userLogin.token;
        expect(adminToken).toBeDefined();

        // A second user in the same org to be the ACE member (granting to a
        // User attaches the ACE to that user's private auth group).
        const memberCreate = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          `${citestMarker}-dacepu-member-${Date.now()}@localhost.com`,
          `Aa1!${uuid.v4()}`,
          rbacOrgId,
          helpersAuditLog.buildCorrelationID(),
        );
        const memberUser = memberCreate.createUser;
        expect(memberUser).toBeDefined();

        const permissionSetId = await createAcePermissionSet(
          ['AIWARE_SDO_READ'],
          rbacOrgId,
        );

        const adminHeaders = (corr) =>
          helpersAuditLog.buildHeadersWithBearerToken(adminToken, corr);

        // Data registry + schema created AS the rbacOrgId admin, so they (and
        // SDOs built from them) belong to the SDO-RBAC-enabled org.
        const dataRegistryId = uuid.v4();
        await helpersAuditLog._gqlClient.query(
          `mutation createDataRegistry {
            createDataRegistry(input: {
              id: "${dataRegistryId}"
              name: "${citestMarker}-dacepu-dr-${Date.now()}"
              description: "DefaultACEPolicyUpdate success citest"
              source: "citest-source"
            }) { id }
          }`,
          null,
          adminHeaders(helpersAuditLog.buildCorrelationID()),
        );

        const schemaId = uuid.v4();
        await helpersAuditLog._gqlClient.query(
          `mutation createSchema($input: CreateSchema!) {
            createSchema(input: $input) { id status }
          }`,
          {
            input: {
              id: schemaId,
              dataRegistryId,
              majorVersion: 1,
              minorVersion: 0,
              status: 'draft',
              definition: {
                type: 'object',
                properties: { name: { type: 'string' } }
              }
            }
          },
          adminHeaders(helpersAuditLog.buildCorrelationID()),
        );

        const publishResult = await helpersAuditLog._gqlClient.query(
          `mutation updateSchemaState($id: ID!) {
            updateSchemaState(input: { id: $id, status: published }) { id status }
          }`,
          { id: schemaId },
          adminHeaders(helpersAuditLog.buildCorrelationID()),
        );
        expect(_.get(publishResult, 'updateSchemaState.status')).toEqual(
          'published',
        );

        // Create the SDO with a nested addACEs that SUCCEEDS.
        const sdoId = uuid.v4();
        const correlationID = helpersAuditLog.buildCorrelationID();
        const createWithACEs = `mutation createSDO {
          createStructuredData(input: {
            id: "${sdoId}"
            schemaId: "${schemaId}"
            data: { name: "citest dacepu success" }
          }) {
            id
            addACEs(entries: [
              {
                member: { id: "${memberUser.id}", memberType: User }
                permissionSetID: "${permissionSetId}"
              }
            ]) { records { id } }
          }
        }`;
        const result = await helpersAuditLog._gqlClient.query(
          createWithACEs,
          null,
          adminHeaders(correlationID),
        );
        const correlationIDResponse =
          helpersAuditLog.getCorrelationIDFromResponse(result);
        expect(_.get(result, 'createStructuredData.id')).toEqual(sdoId);

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'DefaultACEPolicyUpdate',
            actionResult: 'success',
            actionDetails: expect.stringContaining(
              `Updated default ACE policy on SDO ${sdoId} for organization`,
            ),
          },
        ];

        await expectAuditLogItems({
          correlationID,
          correlationIDResponse,
          expectedAuditLogItems,
        });
      });

      it('should index DefaultACEPolicyUpdate when addACEs nested mutation is called on an SDO - failure', async () => {
        // Reuse an existing published schema (as auditLog.structuredData.spec.js
        // does) so SDO creation reliably passes schema validation.
        const schemasResult = await helpersAuditLog._gqlClient.query(
          `{ schemas(status: published, limit: 1) { records { id definition } } }`,
          null,
          helpersAuditLog.buildHeadersWithBearerToken(
            CONFIG_ADMIN_TOKEN,
            helpersAuditLog.buildCorrelationID(),
          ),
        );
        const schema = _.get(schemasResult, 'schemas.records[0]');
        expect(schema).toBeDefined();
        const schemaId = schema.id;
        const sdoData = assembleSdoInputData(
          _.get(schema, 'definition.properties'),
        );

        // Force the SDO id so the audit resourceId is deterministic. The nested
        // addACEs references a member/permission set that do not exist, so the
        // ACE apply fails and the policy update is audited as a failure.
        const sdoId = uuid.v4();
        const fakeGroupId = uuid.v4();
        const fakePermissionSetId = uuid.v4();
        const correlationID = helpersAuditLog.buildCorrelationID();
        const createWithACEs = `mutation createSDO {
          createStructuredData(input: {
            id: "${sdoId}"
            schemaId: "${schemaId}"
            data: { ${sdoData} }
          }) {
            id
            addACEs(entries: [
              {
                member: { id: "${fakeGroupId}", memberType: Group }
                permissionSetID: "${fakePermissionSetId}"
              }
            ]) { records { id } }
          }
        }`;

        let error;
        try {
          await helpersAuditLog._gqlClient.query(
            createWithACEs,
            null,
            helpersAuditLog.buildHeadersWithBearerToken(
              CONFIG_ADMIN_TOKEN,
              correlationID,
            ),
          );
        } catch (err) {
          error = err; // expected: the nested addACEs fails to apply
        }
        expect(error).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'DefaultACEPolicyUpdate',
            actionResult: 'failure',
            actionDetails: expect.stringContaining(
              `Failed to update default ACE policy on SDO ${sdoId}`,
            ),
          },
        ];

        await expectAuditLogItems({
          correlationID,
          expectedAuditLogItems,
        });
      });
    });

    describe('AuthorizationDenied', () => {
      it('should index AuthorizationDenied when a non-privileged user is denied at the @requireAuthRole gate', async () => {
        const password = `Aa1!${uuid.v4()}`;
        const username = `${citestMarker}-ace-denied-user-${Date.now()}@localhost.com`;
        const createResult = await helpersAuditLog.createUser(
          CONFIG_ADMIN_TOKEN,
          username,
          password,
          rbacOrgId,
          helpersAuditLog.buildCorrelationID(),
        );
        const user = createResult.createUser;
        expect(user).toBeDefined();

        const login = await helpersAuditLog.loginUser(user.name, password);
        const userToken = login.userLogin.token;
        expect(userToken).toBeDefined();

        const tdoId = uuid.v4();
        const correlationID = helpersAuditLog.buildCorrelationID();
        const query = `query temporalDataObject {
          temporalDataObject(id: "${tdoId}") { id }
        }`;

        let error;
        try {
          await helpersAuditLog._gqlClient.query(
            query,
            null,
            helpersAuditLog.buildHeadersWithBearerToken(userToken, correlationID),
          );
        } catch (err) {
          error = err; // expected: NotAllowed at the @requireAuthRole gate
        }
        expect(error).toBeDefined();

        const expectedAuditLogItems = [
          {
            eventType: 'olp',
            eventName: 'AuthorizationDenied',
            // The denial itself is recorded successfully (success = !emitError).
            actionResult: 'success',
            actionDetails: expect.stringContaining(
              `Denied access for ${user.id} (User) on TDO ${tdoId}`,
            ),
          },
        ];

        await expectAuditLogItems({
          correlationID,
          expectedAuditLogItems,
        });
      });
    });
  },
);
