import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import { SchemaStatus } from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';

const describeif = (condition: any, name: string, fn: () => void): void =>
  condition ? describe(name, fn) : describe.skip(name, fn);

const isResourceTestEnabled = !!(
  config.apiAIDataOrgToken && config.apiInternalOrgLessToken
);

describeif(
  isResourceTestEnabled,
  'citest_structureddata: Structured Data resource test using internal orgless token and ai data token',
  () => {
    let isolatedSuperadmin: Awaited<
      ReturnType<typeof createIsolatedSuperadmin>
    >;
    let aiDataOrgClient: GraphqlClient;
    let orglessClient: GraphqlClient;

    const dataRegistry: { id?: string; schemaId?: string } = {};

    beforeAll(async () => {
      const env = config.env;

      // Route setup through an isolated throwaway superadmin rather than the
      // shared session, so this spec can never be the collateral casualty of
      // (nor the cause of) another spec's session-killing cleanup.
      const bootstrapClient = await createGraphqlClient(
        AuthType.SESSION_TOKEN,
        env
      );
      isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);

      aiDataOrgClient = await createGraphqlClient(AuthType.API_KEY, env);
      orglessClient = await createGraphqlClient(AuthType.ORGLESS_API_KEY, env);
    });

    afterAll(async () => {
      await safe('cleanup isolated superadmin', () =>
        isolatedSuperadmin.cleanup()
      );
    });

    it('create data registry and public schema by ai data org token', async () => {
      const dataRegistryId = uuidv4();

      // use ai data org token
      const registryRes = await aiDataOrgClient.sdk.createDataRegistry({
        input: {
          id: dataRegistryId,
          source: '',
          name: `${citestMarker}-resource-ci-test--schema-${uuidv4()}`,
          description: `${citestMarker}-resource-ci-test--schema`
        }
      });
      expect(registryRes.data.createDataRegistry).toBeDefined();
      dataRegistry.id = dataRegistryId;

      const schemaRes = await aiDataOrgClient.sdk.upsertSchemaDraft({
        input: {
          dataRegistryId,
          schema: {
            type: 'object',
            title: 'hub-ci-test-',
            required: ['email'],
            properties: {
              email: {
                type: 'string'
              },
              userName: {
                type: 'string'
              }
            },
            description: 'For CI test'
          }
        }
      });
      dataRegistry.schemaId = schemaRes.data.upsertSchemaDraft?.id;
      expect(dataRegistry.schemaId).toBeDefined();

      // publish schema
      const publishRes = await aiDataOrgClient.sdk.updateSchemaState({
        input: {
          id: dataRegistry.schemaId!,
          status: SchemaStatus.Published,
          breakingChanges: false
        }
      });

      const schemaStatus = publishRes.data.updateSchemaState?.status;
      expect(schemaStatus).toBeDefined();
      expect(schemaStatus).toEqual(SchemaStatus.Published);
    });

    it('fetch specific data registry by internal orgless token', async () => {
      const result: any = await orglessClient.sdk.dataRegistry({
        id: dataRegistry.id!
      });
      expect(result.data.dataRegistry).toBeDefined();
      expect(result.data.dataRegistry.id).toEqual(dataRegistry.id);
      expect(result.data.dataRegistry.schemas.records.length).toEqual(1);
      expect(result.data.dataRegistry.schemas.records[0].id).toEqual(
        dataRegistry.schemaId
      );
      expect(result.data.dataRegistry.publishedSchema.id).toEqual(
        dataRegistry.schemaId
      );
      expect(result.data.dataRegistry.ingestionToken).toBeDefined();
    });

    it('fetch multiple data registries by internal orgless token', async () => {
      const result: any = await orglessClient.sdk.dataRegistries({
        offset: 0,
        limit: 10
      });
      expect(result.data.dataRegistries).toBeDefined();
      expect(result.data.dataRegistries.records.length).toBeGreaterThan(0);
    });
  }
);
