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
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { OrganizationType, RootFolderType, SchemaStatus } from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const testSchemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    foo: {
      $id: '/properties/foo',
      type: 'string',
      title: 'The Foo Schema',
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

const createdTestData: Array<{ schemaId: string; dataRegistryId: string }> = [];

describe('citest_structureddata: lagacy structured data ci test', () => {
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superClient: GraphqlClient;
  let superOrgId: string;

  let testSetup: any;
  let testOrg: any;
  let adminOptions: Record<string, string> | undefined;
  let secondAdminOptions: Record<string, string> | undefined;
  let regularOptions: Record<string, string> | undefined;

  let dataRegistryId: string;
  let schemaId: string;
  let sdoId: string;
  let existOrgSdoId: string;
  let adminDataRegistryId: string;
  let adminSchemaId: string;
  let adminSdoId: string;
  let regularSdoId: string;
  let folderId: string;
  let newFolderId: string;

  beforeAll(async () => {
    const env = config.env;

    // T26: this suite previously ran on the SHARED superadmin session, which
    // becomes an admin MEMBER of testOrg (setupTestOrgAndUser enrolls the
    // caller). Any concurrent spec's org-delete/user-delete/OLP-toggle
    // enumerates that org's active members and kills their sessions —
    // killing this suite's shared token mid-run. Route through a throwaway
    // isolated superadmin (a member of no org but its own) instead, same fix
    // as T14/T15/T16/T22/T23.
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    superClient = isolatedSuperadmin.client;

    const meRes = await superClient.sdk.me();
    expect(meRes.data.me).toBeDefined();
    superOrgId = meRes.data.me?.organization?.id ?? '';

    testSetup = await setupTestOrgAndUser(superClient, createOrgAndUserInput);

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    const testUsers = _.get(testOrg, 'users.records');
    expect(testUsers.length).toEqual(5);

    const listOptions = testSetup.listOptions ?? [];

    const adminUser = listOptions.find(
      (u: any) =>
        u.userName?.includes('-admin-user-') &&
        !u.userName?.includes('-second-admin-user-')
    );
    adminOptions = adminUser?.requestOptions;

    const secondAdminUser = listOptions.find((u: any) =>
      u.userName?.includes('-second-admin-user-')
    );
    secondAdminOptions = secondAdminUser?.requestOptions;

    const regularUser = listOptions.find(
      (u: any) =>
        u.userName?.includes('-regular-user-') &&
        !u.userName?.includes('-second-regular-user-')
    );
    regularOptions = regularUser?.requestOptions;
  });

  afterAll(async () => {
    if (regularSdoId) {
      await safe('delete regular SDO', () =>
        superClient.sdk.deleteStructuredData(
          { input: { id: regularSdoId, schemaId: adminSchemaId } },
          regularOptions
        )
      );
    }

    if (adminSdoId) {
      await safe('delete admin SDO', () =>
        superClient.sdk.deleteStructuredData(
          { input: { id: adminSdoId, schemaId: adminSchemaId } },
          adminOptions
        )
      );
    }

    if (existOrgSdoId) {
      await safe('delete existing org SDO', () =>
        superClient.sdk.deleteStructuredData({
          input: { id: existOrgSdoId, schemaId }
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

    if (adminSchemaId) {
      await safe('delete admin schema', () =>
        superClient.sdk.updateSchemaState({
          input: { id: adminSchemaId, status: SchemaStatus.Deleted }
        })
      );
    }

    if (testSetup?.listOptions?.length) {
      await safe('delete users', async () => {
        for (const user of testSetup.listOptions) {
          await superClient.sdk.deleteUser({ id: user.userId });
        }
      });
    }

    if (testOrg?.id) {
      await safe('delete organization', () =>
        helpers.deleteOrganization(
          superClient.authUrl,
          testOrg.id,
          isolatedSuperadmin.token
        )
      );
    }

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  describe('legacy super admin tests', () => {
    it('should create a data registry success', async () => {
      const res = await superClient.sdk.createDataRegistry({
        input: {
          name: `${citestMarker} + '-registry-unix-name-in-org-' ${uuidv4()}`,
          description: 'citest data registry description',
          source: 'citest data registry source'
        }
      });
      expect(res.data.createDataRegistry?.id).toBeDefined();
      dataRegistryId = res.data.createDataRegistry!.id;
    });

    it('upsert a schema draft should success', async () => {
      const res = await superClient.sdk.upsertSchemaDraft({
        input: { dataRegistryId, schema: testSchemaInput }
      });

      const upsertSchemaDraft = res.data.upsertSchemaDraft;
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
      expect(upsertSchemaDraft!.organizationId).toEqual(superOrgId.toString());
      expect(upsertSchemaDraft!.organization?.id).toEqual(
        superOrgId.toString()
      );

      createdTestData.push({ schemaId, dataRegistryId });
    });

    it('publish a schema draft should success', async () => {
      const res = await superClient.sdk.updateSchemaState({
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

    it('create a structured data should success', async () => {
      const res = await superClient.sdk.createStructuredData({
        input: { schemaId, data: { foo: 'bar' } }
      });
      expect(res.data.createStructuredData).toBeDefined();
      sdoId = res.data.createStructuredData!.id;
    });

    it('get structured data should success', async () => {
      const recResult = await superClient.sdk.structuredDataObjects({
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
      const recResult: any = await superClient.query(getSchemaGql, {
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

    it('update a structured data should success', async () => {
      const res = await superClient.sdk.createStructuredData({
        input: { id: sdoId, schemaId, data: { foo: 'updated bar' } }
      });
      expect(res.data.createStructuredData).toBeDefined();
    });

    it('create folder content template with sdo should success', async () => {
      newFolderId = await createCmsFolderFlow(superClient, citestMarker);

      const templateRes = await superClient.sdk.createFolderContentTemplate({
        input: { folderId: newFolderId, sdoId, schemaId }
      });
      const folderContentTemplate =
        templateRes.data.createFolderContentTemplate;
      expect(folderContentTemplate?.id).toBeDefined();
      expect(folderContentTemplate?.sdoId).toEqual(sdoId);
    });

    it('create tdo with belonged sdo should success', async () => {
      const res = await superClient.sdk.createTDO({
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726755,
          contentTemplates: [{ sdoId, schemaId }]
        }
      });
      expect(res.data.createTDO?.id).toBeDefined();
    });

    it('delete structured data should success', async () => {
      const res = await superClient.sdk.deleteStructuredData({
        input: { schemaId, id: sdoId }
      });
      expect(res.data.deleteStructuredData).toBeDefined();
      expect(res.data.deleteStructuredData?.id).toBeDefined();
    });

    it('should prepare shared sdo success', async () => {
      const res = await superClient.sdk.createStructuredData(
        { input: { schemaId, data: { foo: 'bar' } } },
        adminOptions
      );
      expect(res.data.createStructuredData).toBeDefined();
      existOrgSdoId = res.data.createStructuredData!.id;
    });

    it('update existing org sdo should success', async () => {
      const res = await superClient.sdk.createStructuredData({
        input: { id: existOrgSdoId, schemaId, data: { foo: 'updated bar' } }
      });
      expect(res.data.createStructuredData).toBeDefined();
    });

    it('delete existing org sdo should success', async () => {
      const res = await superClient.sdk.deleteStructuredData({
        input: { schemaId, id: schemaId }
      });
      expect(res.data.deleteStructuredData).toBeDefined();
      expect(res.data.deleteStructuredData?.id).toBeDefined();
    });
  });

  describe('legacy admin tests', () => {
    it('should create a data registry success', async () => {
      const res = await superClient.sdk.createDataRegistry(
        {
          input: {
            name: `${citestMarker} + '-legacy-admin-registry-unix-name-in-org-' ${uuidv4()}`,
            description: 'citest data registry description',
            source: 'citest data registry source'
          }
        },
        adminOptions
      );
      expect(res.data.createDataRegistry?.id).toBeDefined();
      adminDataRegistryId = res.data.createDataRegistry!.id;
    });

    it('upsert a schema draft should success', async () => {
      const res = await superClient.sdk.upsertSchemaDraft(
        {
          input: {
            dataRegistryId: adminDataRegistryId,
            schema: testSchemaInput
          }
        },
        adminOptions
      );

      const upsertSchemaDraft = res.data.upsertSchemaDraft;
      expect(upsertSchemaDraft).toBeDefined();
      adminSchemaId = upsertSchemaDraft!.id;
      expect(adminSchemaId).toBeDefined();
      expect(upsertSchemaDraft!.dataRegistryId).toEqual(adminDataRegistryId);
      expect(upsertSchemaDraft!.status).toEqual(SchemaStatus.Draft);
      expect(upsertSchemaDraft!.definition).toEqual(testSchemaInput);
      expect(upsertSchemaDraft!.validActions).toEqual([
        'view',
        'edit',
        'publish',
        'delete'
      ]);
    });

    it('publish a schema draft should success', async () => {
      const res = await superClient.sdk.updateSchemaState(
        {
          input: {
            id: adminSchemaId,
            status: SchemaStatus.Published,
            breakingChanges: false
          }
        },
        adminOptions
      );
      const updateSchemaState = res.data.updateSchemaState;
      expect(updateSchemaState).toBeDefined();
      expect(updateSchemaState?.id).toEqual(adminSchemaId);
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

    it('create a structured data should success', async () => {
      const res = await superClient.sdk.createStructuredData(
        { input: { schemaId: adminSchemaId, data: { foo: 'bar' } } },
        adminOptions
      );
      expect(res.data.createStructuredData).toBeDefined();
      adminSdoId = res.data.createStructuredData!.id;
    });

    it('update a structured data should success', async () => {
      const res = await superClient.sdk.createStructuredData(
        {
          input: {
            id: adminSdoId,
            schemaId: adminSchemaId,
            data: { foo: 'admin updated bar' }
          }
        },
        adminOptions
      );
      expect(res.data.createStructuredData).toBeDefined();
    });

    it('get structured data should success', async () => {
      const recResult = await superClient.sdk.structuredDataObjects(
        { schemaId: adminSchemaId, ids: [adminSdoId] },
        adminOptions
      );

      expect(recResult).toBeDefined();
      const data = recResult.data.structuredDataObjects;
      expect(data).toBeDefined();
      expect(data?.records).toBeDefined();
      expect(data!.records!.length > 0).toEqual(true);
      expect(data!.records!.length).toEqual(data!.count);
    });

    it('read sdo with schema query should success', async () => {
      const recResult: any = await superClient.query(
        getSchemaGql,
        { id: adminSchemaId },
        adminOptions
      );

      expect(recResult).toBeDefined();
      expect(recResult.schema).toBeDefined();
      expect(recResult.schema.id).toEqual(adminSchemaId);
      expect(recResult.schema.structuredDataObjects).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records).toBeDefined();
      expect(
        recResult.schema.structuredDataObjects.records.length
      ).toBeGreaterThan(0);
      expect(
        _.find(recResult.schema.structuredDataObjects.records, {
          id: adminSdoId
        })
      ).toBeDefined();
    });

    it('create folder content template with sdo should success', async () => {
      folderId = await createCmsFolderFlow(superClient, citestMarker);

      const templateRes = await superClient.sdk.createFolderContentTemplate(
        { input: { folderId, sdoId: adminSdoId, schemaId: adminSchemaId } },
        adminOptions
      );
      const folderContentTemplate =
        templateRes.data.createFolderContentTemplate;
      expect(folderContentTemplate?.id).toBeDefined();
      expect(folderContentTemplate?.sdoId).toEqual(adminSdoId);
    });

    it('create TDO with belonged SDO should success', async () => {
      const res = await superClient.sdk.createTDO(
        {
          input: {
            status: 'uploaded',
            startDateTime: 1476726655,
            stopDateTime: 1476726755,
            contentTemplates: [{ sdoId: adminSdoId, schemaId: adminSchemaId }]
          }
        },
        adminOptions
      );
      expect(res.data.createTDO?.id).toBeDefined();
    });

    it('read existing org sdo should success', async () => {
      const res = await superClient.sdk.structuredData(
        { id: adminSdoId, schemaId: adminSchemaId },
        secondAdminOptions
      );
      expect(res.data.structuredData).toBeDefined();
      expect(res.data.structuredData?.id).toEqual(adminSdoId);
    });

    it('update a structured data should success', async () => {
      const res = await superClient.sdk.createStructuredData(
        {
          input: {
            id: adminSdoId,
            schemaId: adminSchemaId,
            data: { foo: 'admin 2 updated bar' }
          }
        },
        secondAdminOptions
      );
      expect(res.data.createStructuredData).toBeDefined();
    });

    it('delete existing org sdo should success', async () => {
      const res = await superClient.sdk.deleteStructuredData(
        { input: { id: adminSdoId, schemaId: adminSchemaId } },
        adminOptions
      );
      expect(res.data.deleteStructuredData).toBeDefined();
    });
  });

  describe('regular user tests', () => {
    it('should create a structured data success', async () => {
      const res = await superClient.sdk.createStructuredData(
        { input: { schemaId: adminSchemaId, data: { foo: 'bar' } } },
        adminOptions
      );
      expect(res.data.createStructuredData).toBeDefined();
      adminSdoId = res.data.createStructuredData!.id;
    });

    it('read sdo with schema query should success', async () => {
      const recResult: any = await superClient.query(
        getSchemaGql,
        { id: adminSchemaId },
        regularOptions
      );

      expect(recResult).toBeDefined();
      expect(recResult.schema).toBeDefined();
      expect(recResult.schema.id).toEqual(adminSchemaId);
      expect(recResult.schema.structuredDataObjects).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records).toBeDefined();
      expect(
        recResult.schema.structuredDataObjects.records.length
      ).toBeGreaterThan(0);
      expect(
        _.find(recResult.schema.structuredDataObjects.records, {
          id: adminSdoId
        })
      ).toBeDefined();
    });

    it('read existing org sdo should success', async () => {
      const res = await superClient.sdk.structuredData(
        { id: adminSdoId, schemaId: adminSchemaId },
        regularOptions
      );
      expect(res.data.structuredData).toBeDefined();
      expect(res.data.structuredData?.id).toEqual(adminSdoId);
      expect(res.data.structuredData?.schemaId).toEqual(adminSchemaId);
    });

    it('create a structured data should success', async () => {
      const res = await superClient.sdk.createStructuredData(
        {
          input: {
            schemaId: adminSchemaId,
            data: { foo: 'regular user bar' }
          }
        },
        regularOptions
      );
      expect(res.data.createStructuredData).toBeDefined();
      regularSdoId = res.data.createStructuredData!.id;
    });

    it('create folder content template with sdo should success', async () => {
      const templateRes = await superClient.sdk.createFolderContentTemplate(
        { input: { folderId, sdoId: regularSdoId, schemaId: adminSchemaId } },
        regularOptions
      );
      const folderContentTemplate =
        templateRes.data.createFolderContentTemplate;
      expect(folderContentTemplate?.id).toBeDefined();
      expect(folderContentTemplate?.sdoId).toEqual(regularSdoId);
    });
  });
});

async function createCmsFolderFlow(
  client: GraphqlClient,
  marker: string
): Promise<string> {
  const rootFoldersRes = await client.sdk.rootFolders({
    rootFolderType: RootFolderType.Cms
  });
  const rootFolders = rootFoldersRes.data.rootFolders ?? [];
  let cmsRootFolderId: string;

  if (rootFolders.length > 0) {
    cmsRootFolderId = rootFolders[0]!.id;
  } else {
    const createRootFolderRes = await client.sdk.createRootFolders({
      rootFolderType: RootFolderType.Cms
    });
    const createdRootFolders = createRootFolderRes.data.createRootFolders ?? [];
    cmsRootFolderId = createdRootFolders[1]!.treeObjectId!;
  }

  const folderRes = await client.sdk.createFolder({
    input: {
      name: `${marker}-folder-${uuidv4()}`,
      description: 'test folder for rbac created by admin user',
      parentId: cmsRootFolderId,
      rootFolderType: RootFolderType.Cms
    }
  });

  return folderRes.data.createFolder!.id;
}

const getSchemaGql = `query getSchema($id: ID!) {
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

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-legacy-sdo-' + uuidv4(),
    businessUnit: 'Legal',
    types: [OrganizationType.Agency, OrganizationType.Broadcaster],
    metadata: {
      features: {
        enableRBACFeature: 'disabled'
      }
    },
    applications: [
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
  },
  userInputs: [
    {
      name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      name: `${citestMarker}-second-admin-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      name: `${citestMarker}-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      name: `${citestMarker}-second-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    }
  ]
};
