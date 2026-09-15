import { LibraryEngineModelTrainStatus, OrganizationType } from '../../src/gql';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import * as _ from 'lodash';
import { createCollaboratorOrgWithUser } from '../../src/helpers/libraryHelper';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const appKey = Date.now();
const libraryName = `${citestMarker}-configuration-library-${appKey}`;
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

describe('citest_library: libraryConfiguration create/update/delete', () => {
  let gqlClient: GraphqlClient;
  let libraryId: string;
  let engineId1: string;
  let engineId2: string;
  let engineCategoryId: string;
  let configurationId: string;
  let engineModelId: string;
  let engineModelConfigurationId: string;

  let orgBId: string;
  let orgBUserId: string;
  let orgBHeaders: { headers: { Authorization: string } };

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    const enginesResult = await gqlClient.sdk.engines({
      limit: 2,
      libraryRequired: true
    });
    const engineRecords = enginesResult?.data?.engines?.records || [];
    expect(engineRecords.length).toBeGreaterThan(0);
    engineId1 = engineRecords[0]?.id!;
    engineCategoryId = engineRecords[0]?.categoryId!;
    engineId2 = engineRecords[1]?.id || engineId1;
    expect(engineId1).toBeDefined();
    expect(engineCategoryId).toBeDefined();

    const libraryResult = await gqlClient.sdk.createLibrary({
      input: {
        name: libraryName,
        libraryTypeId: 'people'
      }
    });
    libraryId = libraryResult?.data?.createLibrary?.id!;
    expect(libraryId).toBeDefined();

    const orgB = await createCollaboratorOrgWithUser(
      `${citestMarker}-b`,
      appKey,
      gqlClient
    );
    orgBId = orgB.orgId;
    orgBUserId = orgB.userId;
    orgBHeaders = orgB.headers;
  });

  afterAll(async () => {
    if (engineModelId) {
      await safe('delete library engine model', () =>
        gqlClient.sdk.deleteLibraryEngineModel({ id: engineModelId })
      );
    }

    if (configurationId) {
      await safe('delete library configuration', () =>
        gqlClient.sdk.deleteLibraryConfiguration({ id: configurationId })
      );
    }

    if (engineModelConfigurationId) {
      await safe('delete engine model library configuration', () =>
        gqlClient.sdk.deleteLibraryConfiguration({
          id: engineModelConfigurationId
        })
      );
    }

    if (libraryId) {
      await safe('delete library', () =>
        gqlClient.sdk.deleteLibrary({ id: libraryId })
      );
    }

    if (orgBUserId) {
      await safe('delete org B user', () =>
        gqlClient.sdk.deleteUser({ id: orgBUserId })
      );
    }
    if (orgBId) {
      await safe('soft-delete org B', () =>
        gqlClient.sdk.updateOrganization({
          input: { id: orgBId, status: 'deleted' }
        })
      );
    }
  });

  it('creates a library configuration', async () => {
    const result = await gqlClient.sdk.createLibraryConfiguration({
      input: {
        libraryId,
        engineCategoryId,
        targetEngineIds: [engineId1],
        confidence: { min: 0.5, max: 1.0, allowNull: false }
      }
    });

    configurationId = result?.data?.createLibraryConfiguration?.id!;
    expect(configurationId).toBeDefined();
    expect(result?.data?.createLibraryConfiguration?.engineCategoryId).toEqual(
      engineCategoryId
    );
    expect(result?.data?.createLibraryConfiguration?.targetEngineIds).toEqual([
      engineId1
    ]);
  });

  // unskip after VE-25965 is DONE
  xit('creates a library configuration without confidence', async () => {
    const result = await gqlClient.sdk.createLibraryConfiguration({
      input: {
        libraryId,
        engineCategoryId,
        targetEngineIds: [engineId1]
      }
    });

    const noConfidenceConfigurationId =
      result?.data?.createLibraryConfiguration?.id!;
    expect(noConfidenceConfigurationId).toBeDefined();

    await safe('delete no-confidence library configuration', () =>
      gqlClient.sdk.deleteLibraryConfiguration({
        id: noConfidenceConfigurationId
      })
    );
  });

  it('includes the created configuration when querying the library', async () => {
    const result = await gqlClient.sdk.library({
      id: libraryId
    });

    const ids = (result?.data?.library?.configurations?.records || []).map(
      (r: any) => r.id
    );
    expect(ids).toContain(configurationId);
  });

  // unskip when VE-25967 is DONE
  xit('updates the configuration', async () => {
    const result = await gqlClient.sdk.updateLibraryConfiguration({
      input: {
        id: configurationId,
        targetEngineIds: [engineId2],
        confidence: { min: 0.6, max: 0.9, allowNull: true }
      }
    });

    expect(result?.data?.updateLibraryConfiguration?.id).toEqual(
      configurationId
    );
    expect(result?.data?.updateLibraryConfiguration?.targetEngineIds).toEqual([
      engineId2
    ]);
    expect(result?.data?.updateLibraryConfiguration?.confidence).toEqual({
      min: 0.6,
      max: 0.9,
      allowNull: true
    });
  });

  it('associates an engine model with the configuration', async () => {
    const configurationResult = await gqlClient.sdk.createLibraryConfiguration({
      input: {
        libraryId,
        engineCategoryId,
        targetEngineIds: [engineId1],
        confidence: { min: 0.5, max: 1.0, allowNull: false }
      }
    });
    engineModelConfigurationId =
      configurationResult?.data?.createLibraryConfiguration?.id!;
    expect(engineModelConfigurationId).toBeDefined();

    const result = await gqlClient.sdk.createLibraryEngineModel({
      input: {
        libraryId,
        engineId: engineId1,
        configurationId: engineModelConfigurationId,
        trainStatus: LibraryEngineModelTrainStatus.Pending
      }
    });

    engineModelId = result?.data?.createLibraryEngineModel?.id!;
    expect(engineModelId).toBeDefined();
    expect(result?.data?.createLibraryEngineModel?.configurationId).toEqual(
      engineModelConfigurationId
    );

    const modelResult = await gqlClient.sdk.libraryEngineModel({
      id: engineModelId
    });
    expect(modelResult?.data?.libraryEngineModel?.configurationId).toEqual(
      engineModelConfigurationId
    );
  });

  // unskip after VE-25968 is DONE
  xit("non-owner org cannot create a configuration for another org's library", async () => {
    const promise = gqlClient.sdk.createLibraryConfiguration(
      {
        input: {
          libraryId,
          engineCategoryId,
          targetEngineIds: [engineId1],
          confidence: { min: 0.5, max: 1.0, allowNull: false }
        }
      },
      getRequestHeaders(orgBHeaders)
    );

    await expect(promise).rejects.toThrow('not_found');
  });

  it('deletes the configuration', async () => {
    const result = await gqlClient.sdk.deleteLibraryConfiguration({
      id: configurationId
    });

    expect(result?.data?.deleteLibraryConfiguration?.id).toEqual(
      configurationId
    );

    const libraryResult = await gqlClient.sdk.library({
      id: libraryId
    });
    const ids = (
      libraryResult?.data?.library?.configurations?.records || []
    ).map((r: any) => r.id);
    expect(ids).not.toContain(configurationId);

    configurationId = '';
  });
});
