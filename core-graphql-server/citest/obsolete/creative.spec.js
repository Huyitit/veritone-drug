const _ = require('lodash');
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;
const env = config.env;

const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;
const testCreative = {
  name: 'ci-test-creative',
  keywords: 'ci-test-creative-keywords'
};
let creativeId;
const updatedCreative = {
  name: 'ci-test-creative-updated-name'
};

describe('creative', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('create creative', async () => {
    const query = `mutation($testCreative: CreateCreative!) {
      createCreative(input: $testCreative) {
        id
        name
        keywords
        organizationId
        advertiserId
        brandId
      }
    }`;

    const result = await gqlClient.query(query, {
      testCreative
    });
    creativeId = _.get(result, 'createCreative.id');
    expect(creativeId).toBeDefined();
    expect(_.get(result, 'createCreative.name')).toEqual(testCreative.name);
    expect(_.get(result, 'createCreative.keywords')).toEqual(
      testCreative.keywords
    );
  });

  it('should get a creative by id', async () => {
    const query = `query {
      creative(id: ${creativeId}) {
        id
        name
        keywords
        organizationId
        advertiserId
        brandId
      }
    }`;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'creative.id')).toEqual(creativeId.toString());
    expect(_.get(result, 'creative.keywords')).toEqual(testCreative.keywords);
  });

  it('should update a creative', async () => {
    updatedCreative.id = creativeId;
    const query = `mutation($updatedCreative: UpdateCreative!) {
      updateCreative(input: $updatedCreative) {
        id
        name
        keywords
        organizationId
        advertiserId
        brandId
      }
    }`;

    const result = await gqlClient.query(query, {
      updatedCreative
    });
    expect(_.get(result, 'updateCreative.id')).toEqual(updatedCreative.id);
    expect(_.get(result, 'updateCreative.name')).toEqual(updatedCreative.name);
    expect(_.get(result, 'updateCreative.keywords')).toEqual(
      testCreative.keywords
    );
  });
});

describe('delete creative', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('delete creative', async () => {
    const query = `mutation {
      deleteCreative(id: ${creativeId}) {
        id
        message
      }
    }`;
    const result = await gqlClient.query(query, {
      updatedCreative
    });
    expect(_.get(result, 'deleteCreative.id')).toEqual(creativeId.toString());
  });
});
