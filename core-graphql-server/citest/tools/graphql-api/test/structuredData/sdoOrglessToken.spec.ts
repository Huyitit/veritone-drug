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
import { RootFolderType, SchemaStatus } from '../../src/gql';

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

const describeif = (condition: any, name: string, fn: () => void): void =>
  condition ? describe(name, fn) : describe.skip(name, fn);

const isResourceTestEnabled = !!(
  config.apiAIDataOrgToken && config.apiInternalOrgLessToken
);

describeif(
  isResourceTestEnabled,
  'citest_structureddata: structured data citest with orgless token usages',
  () => {
    let isolatedSuperadmin: Awaited<
      ReturnType<typeof createIsolatedSuperadmin>
    >;
    let superClient: GraphqlClient;
    let orglessClient: GraphqlClient;

    let dataRegistryId: string;
    let schemaId: string;
    let existedSdoId: string;
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

      await superClient.sdk.addAppToOrg({
        appId: CMS_APPLICATION_ID,
        orgId: isolatedSuperadmin.orgId,
        configs: []
      });

      orglessClient = await createGraphqlClient(AuthType.ORGLESS_API_KEY, env);

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

      const sdoRes = await superClient.sdk.createStructuredData({
        input: {
          schemaId,
          data: {
            name: `${citestMarker}@veritone.com`,
            phone: '(714) 555-5555'
          }
        }
      });
      expect(sdoRes.data.createStructuredData).toBeDefined();
      existedSdoId = sdoRes.data.createStructuredData!.id;
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

      if (existedSdoId) {
        await safe('delete existing SDO', () =>
          superClient.sdk.deleteStructuredData({
            input: { id: existedSdoId, schemaId }
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

      await safe('cleanup isolated superadmin', () =>
        isolatedSuperadmin.cleanup()
      );
    });

    it('fetch specific data registry by internal orgless token should success', async () => {
      const res = await orglessClient.sdk.dataRegistry({ id: dataRegistryId });
      expect(res.data.dataRegistry).toBeDefined();
      expect(res.data.dataRegistry?.id).toEqual(dataRegistryId);
    });

    it('create a structured data should fail', async () => {
      const result = orglessClient.sdk.createStructuredData({
        input: {
          schemaId,
          data: {
            name: `${citestMarker}@veritone.com`,
            phone: '(714) 555-5555'
          }
        }
      });

      await expect(result).rejects.toThrow(/requires an organization context/i);
    });

    it('get structured data should success', async () => {
      const recResult = await orglessClient.sdk.structuredDataObjects({
        schemaId,
        ids: [existedSdoId]
      });

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

      const variables = { id: schemaId };

      const recResult: any = await orglessClient.query(query, variables);

      expect(recResult).toBeDefined();
      expect(recResult.schema).toBeDefined();
      expect(recResult.schema.id).toEqual(schemaId);
      expect(recResult.schema.structuredDataObjects).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records).toBeDefined();
      expect(
        recResult.schema.structuredDataObjects.records.length
      ).toBeGreaterThan(0);
      expect(
        _.find(recResult.schema.structuredDataObjects.records, {
          id: existedSdoId
        })
      ).toBeDefined();
    });

    it('update data structure should fail', async () => {
      const result = orglessClient.sdk.createStructuredData({
        input: {
          id: existedSdoId,
          schemaId,
          data: { phone: '(714) 666-6666' }
        }
      });

      await expect(result).rejects.toThrow(/requires an organization context/i);
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

      const templateRes = await orglessClient.sdk.createFolderContentTemplate({
        input: {
          folderId: newFolderId,
          sdoId: existedSdoId,
          schemaId
        }
      });

      const folderContentTemplate =
        templateRes.data.createFolderContentTemplate;
      expect(folderContentTemplate?.id).toBeDefined();
      expect(folderContentTemplate?.sdoId).toEqual(existedSdoId);
      contentFolderTemplateId = folderContentTemplate!.id;
    });

    it('create tdo with belonged sdo should fail', async () => {
      const result = orglessClient.sdk.createTDO({
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726755,
          contentTemplates: [{ sdoId: existedSdoId, schemaId }]
        }
      });

      await expect(result).rejects.toThrow(/not authorized/i);
    });

    it('delete structured data should fail', async () => {
      const result = orglessClient.sdk.deleteStructuredData({
        input: {
          id: existedSdoId,
          schemaId
        }
      });

      await expect(result).rejects.toThrow(
        /The provided value, undefined, is not valid/i
      );
    });
  }
);
