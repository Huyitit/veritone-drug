const helpers = require('./helpers/index.js');
const GraphqlClient = require('./helpers/gql.js');
const uuid = require('uuid');
const citestMarker = global.citestMarker || 'citest-should-delete';

describe('citest_eventing: Event action templates', () => {
  let applicationId = null;
  let eventActionTemplateId = null;
  let actionName = citestMarker + '-test_create_asset';
  let gqlClient;
  beforeAll(async () => {
    const env = helpers.config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    const name = `${citestMarker}-${uuid.v4()}-custom-rules-e2e`;
    const query = `
      mutation {
        createApplication(input: {
          name: "${name}",
          key: "${name}-key",
          url: "https://example.com",
          checkPermissions: false
        }) {
          id
        }
      }`;
    const { createApplication } = await gqlClient.query(query);
    applicationId = createApplication.id;
  });

  afterAll(async () => {
    const query = `
    mutation {
      deleteApplication(id: "${applicationId}") {
        id
        message
      }
    }`;
    await gqlClient.query(query);
  });

  it('create action template', async () => {
    const actionTemplate = {
      name: actionName,
      inputType: 'event',
      inputValidation: {},
      inputAttributes: {
        type: 'asset',
        name: 'AssetUploaded',
        application: 'system',
        conditions: {
          operator: 'and',
          conditions: [
            {
              field: 'watchlistId',
              operator: 'eq',
              value: '{{watchlistId}}'
            }
          ]
        }
      },
      actionType: 'job',
      actionValidation: {},
      actionAttributes: {
        recordingId: '{{recordingId}}'
      },
      actionDestination: '{{engineId}}'
    };
    const input = {
      ownerApplicationId: applicationId,
      ...actionTemplate
    };
    const query = `mutation ($input: CreateEventActionTemplate!) {
      createEventActionTemplate(input: $input) {
        id
      }
    }`;
    await gqlClient.query(query, { input });
  });

  it('list action templates', async () => {
    const query = `query {
      eventActionTemplates(ownerApplicationId: "${applicationId}") {
        records {
          id
          name
        }
      }
    }`;
    const {
      eventActionTemplates: { records }
    } = await gqlClient.query(query);
    expect(records).toHaveLength(1);
    const [r0] = records;
    expect(r0.name).toEqual(actionName);
    eventActionTemplateId = r0.id;
  });

  it('update action template', async () => {
    const newName = citestMarker + '-' + uuid.v4();
    const query = `mutation {
      updateEventActionTemplate(input: {
        id: "${eventActionTemplateId}",
        name: "${newName}"
      }) {
        id
        name
      }
    }`;
    const {
      updateEventActionTemplate: { name }
    } = await gqlClient.query(query);
    expect(name).toEqual(newName);
  });
});
