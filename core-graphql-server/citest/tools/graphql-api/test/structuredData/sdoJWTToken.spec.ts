import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import { DeploymentModel, RootFolderType, SchemaStatus } from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';

const CMS_APPLICATION_ID = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';

const testSchemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    name: {
      type: 'string',
      title: 'Name'
    },
    phone: {
      type: 'string',
      title: 'Phone'
    }
  }
};

describe('citest_structureddata: structured data citest with jwt token usages', () => {
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superClient: GraphqlClient;
  let orgId: string;

  let dataRegistryId: string;
  let schemaId: string;
  let engineId: string;
  let jwtTokenOptions: Record<string, string>;
  let sdoId: string;
  let newFolderId: string;
  let contentFolderTemplateId: string;

  beforeAll(async () => {
    const env = config.env;

    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    superClient = isolatedSuperadmin.client;
    orgId = isolatedSuperadmin.orgId;

    await superClient.sdk.addAppToOrg({
      appId: CMS_APPLICATION_ID,
      orgId,
      configs: []
    });

    const registryRes = await superClient.sdk.createDataRegistry({
      input: {
        name: `ENGINE_DR_${citestMarker}`,
        description: 'citest jwt token registry',
        source: 'citest jwt token source'
      }
    });
    expect(registryRes.data.createDataRegistry?.id).toBeDefined();
    dataRegistryId = registryRes.data.createDataRegistry!.id;

    const schemaRes = await superClient.sdk.upsertSchemaDraft({
      input: { dataRegistryId, schema: testSchemaInput }
    });
    const upsertSchemaDraft = schemaRes.data.upsertSchemaDraft;
    expect(upsertSchemaDraft).toBeDefined();
    schemaId = upsertSchemaDraft!.id;
    expect(schemaId).toBeDefined();
    expect(upsertSchemaDraft!.dataRegistryId).toEqual(dataRegistryId);
    expect(upsertSchemaDraft!.status).toEqual(SchemaStatus.Draft);
    expect(upsertSchemaDraft!.definition).toEqual(testSchemaInput);
    expect(upsertSchemaDraft!.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);

    const publishRes = await superClient.sdk.updateSchemaState({
      input: {
        id: schemaId,
        status: SchemaStatus.Published,
        breakingChanges: false
      }
    });
    const updateSchemaState = publishRes.data.updateSchemaState;
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

    const engineCategoryRes = await superClient.sdk.engineCategories({
      type: 'Cognition',
      name: 'Transcription',
      limit: 1
    });
    const engineCategory =
      engineCategoryRes.data.engineCategories?.records?.[0];
    expect(engineCategory?.id).toBeDefined();
    expect(engineCategory?.name).toEqual('Transcription');
    expect(engineCategory?.type?.name).toEqual('Cognition');
    const engineCategoryId = engineCategory!.id;

    const jwtTestEngineName = `JWT_TEST_ENGINE-${citestMarker}`;
    const createEngineRes = await superClient.sdk.createEngine({
      input: {
        name: jwtTestEngineName,
        categoryId: engineCategoryId,
        deploymentModel: DeploymentModel.FullyNetworkIsolated
      }
    });
    const engine = createEngineRes.data.createEngine;
    expect(engine).toBeDefined();
    expect(engine!.id).toBeDefined();
    expect(engine!.name).toEqual(jwtTestEngineName);
    expect(engine!.categoryId).toEqual(engineCategoryId);
    expect(engine!.deploymentModel).toEqual(
      DeploymentModel.FullyNetworkIsolated
    );
    expect(engine!.state).toEqual('pending');
    engineId = engine!.id;

    const jwtRes = await superClient.sdk.getEngineJWT({
      input: {
        engineId,
        resource: { schemaId }
      }
    });
    expect(jwtRes.data.getEngineJWT?.token).toBeDefined();
    const jwtToken = jwtRes.data.getEngineJWT!.token!;
    jwtTokenOptions = helpers.requestOptions(jwtToken).headers as Record<
      string,
      string
    >;
  });

  afterAll(async () => {
    if (contentFolderTemplateId) {
      await safe('delete content folder template', () =>
        superClient.sdk.deleteFolderContentTemplate({
          id: contentFolderTemplateId
        })
      );
    }

    if (newFolderId) {
      await safe('delete folder', () =>
        superClient.sdk.deleteFolder({
          input: { id: newFolderId, orderIndex: 0 }
        })
      );
    }

    if (schemaId) {
      await safe('delete schema', () =>
        superClient.sdk.updateSchemaState({
          input: { id: schemaId, status: SchemaStatus.Deleted }
        })
      );
    }

    if (engineId) {
      await safe('delete engine', () =>
        superClient.sdk.deleteEngine({ id: engineId })
      );
    }

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('create a structured data should success', async () => {
    const res = await superClient.sdk.createStructuredData(
      {
        input: {
          schemaId,
          data: {
            name: `${citestMarker}@veritone.com`,
            phone: '(714) 555-5555'
          }
        }
      },
      jwtTokenOptions
    );
    expect(res.data.createStructuredData).toBeDefined();
    sdoId = res.data.createStructuredData!.id;
  });

  it('get structured data should success', async () => {
    const recResult = await superClient.sdk.structuredDataObjects(
      { schemaId, ids: [sdoId] },
      jwtTokenOptions
    );

    expect(recResult).toBeDefined();
    const data = recResult.data.structuredDataObjects;
    expect(data).toBeDefined();
    expect(data?.records).toBeDefined();
    expect(data!.records!.length > 0).toEqual(true);
    expect(data!.records!.length).toEqual(data!.count);
  });

  it('read sdo with schema query should success', async () => {
    const query = `
      query getSchema($id: ID!) {
        schema(id: $id) {
          id
          status
          createdDateTime
          modifiedDateTime
          dataRegistryId
          definition
          validActions
          dataRegistry {
            id
            publishedSchema {
              id
            }
          }
          structuredDataObjects(limit: 10, offset: 0) {
            records {
              id
            }
          }
        }
      }
    `;

    const recResult: any = await superClient.query(
      query,
      { id: schemaId },
      jwtTokenOptions
    );

    expect(recResult).toBeDefined();
    expect(recResult.schema).toBeDefined();
    expect(recResult.schema.id).toEqual(schemaId);
    expect(recResult.schema.structuredDataObjects).toBeDefined();
    expect(recResult.schema.structuredDataObjects.records).toBeDefined();
    expect(
      recResult.schema.structuredDataObjects.records.length
    ).toBeGreaterThan(0);
    expect(
      _.find(recResult.schema.structuredDataObjects.records, { id: sdoId })
    ).toBeDefined();
  });

  it('update data structure should success', async () => {
    const res = await superClient.sdk.createStructuredData(
      {
        input: {
          id: sdoId,
          schemaId,
          data: { phone: '(714) 666-6666' }
        }
      },
      jwtTokenOptions
    );

    expect(res.data.createStructuredData).toBeDefined();
  });

  it('create folder content template with sdo should success', async () => {
    const rootFoldersRes = await superClient.sdk.createRootFolders({
      rootFolderType: RootFolderType.Cms
    });
    const rootFolders = rootFoldersRes.data.createRootFolders ?? [];
    expect(rootFolders.length).toBeGreaterThan(0);
    expect(rootFolders[0]?.name).toContain('Root Folder');
    const cmsRootFolderId = rootFolders[0]!.id;

    const createFolderRes = await superClient.sdk.createFolder({
      input: {
        name: `${citestMarker}-folder-${uuidv4()}`,
        description: 'test folder for rbac created by admin user',
        parentId: cmsRootFolderId,
        rootFolderType: RootFolderType.Cms
      }
    });
    const createFolder = createFolderRes.data.createFolder;
    expect(createFolder).toBeDefined();
    expect(createFolder?.name).toContain(`${citestMarker}-folder`);
    newFolderId = createFolder!.id;

    const templateRes = await superClient.sdk.createFolderContentTemplate(
      {
        input: {
          folderId: newFolderId,
          sdoId,
          schemaId
        }
      },
      jwtTokenOptions
    );

    const folderContentTemplate = templateRes.data.createFolderContentTemplate;
    expect(folderContentTemplate?.id).toBeDefined();
    expect(folderContentTemplate?.sdoId).toEqual(sdoId);
    contentFolderTemplateId = folderContentTemplate!.id;
  });

  it('create tdo with belonged sdo should fail', async () => {
    const result = superClient.sdk.createTDO(
      {
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726755,
          contentTemplates: [{ sdoId, schemaId }]
        }
      },
      jwtTokenOptions
    );

    await expect(result).rejects.toThrow(/not authorized/i);
  });

  it('delete structured data should success', async () => {
    const res = await superClient.sdk.deleteStructuredData(
      {
        input: { id: sdoId, schemaId }
      },
      jwtTokenOptions
    );

    expect(res.data.deleteStructuredData).toBeDefined();
    expect(res.data.deleteStructuredData?.id).toBeDefined();
  });

  it('create and delete sdo with application jwt should success', async () => {
    const appJwtResult = await superClient.sdk.getApplicationJWT({
      input: {
        appId: CMS_APPLICATION_ID,
        orgId,
        roleIds: [
          '68d053f4-2ff3-4816-a9fd-b9d24798c9c8',
          'ddca9b68-d775-4934-8ffd-7aecc779b652'
        ]
      }
    });

    const appJwtToken = appJwtResult.data.getApplicationJWT?.token;
    expect(appJwtToken).toBeDefined();
    const appJwtOptions = helpers.requestOptions(appJwtToken!)
      .headers as Record<string, string>;

    const createRes = await superClient.sdk.createStructuredData(
      {
        input: {
          schemaId,
          data: {
            name: `${citestMarker}@veritone.com`,
            phone: '(714) 555-5555'
          }
        }
      },
      appJwtOptions
    );
    const appJwtSdoId = createRes.data.createStructuredData?.id;
    expect(appJwtSdoId).toBeDefined();

    const deleteRes = await superClient.sdk.deleteStructuredData(
      {
        input: { id: appJwtSdoId!, schemaId }
      },
      appJwtOptions
    );
    expect(deleteRes.data.deleteStructuredData?.id).toEqual(appJwtSdoId);
  });
});
