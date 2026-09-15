import { v4 as uuidv4 } from 'uuid';

import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { OrganizationStatus, SchemaStatus } from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

interface CitestGlobals {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';

describe('citest_schema: Schema version and storageName behavior', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    /**
     * Isolated throwaway superadmin instead of the legacy shared session, so
     * this spec's schema/data-registry lifecycle can never collaterally
     * affect the session shared by every other spec (see
     * test/helpers/superadminSession.ts).
     */
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
  });

  afterAll(async () => {
    await safe('delete isolated superadmin org', () =>
      isolatedSuperadmin.client.sdk.updateOrganization({
        input: { id: isolatedSuperadmin.orgId, status: OrganizationStatus.Deleted }
      })
    );
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  describe('Minor versions share storageName, major versions create new storage', () => {
    let dataRegistryId: string;

    let schemaV1_1_Id: string;
    let schemaV1_2_Id: string;
    let schemaV2_0_Id: string;
    let schemaV1_3_Id: string;
    let schemaV1_4_Id: string;
    let schemaV3_2_JumpId: string;
    let schemaUpsertDraftId: string;
    let sdoId: string;

    it('should create data registry', async () => {
      // createDataRegistry's generated selection includes `id`, which is
      // all this test needs - use the SDK.
      const result = await gqlClient.sdk.createDataRegistry({
        input: {
          name: `${citestMarker}-storage-test-${Date.now()}`,
          description: 'citest storageName behavior',
          source: 'citest'
        }
      });
      dataRegistryId = result?.data?.createDataRegistry?.id ?? '';

      expect(dataRegistryId).toBeDefined();
    });

    it('should create schema v1.1 (published)', async () => {
      schemaV1_1_Id = uuidv4();

      const result = await gqlClient.sdk.createSchema({
        input: {
          id: schemaV1_1_Id,
          dataRegistryId,
          majorVersion: 1,
          minorVersion: 1,
          status: SchemaStatus.Published,
          definition: {
            type: 'object',
            title: 'Test Schema v1.x',
            required: ['testId'],
            properties: {
              testId: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      });
      const createSchema = result?.data?.createSchema!;
      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV1_1_Id);
      expect(createSchema.majorVersion).toEqual(1);
      expect(createSchema.minorVersion).toEqual(1);
      expect(createSchema.status).toEqual('published');
    });

    it('should create schema v1.2 (published)', async () => {
      schemaV1_2_Id = uuidv4();

      const result = await gqlClient.sdk.createSchema({
        input: {
          id: schemaV1_2_Id,
          dataRegistryId,
          majorVersion: 1,
          minorVersion: 2,
          status: SchemaStatus.Published,
          definition: {
            type: 'object',
            title: 'Test Schema v1.x',
            required: ['testId'],
            properties: {
              testId: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      });
      const createSchema = result?.data?.createSchema!;
      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV1_2_Id);
      expect(createSchema.status).toEqual('published');
    });

    it('should create SDO using schema v1.1', async () => {
      sdoId = uuidv4();

      // createStructuredData's generated selection ({id, schemaId, data,
      // dataString, ...}) covers what's asserted - use the SDK.
      const result = await gqlClient.sdk.createStructuredData({
        input: {
          id: sdoId,
          schemaId: schemaV1_1_Id,
          data: {
            testId: 'storage-test-001',
            name: 'Test object'
          }
        }
      });
      expect(result?.data?.createStructuredData?.id).toEqual(sdoId);
    });

    it('should retrieve SDO using schema v1.2 (shared storage)', async () => {
      // structuredData's generated selection includes `id` and `data` -
      // covers this test's assertions - use the SDK.
      const result = await gqlClient.sdk.structuredData({
        id: sdoId,
        schemaId: schemaV1_2_Id
      });
      expect(result?.data?.structuredData?.id).toEqual(sdoId);
      expect(result?.data?.structuredData?.data?.testId).toEqual(
        'storage-test-001'
      );
    });

    it('should create schema v2.0 (new storage)', async () => {
      schemaV2_0_Id = uuidv4();

      const result = await gqlClient.sdk.createSchema({
        input: {
          id: schemaV2_0_Id,
          dataRegistryId,
          majorVersion: 2,
          minorVersion: 0,
          status: SchemaStatus.Published,
          definition: {
            type: 'object',
            title: 'Test Schema v2',
            required: ['testId', 'newField'],
            properties: {
              testId: { type: 'string' },
              newField: { type: 'string' }
            }
          }
        }
      });

      expect(result.data.createSchema!.status).toEqual('published');
    });

    it('should NOT retrieve v1.x SDO using schema v2.0', async () => {
      let error: any;

      try {
        await gqlClient.sdk.structuredData({ id: sdoId, schemaId: schemaV2_0_Id });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not_found');
    });

    it('should create schema v1.3 as draft', async () => {
      schemaV1_3_Id = uuidv4();

      const result = await gqlClient.sdk.createSchema({
        input: {
          id: schemaV1_3_Id,
          dataRegistryId,
          majorVersion: 1,
          minorVersion: 3,
          status: SchemaStatus.Draft,
          definition: {
            type: 'object',
            title: 'Test Schema v1.x',
            required: ['testId'],
            properties: {
              testId: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      });
      const createSchema = result?.data?.createSchema!;

      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV1_3_Id);
      expect(createSchema.status).toEqual('draft');
    });

    it('should publish schema v1.3 with breakingChanges false (shared storage)', async () => {
      const result = await gqlClient.sdk.updateSchemaState({
        input: {
          id: schemaV1_3_Id,
          status: SchemaStatus.Published,
          breakingChanges: false
        }
      });

      expect(result?.data?.updateSchemaState?.status).toEqual('published');
    });

    it('should retrieve v1.x SDO using schema v1.3 (shared storage)', async () => {
      const result = await gqlClient.sdk.structuredData({
        id: sdoId,
        schemaId: schemaV1_3_Id
      });

      expect(result?.data?.structuredData?.id).toEqual(sdoId);
    });

    it('should create schema v1.4 as draft', async () => {
      schemaV1_4_Id = uuidv4();

      const result = await gqlClient.sdk.createSchema({
        input: {
          id: schemaV1_4_Id,
          dataRegistryId,
          majorVersion: 1,
          minorVersion: 4,
          status: SchemaStatus.Draft,
          definition: {
            type: 'object',
            title: 'Test Schema v1.x',
            required: ['testId'],
            properties: {
              testId: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      });
      const createSchema = result?.data?.createSchema!;
      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV1_4_Id);
      expect(createSchema.majorVersion).toEqual(1);
      expect(createSchema.minorVersion).toEqual(4);
      expect(createSchema.status).toEqual('draft');
    });

    it('should publish schema v1.4 with breakingChanges true (new storage)', async () => {
      const result = await gqlClient.sdk.updateSchemaState({
        input: {
          id: schemaV1_4_Id,
          status: SchemaStatus.Published,
          breakingChanges: true
        }
      });

      const schema = result?.data?.updateSchemaState!;
      expect(schema.status).toEqual('published');
    });

    it('should NOT retrieve v1.x SDO using schema v1.4 with breakingChanges', async () => {
      let error: any;

      try {
        await gqlClient.sdk.structuredData({ id: sdoId, schemaId: schemaV1_4_Id });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not_found');
    });

    it('should create draft schema using upsertSchemaDraft', async () => {
      // upsertSchemaDraft's generated selection is rich enough ({id,
      // dataRegistryId, status, majorVersion, minorVersion, definition,
      // validActions, organizationId, organization{id}}) to cover this
      // test's assertion (id only) - use the SDK.
      const result = await gqlClient.sdk.upsertSchemaDraft({
        input: {
          dataRegistryId,
          majorVersion: 1,
          schema: {
            type: 'object',
            title: 'Test Schema v1.x',
            required: ['testId'],
            properties: {
              testId: { type: 'string' },
              name: { type: 'string' },
              newField: { type: 'string' }
            }
          }
        }
      });

      schemaUpsertDraftId = result?.data?.upsertSchemaDraft?.id ?? '';

      expect(schemaUpsertDraftId).toBeDefined();
    });

    it('should publish upsert draft with breakingChanges true', async () => {
      const result = await gqlClient.sdk.updateSchemaState({
        input: {
          id: schemaUpsertDraftId,
          status: SchemaStatus.Published,
          breakingChanges: true
        }
      });

      expect(result?.data?.updateSchemaState?.status).toEqual('published');
    });

    it('should NOT retrieve old SDO using upsert draft schema', async () => {
      let error: any;

      try {
        await gqlClient.sdk.structuredData({
          id: sdoId,
          schemaId: schemaUpsertDraftId
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not_found');
    });

    // Test case: Create v3.2 directly (skip v3.0, v3.1) - should get NEW storage
    // This covers the edge case where majorVersion jump happens without intermediate versions
    it('should create schema v3.2 as draft (version jump, skip v3.0/v3.1)', async () => {
      schemaV3_2_JumpId = uuidv4();

      const result = await gqlClient.sdk.createSchema({
        input: {
          id: schemaV3_2_JumpId,
          dataRegistryId,
          majorVersion: 3,
          minorVersion: 2,
          status: SchemaStatus.Draft,
          definition: {
            type: 'object',
            title: 'Test Schema v1.x',
            required: ['testId'],
            properties: {
              testId: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      });
      const createSchema = result?.data?.createSchema!;

      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV3_2_JumpId);
      expect(createSchema.majorVersion).toEqual(3);
      expect(createSchema.minorVersion).toEqual(2);
      expect(createSchema.status).toEqual('draft');
    });

    it('should publish schema v3.2 WITHOUT breakingChanges (first v3.x gets new storage)', async () => {
      // NOTE: No v3.0 or v3.1 exists, so v3.2 is first v3.x schema
      // Even without breakingChanges flag, it should get new storage.
      const result = await gqlClient.sdk.updateSchemaState({
        input: {
          id: schemaV3_2_JumpId,
          status: SchemaStatus.Published,
          breakingChanges: false
        }
      });
      const schema = result?.data?.updateSchemaState!;

      expect(schema.status).toEqual('published');
      expect(schema.majorVersion).toEqual(3);
      expect(schema.minorVersion).toEqual(2);
    });

    it('should NOT retrieve v1.x SDO using schema v3.2 (new storage due to version jump)', async () => {
      // v3.2 is first schema of major version 3, so it should have separate storage
      let error: any;

      try {
        await gqlClient.sdk.structuredData({
          id: sdoId,
          schemaId: schemaV3_2_JumpId
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not_found');
    });

    it('cleanup SDO', async () => {
      // deleteStructuredData's generated selection is {id} - the test only
      // asserts the result is defined, so the SDK covers it.
      const result = await gqlClient.sdk.deleteStructuredData({
        input: { id: sdoId, schemaId: schemaV1_1_Id }
      });
      expect(result?.data?.deleteStructuredData).toBeDefined();
    });

    it('cleanup schemas', async () => {
      // Only fires the mutation with `status: deleted` and asserts nothing
      // about the response shape - use the SDK.
      for (const schemaId of [
        schemaV2_0_Id,
        schemaV3_2_JumpId,
        schemaV1_2_Id,
        schemaV1_1_Id,
        schemaV1_3_Id,
        schemaV1_4_Id,
        schemaUpsertDraftId
      ]) {
        await gqlClient.sdk.updateSchemaState({
          input: { id: schemaId, status: SchemaStatus.Deleted }
        });
      }
      expect(true).toBe(true);
    });
  });
});
