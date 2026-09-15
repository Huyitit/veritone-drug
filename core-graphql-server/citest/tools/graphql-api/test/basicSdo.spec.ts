import {
  createGraphqlClient,
  AuthType,
  GraphqlClient,
  buildRequestHeaders
} from '../src/graphqlUtil';
import { v4 as uuidv4 } from 'uuid';
import { OrganizationType, SchemaStatus } from '../src/gql/gql';

let sdoId: string, dataRegistryId: string, schemaId: string;
let adminRequestHeaders: Record<string, string>;
let orgId: string;

const citestMarker = `citest-should-delete-sdo`;
const startDateTime =
  new Date(Date.now() - 2 * 60 * 60 * 1000).getTime() / 1000;
const stopDateTime = new Date(Date.now() - 1 * 60 * 60 * 1000).getTime() / 1000;
const testName = `${citestMarker}_basicsdo_` + Date.now();
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const orgInput = {
  name: `${citestMarker}-org-${uuidv4()}`,
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
};

function getAdminUserInput() {
  return {
    name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
    password: 'testPassword',
    roleIds: [
      isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
      '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
      'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
    ].filter((roleId) => roleId)
  };
}

let adminUserInput;

describe('citest_structureddata: basic sdo operations', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    // create organization
    const createOrgResult = await gqlClient.sdk.createOrganization({
      input: orgInput
    });

    orgId = createOrgResult?.data?.createOrganization?.id as string;
    expect(orgId).toBeDefined();

    // create admin user
    adminUserInput = getAdminUserInput();
    const createAdminUserResult = await gqlClient.sdk.createUser({
      input: {
        ...adminUserInput,
        organizationId: orgId
      }
    });
    expect(createAdminUserResult?.data?.createUser?.id).toBeDefined();

    adminRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: adminUserInput.name,
      password: adminUserInput.password
    });
  });

  // Setup resources
  it('create data registry with superadmin token', async () => {
    const result = await gqlClient.sdk.createDataRegistry({
      input: {
        name: `test-data-registry-${uuidv4()}`,
        description: `test-data-registry-${uuidv4()}`,
        source: `test-data-registry-source-${uuidv4()}`
      }
    });
    const superOrgId = 7682;
    expect(result?.data?.createDataRegistry?.id).toBeDefined();
    expect(result?.data?.createDataRegistry?.organizationId).toBe(
      superOrgId.toString()
    );
  });

  it('creates a data registry with admin token', async () => {
    const result = await gqlClient.sdk.createDataRegistry(
      {
        input: {
          name: `test-data-registry-${uuidv4()}`,
          description: `test-data-registry-${uuidv4()}`,
          source: `test-data-registry-source-${uuidv4()}`
        }
      },
      adminRequestHeaders
    );

    dataRegistryId = result?.data?.createDataRegistry?.id as string;
    expect(dataRegistryId).toBeDefined();
    expect(result?.data?.createDataRegistry?.organizationId).toBe(orgId);
  });

  it('creates a schema', async () => {
    const result = await gqlClient.sdk.createSchema(
      {
        input: {
          id: uuidv4(),
          majorVersion: 1,
          minorVersion: 0,
          status: SchemaStatus.Published,
          dataRegistryId: dataRegistryId,
          definition: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        }
      },
      adminRequestHeaders
    );

    schemaId = result?.data?.createSchema?.id as string;
    expect(schemaId).toBeDefined();
  });

  it('creates a SDO', async () => {
    const result = await gqlClient.sdk.createStructuredData(
      {
        input: {
          schemaId: schemaId,
          data: {
            name: 'test'
          }
        }
      },
      adminRequestHeaders
    );

    sdoId = result?.data?.createStructuredData?.id as string;
    expect(sdoId).toBeDefined();
  });

  it('updates the created resource', async () => {
    // TODO: Add your update operation here
    // Example: const result = await gqlClient.sdk.updateSomething({ ... });
    // expect(result).toBeDefined();
  });

  it('queries the created resources', async () => {
    // TODO: Add your query operations here
    // Example: const result = await gqlClient.sdk.getSomething({ ... });
    // expect(result.data).toBeDefined();
  });

  it('handles error cases properly', async () => {
    try {
      // TODO: Add operation that should fail
      // const result = await gqlClient.sdk.invalidOperation({ ... });
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  // Cleanup resources
  it('deletes the SDO', async () => {
    const result = await gqlClient.sdk.deleteStructuredData(
      { input: { id: sdoId, schemaId: schemaId } },
      adminRequestHeaders
    );
    expect(result?.data?.deleteStructuredData?.id).toBe(sdoId);
  });

  // delete the schema
  // delete the data registry
  // delete the organization
  // delete the users
});
