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

const describeif = (
  condition: any,
  name: string,
  fn: () => void
): void => (condition ? describe(name, fn) : describe.skip(name, fn));

const isResourceTestEnabled = !!(
  config.apiAIDataOrgToken && config.apiInternalOrgLessToken
);

describeif(
  isResourceTestEnabled,
  'citest_structureddata: structured data citest with api key usages',
  () => {
    let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
    let superClient: GraphqlClient;
    let aiDataOrgClient: GraphqlClient;

    let dataRegistryId: string;
    let schemaId: string;
    let sdoId: string;
    let newFolderId: string;
    let contentFolderTemplateId: string;

    beforeAll(async () => {
      const env = config.env;

      // Route setup through an isolated throwaway superadmin rather than the
      // shared session, so this spec can never be the collateral casualty of
      // (nor the cause of) another session's cleanup.
      const bootstrapClient = await createGraphqlClient(
        AuthType.SESSION_TOKEN,
        env
      );
      isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
      superClient = isolatedSuperadmin.client;

      // T73: poll until the isolated superadmin's freshly-created session
      // token is visible in Redis before any test relies on it — in
      // Docker-Compose CI a brand-new session can take a moment to
      // propagate before graphql will accept it as a bearer token.
      let sessionReady = false;
      for (let i = 0; i < 30; i++) {
        try {
          const meRes = await superClient.sdk.me();
          if (meRes.data.me?.id) {
            sessionReady = true;
            break;
          }
        } catch (err) {
          if (i === 29) throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      expect(sessionReady).toBe(true);

      await superClient.sdk.addAppToOrg({
        appId: CMS_APPLICATION_ID,
        orgId: isolatedSuperadmin.orgId,
        configs: []
      });

      aiDataOrgClient = await createGraphqlClient(AuthType.API_KEY, env);
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

      await safe('cleanup isolated superadmin', () =>
        isolatedSuperadmin.cleanup()
      );
    });

    it('should create data registry', async () => {
      const res = await aiDataOrgClient.sdk.createDataRegistry({
        input: {
          name: `ENGINE_DR_${citestMarker}`,
          description: 'citest api key registry',
          source: 'citest api key source'
        }
      });
      expect(res.data.createDataRegistry?.id).toBeDefined();
      dataRegistryId = res.data.createDataRegistry!.id;
    });

    it('should create schema draft', async () => {
      const res = await aiDataOrgClient.sdk.upsertSchemaDraft({
        input: { dataRegistryId, schema: testSchemaInput }
      });

      const upsertSchemaDraft = res.data.upsertSchemaDraft;
      expect(upsertSchemaDraft).toBeDefined();
      schemaId = upsertSchemaDraft!.id;
      expect(schemaId).toBeDefined();
      expect(upsertSchemaDraft!.dataRegistryId).toEqual(dataRegistryId);
      expect(upsertSchemaDraft!.status).toEqual(SchemaStatus.Draft);
      expect(upsertSchemaDraft!.definition).toEqual(testSchemaInput);
      expect(upsertSchemaDraft!.validActions).toEqual(['view']);
    });

    it('should publish schema draft', async () => {
      const res = await aiDataOrgClient.sdk.updateSchemaState({
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
      expect(updateSchemaState?.validActions).toEqual(['view']);
    });

    it('create a structured data should success', async () => {
      const res = await aiDataOrgClient.sdk.createStructuredData({
        input: {
          schemaId,
          data: {
            name: `${citestMarker}@veritone.com`,
            phone: '(714) 555-5555'
          }
        }
      });
      const sdoData = res.data.createStructuredData;
      expect(sdoData).toBeDefined();
      expect(sdoData!.id).toBeDefined();
      expect(sdoData!.schemaId).toEqual(schemaId);

      sdoId = sdoData!.id;
    });

    it('get structured data should success', async () => {
      const recResult = await aiDataOrgClient.sdk.structuredDataObjects({
        schemaId,
        ids: [sdoId]
      });

      expect(recResult).toBeDefined();
      const data = recResult.data.structuredDataObjects;
      expect(data).toBeDefined();
      expect(data?.records).toBeDefined();
      expect(data!.records!.length > 0).toEqual(true);
      expect(data!.records!.length).toEqual(data!.count);
    });

    it('read sdo with schema query should success', async () => {
      const query = `query getSchema($id: ID!) {
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
      }`;

      const recResult: any = await aiDataOrgClient.query(query, {
        id: schemaId
      });

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
      const res = await aiDataOrgClient.sdk.createStructuredData({
        input: {
          id: sdoId,
          schemaId,
          data: { phone: '(714) 666-6666' }
        }
      });
      const sdoData = res.data.createStructuredData;
      expect(sdoData).toBeDefined();
      expect(sdoData!.id).toEqual(sdoId);
      expect(sdoData!.schemaId).toEqual(schemaId);
    });

    it('create folder content template with sdo should success', async () => {
      const rootFoldersRes = await superClient.sdk.rootFolders({
        rootFolderType: RootFolderType.Cms
      });
      const rootFolders = rootFoldersRes.data.rootFolders ?? [];
      let cmsRootFolderId: string;

      if (rootFolders.length > 0) {
        cmsRootFolderId = rootFolders[0]!.id;
      } else {
        const createRootFolderRes = await superClient.sdk.createRootFolders({
          rootFolderType: RootFolderType.Cms
        });
        const createdRootFolders =
          createRootFolderRes.data.createRootFolders ?? [];
        expect(createdRootFolders.length).toBeGreaterThan(0);
        cmsRootFolderId = createdRootFolders[0]!.treeObjectId!;
      }

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

      const templateRes = await aiDataOrgClient.sdk.createFolderContentTemplate({
        input: { folderId: newFolderId, sdoId, schemaId }
      });

      const folderContentTemplate = templateRes.data.createFolderContentTemplate;
      expect(folderContentTemplate?.id).toBeDefined();
      expect(folderContentTemplate?.sdoId).toEqual(sdoId);
      contentFolderTemplateId = folderContentTemplate!.id;
    });

    it('create tdo with belonged sdo should success', async () => {
      const res = await aiDataOrgClient.sdk.createTDO({
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726755,
          contentTemplates: [{ sdoId, schemaId }]
        }
      });
      const tdo = res.data.createTDO;
      expect(tdo).toBeDefined();
      expect(tdo?.id).toBeDefined();
    });

    it('delete structured data should success', async () => {
      const res = await aiDataOrgClient.sdk.deleteStructuredData({
        input: { id: sdoId, schemaId }
      });
      const deleteSdoData = res.data.deleteStructuredData;
      expect(deleteSdoData).toBeDefined();
      expect(deleteSdoData?.id).toEqual(sdoId);
    });
  }
);
