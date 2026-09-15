const helpers = require('../../helpers/index.js'),
  config = helpers.config,
  uuid = require('uuid'),
  _ = require('lodash'),
  moment = require('moment-timezone'),
  supertest = require('supertest');

const { safe } = require('../../helpers/cleanup/utils.js');
const env = config.env;
const GraphqlClient = require('../../helpers/gql.js');
const gqlClient = new GraphqlClient(env);

let options, ingestionToken, dataRegName;
const restUrl =
  gqlClient.structuredDataUrl ||
  'https://api.' + env + '.veritone.com/v3/structured-data';
const testId = uuid.v4();
let dataRegistryId,
  schemaId,
  schemaId2,
  latestDraftSchema,
  incompatibleSchemaId,
  orgId,
  sharedDataRegistry;

let testUserOption;
let sharedOrgId, sharedUserId, sharedDataRegistryId, sharedSchemaId;
const createdTestData = [];
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const propertyTitle = 'The Foo Schema';
const schema = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    foo: {
      $id: '/properties/foo',
      type: 'string',
      title: propertyTitle,
      default: '',
      examples: ['bar']
    },
    bar: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
};

describe('citest_structureddata:', () => {
  beforeAll(async () => {
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    options = helpers.requestOptions(result.token);
    orgId = result.organizationId;
    dataRegName = citestMarker + '-registry-unix-name-in-org-' + orgId;

    const testRegistry = await getOrCreateRegistryByName(dataRegName);
    expect(testRegistry).toBeDefined();
    expect(testRegistry.errors).toBeUndefined();
    // registry
    expect(testRegistry.dataRegistry).toBeDefined();
    expect(testRegistry.dataRegistry.id).toBeDefined();

    expect(_.get(testRegistry, 'dataRegistry.organization.id')).toEqual(
      orgId.toString()
    );
    // store id for other tests
    dataRegistryId = testRegistry.dataRegistry.id;
  });

  afterAll(async () => {
    if (createdTestData.length) {
      const listSchemaIds = Array.from(
        new Set(_.map(createdTestData, 'schemaId'))
      );
      for (const rec of listSchemaIds) {
        await safe(`delete schema ${rec}`, async () => {
          const deleteSDO = await gqlClient.query(`mutation {
            updateSchemaState(input:{id: "${rec}",  status:deleted}) {
              id
              status
            }
          }
          `);
        });
      }
    }
  });

  it('update a data registry', async () => {
    let recResult, errors, updateDataRegistry;

    const query = `mutation {
      updateDataRegistry(
        input:{
          id: "${dataRegistryId}"
          name: "${dataRegName}"
          description: "updated citest description"
          source: "Some other url"
        }) {
        id
        name
        description
        source
        createdDateTime
        modifiedDateTime
        schemas {
          records {
            id
            definition
          }
        }
        organization {
          id
        }
        ingestionToken
      }
    }`;

    recResult = await gqlClient.query(query);
    errors = _.get(recResult, 'errors');
    updateDataRegistry = _.get(recResult, 'updateDataRegistry');

    expect(errors).toBeUndefined();
    expect(updateDataRegistry).toBeDefined();
    expect(updateDataRegistry.id).toEqual(dataRegistryId);
    expect(updateDataRegistry.name).toEqual(dataRegName);
    expect(updateDataRegistry.createdDateTime).toBeDefined();
    expect(updateDataRegistry.createdDateTime).not.toEqual(
      updateDataRegistry.modifiedDateTime
    );
    expect(_.get(updateDataRegistry, 'organization.id')).toEqual(
      orgId.toString()
    );
    ingestionToken = _.get(updateDataRegistry, 'ingestionToken');
    expect(ingestionToken).toBeDefined();
  });

  it('get data registries', async () => {
    let recResult, dataRegistries;

    let prefix = `${dataRegName}`.substring(0, 14);
    const query = `query {
      dataRegistries (id: "${dataRegistryId}") {
        count
        records {
          id
          name
          description
          source
          createdBy {
            id
            name
          }
        }
      }
      byNameExact: dataRegistries(name: "${dataRegName}" nameMatch: exact) {
        count
      }
      byNameContains: dataRegistries(name: "${dataRegName}" nameMatch: contains) {
        count
      }
      byNameStartsWith: dataRegistries(name: "${prefix}" nameMatch: startsWith limit:1) {
        count
      }
      byNameEndsWith: dataRegistries(name: "${dataRegName}" nameMatch: endsWith) {
        count
        records {
          id
          name
        }
      }
      byNameNoMatch: dataRegistries(name: "${dataRegName}-noMatch" nameMatch: exact) {
        count
      }
    }`;

    recResult = await gqlClient.query(query);
    dataRegistries = _.get(recResult, 'dataRegistries.records[0]');
    expect(_.get(recResult, 'byNameNoMatch.count')).toEqual(0);
    expect(_.get(recResult, 'byNameEndsWith.count')).toEqual(1);
    expect(_.get(recResult, 'byNameStartsWith.count')).toEqual(1);
    expect(_.get(recResult, 'byNameContains.count')).toEqual(1);
    expect(_.get(recResult, 'byNameExact.count')).toEqual(1);
    expect(dataRegistries.name).toEqual(dataRegName);
    expect(dataRegistries.createdBy.name).toBeDefined();
  });

  it('get data registries limit offset', async () => {
    let recResult, dataRegistries;

    const query = `query {
      dataRegistries (limit: 2, offset: 2) {
        count
        offset
        records {
          id
          name
          description
          source
          schemas (limit:1) {
            records {
              id
              definition
            }
          }
          organization {
            id
          }
        }
      }
    }`;

    recResult = await gqlClient.query(query);
    dataRegistries = _.get(recResult, 'dataRegistries');
    expect(dataRegistries).toBeDefined();
    expect(dataRegistries.records.length).toEqual(2);
    expect(dataRegistries.count).toBeGreaterThan(1);
    expect(dataRegistries.offset).toEqual(2);
    expect(_.get(dataRegistries, 'records.[0].organization.id')).toBeDefined();
  });

  it('create published registry', async () => {
    // create org
    const timeStamp = Date.now();
    const queryCreateOrg = `
    mutation createOrganization ($kvp: JSONData!, $apps: JSONData) {
      createOrganization (input: {
        name: "${citestMarker}-org-for-reg-${timeStamp}"
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
    }
    `;
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
    const org = await gqlClient.query(queryCreateOrg, variables);
    expect(org.createOrganization.id).toBeDefined();
    expect(org.createOrganization.guid).toBeDefined();
    sharedOrgId = org.createOrganization.id;
    const orgGuid = org.createOrganization.guid;

    // create user admin
    const ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
    const testUserPassword = 'testUserPassword';
    const queryCreateUser = `mutation createUser {
      createUser(
        input: {
          name: "${citestMarker}-user-${timeStamp}"
          password: "${testUserPassword}"
          organizationId: "${sharedOrgId}"
          roleIds: [
            "${ADMIN_ROLE}",
          ]
          firstName: "RBAC-User"
          lastName: "Regular"
          jsondata: {
            firstName: "RBAC-User"
            lastName: "Regular"
          }
        }
      )  {
        id
        name
        firstName
        lastName
        jsondata
      }
    }`;

    const newAdmin = await gqlClient.query(queryCreateUser);

    expect(newAdmin.createUser.id).toBeDefined();
    expect(newAdmin.createUser.name).toBeDefined();
    const testUserName = newAdmin.createUser.name;
    sharedUserId = newAdmin.createUser.id;

    // user login
    const queryLogin = `mutation userLogin {
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

    const loginUser = await gqlClient.query(queryLogin);
    expect(loginUser.userLogin.token).toBeDefined();
    const userToken = loginUser.userLogin.token;
    testUserOption = helpers.requestOptions(userToken);

    // create registry
    const createRegistyQuery = `mutation createDataRegistry{
        createDataRegistry(
          input:{
            name: "${citestMarker}-create-reg-${timeStamp}",
            description:"citest description"
            source: "Some url"
            isPublic: true
          }) {
          id
          name
          description
          source
          schemas {
            records {
              id
              definition
            }
          }
          publishedSchema {
            id
          }
          organization {
            id
          }
        }
      }`;

    const createResult = await gqlClient.query(
      createRegistyQuery,
      {},
      testUserOption
    );
    expect(createResult.createDataRegistry.id).toBeDefined();
    sharedDataRegistryId = createResult.createDataRegistry.id;

    // create draft schema
    const queryCreateSchema = `mutation upsertSchemaDraft($schema: JSONData!) {
      upsertSchemaDraft (
        input:{
          dataRegistryId: "${sharedDataRegistryId}",
          schema: $schema
        }) {
        id
        dataRegistryId
        status
        majorVersion
        minorVersion
        definition
        validActions
        organizationId
        organization {
          id
        }
      }
    }`;

    const schemaVariables = { schema };

    const recResult = await gqlClient.query(
      queryCreateSchema,
      schemaVariables,
      testUserOption
    );
    const upsertSchemaDraft = _.get(recResult, 'upsertSchemaDraft');
    expect(upsertSchemaDraft).toBeDefined();
    sharedSchemaId = upsertSchemaDraft.id;
    expect(sharedSchemaId).toBeDefined();
    expect(upsertSchemaDraft.dataRegistryId).toEqual(sharedDataRegistryId);
    expect(upsertSchemaDraft.status).toEqual('draft');
    expect(upsertSchemaDraft.definition).toEqual(schema);
    expect(upsertSchemaDraft.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);
    expect(_.get(upsertSchemaDraft, 'organizationId')).toEqual(
      sharedOrgId.toString()
    );
    expect(_.get(upsertSchemaDraft, 'organization.id')).toEqual(
      sharedOrgId.toString()
    );

    // publish schema
    const publishSchemaQuery = `mutation updateSchemaState{
        updateSchemaState(input: {
          id:"${sharedSchemaId}",
          status: published,
          breakingChanges: false
        }) {
          id
          status
          createdDateTime
          modifiedDateTime
          validActions
        }
      }`;

    const updateSchema = await gqlClient.query(
      publishSchemaQuery,
      {},
      testUserOption
    );
    expect(updateSchema.updateSchemaState.id).toEqual(sharedSchemaId);
    expect(updateSchema.updateSchemaState.status).toEqual('published');
  });

  it('get shared data registries', async () => {
    let recResult;

    const query = `query {
        dataRegistries (filterByOwnership: others, limit: 1) {
          count
          records {
            id
            name
            organizationId
          }
        }
      }`;

    recResult = await gqlClient.query(query);
    sharedDataRegistry = _.get(recResult, 'dataRegistries.records[0]');

    expect(sharedDataRegistry).toBeDefined();
    expect(_.get(recResult, 'dataRegistries.count')).toEqual(1);
    expect(sharedDataRegistry.organizationId).not.toEqual(orgId.toString());
  });

  it('get shared data registry', async () => {
    let recResult, dataRegistry;

    const query = `query {
      dataRegistry (id: "${sharedDataRegistry.id}") {
        id
        name
        organizationId
      }
    }`;

    recResult = await gqlClient.query(query);
    dataRegistry = _.get(recResult, 'dataRegistry');
    expect(dataRegistry).toBeDefined();
    expect(dataRegistry).toEqual(sharedDataRegistry);
    expect(dataRegistry.organizationId).not.toEqual(orgId.toString());
  });

  it('delete created registry data', async () => {
    // get schema
    const querySchema = `query q{
      dataRegistry(id: "${sharedDataRegistryId}") {
        id
        name
        createdDateTime
        schemas {
          records {
            id
            status
            createdDateTime
          }
        }
      }
    }`;

    const schemaData = await gqlClient.query(querySchema, {}, testUserOption);
    const schemas = _.get(schemaData, 'dataRegistry.schemas.records', []);

    // delete schema + registry
    for (const schema of schemas) {
      const deleteSchemaAndRegQuery = `
      mutation {
          updateSchemaState(input:{id: "${schema.id}",  status:deleted}) {
            id
            status
          }
        }`;
      const deleteSDO = await gqlClient.query(
        deleteSchemaAndRegQuery,
        {},
        testUserOption
      );

      expect(deleteSDO.updateSchemaState.id).toEqual(schema.id);
    }

    // delete user
    const queryDeleteUser = `mutation {
      deleteUser (id: "${sharedUserId}"){
        id
        message
      }
    }`;

    const deleteUser = await gqlClient.query(queryDeleteUser);
    expect(deleteUser.deleteUser.id).toEqual(sharedUserId);

    // delete org
    const queryDeleteOrg = `mutation updateOrg {
        updateOrganization (input: {
          id: "${sharedOrgId}"
          status: "deleted"
        }){
          id
          status
        }
      }`;

    const deleteOrg = await gqlClient.query(queryDeleteOrg);
    expect(deleteOrg.updateOrganization.id).toEqual(sharedOrgId);
  });

  it('upsert a schema draft with none exist dataRegistryId', async () => {
    let recResult, errors, upsertSchemaDraft;

    const noneExitId = uuid.v4();
    const query = `mutation ($schema: JSONData!) {
      upsertSchemaDraft (
        input:{
          dataRegistryId: "${noneExitId}",
          schema: $schema
        }) {
        id
        dataRegistryId
        status
        majorVersion
        minorVersion
        definition
        validActions
        organizationId
        organization {
          id
        }
      }
    }`;

    const variables = { schema };
    try {
      recResult = await gqlClient.query(query, variables);
      upsertSchemaDraft = _.get(recResult, 'upsertSchemaDraft');
      expect(upsertSchemaDraft).toBeDefined();
    } catch (ex) {
      errors = ex;
    }

    expect(errors).toBeDefined();
    expect(`${errors}`).toContain(`The requested object was not found`);
    expect(`${errors}`).toContain(`not_found`);
  });

  it('upsert a schema draft', async () => {
    let recResult, upsertSchemaDraft;

    const query = `mutation ($schema: JSONData!) {
      upsertSchemaDraft (
        input:{
          dataRegistryId: "${dataRegistryId}",
          schema: $schema
        }) {
        id
        dataRegistryId
        status
        majorVersion
        minorVersion
        definition
        validActions
        organizationId
        organization {
          id
        }
      }
    }`;

    const variables = { schema };

    recResult = await gqlClient.query(query, variables);
    upsertSchemaDraft = _.get(recResult, 'upsertSchemaDraft');
    expect(upsertSchemaDraft).toBeDefined();
    schemaId = upsertSchemaDraft.id;
    createdTestData.push({
      schemaId,
      dataRegistryId
    });

    expect(schemaId).toBeDefined();
    expect(upsertSchemaDraft.dataRegistryId).toEqual(dataRegistryId);
    expect(upsertSchemaDraft.status).toEqual('draft');
    expect(upsertSchemaDraft.definition).toEqual(schema);
    expect(upsertSchemaDraft.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);
    expect(_.get(upsertSchemaDraft, 'organizationId')).toEqual(
      orgId.toString()
    );
    expect(_.get(upsertSchemaDraft, 'organization.id')).toEqual(
      orgId.toString()
    );
  });

  it('publish a schema draft with none exit id', async () => {
    let errors;
    const noneExitId = uuid.v4();

    const query = `mutation {
        updateSchemaState(input: {
          id:"${noneExitId}",
          status: published,
          breakingChanges: false
        }) {
          id
          status
          createdDateTime
          modifiedDateTime
          validActions
        }
      }`;

    try {
      await gqlClient.query(query);
    } catch (ex) {
      errors = ex;
    }
    expect(errors).toBeDefined();
    expect(`${errors}`).toContain(`The requested object was not found`);
    expect(`${errors}`).toContain(`not_found`);
  });

  it('publish a schema draft', async () => {
    let recResult, updateSchemaState;

    const query = `mutation {
        updateSchemaState(input: {
          id:"${schemaId}",
          status: published,
          breakingChanges: false
        }) {
          id
          status
          createdDateTime
          modifiedDateTime
          validActions
        }
      }`;

    recResult = await gqlClient.query(query);
    updateSchemaState = _.get(recResult, 'updateSchemaState');
    expect(updateSchemaState).toBeDefined();
    expect(updateSchemaState.id).toEqual(schemaId);
    expect(updateSchemaState.status).toEqual('published');
    expect(updateSchemaState.createdDateTime).toBeDefined();
    expect(updateSchemaState.modifiedDateTime).toBeDefined();
    expect(updateSchemaState.validActions).toEqual([
      'view',
      'edit',
      'deactivate',
      'delete'
    ]);
  });

  it('upsert a new schema draft to test schema state', async () => {
    let recResult, upsertSchemaDraft;

    const query = `mutation ($schema: JSONData!) {
      upsertSchemaDraft (
        input:{
          dataRegistryId: "${dataRegistryId}",
          schema: $schema
        }) {
        id
        dataRegistryId
        status
        majorVersion
        minorVersion
        definition
        validActions
        organizationId
        organization {
          id
        }
      }
    }`;

    const variables = { schema };

    recResult = await gqlClient.query(query, variables);
    upsertSchemaDraft = _.get(recResult, 'upsertSchemaDraft');
    expect(upsertSchemaDraft).toBeDefined();
    schemaId2 = upsertSchemaDraft.id;

    createdTestData.push({
      schemaId: schemaId2,
      dataRegistryId
    });

    expect(schemaId2).toBeDefined();
    expect(upsertSchemaDraft.dataRegistryId).toEqual(dataRegistryId);
    expect(upsertSchemaDraft.status).toEqual('draft');
    expect(upsertSchemaDraft.definition).toEqual(schema);
    expect(upsertSchemaDraft.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);
    expect(_.get(upsertSchemaDraft, 'organizationId')).toEqual(
      orgId.toString()
    );
    expect(_.get(upsertSchemaDraft, 'organization.id')).toEqual(
      orgId.toString()
    );
    expect(_.get(upsertSchemaDraft, 'majorVersion')).toEqual(1);
    expect(_.get(upsertSchemaDraft, 'minorVersion')).toEqual(1);

    // also verify that only one draft was created
    const schemaQuery = `
      query {
        schemas(dataRegistryId: "${dataRegistryId}", status: draft) {
          count
        }
      }
    `;

    const schemaResult = await gqlClient.query(schemaQuery);
    expect(_.get(schemaResult, 'schemas.count')).toEqual(1);
  });

  it('publish the new schema draft to test schema state', async () => {
    let recResult, updateSchemaState;

    const query = `mutation {
        updateSchemaState(input: {
          id:"${schemaId2}",
          status: published,
          breakingChanges: false
        }) {
          id
          status
          createdDateTime
          modifiedDateTime
          validActions
        }
      }`;

    recResult = await gqlClient.query(query);
    updateSchemaState = _.get(recResult, 'updateSchemaState');
    expect(updateSchemaState).toBeDefined();
    expect(updateSchemaState.id).toEqual(schemaId2);
    expect(updateSchemaState.status).toEqual('published');
    expect(updateSchemaState.createdDateTime).toBeDefined();
    expect(updateSchemaState.modifiedDateTime).toBeDefined();
    expect(updateSchemaState.validActions).toEqual([
      'view',
      'edit',
      'deactivate',
      'delete'
    ]);
  });

  it('the older schema"s state should be inactive', async () => {
    let result, updateSchemaState;

    const query = `query getSchema {
        schema(id: "${schemaId}") {
          id
          status
          createdDateTime
          modifiedDateTime
        }
      }`;

    result = await gqlClient.query(query);
    updateSchemaState = _.get(result, 'schema');
    expect(updateSchemaState).toBeDefined();
    expect(updateSchemaState.id).toEqual(schemaId);

    // reset the latest schema
    schemaId = schemaId2;

    expect(updateSchemaState.createdDateTime).toBeDefined();
    expect(updateSchemaState.modifiedDateTime).toBeDefined();
    expect(updateSchemaState.status).toEqual('inactive'); // This might be failed if the new changes are not deployed.
  });

  it('upsert a new schema draft with higher major version than published', async () => {
    let recResult, upsertSchemaDraft;

    const query = `mutation ($schema: JSONData!) {
      upsertSchemaDraft (
        input:{
          dataRegistryId: "${dataRegistryId}",
          majorVersion: 2,
          schema: $schema
        }) {
        id
        dataRegistryId
        status
        majorVersion
        minorVersion
        definition
        validActions
        organizationId
        organization {
          id
        }
      }
    }`;

    const variables = { schema };

    recResult = await gqlClient.query(query, variables);
    upsertSchemaDraft = _.get(recResult, 'upsertSchemaDraft');
    expect(upsertSchemaDraft).toBeDefined();
    latestDraftSchema = upsertSchemaDraft.id;

    createdTestData.push({
      schemaId: latestDraftSchema,
      dataRegistryId
    });

    expect(latestDraftSchema).toBeDefined();
    expect(upsertSchemaDraft.dataRegistryId).toEqual(dataRegistryId);
    expect(upsertSchemaDraft.status).toEqual('draft');
    expect(upsertSchemaDraft.definition).toEqual(schema);
    expect(upsertSchemaDraft.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);
    expect(_.get(upsertSchemaDraft, 'organizationId')).toEqual(
        orgId.toString()
    );
    expect(_.get(upsertSchemaDraft, 'organization.id')).toEqual(
        orgId.toString()
    );
    expect(_.get(upsertSchemaDraft, 'majorVersion')).toEqual(1);
    expect(_.get(upsertSchemaDraft, 'minorVersion')).toEqual(2);

    // also verify that only one draft was created
    const schemaQuery = `
      query {
        schemas(dataRegistryId: "${dataRegistryId}", status: draft) {
          count
        }
      }
    `;

    const schemaResult = await gqlClient.query(schemaQuery);
    expect(_.get(schemaResult, 'schemas.count')).toEqual(1);
  });

  it('get schema properties by path name', async () => {
    const data = await getSchemaPropertiesSharedBefore('foo');
    getSchemaPropertiesSharedAssertions(data);
  });

  it('get schema properties by title name', async () => {
    const data = await getSchemaPropertiesSharedBefore(propertyTitle);
    getSchemaPropertiesSharedAssertions(data);
  });

  it('get a schema', async () => {
    var recResult;
    var schemaResult = null;

    const query = `query {
        schema(id: "${schemaId}"){
          id
          dataRegistryId
          definition
          status
          validActions
          dataRegistry {
            id
            publishedSchema {
              id
            }
          }
        }
      }
      `;

    recResult = await gqlClient.query(query);
    schemaResult = _.get(recResult, 'schema');
    expect(schemaResult).toBeDefined();
    expect(schemaResult.status).toEqual('published');
    expect(schemaResult.definition).toEqual(schema);
    expect(_.get(schemaResult, 'dataRegistry.id')).toBeDefined();
    expect(_.get(schemaResult, 'dataRegistry.publishedSchema.id')).toEqual(
      schemaId
    );
  });

  it('get schemas', async () => {
    var recResult;

    const query = `query {
      byName: schemas(name: "${dataRegName}"){
        records {
          id
          dataRegistry {
            name
          }
        }
        count
      }
      byIds: schemas(ids:["${schemaId}"]) {
        records {
          id
        }
        count
      }
      byNameContains: schemas(name: "citest", nameMatch: contains, limit: 1){
        count
      }
      byDataRegistryId: schemas(dataRegistryId: "${dataRegistryId}"){
        count
      }
    }
    `;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    expect(recResult.byName.records.length > 0).toEqual(true);
    expect(recResult.byIds.records.length > 0).toEqual(true);
    expect(recResult.byName.records[0].id).toEqual(latestDraftSchema);
    expect(recResult.byName.records[0].dataRegistry.name).toEqual(dataRegName);
    expect(recResult.byIds.count).toEqual(1);
    expect(recResult.byIds.records[0].id).toEqual(schemaId);
  });

  it('create a structured data - basic', async () => {
    var recResult, error;

    const query = `mutation {
        createStructuredData(input: {
          schemaId: "${schemaId}"
          data: {
            foo: "bar"
          }
        }) {
          id
          data
          dataString
          schemaId
          modifiedDateTime
          createdDateTime
        }

        withError:  createStructuredData(input: {
          schemaId: "${schemaId}"
          data: {
            foo: 1
          }
        }) {
          id
        }
      }
      `;
    try {
      recResult = await gqlClient.query(query);
      expect(recResult).toBeDefined();
    } catch (ex) {
      error = ex;
    }

    // check createStructuredData success 1

    expect(error).toBeDefined();
    expect(`${error}`).toContain(`invalid_input`);
    expect(`${error}`).toContain(`The provided JSON had validation errors.`);
    expect(`${error}`).toContain(`instance.foo is not of a type(s) string`);
  });

  it('create a structured data - force ID and from string', async () => {
    var recResult;
    var createStructuredData = null;

    var query = `mutation {
          createStructuredData(input: {
            id: "${testId}"
            schemaId: "${schemaId}"
            dataString: "{ \\"foo\\": \\"bar\\" }"
          }) {
            id
            data
            dataString
            schemaId
            modifiedDateTime
            createdDateTime
          }
        }
    `;
    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    createStructuredData = _.get(recResult, 'createStructuredData');
    expect(createStructuredData).toBeDefined();
    let testData = null;
    try {
      testData = JSON.parse(createStructuredData.dataString);
    } catch (err) {
      console.log(err);
    }
    expect(testData).toBeDefined();

    createdTestData.push({
      schemaId: schemaId,
      dataRegistryId: testId
    });
  });

  it('create a structured data - rest endpoint', async () => {
    let recResult, error;
    let resp = null;
    const id = uuid.v4();
    const spotTime = moment().unix();
    const payload = {
      rest: 'test',
      spot_id: id,
      start_time: spotTime,
      spot_length: 10
    };

    const url = restUrl + `?token=${ingestionToken}`;
    resp = await helpers.postRetry(
      url,
      payload,
      helpers.requestOptions(ingestionToken),
      1
    );
    expect(resp).toBeDefined();
    if (resp.status !== 200 && resp.status !== 204) {
      error = new Error(`Server response error: ${resp.status}`);
    }
    expect(error).toBeUndefined();
    expect(resp.body).toBeDefined();
    let body = resp.body;
    if (typeof body === 'string') {
      body = JSON.parse(resp.body);
    }
    expect(body).toBeDefined();
    expect(body.length).toBeDefined();
    expect(body.length).toEqual(1);
    recResult = body[0];
    const data = recResult.data;
    expect(data.rest).toEqual('test');
    expect(data.spot_id).toEqual(id);
    expect(data.start_time).toEqual(spotTime);
    expect(data.spot_length).toEqual(10);
  });

  it('create a structured data - rest endpoint large payload', async () => {
    let payload = '<data>';

    for (let i = 0; i < 10000; i++) {
      payload += `<item>
         <number>${i}</number>
         <id>${uuid.v4()}</id>
         <startDate>${new Date().toLocaleDateString()}</startDate>
         <endDate>${new Date().toLocaleDateString()}</endDate>
         </item>`;
    }
    payload += '</data>';

    const url = restUrl + `?token=${ingestionToken}`;
    await supertest(url)
      .post('')
      .set('Content-Type', 'text/plain')
      .send(payload)
      .expect(200);
  });

  it('create a structured data - rest endpoint large payload', async () => {
    let payload = '<data>';

    for (let i = 0; i < 10000; i++) {
      payload += `<item>
         <number>${i}</number>
         <id>${uuid.v4()}</id>
         <startDate>${new Date().toLocaleDateString()}</startDate>
         <endDate>${new Date().toLocaleDateString()}</endDate>
         </item>`;
    }
    payload += '</data>';

    const url = restUrl + `?token=${ingestionToken}`;
    await supertest(url)
      .post('')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(payload)
      .expect(200);
  });

  it('should fail unauthorized create a structured data - rest endpoint', async () => {
    let error;
    let resp;

    const payload = {
      data: [
        {
          rest: 'test'
        }
      ]
    };

    const url = restUrl + `?token=NOTATOKEN`;
    try {
      resp = await helpers.postRetry(
        url,
        payload,
        helpers.requestOptions('NOTATOKEN'),
        1
      );
    } catch (ex) {
      error = ex;
    }
    expect(error).toBeUndefined();
    expect(resp).toBeDefined();
    expect(resp.body).toBeDefined();
    let body = resp.body;
    if (typeof body === 'string') {
      body = JSON.parse(resp.body);
    }
    expect(body.errors).toBeDefined();
    expect(body.errors.length > 0).toEqual(true);
    const firstError = body.errors[0];
    expect(firstError).toBeDefined();
    expect(firstError.status).toEqual(401);
    expect(firstError.name).toEqual(`not_allowed`);
    expect(firstError.message).toContain(
      `The request did not contain a valid authentication token. If a token was passed in the Authorization header, it may be expired.`
    );
  });

  it('get a structured data - basic', async () => {
    // Note this only works if core-eventing is running
    let recResult;

    const query = `query {
        structuredData(
          id: "${testId}"
          schemaId: "${schemaId}"
        ) {
            id
            dataString
        }
        structuredDataObject(
          id: "${testId}"
          schemaId: "${schemaId}"
        ) {
            id
            dataString
            foo: data(path:"foo")
            schema {
              structuredDataObjects(limit:1) {
                count
                records {
                  id
                }
              }
            }
        }

      }
      `;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    expect(recResult.structuredData).toBeDefined();
    expect(recResult.structuredDataObject).toBeDefined();
    expect(
      recResult.structuredDataObject.schema.structuredDataObjects.records
    ).toBeDefined();

    expect(recResult.structuredData.id).toEqual(testId);
    expect(_.get(recResult, 'structuredDataObject.foo')).toEqual('bar');
    let testData = null;
    try {
      testData = JSON.parse(recResult.structuredData.dataString);
    } catch (err) {
      console.log(err);
    }
    expect(testData).toBeDefined();
  });

  it('get structured datas - ids', async () => {
    // Note this only works if core-eventing is running
    let recResult;
    let data = null;

    const query = `query ($ids: [ID!]) {
      structuredDataObjects(
        schemaId: "${schemaId}"
        ids: $ids
      ) {
        count
        records {
          id
          dataString
        }
      }
    }
    `;

    const variables = {
      ids: [testId]
    };

    recResult = await gqlClient.query(query, variables);
    expect(recResult).toBeDefined();
    data = recResult.structuredDataObjects;
    expect(data).toBeDefined();

    expect(data.records).toBeDefined();
    expect(data.records.length > 0).toEqual(true);
    expect(data.records.length).toEqual(data.count);

    let testData = null;
    try {
      testData = JSON.parse(data.records[0].dataString);
    } catch (err) {
      console.log(err);
    }
    expect(testData).toBeDefined();
  });

  it('get a structured datas - filter', async () => {
    // Note this only works if core-eventing is running
    let recResult;
    let data = null;

    const query = `query ($filter: JSONData!) {
      structuredDataObjects(
        schemaId: "${schemaId}"
        filter: $filter
      ) {
        records {
          id
          dataString
        }
      }
    }
    `;

    const variables = {
      filter: {
        foo: {
          eq: 'bar'
        }
      }
    };

    recResult = await gqlClient.query(query, variables);
    expect(recResult).toBeDefined();
    data = recResult.structuredDataObjects;
    expect(data).toBeDefined();
    expect(data.records).toBeDefined();
    expect(data.records.length > 0).toEqual(true);
    let testData = null;
    try {
      testData = JSON.parse(data.records[0].dataString);
    } catch (err) {
      console.log(err);
    }
    expect(testData).toBeDefined();
  });

  it('get a structured datas - date filter by modifiedAt ', async () => {
    const toDateTime = new Date().toISOString();
    const query = `query {
      structuredDataObjects(
        schemaId: "${schemaId}"
        dateTimeFilter: {
          field: modifiedAt
          toDateTime: "${toDateTime}"
        }
      ) {
        records {
          id
          dataString
        }
      }
    }
    `;
    const res = await gqlClient.query(query);
    expect(res).toBeDefined();
    const structuredDataObjects = res.structuredDataObjects;
    expect(structuredDataObjects).toBeDefined();
    expect(structuredDataObjects.records).toBeDefined();
  });

  it('get a structured datas - date filter by createdAt', async () => {
    const toDateTime = new Date().toISOString();
    const query = `query {
      structuredDataObjects(
        schemaId: "${schemaId}" 
        dateTimeFilter: {
          field: createdAt
          toDateTime: "${toDateTime}"
        }
      ) {
        records {
          id
          dataString
        }
      }
    }
    `;
    const res = await gqlClient.query(query);
    expect(res).toBeDefined();
    const structuredDataObjects = res.structuredDataObjects;
    expect(structuredDataObjects).toBeDefined();
    expect(structuredDataObjects.records).toBeDefined();
  });

  it('get structured datas - orderBy', async () => {
    // Note this only works if core-eventing is running
    let recResult;
    let data = null;

    const query = `query {
      structuredDataObjects(
        schemaId: "${schemaId}"
      ) {
        records {
          id
          createdDateTime
        }
      }
    }
    `;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    data = recResult.structuredDataObjects;
    expect(data).toBeDefined();
    expect(data.records).toBeDefined();
    expect(data.records.length > 0).toEqual(true);

    let testData = { isOrdered: true, lastDate: '9999' };
    testData = data.records.reduce(function (acc, r) {
      const lastDate = r.createdDateTime;
      const isOrdered = acc.lastDate.localeCompare(lastDate) > -1;
      return { isOrdered: acc.isOrdered && isOrdered, lastDate: lastDate };
    }, testData);
    expect(testData.isOrdered).toEqual(true);
  });

  it('delete structured data', async () => {
    // Note this only works if core-eventing is running
    let recResult;
    let data = null;

    const query = `mutation {
      deleteStructuredData(input: {
        schemaId: "${schemaId}"
        id: "${testId}"
      }) {
        id
      }
    }
    `;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    data = recResult.deleteStructuredData;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
  });

  it('upsert another schema draft after publishing - incompatible', async () => {
    let recResult, data;

    const query = `mutation {
      upsertSchemaDraft (
        input:{
          dataRegistryId: "${dataRegistryId}",
          schema: {
            test: "citest",
            properties: {
              anotherField: true,
              numbers: 1
            }
          }
        }) {
        id
        dataRegistryId
        status
        majorVersion
        minorVersion
        definition
        validActions
      }
    }`;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    data = recResult.upsertSchemaDraft;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.dataRegistryId).toEqual(dataRegistryId);
    expect(data.status).toEqual('draft');
    expect(data.validActions).toEqual(['view', 'edit', 'publish', 'delete']);
    incompatibleSchemaId = data.id;

    createdTestData.push({
      schemaId: incompatibleSchemaId,
      dataRegistryId: testId
    });
  });

  it('publish a schema draft incompatible', async () => {
    let recResult, errors, data;

    const query = `mutation {
      updateSchemaState(input: {
        id:"${incompatibleSchemaId}",
        status: published,
        breakingChanges: false
      }) {
        id
        status
        createdDateTime
        modifiedDateTime
        validActions
      }
    }`;

    try {
      recResult = await gqlClient.query(query);
      expect(recResult).toBeDefined();
      data = recResult.updateSchemaState;
      expect(data).toBeDefined();
    } catch (ex) {
      errors = ex;
    }
    expect(errors).toBeDefined();
  });

  it('Ingest SDOs into the non-published schema', async () => {
    var recResult;
    var errors = null;
    var data = null;

    var query = `mutation {
      createStructuredData(input: {
        schemaId: "${incompatibleSchemaId}"
        data: {
          foo: "bar"
        }
      }) {
        id
      data
      dataString
      schemaId
      modifiedDateTime
      createdDateTime
      }
    }
    `;
    try {
      recResult = await gqlClient.query(query);
      expect(recResult).toBeDefined();
      data = recResult.createStructuredData;
      expect(data).toBeDefined();
    } catch (ex) {
      errors = ex;
    }
    expect(errors).toBeDefined();
  });

  it('publish a schema draft incompatible with breakingChanges', async () => {
    let recResult, data;

    const query = `mutation {
      updateSchemaState(input: {
        id:"${incompatibleSchemaId}",
        status: published,
        breakingChanges: true
      }) {
        id
        status
        createdDateTime
        modifiedDateTime
        validActions
      }
    }`;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    data = recResult.updateSchemaState;
    expect(data).toBeDefined();
    expect(data.id).toEqual(incompatibleSchemaId);
    expect(data.status).toEqual('published');
    expect(data.createdDateTime).toBeDefined();
    expect(data.modifiedDateTime).toBeDefined();
    expect(data.validActions).toEqual(['view', 'edit', 'deactivate', 'delete']);
  });

  it('get data registries with sorted schemas', async () => {
    let recResult, dataRegistries;

    const query = `query {
      dataRegistries(id:"${dataRegistryId}") {
        records {
          id
          name
          schemas  (
            orderBy: [
            {field: majorVersion, direction: asc},
            {field: minorVersion, direction:desc}
          ]
        ) {
            records {
              id
              majorVersion
              minorVersion
              status
              createdDateTime
            }
          }
        }
      }
    }`;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    expect(recResult.dataRegistries).toBeDefined();
    expect(recResult.dataRegistries.records.length > 0).toEqual(true);
    dataRegistries = recResult.dataRegistries.records[0];
    expect(dataRegistries).toBeDefined();
    expect(dataRegistries.id).toEqual(dataRegistryId);
    expect(dataRegistries.name).toEqual(dataRegName);
  });

  it('delete draft schema', async () => {
    let recResult, dataRegistries;

    const query = `mutation {
        updateSchemaState(input:{id: "${incompatibleSchemaId}",  status:deleted}) {
          id
          status
        }
      }`;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    dataRegistries = recResult.updateSchemaState;
    expect(dataRegistries).toBeDefined();
    expect(dataRegistries.status).toEqual('deleted');
  });

  it('detete schemas: should get schemas and delete if not necessary', async () => {
    const schemasQuery = `query {
      schemas(dataRegistryId: "${dataRegistryId}") {
        count
        records {
          id
        }
      }
    }`;
    const respObj = await gqlClient.query(schemasQuery, options);
    expect(respObj).toBeDefined();
    const schemas = respObj.schemas;
    expect(schemas).toBeDefined();

    // Skip deleting if there is only one schema left because deleting the last schema will also delete the data registry.
    if (schemas.count > 1) {
      const deleteSchemaQuery = `mutation {
          updateSchemaState(input:{id: "${schemaId}",  status:deleted}) {
            id
            status
          }
        }`;

      const deleteSchemaResult = await gqlClient.query(deleteSchemaQuery);
      expect(deleteSchemaResult).toBeDefined();
      const deletedSchema = deleteSchemaResult.updateSchemaState;
      expect(deletedSchema).toBeDefined();
      expect(deletedSchema.status).toEqual('deleted');
    }
  });

  it('get data registries', async () => {
    let recResult, dataRegistries;

    const query = `query {
        dataRegistries (id: "${dataRegistryId}") {
          count
          records {
            id
            name
            description
            source
            createdBy {
              id
              name
            }
          }
        }
      }`;

    recResult = await gqlClient.query(query);
    expect(recResult).toBeDefined();
    dataRegistries = recResult.dataRegistries;
    expect(dataRegistries).toBeDefined();
    expect(dataRegistries.records).toBeDefined();
    expect(dataRegistries.records.length > 0).toEqual(true);
    expect(dataRegistries.records[0].id).toEqual(dataRegistryId);
  });

  describe('redis cache: schema status', () => {
    let dataRegistryId, schemaId, options, orgId, dataRegName;
    beforeAll(async () => {
      const result = await gqlClient.connect();
      expect(result.apiToken).toBeDefined();
      expect(result.token).toBeDefined();
      options = helpers.requestOptions(result.token);
      orgId = result.organizationId;
      dataRegName = citestMarker + '-registry-cache-unix-name-in-org-' + orgId;

      const testRegistry = await getOrCreateRegistryByName(dataRegName, true);
      expect(testRegistry).toBeDefined();
      expect(testRegistry.errors).toBeUndefined();
      // registry
      expect(testRegistry.dataRegistry).toBeDefined();
      expect(testRegistry.dataRegistry.id).toBeDefined();
      // draft schema
      expect(testRegistry.draftSchema).toBeDefined();
      expect(testRegistry.draftSchema.id).toBeDefined();
      expect(testRegistry.draftSchema.dataRegistryId).toEqual(
        testRegistry.dataRegistry.id
      );

      expect(_.get(testRegistry, 'dataRegistry.organization.id')).toEqual(
        orgId.toString()
      );
      // store id for other tests
      dataRegistryId = testRegistry.dataRegistry.id;
      schemaId = testRegistry.draftSchema.id;
    });

    it('get the draft schema', async () => {
      const query = `query {
        schema(id: "${schemaId}"){
          id
          dataRegistryId
          definition
          status
          validActions
          dataRegistry {
            id
          }
        }
      }
      `;

      const recResult = await gqlClient.query(query);
      const schemaResult = _.get(recResult, 'schema');
      expect(schemaResult).toBeDefined();
      expect(schemaResult.status).toEqual('draft');
      expect(schemaResult.definition).toEqual(schema);
      expect(schemaResult.dataRegistry).toBeDefined();
      expect(_.get(schemaResult, 'dataRegistry.id')).toEqual(dataRegistryId);
    });

    it('should throw an error when creating a structured data if the schema is not published', async () => {
      var recResult, error;

      const query = `mutation {
        createStructuredData(input: {
          schemaId: "${schemaId}"
          data: {
            foo: "test-error: the schema is not published"
          }
        }) {
          id
          data
          dataString
          schemaId
          modifiedDateTime
          createdDateTime
        }
      }
      `;
      try {
        recResult = await gqlClient.query(query);
        expect(recResult).toBeDefined();
      } catch (ex) {
        error = ex;
      }

      expect(error).toBeDefined();
      expect(`${error}`).toContain(`invalid_input`);
      expect(`${error}`).toContain(`The schema is not in a published state`);
    });

    it('publish the new schema draft to test schema state', async () => {
      const query = `mutation {
        updateSchemaState(input: {
          id:"${schemaId}",
          status: published,
          breakingChanges: false
        }) {
          id
          status
          createdDateTime
          modifiedDateTime
          validActions
        }
      }`;

      const recResult = await gqlClient.query(query);
      const updateSchemaState = _.get(recResult, 'updateSchemaState');
      expect(updateSchemaState).toBeDefined();
      expect(updateSchemaState.id).toEqual(schemaId);
      expect(updateSchemaState.status).toEqual('published');
      expect(updateSchemaState.createdDateTime).toBeDefined();
      expect(updateSchemaState.modifiedDateTime).toBeDefined();
      expect(updateSchemaState.validActions).toEqual([
        'view',
        'edit',
        'deactivate',
        'delete'
      ]);
    });

    it('should not throw an error when creating a structured data if the schema is published', async () => {
      // use a loop to use load balancer
      for (let i = 0; i < 5; i++) {
        var recResult, error;
        const query = `mutation {
            createStructuredData(input: {
              schemaId: "${schemaId}"
              data: {
                foo: "[${i}] test-schema status: the schema is published"
              }
            }) {
              id
              data
              dataString
              schemaId
              modifiedDateTime
              createdDateTime
            }
          }
          `;
        try {
          recResult = await gqlClient.query(query);
          expect(recResult).toBeDefined();
        } catch (ex) {
          error = ex;
        }

        expect(error).toBeUndefined();
        expect(recResult.createStructuredData.id).toBeDefined();
        expect(recResult.createStructuredData.schemaId).toEqual(schemaId);
        createdTestData.push({
          schemaId: schemaId,
          dataRegistryId: recResult.createStructuredData.id
        });
      }
    });
  });

  async function getSchemaPropertiesSharedBefore(searchTerm) {
    const query = `query sp {
    schemaProperties(search: "${searchTerm}", offset: 0, dataRegistryVersion:{ id: "${dataRegistryId}", majorVersion: 1}) {
      records {
        type
        path
        searchPath
        title
        schema {
          id
          dataRegistry {
            name
            organization {
              id
              name
            }
          }
        }
      }
      limit
      offset
      count
    }
  }`;
    return await gqlClient.query(query);
  }

  function getSchemaPropertiesSharedAssertions(recResult) {
    const schemaProperties = _.get(recResult, 'schemaProperties');
    expect(schemaProperties).toBeDefined();
    expect(schemaProperties.records).toBeDefined();
    expect(schemaProperties.records.length).not.toEqual(0);
    const schemaProperty = schemaProperties.records[0];
    expect(schemaProperty.type).toEqual('string');
    expect(schemaProperty.title).toEqual(propertyTitle);
    expect(schemaProperty.path).toBeDefined();
    expect(schemaProperty.searchPath).toContain(schemaProperty.path);
    expect(schemaProperty.schema.dataRegistry.name).toEqual(dataRegName);
    expect(schemaProperty.schema.dataRegistry.organization.id).toEqual(
      _.toString(orgId)
    );
  }
});

/**
 * get or create a registry for testing
 * @param {*} dataRegName the name of registry
 * @param {*} upsertSchemaDraft create a draft schema or not: true/ false. Default value is false
 * @returns {object}: { dataRegistry: object, errors: any }
 */
async function getOrCreateRegistryByName(
  dataRegName,
  upsertSchemaDraft = false
) {
  const result = {
    dataRegistry: null,
    draftSchema: null,
    errors: null
  };

  // get data registries by unix name create if not exist
  const dataRegistriesQuery = `query {
      dataRegistries (name: "${dataRegName}" nameMatch: exact) {
        count
        records {
          id
          name
          description
          source
          schemas {
            records {
              id
              definition
            }
          }
          publishedSchema {
            id
          }
          organization {
            id
          }
        }
      }
    }`;
  const respObj = await gqlClient.query(dataRegistriesQuery);
  result.errors = respObj.errors;
  if (respObj.errors) {
    result.errors = respObj.errors;
    return result;
  }

  result.dataRegistry = _.get(respObj, 'dataRegistries.records[0]');
  if (!_.isNil(result.dataRegistry) && !_.isNil(result.dataRegistry.id)) {
    //console.log('exist data registry', result.dataRegistry.id);
  } else {
    // create data registries if not exit
    const createDataRegistryQuery = `mutation {
        createDataRegistry(
          input:{
            name: "${dataRegName}",
            description:"citest description"
            source: "Some url"
          }) {
          id
          name
          description
          source
          schemas {
            records {
              id
              definition
            }
          }
          publishedSchema {
            id
          }
          organization {
            id
          }
        }
      }`;

    const createResult = await gqlClient.query(createDataRegistryQuery);
    if (createResult.errors) {
      result.errors = createResult.errors;
      return result;
    }

    result.dataRegistry = _.get(createResult, 'createDataRegistry');
  }

  // create a draft schema
  if (upsertSchemaDraft === true) {
    const query = `mutation ($schema: JSONData!) {
      upsertSchemaDraft (
        input:{
          dataRegistryId: "${result.dataRegistry.id}",
          schema: $schema
        }) {
        id
        dataRegistryId
        status
        majorVersion
        minorVersion
        definition
        validActions
        organizationId
        organization {
          id
        }
      }
    }`;

    const variables = { schema };

    const recResult = await gqlClient.query(query, variables);
    createdTestData.push({
      schemaId: recResult.upsertSchemaDraft.id,
      dataRegistryId: result.dataRegistry.id
    });

    result.draftSchema = _.get(recResult, 'upsertSchemaDraft');
  }

  return result;
}
