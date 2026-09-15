const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
var triggerId;
const citestMarker = global.citestMarker || 'citest-should-delete';

describe('citest_trigger: trigger tests', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('register a trigger', async () => {
    const testName = citestMarker + 'testEventName';
    const query = `mutation {
        createTriggers(input: {
          events: "${testName}"
          targets: [
            {
              name: Webhook
              params: {
                url: "http://testendpoint.com"
              }
            }
          ]
        }) {
          id
          event
          target
        }}`;
    const result = await gqlClient.query(query);
    triggerId = _.get(result, 'createTriggers[0].id');
    expect(triggerId).toBeDefined();
    expect(_.get(result, 'createTriggers[0].event')).toEqual(testName);
    expect(_.get(result, 'createTriggers[0].target')).toEqual('Webhook');
  });

  it('delete a trigger', async () => {
    const query = `mutation {
        deleteTrigger(id: "${triggerId}") {
              id
        }
      }`;

    const result = await gqlClient.query(query);
    triggerId = _.get(result, 'deleteTrigger.id');
    expect(triggerId).toBeDefined();
  });

  it('delete an invalid trigger', async () => {
    const query = `mutation {
      deleteTrigger(id: "${triggerId}") {
              id
        }
      }`;

    expect(async () => gqlClient.query(query)).rejects.toThrow();
  });

  describe('register invalid hook', () => {
    it('should be a bad request with unsupported target', async () => {
      const query = `mutation {
      createHooks(input: {
        events:"${citestMarker}-test1"
        targets:[
          {
            name: "Email"
            params: {}
          }
        ]
      }) {
        id
      }
    }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow();
    });

    it('should be a bad request with incorrect payload for target', async () => {
      const query = `mutation {
      createHooks(input: {
        events:"${citestMarker}-test1"
        targets:[
          {
            name: Email
            params: {}
          }
        ]
      }) {
        id
      }
    }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow();
    });

    it('should have error providing both events and types input', async () => {
      const query = `mutation {
      createHooks(input: {
        events:"${citestMarker}-test1"
        types:"type1"
        targets:[
          {
            name: Email,
            params:""
          }
        ]
      }) {
        id
      }
    }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow();
    });

    it('should have error for empty target', async () => {
      const query = `mutation {
      createHooks(input: {
        events:"${citestMarker}-test1"
        targets:[]
      }) {
        id
      }
    }`;
      expect(async () => gqlClient.query(query)).rejects.toThrow();
    });
  });

  describe('register valid hook', () => {
    let createdTriggers = [];
    afterAll(async () => {
      const query = `mutation {
      delete1: deleteTrigger(id: ${createdTriggers[0][0].id}) {id}
      delete2: deleteTrigger(id: ${createdTriggers[0][1].id}) {id}
      delete3: deleteTrigger(id: ${createdTriggers[1][0].id}) {id}
      delete4: deleteTrigger(id: ${createdTriggers[1][1].id}) {id}
    }`;
      await gqlClient.query(query);
    });

    it('should create two hooks, one per event', async () => {
      const query = `mutation {
      createTriggers(input: {
        events:"${citestMarker}-citest1,citest2"
        targets:[
          {
            name: Email
            params: {
              address:"graphql_test@veritone.com"
            }
          }
        ]
      }) {
        id
      }
    }`;
      const result = await gqlClient.query(query);
      expect(_.get(result, 'createTriggers', null)).toHaveLength(2);
      createdTriggers.push(_.get(result, 'createTriggers'));
    });

    it('should create two hooks, one per type', async () => {
      const query = `mutation {
      createTriggers(input: {
        types:"${citestMarker}-t1,t2"
        targets:[
          {
            name: Email
            params: {
              address:"graphql_test@veritone.com"
            }
          }
        ]
      }) {
        id
      }
    }`;
      const result = await gqlClient.query(query);
      expect(_.get(result, 'createTriggers', null)).toHaveLength(2);
      createdTriggers.push(_.get(result, 'createTriggers'));
    });
  });
});
