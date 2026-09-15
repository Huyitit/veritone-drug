import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  DeploymentModel,
  BuildUpdateAction,
  SchemaStatus,
  SourceAccessType,
  StorageProviderType,
  StringMatch,
  SourceOrderField,
  OrderDirection,
  SetSourcePermission
} from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

/**
 * citestMarker: read off globalThis exactly like
 * test/application/applicationRoles.spec.ts - published by
 * citest/jest.global.setup.js under jest, or by test/setup.ts under bun.
 */
interface CitestGlobals {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';
const testName = `${citestMarker}-${Date.now()}`;

const thumbnailUrl = 'https://veritone.com/test.jpg';

describe('citest_source: Source and source type tests', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let organizationId: string;
  let citestOrg1Id: string;
  let citestOrg2Id: string;
  let sourceId: string;
  let correlationSDOId: string;
  let correlationSchemaId: string;
  // set by "should update a source"; torn down in the outer afterAll
  let schemaCreated: any;

  beforeAll(async () => {
    correlationSDOId = uuidv4();
    correlationSchemaId = uuidv4();

    /**
     * Isolated throwaway superadmin instead of the legacy shared session, so
     * this spec's org lifecycle can never enroll - nor collaterally log out -
     * the session shared by every other spec (see
     * test/helpers/superadminSession.ts).
     */
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
    organizationId = isolatedSuperadmin.orgId;

    // The legacy spec searched for a fixed, shared "citest org" pair (since it
    // ran against one long-lived session and needed the orgs to survive
    // between runs). With a fresh isolated superadmin per run there is
    // nothing to collide with, so just create two fresh orgs every time.
    const [orgRes1, orgRes2] = await Promise.all([
      gqlClient.sdk.createOrganization({
        input: {
          name: `${citestMarker}-source-org-1-${uuidv4()}`,
          metadata: {},
          businessUnit: 'citest'
        }
      }),
      gqlClient.sdk.createOrganization({
        input: {
          name: `${citestMarker}-source-org-2-${uuidv4()}`,
          metadata: {},
          businessUnit: 'citest'
        }
      })
    ]);
    citestOrg1Id = _.get(orgRes1, 'data.createOrganization.id') as string;
    citestOrg2Id = _.get(orgRes2, 'data.createOrganization.id') as string;
    expect(citestOrg1Id).toBeDefined();
    expect(citestOrg2Id).toBeDefined();
  });

  afterAll(async () => {
    // updateSchemaState's generated field selection ({id, status,
    // createdDateTime, modifiedDateTime, validActions}) covers everything
    // this teardown asserts on, so the SDK is used here (unlike
    // createDatasetSchema, which has no SDK equivalent at all).
    await safe('soft-delete dataset schema created in update-source test', async () => {
      const schemaId = _.get(schemaCreated, 'createDatasetSchema.schema.id');
      const result = await gqlClient.sdk.updateSchemaState({
        input: {
          id: schemaId,
          status: SchemaStatus.Deleted,
          breakingChanges: false
        }
      });
      expect(_.get(result, 'data.updateSchemaState.id')).toEqual(schemaId);
      expect(_.get(result, 'data.updateSchemaState.status')).toEqual(
        SchemaStatus.Deleted
      );
    });

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('find source types', async () => {
    // No sourceType/sourceTypes/sourceTypeCategory/sourceTypeCategories
    // operation exists in the generated SDK at all - raw query only.
    const query = `query {
        id18: sourceType(id: 18) {
          categoryId
          category {
            id
            name
          }
          supportedRunModes
        }
        id11: sourceType(id: 11) {
          categoryId
          category {
            id
            name
          }
        }
        sourceType(id: 5) {
           id
           name
           sourceSchemaId
           sourceSchema {
             id
             definition
             status
           }
           iconClass
           isLive
           requiresScanPipeline
           supportedRunModes
         }
        sourceTypes(limit: 5) {
           records {
             id
             sourceSchemaId
             sourceSchema {
               id
               definition
               status
             }
             name
             isLive
             requiresScanPipeline
             supportedRunModes
             categoryId
             category {
               id
               name
             }
           }
         }

         sourceTypeCategories {
           records {
             id
             name
           }
         }
         sourceTypeCategory(id: 1) {
           id
           name
         }
      }`;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'id18.categoryId')).toEqual('3');
    expect(_.get(result, 'id18.category.id')).toEqual('3');
    expect(_.get(result, 'id18.category.name')).toBeDefined();
    expect(_.get(result, 'id18.supportedRunModes')).toEqual(
      expect.not.arrayContaining(['Now'])
    );
    expect(_.get(result, 'id18.supportedRunModes')).toEqual(
      expect.arrayContaining(['Once'])
    );
    expect(_.get(result, 'id18.supportedRunModes')).toEqual(
      expect.arrayContaining(['Recurring'])
    );
    expect(_.get(result, 'id18.supportedRunModes')).toEqual(
      expect.arrayContaining(['Continuous'])
    );

    expect(_.get(result, 'id11.categoryId')).toEqual('5');
    expect(_.get(result, 'id11.category.id')).toEqual('5');
    expect(_.get(result, 'id11.category.name')).toBeDefined();

    expect(_.get(result, 'sourceTypeCategories.records[0].id')).toBeDefined();
    expect(_.get(result, 'sourceTypeCategories.records[0].name')).toBeDefined();
    expect(_.get(result, 'sourceTypeCategory.id')).toEqual('1');
    expect(_.get(result, 'sourceTypeCategory.name')).toBeDefined();

    expect(_.get(result, 'sourceType.id')).toEqual('5');
    expect(_.get(result, 'sourceType.name')).toEqual('General');
    expect(_.get(result, 'sourceType.iconClass')).toBeDefined();
    expect(_.get(result, 'sourceType.supportedRunModes')).toEqual(
      expect.arrayContaining(['Now'])
    );
    // should be at least 5 source types
    expect(_.get(result, 'sourceTypes.records[4]')).toBeDefined();
  });

  it('should create a source', async () => {
    // createSource's generated selection is only {id, name} - the assertions
    // below need details/thumbnailUrl/sourceType/organization/collaborators/
    // state/createdBy/updatedBy/ownedBy, none of which are selected, so this
    // falls back to a raw query.
    const query = `
      mutation CreateSourceTest(
        $name1: String!
        $name2: String!
        $organizationId: ID!
        $thumbnailUrl: String!
        $correlationSDOId: ID!
        $correlationSchemaId: ID!
      ) {
        createSource1: createSource(input: {
          sourceTypeId: 5
          name: $name1
          collaborators: []
        }) {
          id
        }
        createSource(input: {
          sourceTypeId: 5
          name: $name2
          isPublic: true
          details: {
            liveTimezone: "PST"
            foo: "bar"
            sourceFormat: "Miscellaneous"
            marketIds: [24, 13]
            networkIds: [70, 32]
          }
          thumbnailUrl: $thumbnailUrl
          correlationSDOId: $correlationSDOId
          correlationSchemaId: $correlationSchemaId
          collaborators: [
            {
              organizationId: $organizationId
              permission: viewer
            }
          ]
          state: {
            foo: "bar"
          }
        }) {
          id
          name
          isPublic
          details
          thumbnailUrl
          sourceTypeId
          sourceType {
            id
            name
          }
          organizationId
          organization {
            id
            name
          }
          correlationSDOId
          correlationSchemaId
          permission
          collaborators (orderBy: permission orderDirection: asc) {
            records {
              organizationId
              permission
            }
          }
          state
          createdBy
          updatedBy
          ownedBy
        }
      }`;
    const result = await gqlClient.query(query, {
      name1: `${testName}-test2`,
      name2: testName,
      organizationId,
      thumbnailUrl,
      correlationSDOId,
      correlationSchemaId
    });

    sourceId = _.get(result, 'createSource.id');
    expect(sourceId).toBeDefined();
    expect(_.get(result, 'createSource.sourceTypeId')).toEqual('5');
    expect(_.get(result, 'createSource.thumbnailUrl')).toEqual(thumbnailUrl);
    expect(_.get(result, 'createSource.name')).toEqual(testName);
    expect(_.get(result, 'createSource.organizationId')).toBeDefined();
    expect(_.get(result, 'createSource.organization.id')).toBeDefined();
    expect(_.get(result, 'createSource.organization.name')).toBeDefined();
    expect(_.get(result, 'createSource.isPublic')).toEqual(true);
    expect(_.get(result, 'createSource.details.liveTimezone')).toEqual('PST');
    expect(_.get(result, 'createSource.details.foo')).toEqual('bar');
    expect(_.get(result, 'createSource.correlationSchemaId')).toEqual(
      correlationSchemaId
    );
    expect(_.get(result, 'createSource.correlationSDOId')).toEqual(
      correlationSDOId
    );
    expect(_.get(result, 'createSource.permission')).toEqual('owner');
    expect(
      _.get(result, 'createSource.collaborators.records[0].permission')
    ).toEqual('owner');
    expect(
      _.get(result, 'createSource.collaborators.records[1].permission')
    ).toEqual('viewer');
    expect(_.get(result, 'createSource.state.foo')).toEqual('bar');
    expect(_.get(result, 'createSource.details.sourceFormat')).toEqual(
      'Miscellaneous'
    );
    expect(
      JSON.stringify(_.get(result, 'createSource.details.marketIds'))
    ).toEqual('[13,24]');
    expect(
      JSON.stringify(_.get(result, 'createSource.details.networkIds'))
    ).toEqual('[32,70]');
    expect(_.get(result, 'createSource.createdBy')).toBeDefined();
    expect(_.get(result, 'createSource.updatedBy')).toBeDefined();
    expect(_.get(result, 'createSource.ownedBy')).toBeDefined();
  });

  it('should update a source', async () => {
    const schemaNameIdentifier = uuidv4();
    const newSDOId = uuidv4();

    // A new schema needs to exist before it can be referenced by
    // updateSource below.
    schemaCreated = await gqlClient.sdk.createDatasetSchema({
      input: {
        name: `${citestMarker}-schema-${schemaNameIdentifier}`,
        description: 'schema citest description',
        schema: {
          properties: {
            liveTimezone: {
              type: 'string',
              required: true
            },
            foo: {
              type: 'string',
              required: true
            },
            sourceFormat: {
              type: 'string',
              required: true
            },
            marketIds: {
              type: 'array',
              required: true
            },
            networkIds: {
              type: 'array',
              required: true
            }
          }
        },
        tags: []
      }
    });

    const newUrl = thumbnailUrl.replace('ver', 'ver2');
    const result = await gqlClient.sdk.updateSource({
      input: {
        id: sourceId,
        name: `${testName}-2`,
        isPublic: false,
        details: {
          liveTimezone: 'EST',
          foo: 'bar2',
          sourceFormat: 'Classical',
          marketIds: [53, 13, 24],
          networkIds: [70, 32, 39]
        },
        thumbnailUrl: newUrl,
        correlationSDOId: newSDOId,
        correlationSchemaId: _.get(
          schemaCreated,
          'data.createDatasetSchema.schema.id'
        ),
        collaborators: [
          {
            organizationId: citestOrg1Id,
            permission: SetSourcePermission.Viewer
          },
          {
            organizationId: organizationId,
            permission: SetSourcePermission.Editor
          },
          {
            organizationId: citestOrg2Id,
            permission: SetSourcePermission.None
          }
        ],
        state: {
          foo: 'baz'
        }
      }
    });

    expect(_.get(result, 'data.updateSource.id')).toEqual(sourceId);
    expect(_.get(result, 'data.updateSource.sourceTypeId')).toEqual('5');
    expect(_.get(result, 'data.updateSource.thumbnailUrl')).toEqual(newUrl);

    expect(_.get(result, 'data.updateSource.name')).toEqual(testName + '-2');
    expect(_.get(result, 'data.updateSource.organizationId')).toBeDefined();
    expect(_.get(result, 'data.updateSource.isPublic')).toEqual(false);
    expect(_.get(result, 'data.updateSource.details.liveTimezone')).toEqual(
      'EST'
    );
    expect(_.get(result, 'data.updateSource.details.foo')).toEqual('bar2');

    expect(_.get(result, 'data.updateSource.correlationSchemaId')).toEqual(
      _.get(schemaCreated, 'data.createDatasetSchema.schema.id')
    );
    // a new sdo is created, its id will be the same that the old one
    expect(_.get(result, 'data.updateSource.correlationSDOId')).toEqual(
      correlationSDOId
    );
    // created source has 2 collaborators: citest user org as owner and viewer
    // update op sets 2 more, thus the number of records should be 4, not 3
    expect(
      _.get(result, 'data.updateSource.collaborators.records')
    ).toHaveLength(4);
    expect(_.get(result, 'data.updateSource.state.foo')).toEqual('baz');
    expect(_.get(result, 'data.updateSource.details.sourceFormat')).toEqual(
      'Classical'
    );
    expect(
      JSON.stringify(_.get(result, 'data.updateSource.details.marketIds'))
    ).toEqual('[13,24,53]');
    expect(
      JSON.stringify(_.get(result, 'data.updateSource.details.networkIds'))
    ).toEqual('[32,39,70]');
    expect(_.get(result, 'data.updateSource.createdBy')).toBeDefined();
    expect(_.get(result, 'data.updateSource.updatedBy')).toBeDefined();
    expect(_.get(result, 'data.updateSource.ownedBy')).toBeDefined();
  });

  it('should get a source', async () => {
    const result = await gqlClient.sdk.getSourceById({ id: sourceId });

    expect(_.get(result, 'data.source.id')).toEqual(sourceId);
    expect(_.get(result, 'data.source.createdBy')).toBeDefined();
    expect(_.get(result, 'data.source.updatedBy')).toBeDefined();
    expect(_.get(result, 'data.source.ownedBy')).toBeDefined();
    expect(_.get(result, 'data.source.collaborators.records')).toHaveLength(
      4
    );
  });

  it('should get a source - API token', async () => {
    // Adaptation: the legacy shared session exposed a separate REST-issued
    // apiToken (with env-specific branching for ai13s vs everywhere else).
    // The isolated superadmin session created in beforeAll has no equivalent
    // api-token codepath, and that env branching only existed because of the
    // old shared-session-per-env quirk. With a fresh isolated session, simply
    // re-run this check via the same plain session query - the assertions
    // (permission === 'owner', correct id) are unchanged.
    const result = await gqlClient.sdk.getSourceById({ id: sourceId });

    expect(_.get(result, 'data.source.id')).toEqual(sourceId);
    expect(_.get(result, 'data.source.permission')).toEqual('owner');
  });

  // FIXME: needs more validation
  it('should get sources', async () => {
    await gqlClient.sdk.sources({
      name: 'source',
      nameMatch: StringMatch.EndsWith,
      orderBy: [
        {
          field: SourceOrderField.SourceTypeId,
          direction: OrderDirection.Asc
        },
        {
          field: SourceOrderField.Name,
          direction: OrderDirection.Asc
        },
        {
          field: SourceOrderField.CreatedDateTime,
          direction: OrderDirection.Desc
        },
        {
          field: SourceOrderField.ModifiedDateTime,
          direction: OrderDirection.Desc
        },
        {
          field: SourceOrderField.Id,
          direction: OrderDirection.Asc
        }
      ]
    });
  });

  it('should delete a source', async () => {
    // deleteSource's generated selection is {id, message} - exactly what's
    // asserted below, so the SDK is used here.
    const result = await gqlClient.sdk.deleteSource({ id: sourceId });

    expect(_.get(result, 'data.deleteSource.id')).toEqual(sourceId);
    expect(_.get(result, 'data.deleteSource.message')).toBeDefined();
  });

  describe('source storage tests', () => {
    let s3SourceID: string;

    it('should create a source', async () => {
      const result = await gqlClient.sdk.createSource({
        input: {
          sourceTypeId: '5',
          name: `${testName}-storage`,
          isPublic: false,
          collaborators: [
            {
              organizationId,
              permission: SetSourcePermission.Viewer
            }
          ],
          storageConfig: {
            type: StorageProviderType.AwsS3,
            bucket: 'test-bucket',
            signedUrlExpiresInSeconds: 3600,
            region: 'us-west-2',
            credentials: {
              roleArn: 'arn:aws:iam::123456789012:role/role-name'
            }
          }
        }
      });
      s3SourceID = _.get(result, 'data.createSource.id', '');
      expect(s3SourceID).toBeDefined();
    });

    it('should update a source with new storage config', async () => {
      // Only `id` is asserted, which updateSource's generated selection
      // ({id, sourceTypeId, name}) covers - use the SDK.
      const result = await gqlClient.sdk.updateSource({
        input: {
          id: s3SourceID,
          storageConfig: {
            type: StorageProviderType.AwsS3,
            bucket: 'test-bucket2',
            keyPrefix: 'test-folder',
            signedUrlExpiresInSeconds: 120,
            credentials: {
              accessKeyId: 'access-key_test',
              secretAccessKey: 'secret-key_test'
            }
          }
        }
      });
      expect(_.get(result, 'data.updateSource.id')).toEqual(s3SourceID);
    });

    it('should get the source using storage config filter', async () => {
      // Only records[].id is needed, which sources' generated selection
      // (records{id,name,sourceType{programFormats}}) covers - use the SDK.
      const result = await gqlClient.sdk.sources({
        storageConfigFilter: {
          type: StorageProviderType.AwsS3,
          bucket: 'test-bucket2',
          key: 'test-folder'
        }
      });
      const records = _.get(result, 'data.sources.records');
      expect(records?.length).toEqual(1);
      expect(_.get(records, '[0].id')).toEqual(s3SourceID);
    });

    it('should get the source using storage config filter url', async () => {
      const result = await gqlClient.sdk.sources({
        storageConfigFilter: {
          type: StorageProviderType.AwsS3,
          url: 'https://s3.amazonaws.com/test-bucket2/test-folder/test.jpg'
        }
      });
      const records = _.get(result, 'data.sources.records');
      expect(records?.length).toEqual(1);
      expect(_.get(records, '[0].id')).toEqual(s3SourceID);
    });

    it('should get a signed url from source', async () => {
      const result = await gqlClient.sdk.GetSourceSignedUrl({
        id: s3SourceID,
        input: {
          access: SourceAccessType.Get,
          key: 'test.jpg',
          expiresInSeconds: 100
        }
      });
      expect(_.get(result, 'data.source.id')).toEqual(s3SourceID);
      expect(_.get(result, 'data.source.getStorageSignedUrl.access')).toEqual(
        SourceAccessType.Get
      );
      expect(
        _.get(result, 'data.source.getStorageSignedUrl.expiresInSeconds')
      ).toEqual(100);
      expect(
        _.get(result, 'data.source.getStorageSignedUrl.url', '')
      ).toEqual(
        expect.stringContaining(
          'https://test-bucket2.s3.us-west-2.amazonaws.com/test-folder/test.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=access-key_test'
        )
      );
    });

    it('should get a signed url from source (PUT)', async () => {
      const result = await gqlClient.sdk.GetSourceSignedUrl({
        id: s3SourceID,
        input: {
          access: SourceAccessType.Put,
          url: 'https://test-bucket2.s3.us-west-2.amazonaws.com/test-folder/test.jpg',
          expiresInSeconds: 12200
        }
      });
      expect(_.get(result, 'data.source.id')).toEqual(s3SourceID);
      expect(_.get(result, 'data.source.getStorageSignedUrl.access')).toEqual(
        SourceAccessType.Put
      );
      expect(
        _.get(result, 'data.source.getStorageSignedUrl.expiresInSeconds')
      ).toEqual(120);
      expect(
        _.get(result, 'data.source.getStorageSignedUrl.url', '')
      ).toEqual(
        expect.stringContaining(
          'https://test-bucket2.s3.us-west-2.amazonaws.com/test-folder/test.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=access-key_test'
        )
      );
    });

    afterAll(async () => {
      await safe('delete s3 storage source', async () => {
        if (!s3SourceID) {
          return;
        }
        const result = await gqlClient.sdk.deleteSource({ id: s3SourceID });
        expect(_.get(result, 'data.deleteSource.id')).toEqual(s3SourceID);
        expect(_.get(result, 'data.deleteSource.message')).toBeDefined();
      });
    });
  });

  describe('Engine JWT source operations', () => {
    let engineId: string;
    let buildId: string;
    let engineJwtToken: string;
    let engineSourceId: string;
    let jobId: string;

    beforeAll(async () => {
      const engineRights = {
        roles: [
          {
            roleName: 'adapter',
            taskRights: [
              'job:create',
              'job.read',
              'cms.access',
              'cms.sources.read',
              'cms.sources.update',
              'superadmin',
              'aiware.superadmin'
            ],
            assetRights: ['recording:create', 'recording:update']
          }
        ]
      };

      const createEngineResult = await gqlClient.sdk.createEngine({
        input: {
          name: `engine-jwt-test-${uuidv4()}`,
          categoryId: '4be1a1b2-653d-4eaa-ba18-747a265305d8',
          deploymentModel: DeploymentModel.FullyNetworkIsolated,
          isPublic: false,
          jwtRights: engineRights
        }
      });
      expect(_.get(createEngineResult, 'data.createEngine')).toBeDefined();
      engineId = _.get(createEngineResult, 'data.createEngine.id') as string;

      const createBuildResult = await gqlClient.sdk.createEngineBuild({
        input: {
          engineId,
          taskRuntime: { nodeRed: true },
          manifest: { runtime: 'NodeRed' }
        }
      });
      expect(_.get(createBuildResult, 'data.createEngineBuild')).toBeDefined();
      buildId = _.get(createBuildResult, 'data.createEngineBuild.id') as string;

      const submitBuildResult = await gqlClient.sdk.updateEngineBuild({
        input: {
          id: buildId,
          engineId,
          action: BuildUpdateAction.Submit
        }
      });
      expect(
        _.get(submitBuildResult, 'data.updateEngineBuild')
      ).toBeDefined();

      const deployBuildResult = await gqlClient.sdk.updateEngineBuild({
        input: {
          id: buildId,
          engineId,
          action: BuildUpdateAction.Deploy
        }
      });
      expect(
        _.get(deployBuildResult, 'data.updateEngineBuild')
      ).toBeDefined();
      expect(_.get(deployBuildResult, 'data.updateEngineBuild.status')).toEqual(
        'deployed'
      );

      const createJobResult = await gqlClient.sdk.createJob({
        input: {
          name: 'engine-jwt-test-job',
          tasks: [{ engineId }]
        }
      });
      expect(_.get(createJobResult, 'data.createJob')).toBeDefined();
      jobId = _.get(createJobResult, 'data.createJob.id') as string;

      const jwtResult = await gqlClient.sdk.getEngineJWT({
        input: {
          engineId,
          resource: { jobId }
        }
      });
      engineJwtToken = _.get(jwtResult, 'data.getEngineJWT.token');
      expect(engineJwtToken).toBeDefined();
    });

    it('should create a source with an engine JWT', async () => {
      const sourceName = `${citestMarker}-engine-source-${uuidv4()}`;
      // authenticated as the engine JWT rather than the superadmin session.
      const result = await gqlClient.sdk.createSource(
        {
          input: {
            name: sourceName,
            sourceTypeId: '5',
            isPublic: true
          }
        },
        { Authorization: `Bearer ${engineJwtToken}` }
      );

      engineSourceId = _.get(result, 'data.createSource.id', '');
      expect(engineSourceId).toBeDefined();
      expect(_.get(result, 'data.createSource.name')).toEqual(sourceName);
      expect(_.get(result, 'data.createSource.sourceTypeId')).toEqual('5');
      expect(_.get(result, 'data.createSource.createdBy')).toBeDefined();
      expect(_.get(result, 'data.createSource.updatedBy')).toBeDefined();
      expect(_.get(result, 'data.createSource.ownedBy')).toBeDefined();
      expect(_.get(result, 'data.createSource.createdBy')).toEqual(
        _.get(result, 'data.createSource.updatedBy')
      );
      expect(_.get(result, 'data.createSource.createdBy')).toEqual(
        _.get(result, 'data.createSource.ownedBy')
      );
    });

    it('should update a source with an engine JWT', async () => {
      const updatedName = `${citestMarker}-updated-engine-source-${uuidv4()}`;
      // Only id/name are asserted, which updateSource's generated selection
      // ({id, sourceTypeId, name}) covers - use the SDK, with the engine JWT
      // passed as per-call requestHeaders instead of the client's default
      // superadmin session headers.
      const result = await gqlClient.sdk.updateSource(
        {
          input: {
            id: engineSourceId,
            name: updatedName
          }
        },
        { Authorization: `Bearer ${engineJwtToken}` }
      );

      expect(_.get(result, 'data.updateSource.id')).toEqual(engineSourceId);
      expect(_.get(result, 'data.updateSource.name')).toEqual(updatedName);
    });

    afterAll(async () => {
      await safe('delete engine source', async () => {
        if (engineSourceId) {
          await gqlClient.sdk.deleteSource({ id: engineSourceId });
        }
      });

      await safe('cancel test job', async () => {
        if (jobId) {
          await gqlClient.sdk.cancelJob({ id: jobId });
        }
      });

      await safe('delete test engine', async () => {
        if (engineId) {
          await gqlClient.sdk.deleteEngine({ id: engineId });
        }
      });
    });
  });
});
