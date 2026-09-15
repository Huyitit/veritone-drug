import { OrganizationStatus, OrganizationType } from '../../src/gql';
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
const libraryName = `${citestMarker}-collab-library-${appKey}`;
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

describe('citest_library: libraryCollaborator create/update/delete', () => {
  let gqlClient: GraphqlClient;
  let libraryId: string;

  let orgBId: string;
  let orgBUserId: string;
  let orgBHeaders: { headers: { Authorization: string } };

  let orgCId: string;
  let orgCUserId: string;
  let orgCHeaders: { headers: { Authorization: string } };

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    const orgB = await createCollaboratorOrgWithUser(
      `${citestMarker}-b`,
      appKey,
      gqlClient
    );
    orgBId = orgB.orgId;
    orgBUserId = orgB.userId;
    orgBHeaders = orgB.headers;

    const orgC = await createCollaboratorOrgWithUser(
      `${citestMarker}-c`,
      appKey,
      gqlClient
    );
    orgCId = orgC.orgId;
    orgCUserId = orgC.userId;
    orgCHeaders = orgC.headers;

    const libraryResult = await gqlClient.sdk.createLibrary({
      input: {
        name: libraryName,
        libraryTypeId: 'people'
      }
    });
    libraryId = libraryResult?.data?.createLibrary?.id as string;
    expect(libraryId).toBeDefined();
  });

  afterAll(async () => {
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
    if (orgCUserId) {
      await safe('delete org C user', () =>
        gqlClient.sdk.deleteUser({ id: orgCUserId })
      );
    }

    if (orgBId) {
      await safe('soft-delete org B', () =>
        gqlClient.sdk.updateOrganization({
          input: { id: orgBId, status: OrganizationStatus.Deleted }
        })
      );
    }
    if (orgCId) {
      await safe('soft-delete org C', () =>
        gqlClient.sdk.updateOrganization({
          input: { id: orgCId, status: OrganizationStatus.Deleted }
        })
      );
    }
  });

  it('creates a library collaborator for org B with read permission', async () => {
    const result = await gqlClient.sdk.createLibraryCollaborator({
      input: {
        libraryId,
        organizationId: Number(orgBId),
        permissions: ['read']
      }
    });

    expect(
      String(result?.data?.createLibraryCollaborator?.organizationId)
    ).toEqual(String(orgBId));
    expect(result?.data?.createLibraryCollaborator?.status).toEqual('active');
  });

  it('org B (read-only collaborator) can read the library', async () => {
    const result = await gqlClient.sdk.library(
      { id: libraryId },
      getRequestHeaders(orgBHeaders)
    );

    expect(result?.data?.library?.id).toEqual(libraryId);
  });

  // unskip after VE-25969 is DONE
  xit('org B (read-only collaborator) cannot create an entity in the library', async () => {
    const promise = gqlClient.sdk.createEntity(
      {
        input: {
          libraryId,
          name: `${citestMarker}-collab-entity-denied-${appKey}`
        }
      },
      getRequestHeaders(orgBHeaders)
    );

    await expect(promise).rejects.toThrow('not_allowed');
  });

  it('updates the collaborator to grant write access', async () => {
    const result = await gqlClient.sdk.updateLibraryCollaborator({
      input: {
        libraryId,
        organizationId: Number(orgBId),
        permissions: ['read', 'write']
      }
    });

    expect(result?.data?.updateLibraryCollaborator?.permissions).toEqual(
      expect.arrayContaining(['read', 'write'])
    );
  });

  it('org B can now create an entity in the library', async () => {
    const result = await gqlClient.sdk.createEntity(
      {
        input: {
          libraryId,
          name: `${citestMarker}-collab-entity-allowed-${appKey}`
        }
      },
      getRequestHeaders(orgBHeaders)
    );

    expect(result?.data?.createEntity?.id).toBeDefined();
  });

  it('org C (non-collaborator) cannot see the library', async () => {
    const promise = gqlClient.sdk.library(
      { id: libraryId },
      getRequestHeaders(orgCHeaders)
    );

    await expect(promise).rejects.toThrow('not_found');
  });

  it('includeOwnedOnly excludes collaborated libraries for org B', async () => {
    const result = await gqlClient.sdk.libraries(
      { name: libraryName, includeOwnedOnly: true },
      getRequestHeaders(orgBHeaders)
    );

    const ids = (result?.data?.libraries?.records || []).map((r: any) => r.id);
    expect(ids).not.toContain(libraryId);
  });

  it('includeOwnedOnly: false (default) includes collaborated libraries for org B', async () => {
    const result = await gqlClient.sdk.libraries(
      { name: libraryName },
      getRequestHeaders(orgBHeaders)
    );

    const ids = (result?.data?.libraries?.records || []).map((r: any) => r.id);
    expect(ids).toContain(libraryId);
  });

  it('deletes the library collaborator', async () => {
    const result = await gqlClient.sdk.deleteLibraryCollaborator({
      libraryId,
      organizationId: orgBId
    });

    expect(result?.data?.deleteLibraryCollaborator?.id).toBeDefined();
  });

  it('org B loses access to the library after the collaborator is deleted', async () => {
    const promise = gqlClient.sdk.library(
      { id: libraryId },
      getRequestHeaders(orgBHeaders)
    );

    await expect(promise).rejects.toThrow('not_found');
  });
});
