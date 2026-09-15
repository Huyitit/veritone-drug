const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');

const config = helpers.config;

const _ = require('lodash');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const CMS_APPLICATION_ID = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';
const citestMarker = global.citestMarker || 'citest-should-delete';

describe('Application', () => {
  let roleIds, orgId, orgGuid, userId;
  let authGroupId, authPermissionSetId;

  let gqlClient;
  let hasRBACAuthModule = false;
  let useRBACFeature = false;
  let aceAdded = [];
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    hasRBACAuthModule = _.has(introspectionQuery, '__type.name');
  });

  afterAll(async () => {
    // delete ACE
    if (aceAdded.length) {
      const recordIds = aceAdded.map((e) => `"${e.id}"`);

      const query = `mutation {
        removeACEsFromResource(ids: [${recordIds}], resourceType: TDO) {
          records {
            id
          }
        }
      }`;

      await gqlClient.query(query);
    }

    // delete AuthPermission
    if (authPermissionSetId) {
      const query = `mutation {
        authPermissionSetDelete (id: "${authPermissionSetId}") {
          id
          message
        }
      }`;

      await gqlClient.query(query);
    }

    // delete authGroup
    if (authGroupId) {
      const query = `mutation {
        authGroupDelete (id: "${authGroupId}") {
          id
          message
        }
      }`;

      await gqlClient.query(query);
    }
  });

  describe('get JWT token for application', () => {
    it('get roleIds of current user (for adding to application JWT token)', async () => {
      const query = `
        query {
          me {
            id
            organization {
              id
              guid
              name
              jsondata
            }
            roles {
              id
            }
          }
        }
      `;
      const result = await gqlClient.query(query);
      const roles = _.get(result, 'me.roles');
      orgId = _.get(result, 'me.organization.id');
      orgGuid = _.get(result, 'me.organization.guid');
      userId = _.get(result, 'me.id');
      useRBACFeature =
        _.get(result, 'me.organization.jsondata.features.enableRBACFeature') ===
        'enabled';
      expect(_.isArray(roles)).toEqual(true);
      roleIds = _.map(roles, (role) => role.id);
    });

    it('create auth group with a member (current user)', async () => {
      if (useRBACFeature) {
        const query = `
          mutation {
            authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "desc"
              ownerOrganization: "${orgGuid}"
              members: {
                id: "${userId}",
                memberType: User
              }
            }) {
              id
              name
            }
          }
        `;

        const result = await gqlClient.query(query);
        expect(result.authGroupCreate.id).toBeDefined();
        authGroupId = _.get(result, 'authGroupCreate.id');
      }
    });

    it('create auth permission set', async () => {
      if (useRBACFeature) {
        const query = `mutation  {
          authPermissionSetCreate(input: {
            name: "${citestMarker}-permission-test-${uuid.v4()}",
            description: "desc"
            permissions: [RECORDING_READ, CMS_ACCESS, CMS_MEDIA_READ]
          }){
            id
            permissions
          }
        }`;

        const result = await gqlClient.query(query);
        expect(result.authPermissionSetCreate.id).toBeDefined();
        expect(result.authPermissionSetCreate.permissions).toEqual(
          expect.arrayContaining([
            'RECORDING_READ',
            'CMS_ACCESS',
            'CMS_RECORDING_READ'
          ])
        );

        authPermissionSetId = result.authPermissionSetCreate.id;
      }
    });

    it('add ACEs to resources', async () => {
      if (useRBACFeature) {
        const query = `mutation  {
          addACEsToResources(
            ids:["test-ACE-${uuid.v4()}", "test-ACE-${uuid.v4()}"], 
            resourceType: TDO
            entries: [{
              member: {id: "${authGroupId}", memberType: Group}, 
              permissionSetID: "${authPermissionSetId}"}
            ]) {
            records {
              id
              objectType
              permissionSet {
                id
              }
              objectType
            }
          }
        }`;

        const result = await gqlClient.query(query);
        expect(result.addACEsToResources.records.length).toEqual(2);
        expect(result.addACEsToResources.records[1].permissionSet.id).toEqual(
          authPermissionSetId
        );
        aceAdded = result.addACEsToResources.records;
      }
    });

    it('get JWT token for application - have roles', async () => {
      const query = `
        mutation ($roleIds: [ID]) {
          getApplicationJWT(input: {
            appId: "${CMS_APPLICATION_ID}"
            orgId: ${orgId}
            roleIds: $roleIds
          }) {
            applicationId
            organizationId
            token
          }
        }
      `;
      const variables = { roleIds };
      const result = await gqlClient.query(query, variables);
      const getApplicationJWT = _.get(result, 'getApplicationJWT');

      expect(getApplicationJWT).toBeDefined();
      expect(getApplicationJWT.applicationId).toEqual(CMS_APPLICATION_ID);
      expect(getApplicationJWT.organizationId).toEqual(orgId);
      expect(getApplicationJWT.token).toBeDefined();
      expect(jwt.decode(getApplicationJWT.token)).toEqual({
        contentApplicationId: expect.any(String),
        contentOrganizationId: parseInt(orgId),
        tokenApplicationId: CMS_APPLICATION_ID,
        userId: userId,
        scope: [
          {
            actions: expect.any(Array),
            resources: { applicationId: CMS_APPLICATION_ID }
          }
        ],
        iat: expect.any(Number),
        exp: expect.any(Number),
        sub: 'engine-run',
        jti: expect.any(String),
        ...(useRBACFeature ? { authGroups: expect.any(Array) } : {})
      });
    });

    it('get JWT token for application - no roles', async () => {
      const query = `
        mutation {
          getApplicationJWT(input: {
            appId: "${CMS_APPLICATION_ID}"
            orgId: ${orgId}
          }) {
            applicationId
            organizationId
            token
          }
        }
      `;
      try {
        const result = await gqlClient.query(query);
        const getApplicationJWT = _.get(result, 'getApplicationJWT');
        expect(getApplicationJWT).toBeDefined();
        expect(getApplicationJWT.applicationId).toEqual(CMS_APPLICATION_ID);
        expect(getApplicationJWT.organizationId).toEqual(orgId);
        expect(getApplicationJWT.token).toBeDefined();
      } catch (err) {
        console.log(`>>>> getApplicationJWT.error: ${err}`);
        const errMsg =
          'roleIds are not provided and cannot be deduced from other inputs'; // Roles were not found
        expect(`${err}`.includes(errMsg)).toEqual(true);
      }
    });
  });
});
