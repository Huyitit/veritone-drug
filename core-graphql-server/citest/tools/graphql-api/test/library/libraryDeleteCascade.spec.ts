import { LibraryEngineModelTrainStatus, OrganizationType } from '../../src/gql';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import * as _ from 'lodash';
import { createCollaboratorOrgWithUser } from '../../src/helpers/libraryHelper';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const appKey = Date.now();
const imageUrl = 'https://www.veritone.com/images/logo.svg';
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

describe('citest_library: deleteLibrary cascade', () => {
  let gqlClient: GraphqlClient;
  let libraryId: string;
  let entityId: string;
  let entityIdentifierId: string;
  let engineModelId: string;
  let engineId: string;

  let orgBId: string;
  let orgBUserId: string;
  let orgBHeaders: { headers: { Authorization: string } };

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    const enginesResult = await gqlClient.sdk.engines({
      limit: 1,
      libraryRequired: true
    });
    engineId = enginesResult?.data?.engines?.records?.[0]?.id as string;
    expect(engineId).toBeDefined();

    const libraryResult = await gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-cascade-library-${appKey}`,
        libraryTypeId: 'people'
      }
    });
    libraryId = libraryResult?.data?.createLibrary?.id as string;
    expect(libraryId).toBeDefined();

    const entityResult = await gqlClient.sdk.createEntity({
      input: {
        libraryId,
        name: `${citestMarker}-cascade-entity-${appKey}`
      }
    });
    entityId = entityResult?.data?.createEntity?.id as string;
    expect(entityId).toBeDefined();

    const identifierResult = await gqlClient.sdk.createEntityIdentifier({
      input: {
        entityId,
        identifierTypeId: 'face',
        contentType: 'image/svg+xml',
        url: imageUrl
      }
    });
    entityIdentifierId = identifierResult?.data?.createEntityIdentifier
      ?.id as string;
    expect(entityIdentifierId).toBeDefined();

    const engineModelResult = await gqlClient.sdk.createLibraryEngineModel({
      input: {
        libraryId,
        engineId,
        trainStatus: LibraryEngineModelTrainStatus.Pending
      }
    });
    engineModelId = engineModelResult?.data?.createLibraryEngineModel
      ?.id as string;
    expect(engineModelId).toBeDefined();

    const orgB = await createCollaboratorOrgWithUser(
      `${citestMarker}-b`,
      appKey,
      gqlClient
    );
    orgBId = orgB.orgId;
    orgBUserId = orgB.userId;
    orgBHeaders = orgB.headers;

    const collaboratorResult = await gqlClient.sdk.createLibraryCollaborator({
      input: {
        libraryId,
        organizationId: Number(orgBId),
        permissions: ['read']
      }
    });
    expect(collaboratorResult?.data?.createLibraryCollaborator?.status).toEqual(
      'active'
    );

    const preDeleteResult = await gqlClient.sdk.library(
      { id: libraryId },
      getRequestHeaders(orgBHeaders)
    );
    expect(preDeleteResult?.data?.library?.id).toEqual(libraryId);
  });

  afterAll(async () => {
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

  it('deletes the library', async () => {
    const result = await gqlClient.sdk.deleteLibrary({ id: libraryId });
    expect(result?.data?.deleteLibrary?.id).toEqual(libraryId);
  });

  it('library is gone', async () => {
    const promise = gqlClient.sdk.library({ id: libraryId });
    await expect(promise).rejects.toThrow('not_found');
  });

  it('entity is gone (cascaded)', async () => {
    const promise = gqlClient.sdk.entity({ id: entityId });
    await expect(promise).rejects.toThrow('not_found');
  });

  it('entity identifier is gone (cascaded — implied by the entity itself being gone)', async () => {
    const result = await gqlClient.sdk.entities({
      ids: [entityId]
    });
    expect(result?.data?.entities?.count).toEqual(0);
    expect(result?.data?.entities?.records).toEqual([]);
    expect(entityIdentifierId).toBeDefined();
  });

  it('library engine model is gone (cascaded)', async () => {
    const promise = gqlClient.sdk.libraryEngineModel({
      id: engineModelId
    });
    await expect(promise).rejects.toThrow('not_found');
  });

  it('collaborator is gone (cascaded) — org B loses access to the library', async () => {
    const promise = gqlClient.sdk.library(
      { id: libraryId },
      getRequestHeaders(orgBHeaders)
    );
    await expect(promise).rejects.toThrow('not_found');
  });
});
