import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../src/helpers';
import {
  createClientWithUser,
  GraphqlClient
} from '../../src/graphqlUtil';

// TS-native port of the legacy JS `citest/helpers/superadminSession.js`
// `createIsolatedSuperadmin` helper, for the newer `tools/graphql-api/` harness
// (which had no equivalent). See T14/T15/T16 (legacy harness) and T24/T25 (this
// harness) for the defect this addresses.
//
// The defect: a spec that creates its test org via the SHARED superadmin session
// (`sys_graphql_citest_superadmin@veritone.com`) auto-enrolls that shared
// superadmin as a member of the test org (`addAdminToOrganization`). When the
// spec's `afterAll` then hard-deletes the test org via the REST
// `helpers.deleteOrganization(...)`, the server terminates every session indexed
// under that org's GUID — including the shared superadmin's session, which is
// shared across ALL specs in the shard. Every subsequent spec then fails with
// "token invalid or expired".
//
// The fix: give each such spec its own THROWAWAY superadmin identity that owns
// (and is the only member of) the test org. When that spec deletes its test org,
// only the throwaway identity's session dies — the shared session is untouched.
//
// The three roles below match the legacy helper exactly — the minimum subset
// re-verified live (2026-07-01) to pass `createOrganization`
// (rightsRequired: ["superadmin","admin.org.create"]). See the legacy
// `superadminSession.js` for the full DB-query rationale.
const ROLE_IDS = [
  '3459c3de-493f-443a-8ad0-ddb9f3f6c76d', // Super Admin — org/user/group/package/slug admin rights
  '032218c3-d47e-4287-9d16-7bb867c01266', // aiWARE Administrator — broad content-access rights
  'cb18eb9c-3264-434a-8a8d-e6b2d680f66e' // aiWARE Instance Administrator — literal superadmin/admin.org.create scope
];

const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';

export interface IsolatedSuperadmin {
  /** A GraphqlClient whose SDK is authenticated as the throwaway superadmin.
   * Route the spec's org-creation (`setupTestOrgAndUser`) and its `me()`
   * identity lookups through this client so the shared session is never
   * enrolled in — or logged out by the deletion of — the test org. */
  client: GraphqlClient;
  /** The throwaway superadmin's session token. */
  token: string;
  /** Request headers (`{ Authorization, ... }`) for the throwaway superadmin,
   * suitable to pass as the `requestHeaders` arg to SDK calls or as
   * `adminOptions`-style headers. */
  options: Record<string, string>;
  /** The throwaway org's numeric id. */
  orgId: string;
  /** The throwaway superadmin user's id. */
  userId: string;
  /** Tears down the throwaway user + org. MUST be called from the spec's
   * outermost `afterAll`, AFTER the spec's own test-org teardown. Safe to call
   * unconditionally; failures are swallowed and logged. */
  cleanup: () => Promise<void>;
}

/**
 * Creates a brand-new, single-use org + superadmin user, isolated from every
 * other org/session in the run. Use this instead of the shared
 * `createGraphqlClient(AuthType.SESSION_TOKEN, env)` session whenever a spec
 * needs a superadmin session but must not risk being a collateral casualty of
 * (nor the cause of) another session's termination when its own test org is
 * deleted.
 *
 * @param bootstrapClient the SHARED superadmin client
 *   (`createGraphqlClient(AuthType.SESSION_TOKEN, env)`). It is used ONCE, at
 *   bootstrap, to create the throwaway org + user, and again in `cleanup()` to
 *   tear them down. All of the caller's actual test work should go through the
 *   returned `.client`, NOT through this bootstrap client.
 */
export async function createIsolatedSuperadmin(
  bootstrapClient: GraphqlClient
): Promise<IsolatedSuperadmin> {
  // The shared session's own token — captured now, at bootstrap, so cleanup()
  // can tear down the throwaway org/user with the shared identity even after
  // the isolated identity's session has been killed by the spec's own test-org
  // deletion. Mirrors the legacy helper's `bootstrapOptions`.
  const bootstrapHeaders = helpers.requestOptions(
    bootstrapClient.sessionToken as string
  ).headers as Record<string, string>;

  // 1. Create the throwaway org using the SHARED session. This is the only
  //    place the shared superadmin gets enrolled into an org — and this org is
  //    torn down via a soft-delete (updateOrganization status:"deleted"), NOT
  //    the session-killing REST hard-delete, so the shared session survives.
  const orgRes = await bootstrapClient.sdk.createOrganization({
    input: {
      name: `${citestMarker}-isolated-superadmin-org-${uuidv4()}`,
      businessUnit: 'Developer',
      remainingBudget: 1000000,
      metadata: {
        billing: { pausedProcessing: false }
      }
    }
  });
  const org = orgRes?.data?.createOrganization;
  if (!org?.id) {
    throw new Error(
      'createIsolatedSuperadmin: createOrganization returned no org id'
    );
  }

  // 2. Create the throwaway superadmin-roled user in that org.
  const email = `citest-isolated-sa-${uuidv4()}@localhost`;
  const password = uuidv4();
  const userRes = await bootstrapClient.sdk.createUser({
    input: {
      name: email,
      password,
      organizationId: org.id,
      roleIds: ROLE_IDS
    }
  });
  const user = userRes?.data?.createUser;
  if (!user?.id) {
    throw new Error(
      `createIsolatedSuperadmin: createUser returned no user id for ${email}`
    );
  }

  // 3. Log in as the throwaway user to get an ISOLATED session + a client whose
  //    SDK is bound to that token. `createClientWithUser` builds a fresh
  //    GraphQLClient/SDK (unlike `createGraphqlClient`, which caches the SDK by
  //    AuthType and bakes in the shared login) — exactly what we need here.
  const client = await createClientWithUser(
    email,
    password,
    bootstrapClient.environment
  );
  const token = client.sessionToken;
  if (!token) {
    throw new Error(
      `createIsolatedSuperadmin: login returned no token for ${email}`
    );
  }
  const options = helpers.requestOptions(token).headers as Record<
    string,
    string
  >;

  async function cleanup(): Promise<void> {
    // Use the SHARED bootstrap headers, NOT the isolated token: by the time
    // cleanup() runs (the spec's outermost afterAll), the spec has already
    // deleted its own test org, which killed the isolated superadmin's session.
    // The shared session is still alive, so it is what tears down the throwaway
    // records. Delete the user before the org to avoid an orphaned user record.
    try {
      await bootstrapClient.sdk.deleteUser(
        { id: user!.id },
        bootstrapHeaders
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `createIsolatedSuperadmin cleanup: failed to delete user ${user!.id}`,
        err
      );
    }
    try {
      // Soft-delete via updateOrganization(status:"deleted") — the same
      // non-session-killing mechanism the legacy `orgHelper.deleteOrganization`
      // uses. Deliberately NOT `helpers.deleteOrganization` (the REST
      // hard-delete), which would terminate the shared session and reintroduce
      // the very defect this helper exists to prevent.
      await bootstrapClient.sdk.updateOrganization(
        { input: { id: org!.id, status: 'deleted' } },
        bootstrapHeaders
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `createIsolatedSuperadmin cleanup: failed to delete org ${org!.id}`,
        err
      );
    }
  }

  return {
    client,
    token,
    options,
    orgId: org.id,
    userId: user.id,
    cleanup
  };
}
