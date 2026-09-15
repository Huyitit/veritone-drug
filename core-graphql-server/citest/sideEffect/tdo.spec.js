const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const CI_TEST_ROLE = 'ddf6f444-eaf0-4ee3-bded-98776e5fee0f';
const ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

describe('TDO', () => {
  let gqlClient;
  let hasRBACAuthModule = false;
  let useRBACFeature = false;
  let adminToken;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    adminToken = result.token;
    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    hasRBACAuthModule = _.has(introspectionQuery, '__type.name');
  });

  describe('Add the ACE for the defaultGroup with the defaultPermissionSet', () => {
    let tdoId;
    let orgId, orgGuid;
    let testUserId, testUserName, testUserPassword, testUserToken;
    let testAdminId, testAdminName, testAdminToken;

    it('create organization', async () => {
      if (hasRBACAuthModule) {
        const query = `mutation ($kvp: JSONData!, $apps: JSONData) {
          createOrganization (input: {
            name: "${citestMarker}-test-org-${uuid.v4()}"
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
              enableRBACFeature: 'enabled'
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
        const result = await gqlClient.query(query, variables);
        expect(result.createOrganization.type).toEqual(
          expect.arrayContaining(['Agency', 'Broadcaster'])
        );
        expect(
          result.createOrganization.jsondata.features.enableRBACFeature
        ).toEqual('enabled');
        expect(
          result.createOrganization.jsondata.applicationIds.length
        ).toBeGreaterThanOrEqual(2);
        expect(result.createOrganization.id).toBeDefined();
        expect(result.createOrganization.guid).toBeDefined();

        orgId = result.createOrganization.id;
        orgGuid = result.createOrganization.guid;
        useRBACFeature =
          _.get(
            result,
            'createOrganization.jsondata.features.enableRBACFeature'
          ) === 'enabled';
      }
    });

    it('create user in the organization', async () => {
      if (useRBACFeature) {
        // create CI test User
        testUserPassword = 'testUserPassword';
        const query = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_user_${uuid.v4()}@localhost"
            password: "${testUserPassword}"
            organizationId: "${orgId}"
            roleIds: ["${CI_TEST_ROLE}"]
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
        const result = await gqlClient.query(query);
        expect(result.createUser.id).toBeDefined();
        expect(result.createUser.name).toBeDefined();

        testUserId = result.createUser.id;
        testUserName = result.createUser.name;

        // create admin user to clean up test data
        const adminQuery = `mutation {
          createUser(input: {
            name: "${citestMarker}-test_admin_${uuid.v4()}@localhost"
            password: "${testUserPassword}"
            organizationId: "${orgId}"
            roleIds: ["${ADMIN_ROLE}"]
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
        const adminResult = await gqlClient.query(adminQuery);
        expect(adminResult.createUser.id).toBeDefined();
        expect(adminResult.createUser.name).toBeDefined();
        testAdminId = adminResult.createUser.id;
        testAdminName = adminResult.createUser.name;
      }
    });

    it('test user login successfully', async () => {
      if (useRBACFeature) {
        const query = `mutation {
          userLogin(input: {
            userName: "${testUserName}"
            password: "${testUserPassword}"
            organizationGuid: "${orgGuid}"
          }) {
            token
            user {
              id
              name
            }
            organization {
              id
              guid
              jsondata
            }
          }
        }`;
        const result = await gqlClient.query(query);
        expect(result.userLogin.organization).toBeDefined();
        expect(
          result.userLogin.organization.jsondata.features.enableRBACFeature
        ).toEqual('enabled');

        testUserToken = result.userLogin.token;
      }
    });

    it('should create a TDO', async () => {
      if (useRBACFeature) {
        const curDateTime = Math.floor(Date.now() / 1000);
        var query = `mutation {
          createTDO(input: {
            status: "uploaded"
            isPublic: true
            startDateTime: ${curDateTime}
            stopDateTime: ${curDateTime + 300}
          }) {
              id
          }
        }`;

        const result = await gqlClient._execQuery(
          gqlClient.getUrl(),
          query,
          undefined,
          helpers.requestOptions(testUserToken)
        );
        expect(result.createTDO).toBeDefined();
        expect(result.createTDO.id).toBeDefined();

        tdoId = result.createTDO.id;
      }
    });

    it('get ACLs for the TDO', async () => {
      if (useRBACFeature) {
        var query = `query {
          getACLForResources(resourceType: TDO, ids: ["${tdoId}"]) {
            records {
              id
              objectID  
            }
          }
        }`;

        const result = await gqlClient._execQuery(
          gqlClient.getUrl(),
          query,
          undefined,
          helpers.requestOptions(testUserToken)
        );
        expect(result.getACLForResources).toBeDefined();
        expect(result.getACLForResources.records.length).toBeGreaterThanOrEqual(
          1
        );
      }
    });

    it('test admin login successfully', async () => {
      if (useRBACFeature) {
        const query = `mutation {
          userLogin(input: {
            userName: "${testAdminName}"
            password: "${testUserPassword}"
            organizationGuid: "${orgGuid}"
          }) {
            token
            user {
              id
              name
            }
            organization {
              id
              guid
              jsondata
            }
          }
        }`;
        const result = await gqlClient.query(query);
        expect(result.userLogin.organization).toBeDefined();
        expect(
          result.userLogin.organization.jsondata.features.enableRBACFeature
        ).toEqual('enabled');

        testAdminToken = result.userLogin.token;
      }
    });

    it('should delete TDO', async () => {
      if (useRBACFeature) {
        var query = `mutation {
          deleteTDO(id: "${tdoId}") {
              id
          }
        }`;

        const result = await gqlClient._execQuery(
          gqlClient.getUrl(),
          query,
          undefined,
          helpers.requestOptions(testAdminToken)
        );
      }
    });

    it('delete test user', async () => {
      if (useRBACFeature) {
        const query = `mutation {
          deleteUser(id: "${testUserId}")  {
            id
          }
        }`;
        const result = await gqlClient.query(query);
        expect(result.deleteUser.id).toEqual(testUserId);
      }
    });

    it('delete test admin', async () => {
      if (useRBACFeature) {
        const query = `mutation {
          deleteUser(id: "${testAdminId}")  {
            id
          }
        }`;
        const result = await gqlClient.query(query);
        expect(result.deleteUser.id).toEqual(testAdminId);
      }
    });
  });
});
