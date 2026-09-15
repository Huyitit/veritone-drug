const helpers = require('../citest/helpers/index.js');
const GraphqlClient = require('./helpers/gql.js');
const { safe } = require('./helpers/cleanup/utils');

const config = helpers.config;
const _ = require('lodash');
const citestMarker = global.citestMarker || 'citest-should-delete';

describe('citest_billing: billing tests', () => {
  let gqlClient;
  let orgId;
  let userToken;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();

    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    userToken = result.token;
  });

  afterAll(async () => {
    if (orgId) {
      await safe('delete test organization', async () => {
        await helpers.deleteOrganization(gqlClient.authUrl, orgId, userToken);
      });
    }
  });

  it('create test organization', async () => {
    var query = `mutation ($kvp: JSONData!) {
      createOrganization (input: {
        name: "${citestMarker}-${new Date().toISOString()}"
        businessUnit: "Legal"
        types: []
        metadata: $kvp
      }) {
        id
        name
        type
        jsondata
      }
      }`;

    const variables = {
      kvp: {
        test: 'value'
      }
    };
    const result = await gqlClient.query(query, variables);
    // expect(result.createOrganization.type).toEqual(
    //   expect.arrayContaining(['Agency', 'Broadcaster'])
    // );
    expect(result.createOrganization.jsondata).toHaveProperty('test', 'value');
    orgId = result.createOrganization.id;
  });

  const BILLING_PLAN_ID = 'BP_cit';
  it('update organization billing plan', async () => {
    var query = `mutation($id: ID!, $planId: String!) {
      updateOrganizationBilling(
        targetOrganizationId: $id
        planId: $planId
      ) {
        planId
      }
      }`;

    const variables = {
      id: orgId,
      planId: BILLING_PLAN_ID
    };
    const result = await gqlClient.query(query, variables);
    expect(result.updateOrganizationBilling.planId).toEqual(BILLING_PLAN_ID);
  });

  it('query organization billing plan', async () => {
    var query = `query($id: ID!) {
      organization(id: $id) {
        id
        billingDirty
        billingPlanId
        createdDateTime
        modifiedDateTime
      }
      }`;

    const variables = {
      id: orgId
    };

    const result = await gqlClient.query(query, variables);
    expect(result.organization.id).toEqual(orgId);

    // This is a temporary fix to reduce the effort to build Jenkins pipelines
    // This will be investigated by https://steel-ventures.atlassian.net/browse/AWT-7064
    if (
      result.organization.createdDateTime !==
      result.organization.modifiedDateTime
    ) {
      expect(result.organization.billingDirty).toEqual(true);
      expect(result.organization.billingPlanId).toEqual(BILLING_PLAN_ID);
    }
  });

  it('add to the list of available applications', async () => {
    var query = `mutation ($id: ID!, $apps: [SetOrganizationApplicationAccess!]) {
      updateOrganization(input: {
        id: $id,
        applicationAccess: $apps
      }) {
        id
      }
      }`;

    const variables = {
      id: orgId,
      apps: [
        {
          // CMS
          applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
          enable: true
        }
      ]
    };
    const result = await gqlClient.query(query, variables);
    expect(result.updateOrganization.id).toEqual(orgId);
  });

  it('query the list of available applications', async () => {
    var query = `query ($id: ID!) {
      applications(orgId: $id, owned: false) {
        records {
        id
        name
        }
      }
      }`;

    const variables = {
      id: orgId
    };
    const result = await gqlClient.query(query, variables);
    expect(result.applications).toBeTruthy();
    expect(result.applications.records).toEqual(expect.any(Array));
    expect(result.applications.records.length).toBeGreaterThan(0);
    expect(result.applications.records.map((a) => a.id)).toContain(
      '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5'
    );
  });
});
