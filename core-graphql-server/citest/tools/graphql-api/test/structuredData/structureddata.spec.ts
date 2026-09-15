import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';
import moment from 'moment';
import supertest from 'supertest';

import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import {
  OrganizationType,
  OrganizationStatus,
  SchemaStatus,
  SdoDateTimeField,
  StringMatch,
  SchemaOwnership
} from '../../src/gql';

const config = helpers.config;
const env = config.env;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const restUrl =
  config.structured_data_url ||
  `https://api.${env}.veritone.com/v3/structured-data`;
const testId = uuidv4();

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

let sdkClient: GraphqlClient;
let orgId: string;
let dataRegName: string;
let dataRegistryId: string;
let schemaId: string;
let schemaId2: string | undefined;
let latestDraftSchema: string;
let incompatibleSchemaId: string;
let ingestionToken: string;
let sharedDataRegistry: any;

let testUserOption: Record<string, string>;
let sharedOrgId: string;
let sharedUserId: string;
let sharedDataRegistryId: string;
let sharedSchemaId: string;
const createdTestData: Array<{ schemaId: string; dataRegistryId: string }> = [];

describe('citest_structureddata:', () => {
  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    const me = await sdkClient.sdk.me();
    expect(me.data.me).toBeDefined();
    orgId = _.get(me, 'data.me.organization.id', '');
    dataRegName = citestMarker + '-registry-unix-name-in-org-' + orgId;

    const testRegistry = await getOrCreateRegistryByName(dataRegName);
    expect(testRegistry).toBeDefined();
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
        await safe(`delete schema ${rec}`, () =>
          sdkClient.sdk.updateSchemaState({
            input: { id: rec, status: SchemaStatus.Deleted }
          })
        );
      }
    }
  });

  it('update a data registry', async () => {
    const res = await sdkClient.sdk.updateDataRegistry({
      input: {
        id: dataRegistryId,
        name: dataRegName,
        description: 'updated citest description',
        source: 'Some other url'
      }
    });
    const updateDataRegistry = res.data.updateDataRegistry;

    expect(updateDataRegistry).toBeDefined();
    expect(updateDataRegistry?.id).toEqual(dataRegistryId);
    expect(updateDataRegistry?.name).toEqual(dataRegName);
    expect(updateDataRegistry?.createdDateTime).toBeDefined();
    expect(updateDataRegistry?.createdDateTime).not.toEqual(
      updateDataRegistry?.modifiedDateTime
    );
    expect(updateDataRegistry?.organization?.id).toEqual(orgId.toString());
    ingestionToken = updateDataRegistry?.ingestionToken ?? '';
    expect(ingestionToken).toBeDefined();
  });

  it('get data registries', async () => {
    const prefix = `${dataRegName}`.substring(0, 14);
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

    const recResult: any = await sdkClient.query(query);
    const dataRegistries = _.get(recResult, 'dataRegistries.records[0]');
    expect(_.get(recResult, 'byNameNoMatch.count')).toEqual(0);
    expect(_.get(recResult, 'byNameEndsWith.count')).toEqual(1);
    expect(_.get(recResult, 'byNameStartsWith.count')).toEqual(1);
    expect(_.get(recResult, 'byNameContains.count')).toEqual(1);
    expect(_.get(recResult, 'byNameExact.count')).toEqual(1);
    expect(dataRegistries.name).toEqual(dataRegName);
    expect(dataRegistries.createdBy.name).toBeDefined();
  });

  it('get data registries limit offset', async () => {
    const res = await sdkClient.sdk.dataRegistries({
      limit: 2,
      offset: 2,
      schemaLimit: 1
    });
    const dataRegistries = res.data.dataRegistries;
    expect(dataRegistries).toBeDefined();
    expect(dataRegistries?.records?.length).toEqual(2);
    expect(dataRegistries?.count).toBeGreaterThan(1);
    expect(dataRegistries?.offset).toEqual(2);
    expect(dataRegistries?.records?.[0]?.organization?.id).toBeDefined();
  });

  it('create published registry', async () => {
    const timeStamp = Date.now();
    const ADMIN_ROLE = '032218c3-d47e-4287-9d16-7bb867c01266';
    const testUserPassword = 'testUserPassword';

    const orgRes = await sdkClient.sdk.createOrganization({
      input: {
        name: `${citestMarker}-org-for-reg-${timeStamp}`,
        businessUnit: 'Legal',
        types: [OrganizationType.Agency, OrganizationType.Broadcaster],
        metadata: {
          features: {
            enableRBACFeature: 'enabled'
          }
        },
        applications: [
          {
            applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
            applicationKey: 'cms'
          },
          ...(isDesktopAppEnabled
            ? []
            : [
                {
                  applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
                  applicationKey: 'admin'
                }
              ]),
          {
            applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
            applicationKey: 'developer'
          },
          {
            applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
            applicationKey: 'discovery'
          }
        ]
      }
    });

    const org = orgRes.data.createOrganization;
    expect(org?.id).toBeDefined();
    expect(org?.guid).toBeDefined();
    sharedOrgId = org!.id;
    const orgGuid = org!.guid!;

    const userRes = await sdkClient.sdk.createUser({
      input: {
        name: `${citestMarker}-user-${timeStamp}`,
        password: testUserPassword,
        organizationId: sharedOrgId,
        roleIds: [ADMIN_ROLE],
        firstName: 'RBAC-User',
        lastName: 'Regular',
        jsondata: {
          firstName: 'RBAC-User',
          lastName: 'Regular'
        }
      }
    });

    const newAdmin = userRes.data.createUser;
    expect(newAdmin?.id).toBeDefined();
    expect(newAdmin?.name).toBeDefined();
    const testUserName = newAdmin!.name;
    sharedUserId = newAdmin!.id;

    const loginRes = await sdkClient.sdk.userLogin({
      input: {
        userName: testUserName,
        password: testUserPassword,
        organizationGuid: orgGuid
      }
    });
    expect(loginRes.data.userLogin?.token).toBeDefined();
    const userToken = loginRes.data.userLogin!.token!;
    testUserOption = helpers.requestOptions(userToken).headers as Record<
      string,
      string
    >;

    const createResult = await sdkClient.sdk.createDataRegistry(
      {
        input: {
          name: `${citestMarker}-create-reg-${timeStamp}`,
          description: 'citest description',
          source: 'Some url',
          isPublic: true
        }
      },
      testUserOption
    );
    expect(createResult.data.createDataRegistry?.id).toBeDefined();
    sharedDataRegistryId = createResult.data.createDataRegistry!.id;

    const schemaRes = await sdkClient.sdk.upsertSchemaDraft(
      {
        input: {
          dataRegistryId: sharedDataRegistryId,
          schema
        }
      },
      testUserOption
    );
    const upsertSchemaDraft = schemaRes.data.upsertSchemaDraft;
    expect(upsertSchemaDraft).toBeDefined();
    sharedSchemaId = upsertSchemaDraft!.id;
    expect(sharedSchemaId).toBeDefined();
    expect(upsertSchemaDraft!.dataRegistryId).toEqual(sharedDataRegistryId);
    expect(upsertSchemaDraft!.status).toEqual(SchemaStatus.Draft);
    expect(upsertSchemaDraft!.definition).toEqual(schema);
    expect(upsertSchemaDraft!.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);
    expect(upsertSchemaDraft!.organizationId).toEqual(sharedOrgId.toString());
    expect(upsertSchemaDraft!.organization?.id).toEqual(sharedOrgId.toString());

    const publishRes = await sdkClient.sdk.updateSchemaState(
      {
        input: {
          id: sharedSchemaId,
          status: SchemaStatus.Published,
          breakingChanges: false
        }
      },
      testUserOption
    );
    expect(publishRes.data.updateSchemaState?.id).toEqual(sharedSchemaId);
    expect(publishRes.data.updateSchemaState?.status).toEqual(
      SchemaStatus.Published
    );
  });

  it('get shared data registries', async () => {
    const recResult: any = await sdkClient.sdk.dataRegistries({
      filterByOwnership: SchemaOwnership.Others,
      limit: 1
    });

    sharedDataRegistry = _.get(recResult, 'data.dataRegistries.records[0]');

    expect(sharedDataRegistry).toBeDefined();
    expect(_.get(recResult, 'data.dataRegistries.count')).toEqual(1);
    expect(sharedDataRegistry.organizationId).not.toEqual(orgId.toString());
  });

  it('get shared data registry', async () => {
    const res = await sdkClient.sdk.dataRegistry({ id: sharedDataRegistry.id });
    const dataRegistry = res.data.dataRegistry;
    expect(dataRegistry).toBeDefined();
    expect(dataRegistry?.id).toEqual(sharedDataRegistry.id);
    expect(dataRegistry?.name).toEqual(sharedDataRegistry.name);
    expect(dataRegistry?.organizationId).toEqual(
      sharedDataRegistry.organizationId
    );
    expect(dataRegistry?.organizationId).not.toEqual(orgId.toString());
  });

  it('delete created registry data', async () => {
    const schemaData = await sdkClient.sdk.dataRegistry(
      { id: sharedDataRegistryId },
      testUserOption
    );
    const schemas = schemaData.data.dataRegistry?.schemas?.records ?? [];

    // delete schema + registry
    for (const rec of schemas) {
      const deleteSDO = await sdkClient.sdk.updateSchemaState(
        {
          input: { id: rec!.id, status: SchemaStatus.Deleted }
        },
        testUserOption
      );
      expect(deleteSDO.data.updateSchemaState?.id).toEqual(rec!.id);
    }

    const deleteUserRes = await sdkClient.sdk.deleteUser({
      id: sharedUserId
    });
    expect(deleteUserRes.data.deleteUser?.id).toEqual(sharedUserId);

    const deleteOrgRes = await sdkClient.sdk.updateOrganization({
      input: {
        id: sharedOrgId,
        status: OrganizationStatus.Deleted
      }
    });
    expect(deleteOrgRes.data.updateOrganization?.id).toEqual(sharedOrgId);
  });

  it('upsert a schema draft with none exist dataRegistryId', async () => {
    const noneExitId = uuidv4();
    let error: any;

    try {
      await sdkClient.sdk.upsertSchemaDraft({
        input: { dataRegistryId: noneExitId, schema }
      });
    } catch (ex) {
      error = ex;
    }

    expect(error).toBeDefined();
    expect(`${error}`).toContain(`The requested object was not found`);
    expect(`${error}`).toContain(`not_found`);
  });

  it('upsert a schema draft', async () => {
    const res = await sdkClient.sdk.upsertSchemaDraft({
      input: { dataRegistryId, schema }
    });
    const upsertSchemaDraft = res.data.upsertSchemaDraft;
    expect(upsertSchemaDraft).toBeDefined();
    schemaId = upsertSchemaDraft!.id;
    createdTestData.push({ schemaId, dataRegistryId });

    expect(schemaId).toBeDefined();
    expect(upsertSchemaDraft!.dataRegistryId).toEqual(dataRegistryId);
    expect(upsertSchemaDraft!.status).toEqual(SchemaStatus.Draft);
    expect(upsertSchemaDraft!.definition).toEqual(schema);
    expect(upsertSchemaDraft!.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);
    expect(upsertSchemaDraft!.organizationId).toEqual(orgId.toString());
    expect(upsertSchemaDraft!.organization?.id).toEqual(orgId.toString());
  });

  it('publish a schema draft with none exit id', async () => {
    const noneExitId = uuidv4();
    let error: any;

    try {
      await sdkClient.sdk.updateSchemaState({
        input: {
          id: noneExitId,
          status: SchemaStatus.Published,
          breakingChanges: false
        }
      });
    } catch (ex) {
      error = ex;
    }
    expect(error).toBeDefined();
    expect(`${error}`).toContain(`The requested object was not found`);
    expect(`${error}`).toContain(`not_found`);
  });

  it('publish a schema draft', async () => {
    const res = await sdkClient.sdk.updateSchemaState({
      input: {
        id: schemaId,
        status: SchemaStatus.Published,
        breakingChanges: false
      }
    });
    const updateSchemaState = res.data.updateSchemaState;
    expect(updateSchemaState).toBeDefined();
    expect(updateSchemaState?.id).toEqual(schemaId);
    expect(updateSchemaState?.status).toEqual('published');
    expect(updateSchemaState?.createdDateTime).toBeDefined();
    expect(updateSchemaState?.modifiedDateTime).toBeDefined();
    expect(updateSchemaState?.validActions).toEqual([
      'view',
      'edit',
      'deactivate',
      'delete'
    ]);
  });

  it('upsert a new schema draft to test schema state', async () => {
    const res = await sdkClient.sdk.upsertSchemaDraft({
      input: { dataRegistryId, schema }
    });
    const upsertSchemaDraft = res.data.upsertSchemaDraft;
    expect(upsertSchemaDraft).toBeDefined();
    schemaId2 = upsertSchemaDraft!.id;

    createdTestData.push({ schemaId: schemaId2, dataRegistryId });

    expect(schemaId2).toBeDefined();
    expect(upsertSchemaDraft!.dataRegistryId).toEqual(dataRegistryId);
    expect(upsertSchemaDraft!.status).toEqual(SchemaStatus.Draft);
    expect(upsertSchemaDraft!.definition).toEqual(schema);
    expect(upsertSchemaDraft!.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);
    expect(upsertSchemaDraft!.organizationId).toEqual(orgId.toString());
    expect(upsertSchemaDraft!.organization?.id).toEqual(orgId.toString());
    expect(upsertSchemaDraft!.majorVersion).toEqual(1);
    expect(upsertSchemaDraft!.minorVersion).toEqual(1);

    // also verify that only one draft was created
    const schemaCountRes = await sdkClient.sdk.getSchemas({
      dataRegistryId,
      status: [SchemaStatus.Draft]
    });
    expect(schemaCountRes.data.schemas?.count).toEqual(1);
  });

  it('publish the new schema draft to test schema state', async () => {
    const res = await sdkClient.sdk.updateSchemaState({
      input: {
        id: schemaId2!,
        status: SchemaStatus.Published,
        breakingChanges: false
      }
    });
    const updateSchemaState = res.data.updateSchemaState;
    expect(updateSchemaState).toBeDefined();
    expect(updateSchemaState?.id).toEqual(schemaId2);
    expect(updateSchemaState?.status).toEqual('published');
    expect(updateSchemaState?.createdDateTime).toBeDefined();
    expect(updateSchemaState?.modifiedDateTime).toBeDefined();
    expect(updateSchemaState?.validActions).toEqual([
      'view',
      'edit',
      'deactivate',
      'delete'
    ]);
  });

  it('the older schema"s state should be inactive', async () => {
    const res = await sdkClient.sdk.schema({ id: schemaId });
    const schemaResult = res.data.schema;
    expect(schemaResult).toBeDefined();
    expect(schemaResult!.id).toEqual(schemaId);

    // reset the latest schema
    schemaId = schemaId2!;

    expect(schemaResult!.createdDateTime).toBeDefined();
    expect(schemaResult!.modifiedDateTime).toBeDefined();
    expect(schemaResult!.status).toEqual(SchemaStatus.Inactive); // This might be failed if the new changes are not deployed.
  });

  it('upsert a new schema draft with higher major version than published', async () => {
    const res = await sdkClient.sdk.upsertSchemaDraft({
      input: {
        dataRegistryId,
        majorVersion: 2,
        schema
      }
    });
    const upsertSchemaDraft = res.data.upsertSchemaDraft;
    expect(upsertSchemaDraft).toBeDefined();
    latestDraftSchema = upsertSchemaDraft!.id;

    createdTestData.push({ schemaId: latestDraftSchema, dataRegistryId });

    expect(latestDraftSchema).toBeDefined();
    expect(upsertSchemaDraft!.dataRegistryId).toEqual(dataRegistryId);
    expect(upsertSchemaDraft!.status).toEqual(SchemaStatus.Draft);
    expect(upsertSchemaDraft!.definition).toEqual(schema);
    expect(upsertSchemaDraft!.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);
    expect(upsertSchemaDraft!.organizationId).toEqual(orgId.toString());
    expect(upsertSchemaDraft!.organization?.id).toEqual(orgId.toString());
    expect(upsertSchemaDraft!.majorVersion).toEqual(1);
    expect(upsertSchemaDraft!.minorVersion).toEqual(2);

    // also verify that only one draft was created
    const schemaCountRes = await sdkClient.sdk.getSchemas({
      dataRegistryId,
      status: [SchemaStatus.Draft]
    });
    expect(schemaCountRes.data.schemas?.count).toEqual(1);
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
    const recResult: any = await sdkClient.sdk.schema({
      id: schemaId
    });

    const schemaResult = _.get(recResult, 'data.schema');
    expect(schemaResult).toBeDefined();
    expect(schemaResult.status).toEqual('published');
    expect(schemaResult.definition).toEqual(schema);
    expect(_.get(schemaResult, 'dataRegistry.id')).toBeDefined();
    expect(_.get(schemaResult, 'dataRegistry.publishedSchema.id')).toEqual(
      schemaId
    );
  });

  it('get schemas', async () => {
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

    const recResult: any = await sdkClient.query(query);
    expect(recResult).toBeDefined();
    expect(recResult.byName.records.length > 0).toEqual(true);
    expect(recResult.byIds.records.length > 0).toEqual(true);
    expect(recResult.byName.records[0].id).toEqual(latestDraftSchema);
    expect(recResult.byName.records[0].dataRegistry.name).toEqual(dataRegName);
    expect(recResult.byIds.count).toEqual(1);
    expect(recResult.byIds.records[0].id).toEqual(schemaId);
  });

  it('create a structured data - basic', async () => {
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
    let error: any;
    try {
      await sdkClient.query(query);
    } catch (ex) {
      error = ex;
    }

    expect(error).toBeDefined();
    expect(`${error}`).toContain(`invalid_input`);
    expect(`${error}`).toContain(`The provided JSON had validation errors.`);
    expect(`${error}`).toContain(`instance.foo is not of a type(s) string`);
  });

  it('create a structured data - force ID and from string', async () => {
    const recResult: any = await sdkClient.sdk.createStructuredData({
      input: {
        id: testId,
        schemaId: schemaId,
        dataString: `{ "foo": "bar" }`
      }
    });

    expect(recResult).toBeDefined();
    const createStructuredData = _.get(recResult, 'data.createStructuredData');
    expect(createStructuredData).toBeDefined();
    let testData = null;
    try {
      testData = JSON.parse(createStructuredData.dataString);
    } catch (err) {
      console.log(err);
    }
    expect(testData).toBeDefined();

    createdTestData.push({
      schemaId,
      dataRegistryId: testId
    });
  });

  it('create a structured data - rest endpoint', async () => {
    let error: any;
    const id = uuidv4();
    const spotTime = moment().unix();
    const payload = {
      rest: 'test',
      spot_id: id,
      start_time: spotTime,
      spot_length: 10
    };

    const url = restUrl + `?token=${ingestionToken}`;
    const resp = await helpers.postRetry(
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
    const recResult = body[0];
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
         <id>${uuidv4()}</id>
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

  it('create a structured data - rest endpoint large payload (urlencoded)', async () => {
    let payload = '<data>';

    for (let i = 0; i < 10000; i++) {
      payload += `<item>
         <number>${i}</number>
         <id>${uuidv4()}</id>
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
    let error: any;
    let resp: any;

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
    // Note this only works if core-eventing is running.
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

    const recResult: any = await sdkClient.query(query);
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
    // Note this only works if core-eventing is running.
    const recResult = await sdkClient.sdk.structuredDataObjects({
      schemaId,
      ids: [testId]
    });
    expect(recResult).toBeDefined();
    const data = recResult.data.structuredDataObjects;
    expect(data).toBeDefined();

    expect(data?.records).toBeDefined();
    expect(data!.records!.length > 0).toEqual(true);
    expect(data!.records!.length).toEqual(data!.count);

    let testData = null;
    try {
      testData = JSON.parse(data!.records![0]!.dataString!);
    } catch (err) {
      console.log(err);
    }
    expect(testData).toBeDefined();
  });

  it('get a structured datas - filter', async () => {
    // Note this only works if core-eventing is running.
    const recResult = await sdkClient.sdk.structuredDataObjects({
      schemaId,
      filter: {
        foo: {
          eq: 'bar'
        }
      }
    });
    expect(recResult).toBeDefined();
    const data = recResult.data.structuredDataObjects;
    expect(data).toBeDefined();
    expect(data?.records).toBeDefined();
    expect(data!.records!.length > 0).toEqual(true);
    let testData = null;
    try {
      testData = JSON.parse(data!.records![0]!.dataString!);
    } catch (err) {
      console.log(err);
    }
    expect(testData).toBeDefined();
  });

  it('get a structured datas - date filter by modifiedAt ', async () => {
    const toDateTime = new Date().toISOString();
    const res = await sdkClient.sdk.structuredDataObjects({
      schemaId,
      dateTimeFilter: {
        field: SdoDateTimeField.ModifiedAt,
        toDateTime
      }
    });
    expect(res).toBeDefined();
    const structuredDataObjects = res.data.structuredDataObjects;
    expect(structuredDataObjects).toBeDefined();
    expect(structuredDataObjects?.records).toBeDefined();
  });

  it('get a structured datas - date filter by createdAt', async () => {
    const toDateTime = new Date().toISOString();
    const res = await sdkClient.sdk.structuredDataObjects({
      schemaId,
      dateTimeFilter: {
        field: SdoDateTimeField.CreatedAt,
        toDateTime
      }
    });
    expect(res).toBeDefined();
    const structuredDataObjects = res.data.structuredDataObjects;
    expect(structuredDataObjects).toBeDefined();
    expect(structuredDataObjects?.records).toBeDefined();
  });

  it('get structured datas - orderBy', async () => {
    // Note this only works if core-eventing is running.
    const recResult: any = await sdkClient.sdk.structuredDataObjects({
      schemaId: schemaId
    });

    expect(recResult.data).toBeDefined();
    const data = recResult.data.structuredDataObjects;
    expect(data).toBeDefined();
    expect(data.records).toBeDefined();
    expect(data.records.length > 0).toEqual(true);

    let testData = { isOrdered: true, lastDate: '9999' };
    testData = data.records.reduce(function (acc: any, r: any) {
      const lastDate = r.createdDateTime;
      const isOrdered = acc.lastDate.localeCompare(lastDate) > -1;
      return { isOrdered: acc.isOrdered && isOrdered, lastDate };
    }, testData);
    expect(testData.isOrdered).toEqual(true);
  });

  it('delete structured data', async () => {
    const res = await sdkClient.sdk.deleteStructuredData({
      input: {
        schemaId,
        id: testId
      }
    });
    expect(res.data.deleteStructuredData).toBeDefined();
    expect(res.data.deleteStructuredData?.id).toBeDefined();
  });

  it('upsert another schema draft after publishing - incompatible', async () => {
    const res = await sdkClient.sdk.upsertSchemaDraft({
      input: {
        dataRegistryId,
        schema: {
          test: 'citest',
          properties: {
            anotherField: true,
            numbers: 1
          }
        }
      }
    });
    const data = res.data.upsertSchemaDraft;
    expect(data).toBeDefined();
    expect(data!.id).toBeDefined();
    expect(data!.dataRegistryId).toEqual(dataRegistryId);
    expect(data!.status).toEqual(SchemaStatus.Draft);
    expect(data!.validActions).toEqual(['view', 'edit', 'publish', 'delete']);
    incompatibleSchemaId = data!.id;

    createdTestData.push({
      schemaId: incompatibleSchemaId,
      dataRegistryId: testId
    });
  });

  it('publish a schema draft incompatible', async () => {
    let error: any;

    try {
      const res = await sdkClient.sdk.updateSchemaState({
        input: {
          id: incompatibleSchemaId,
          status: SchemaStatus.Published,
          breakingChanges: false
        }
      });
      expect(res.data.updateSchemaState).toBeDefined();
    } catch (ex) {
      error = ex;
    }
    expect(error).toBeDefined();
  });

  it('Ingest SDOs into the non-published schema', async () => {
    let error: any;

    try {
      const res = await sdkClient.sdk.createStructuredData({
        input: {
          schemaId: incompatibleSchemaId,
          data: { foo: 'bar' }
        }
      });
      expect(res.data.createStructuredData).toBeDefined();
    } catch (ex) {
      error = ex;
    }
    expect(error).toBeDefined();
  });

  it('publish a schema draft incompatible with breakingChanges', async () => {
    const res = await sdkClient.sdk.updateSchemaState({
      input: {
        id: incompatibleSchemaId,
        status: SchemaStatus.Published,
        breakingChanges: true
      }
    });
    expect(res).toBeDefined();
    const data = res.data.updateSchemaState;
    expect(data).toBeDefined();
    expect(data?.id).toEqual(incompatibleSchemaId);
    expect(data?.status).toEqual('published');
    expect(data?.createdDateTime).toBeDefined();
    expect(data?.modifiedDateTime).toBeDefined();
    expect(data?.validActions).toEqual([
      'view',
      'edit',
      'deactivate',
      'delete'
    ]);
  });

  it('get data registries with sorted schemas', async () => {
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

    const recResult: any = await sdkClient.query(query);
    expect(recResult).toBeDefined();
    expect(recResult.dataRegistries).toBeDefined();
    expect(recResult.dataRegistries.records.length > 0).toEqual(true);
    const dataRegistries = recResult.dataRegistries.records[0];
    expect(dataRegistries).toBeDefined();
    expect(dataRegistries.id).toEqual(dataRegistryId);
    expect(dataRegistries.name).toEqual(dataRegName);
  });

  it('delete draft schema', async () => {
    const res = await sdkClient.sdk.updateSchemaState({
      input: { id: incompatibleSchemaId, status: SchemaStatus.Deleted }
    });
    expect(res.data.updateSchemaState).toBeDefined();
    expect(res.data.updateSchemaState?.status).toEqual(SchemaStatus.Deleted);
  });

  it('detete schemas: should get schemas and delete if not necessary', async () => {
    const respObj = await sdkClient.sdk.getSchemas({ dataRegistryId });
    expect(respObj.data.schemas).toBeDefined();
    const schemasCount = respObj.data.schemas?.count ?? 0;

    // Skip deleting if there is only one schema left because deleting the last schema will also delete the data registry.
    if (schemasCount > 1) {
      const deleteSchemaResult = await sdkClient.sdk.updateSchemaState({
        input: { id: schemaId, status: SchemaStatus.Deleted }
      });
      const deletedSchema = deleteSchemaResult.data.updateSchemaState;
      expect(deletedSchema).toBeDefined();
      expect(deletedSchema!.status).toEqual(SchemaStatus.Deleted);
    }
  });

  it('get data registries', async () => {
    const recResult: any = await sdkClient.sdk.dataRegistries({
      id: dataRegistryId
    });

    expect(recResult.data).toBeDefined();
    const dataRegistries = recResult.data.dataRegistries;
    expect(dataRegistries).toBeDefined();
    expect(dataRegistries.records).toBeDefined();
    expect(dataRegistries.records.length > 0).toEqual(true);
    expect(dataRegistries.records[0].id).toEqual(dataRegistryId);
  });

  describe('redis cache: schema status', () => {
    let cacheDataRegistryId: string;
    let cacheSchemaId: string;
    let cacheDataRegName: string;

    beforeAll(async () => {
      cacheDataRegName =
        citestMarker + '-registry-cache-unix-name-in-org-' + orgId;

      const testRegistry = await getOrCreateRegistryByName(
        cacheDataRegName,
        true
      );
      expect(testRegistry).toBeDefined();
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
      cacheDataRegistryId = testRegistry.dataRegistry.id;
      cacheSchemaId = testRegistry.draftSchema.id;
    });

    it('get the draft schema', async () => {
      const query = `query {
        schema(id: "${cacheSchemaId}"){
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

      const recResult: any = await sdkClient.query(query);

      const schemaResult = _.get(recResult, 'schema');
      expect(schemaResult).toBeDefined();
      expect(schemaResult.status).toEqual('draft');
      expect(schemaResult.definition).toEqual(schema);
      expect(schemaResult.dataRegistry).toBeDefined();
      expect(_.get(schemaResult, 'dataRegistry.id')).toEqual(
        cacheDataRegistryId
      );
    });

    it('should throw an error when creating a structured data if the schema is not published', async () => {
      let error: any;

      try {
        const res = await sdkClient.sdk.createStructuredData({
          input: {
            schemaId: cacheSchemaId,
            data: { foo: 'test-error: the schema is not published' }
          }
        });
        expect(res.data.createStructuredData).toBeDefined();
      } catch (ex) {
        error = ex;
      }

      expect(error).toBeDefined();
      expect(`${error}`).toContain(`invalid_input`);
      expect(`${error}`).toContain(`The schema is not in a published state`);
    });

    it('publish the new schema draft to test schema state', async () => {
      const res = await sdkClient.sdk.updateSchemaState({
        input: {
          id: cacheSchemaId,
          status: SchemaStatus.Published,
          breakingChanges: false
        }
      });
      const updateSchemaState = res.data.updateSchemaState;
      expect(updateSchemaState).toBeDefined();
      expect(updateSchemaState?.id).toEqual(cacheSchemaId);
      expect(updateSchemaState?.status).toEqual('published');
      expect(updateSchemaState?.createdDateTime).toBeDefined();
      expect(updateSchemaState?.modifiedDateTime).toBeDefined();
      expect(updateSchemaState?.validActions).toEqual([
        'view',
        'edit',
        'deactivate',
        'delete'
      ]);
    });

    it('should not throw an error when creating a structured data if the schema is published', async () => {
      // use a loop to use load balancer
      for (let i = 0; i < 5; i++) {
        let error: any;
        let recResult: any;
        try {
          recResult = await sdkClient.sdk.createStructuredData({
            input: {
              schemaId: cacheSchemaId,
              data: {
                foo: `[${i}] test-schema status: the schema is published`
              }
            }
          });
        } catch (ex) {
          error = ex;
        }

        expect(error).toBeUndefined();
        expect(recResult.data.createStructuredData.id).toBeDefined();
        expect(recResult.data.createStructuredData.schemaId).toEqual(
          cacheSchemaId
        );
        createdTestData.push({
          schemaId: cacheSchemaId,
          dataRegistryId: recResult.data.createStructuredData.id
        });
      }
    });
  });

  async function getSchemaPropertiesSharedBefore(searchTerm: string) {
    const res = await sdkClient.sdk.schemaProperties({
      search: searchTerm,
      offset: 0,
      dataRegistryVersion: [{ id: dataRegistryId, majorVersion: 1 }]
    });
    return res.data;
  }

  function getSchemaPropertiesSharedAssertions(recResult: any) {
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

  /**
   * get or create a registry for testing
   * @param regName the name of registry
   * @param upsertDraftSchema create a draft schema or not: true/ false. Default value is false
   */
  async function getOrCreateRegistryByName(
    regName: string,
    upsertDraftSchema = false
  ): Promise<{ dataRegistry: any; draftSchema: any; errors: any }> {
    const result: { dataRegistry: any; draftSchema: any; errors: any } = {
      dataRegistry: null,
      draftSchema: null,
      errors: null
    };

    // get data registries by unix name create if not exist
    const respObj = await sdkClient.sdk.dataRegistries({
      name: regName,
      nameMatch: StringMatch.Exact
    });

    result.dataRegistry = respObj.data.dataRegistries?.records?.[0];
    if (!_.isNil(result.dataRegistry) && !_.isNil(result.dataRegistry.id)) {
      //console.log('exist data registry', result.dataRegistry.id);
    } else {
      // create data registries if not exit
      const createResult = await sdkClient.sdk.createDataRegistry({
        input: {
          name: regName,
          description: 'citest description',
          source: 'Some url'
        }
      });
      result.dataRegistry = createResult.data.createDataRegistry;
    }

    // create a draft schema
    if (upsertDraftSchema === true) {
      const res = await sdkClient.sdk.upsertSchemaDraft({
        input: {
          dataRegistryId: result.dataRegistry.id,
          schema
        }
      });
      createdTestData.push({
        schemaId: res.data.upsertSchemaDraft!.id,
        dataRegistryId: result.dataRegistry.id
      });

      result.draftSchema = res.data.upsertSchemaDraft;
    }

    return result;
  }
});
