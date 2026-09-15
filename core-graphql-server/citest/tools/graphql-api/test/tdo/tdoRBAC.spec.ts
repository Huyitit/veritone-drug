import * as uuid from 'uuid';
import * as _ from 'lodash';
import { GraphqlClient, AuthType, createGraphqlClient } from '@api/src/graphqlUtil';
import { impersonateUser } from '@api/src/helpers/commonHelper';
import { setupTestOrgAndUser } from '@api/test/helpers/organization.helper';
import type { ServerFeatureFlags } from '@api/test/helpers/featureFlags';
import {
  MeQuery,
  OrganizationsQuery,
  RootFolderType
} from '@api/src/gql/gql';

/**
 * Feature-flag and marker globals are published by the Jest harness
 * (`jest.global.setup.js`) and mirrored by the Bun preload, so they can be read
 * synchronously — no top-level await, which ts-jest (CommonJS) cannot compile.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = citestGlobals.enableDefaultDesktopApp ?? true;

/**
 * `useRBACFeature` was previously derived by introspecting for the
 * `AuthPermissionSet` type, which was only ever a proxy for this server flag.
 * The flag itself is authoritative and already typed.
 */
const useRBACFeature = citestGlobals.enableRBACFeature ?? false;

/** Per-request header maps produced by `impersonateUser`. */
type RequestHeaders = Record<string, string>;

type OrgRecord = NonNullable<
  NonNullable<NonNullable<OrganizationsQuery['organizations']>['records']>[number]
>;
type OrgUser = NonNullable<
  NonNullable<NonNullable<OrgRecord['users']>['records']>[number]
>;
type AuthGroupRef = NonNullable<
  NonNullable<NonNullable<MeQuery['me']>['authGroups']>['records'][number]
>;

describe('citest_tdo: TDO RBAC', () => {
  // Assigned in beforeAll: `GraphqlClient` is a TS interface (erased at
  // runtime), so it cannot be constructed — the client comes from
  // createGraphqlClient().
  let gqlClient: GraphqlClient;

  let tdoId: string | null = null;
  let folderId: string | null = null;
  let folderId1: string | null = null;
  let defaultAGsToRemoveMember: AuthGroupRef[] = [];
  let regularUserId: string | null = null;
  let superAdminOptions: RequestHeaders;
  let adminOptions: RequestHeaders;
  let regularOptions: RequestHeaders;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();
    const superToken = gqlClient.sessionToken as string;

    const spadminMe = await gqlClient.sdk.me({});
    const superUser = spadminMe?.data?.me ?? null;
    if (!superUser) {
      throw new Error('tdoRBAC: superadmin `me` returned no user');
    }
    const superOrgGuid = superUser.organization?.guid ?? null;
    if (!superOrgGuid) {
      throw new Error('tdoRBAC: superadmin has no organization guid');
    }

    const testOrgData = await setupTestOrgAndUser(
      gqlClient,
      createOrgAndUserInput
    );

    const testOrg: OrgRecord | null = testOrgData.org ?? null;
    expect(testOrg).toBeDefined();
    expect(testOrg?.name).toContain(`${citestMarker}-org`);
    expect(testOrg?.users).toBeDefined();

    const testUsers: OrgUser[] = (testOrg?.users?.records ?? []).filter(
      (user): user is OrgUser => Boolean(user)
    );

    const adminUser =
      _.find(testUsers, (user) => _.includes(user.name, 'admin')) ?? null;
    const regularUser =
      _.find(testUsers, (user) => _.includes(user.name, 'regular')) ?? null;
    if (!adminUser || !regularUser) {
      throw new Error(
        'tdoRBAC: setupTestOrgAndUser did not return both an admin and a regular user'
      );
    }
    regularUserId = regularUser.id;

    // Login for super Admin user
    superAdminOptions = (
      await impersonateUser(superToken, superUser.id, superOrgGuid)
    ).requestOptions;

    // Login for Admin user
    if (!adminUser.organizationGuid) {
      throw new Error('tdoRBAC: admin user has no organizationGuid');
    }
    adminOptions = (
      await impersonateUser(superToken, adminUser.id, adminUser.organizationGuid)
    ).requestOptions;

    // Login for Regular user
    if (!regularUser.organizationGuid) {
      throw new Error('tdoRBAC: regular user has no organizationGuid');
    }
    regularOptions = (
      await impersonateUser(
        superToken,
        regularUser.id,
        regularUser.organizationGuid
      )
    ).requestOptions;

    const me = await gqlClient.sdk.me({}, regularOptions);
    defaultAGsToRemoveMember = (me?.data?.me?.authGroups?.records ?? []).filter(
      (group): group is AuthGroupRef => Boolean(group)
    );
  });

  /**
   * Uses `createFolderBasic`, not `createFolder`. The shared `CREATE_FOLDER`
   * document selects `parent { id }`, and resolving `Folder.parent` requires
   * folder-read on the parent — which this CMS-viewer does not hold. The folder
   * is still created, but the response carries
   * `No authorization access role found for Folder` at
   * `["createFolder","parent","id"]`, and graphql-request throws on any `errors`
   * entry, so a successful mutation reads as a failure.
   * `CREATE_FOLDER_BASIC` (added by VE-26414 / #4568) is the same mutation
   * without the parent expansion.
   */
  it('should create a root folder', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const rootFolderResult = await gqlClient.sdk.createRootFolders(
      { rootFolderType: RootFolderType.Cms },
      regularOptions
    );
    const rootFolders = rootFolderResult?.data?.createRootFolders ?? [];
    expect(rootFolders).toBeDefined();

    const treeObjectId = rootFolders[1]?.treeObjectId ?? null;
    if (!treeObjectId) {
      throw new Error('tdoRBAC: createRootFolders returned no cms root folder');
    }

    const result = await gqlClient.sdk.createFolderBasic(
      {
        input: {
          name: 'citest-should-delete-graphql-folders',
          description: 'citest-should-delete-graphql-folders-description',
          rootFolderType: RootFolderType.Cms,
          parentId: treeObjectId
        }
      },
      regularOptions
    );
    folderId = _.get(result, 'data.createFolder.id', null);

    expect(folderId).toBeDefined();
    expect(_.get(result, 'data.createFolder.name', null)).toBeDefined();

    const result1 = await gqlClient.sdk.createFolderBasic(
      {
        input: {
          name: 'citest-should-delete-graphql-folders1',
          description: 'citest-should-delete-graphql-folders1-description',
          rootFolderType: RootFolderType.Cms,
          parentId: treeObjectId
        }
      },
      regularOptions
    );
    folderId1 = _.get(result1, 'data.createFolder.id', null);

    expect(folderId1).toBeDefined();
    expect(_.get(result1, 'data.createFolder.name', null)).toBeDefined();
  });

  // TDO
  it('should create a TDO', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const result = await gqlClient.sdk.createTDO(
      {
        input: {
          status: 'uploaded',
          startDateTime: 1476726655,
          stopDateTime: 1476726755,
          parentFolderId: folderId
        }
      },
      regularOptions
    );
    tdoId = _.get(result, 'data.createTDO.id', null);
    expect(tdoId).toBeDefined();
  });

  it('should get a TDO by ID', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    /**
     * `temporalDataObjectSummary`, not `temporalDataObject`: the latter expands
     * `folders`, which requires folder-read this CMS-viewer does not hold, so it
     * would fail on an authorization error for the Folder type rather than on
     * anything this case is about.
     */
    const result = await gqlClient.sdk.temporalDataObjectSummary(
      { id: tdoId as string },
      regularOptions
    );
    expect(_.get(result, 'data.temporalDataObject.id', null)).toEqual(tdoId);
  });

  it('should update a TDO', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const result = await gqlClient.sdk.updateTDO(
      {
        input: {
          id: tdoId as string,
          name: 'updated tdo name'
        }
      },
      regularOptions
    );
    tdoId = _.get(result, 'data.updateTDO.id', null);
    const details = _.get(result, 'data.updateTDO.details', {});
    expect(tdoId).toBeDefined();
    expect(details).toHaveProperty('veritoneFile.fileName', 'updated tdo name');
  });

  // restricted user
  it('should removes restrict users from default AGs', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }
    const authGroupIds = _.map(defaultAGsToRemoveMember, 'id');

    if (authGroupIds.length > 0) {
      const result = await Promise.all(
        authGroupIds.map((id) =>
          gqlClient.sdk.authGroupRemoveMembers(
            { id, memberIds: [regularUserId as string] },
            adminOptions
          )
        )
      );
      expect(result.length).toEqual(authGroupIds.length);
    }
  });

  it('move tdo to new folder', async () => {
    if (!useRBACFeature) {
      pending('useRBACFeature = false');
    }

    /**
     * Asserted directly, with no retry-and-swallow. The inherited version looped
     * 12x5s and then `return`ed on exhaustion, so Jest reported a pass while the
     * move had failed every attempt (and 60s of sleeps sat right under the 70s
     * testTimeout, making it time out under any extra load). The move failed for
     * a fixture reason, not a timing one -- see `v2FoldersEnabled` on orgInput.
     */
    const result = await gqlClient.sdk.moveTemporalDataObject(
      {
        input: {
          tdoId: tdoId as string,
          oldFolderId: folderId as string,
          newFolderId: folderId1 as string
        }
      },
      regularOptions
    );
    expect(_.get(result, 'data.moveTemporalDataObject.id', null)).toEqual(tdoId);
  });

  it('delete the tdoId', async () => {
    await Promise.all(
      [tdoId].map(async (id) => {
        const result = await gqlClient.sdk.deleteTDO(
          { id: id as string },
          regularOptions
        );
        expect(_.get(result, 'data.deleteTDO.id', null)).toBeDefined();
      })
    );
  });

  /**
   * Teardown for the two child folders created above. Runs as the SUPERADMIN,
   * which is the only one of the three actors that can complete it:
   *   - regular user (folder creator): denied on the mutation itself —
   *     "No authorization access role found for Mutation.deleteFolder";
   *   - admin user: "folder was not found", i.e. no ACE on folders another
   *     user in the org created.
   * The regular user's TDO rights are still asserted by the deleteTDO case.
   *
   * The pre-conversion JS ran these assertions inside `forEach(async …)`, so
   * they resolved after the test had already finished and any failure was
   * silently discarded — this case never actually verified anything. Switching
   * to Promise.all (per the conversion) surfaced that.
   */
  it('delete a folder', async () => {
    await Promise.all(
      [folderId, folderId1].map(async (id) => {
        const result = await gqlClient.sdk.deleteFolder(
          { input: { id: id as string, orderIndex: 0 } },
          superAdminOptions
        );
        expect(_.get(result, 'data.deleteFolder.id', null)).toBeDefined();
      })
    );
  });
});

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-rbac-' + uuid.v4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    /**
     * Schema field names, passed straight through to sdk.createOrganization.
     * The legacy JS helper accepted `kvp`/`apps` and remapped them to
     * metadata/applications; the typed SDK has no such translation layer.
     */
    metadata: {
      features: {
        enableRBACFeature: 'enabled',
        enableRBACFeatureForSDO: 'enabled',
        /**
         * Required by `move tdo to new folder`. Folder reads route V1/V2 on this
         * org feature (dalFolder.v2DalSwitch -> _useV2FoldersEnabledFeature), and
         * the two paths authorize differently: V2 grants access when the folder
         * sits under a root the user owns, while V1 (_canAccessFolder) demands
         * AIWARE_FOLDER_READ/ADMIN_ACCESS through an ACE. Nothing seeds ACEs for
         * folders this suite creates, so on V1 the move is denied with
         * "The folder was not found" even though the mutation's own contract only
         * asks for AIWARE_FOLDER_FILE -- which these users do have. See VE-21380.
         */
        v2FoldersEnabled: 'enabled'
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
  /**
   * No `key` field: setupTestOrgAndUser spreads each entry straight into
   * sdk.createUser, and `CreateUser` rejects unknown fields. The legacy helper
   * tolerated the label; the typed SDK does not. Users are located by name
   * match ('admin' / 'regular') in beforeAll, so no label is needed.
   * `password` is explicit because the helper logs each user in via
   * buildRequestHeaders to build listOptions.
   */
  userInputs: [
    {
      name: `${citestMarker}-admin-user-${uuid.v4()}@localhost`,
      password: 'testPassword',
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
      password: 'testPassword',
      roleIds: ['cf2ed945-176b-4dd9-943e-22fcb1cf684f'] // CMS Viewer
    }
  ]
};
