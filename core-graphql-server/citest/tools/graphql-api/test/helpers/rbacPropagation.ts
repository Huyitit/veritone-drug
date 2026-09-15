import { buildRequestHeaders, GraphqlClient } from '@api/src/graphqlUtil';

// Auth-group membership changes do NOT take effect synchronously. On the
// server, `authGroupAddMembers` / `authGroupRemoveMembers` fan out through:
//   - `_invalidateAnyAuthGroupRelatedCaches` — Redis dirty-marking that clears
//     the L1 in-process RBAC caches (`config.localCache.rbacAuthGroups`,
//     `rbacAuthGroupsForMember`, `rbacAclHasPermissions`, ... — 2 min TTL each
//     when the dirty bit is missed), and
//   - `reloadSessionAuthGroupsForMembers` — a FIRE-AND-FORGET session-reload
//     event; the mutation returns before any session has been rebuilt.
// A spec that flips membership and then sleeps a fixed interval is therefore
// betting on that fan-out finishing in time. It usually does; when it doesn't,
// every authorization assertion downstream lands on the wrong side and the
// failure reads as a permissions bug rather than a race. See the citest-runner
// failure on 2026-08-12 (11 tests in userOLPSDO.spec.ts, both directions).
//
// These helpers replace the sleep with a bounded poll on state the server can
// actually confirm.
//
// SCOPE: this module covers waits on the RBAC caches — auth-group membership
// and ACE grants. Hand-rolled retry loops remain elsewhere in these specs on
// purpose, in two cases: where the retried call has SIDE EFFECTS (e.g.
// folderOlp's FO71/FO72 create a fresh probe folder each attempt to avoid a
// memoized denial cache key, which `pollUntilReady` cannot express), and where
// the subject is Elasticsearch indexing rather than an RBAC cache.
//
// CHOOSING A PROBE for `pollUntilReady`: it must be a query the grant actually
// gates, or the poll settles on round one and waits for nothing. Check the
// schema directive before picking one — `Query.schema`, for instance, is
// `@auth(skipObjectAuthorization: true)` with no `@requireAuthRole` and so
// resolves for anyone, whereas `Query.structuredData` carries
// `@requireAuthRole([AIWARE_SDO_READ])` and is a real probe.

// Overridable so a slow CI shard can widen the window without a code change.
const DEFAULT_TIMEOUT_MS = Number(
  process.env.CITEST_RBAC_PROPAGATION_TIMEOUT_MS ?? 60000
);
const DEFAULT_INTERVAL_MS = Number(
  process.env.CITEST_RBAC_PROPAGATION_INTERVAL_MS ?? 2000
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** Names the subject in the timeout message, for CI-log diagnosis. */
  label?: string;
}

export interface UserCredentials {
  userName: string;
  password: string;
}

/**
 * Mints a brand new session and returns its request headers.
 *
 * Specs establish sessions two different ways — credential login
 * (`buildRequestHeaders`) and super-admin impersonation — so the membership
 * poll takes the refresh as a thunk rather than assuming either one.
 */
export type RefreshSession = () => Promise<Record<string, string>>;

export interface MembershipExpectation extends PollOptions {
  /** group ids that must no longer be on the session (after a removal) */
  expectAbsent?: string[];
  /** group ids that must be back on the session (after an add-members call) */
  expectPresent?: string[];
  /**
   * Names the subject in the timeout message. Impersonation-based callers have
   * no user name to hand, so pass whatever identifies the user in that spec
   * (user id, role label). Defaults to `'session'`.
   */
  label?: string;
}

/**
 * Re-establishes the session via `refreshSession` until the resulting session
 * reports the expected auth-group membership, then returns that session's
 * request headers.
 *
 * A fresh session is required on every attempt, not just once at the end: for
 * the requesting user `User.authGroupIds` resolves straight out of
 * `context._authInfo.authGroups`, i.e. the membership snapshot baked into the
 * session when it was minted. That snapshot is also what the ACL layer
 * evaluates against, which is what makes it the right thing to poll — a
 * session that reports the new groups will authorize against the new groups.
 */
export async function waitForAuthGroupMembership(
  gqlClient: GraphqlClient,
  refreshSession: RefreshSession,
  {
    expectAbsent = [],
    expectPresent = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
    label = 'session'
  }: MembershipExpectation
): Promise<Record<string, string>> {
  if (expectAbsent.length === 0 && expectPresent.length === 0) {
    // Both empty means `.every()` is vacuously true and this degrades to a
    // plain session mint with no wait at all. Usually a fixture that returned
    // no groups — surface it rather than letting it look like a real guard.
    console.warn(
      `waitForAuthGroupMembership: no expectations given for ${label}; ` +
        'not waiting for anything.'
    );
  }

  const deadline = Date.now() + timeoutMs;
  let headers: Record<string, string> = {};
  let observed: string[] | undefined;

  while (true) {
    // Minting a session is an HTTP call to core-admin and can fail
    // transiently. Treat that as "not ready" like the read below, else a
    // single 5xx aborts the whole wait — a new flake source in a flake fix.
    try {
      headers = await refreshSession();
      observed = await readAuthGroupIds(gqlClient, headers);
    } catch {
      observed = undefined;
    }

    const settled =
      observed !== undefined &&
      expectAbsent.every((id) => !observed!.includes(id)) &&
      expectPresent.every((id) => observed!.includes(id));

    if (settled) {
      return headers;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `waitForAuthGroupMembership: membership for ${label} ` +
          `did not settle within ${timeoutMs}ms. ` +
          `expectAbsent=${JSON.stringify(expectAbsent)} ` +
          `expectPresent=${JSON.stringify(expectPresent)} ` +
          `observed=${observed ? JSON.stringify(observed) : 'unreadable'}`
      );
    }

    await sleep(intervalMs);
  }
}

/**
 * `waitForAuthGroupMembership` for specs that establish sessions by logging in
 * rather than by impersonation. The user name doubles as the timeout label.
 */
export async function waitForAuthGroupMembershipByLogin(
  gqlClient: GraphqlClient,
  credentials: UserCredentials,
  options: MembershipExpectation = {}
): Promise<Record<string, string>> {
  return waitForAuthGroupMembership(
    gqlClient,
    () => buildRequestHeaders(gqlClient, credentials),
    { label: credentials.userName, ...options }
  );
}

/**
 * Reads `me { authGroupIds }` for the given session, or `undefined` if the
 * membership could not be determined this round.
 *
 * `Query.me` itself is always reachable — `@auth(allowOrgless: true,
 * skipObjectAuthorization: true)` — but the generated `me` operation also
 * selects `organization` / `roles`, which a session stripped of its groups can
 * be denied.
 * graphql-request rejects on any GraphQL error even when the rest of the
 * response resolved, so the field we actually care about is recovered from the
 * partial payload hanging off the rejection before giving up on the round.
 */
async function readAuthGroupIds(
  gqlClient: GraphqlClient,
  headers: Record<string, string>
): Promise<string[] | undefined> {
  try {
    const meResult = await gqlClient.sdk.me({}, headers);
    // A clean read with no groups is the settled state after a removal, so a
    // null/absent list here is [] — not "unreadable".
    return (meResult?.data?.me?.authGroupIds ?? []) as string[];
  } catch (err) {
    const partial = (err as any)?.response?.data?.me?.authGroupIds;
    return Array.isArray(partial) ? (partial as string[]) : undefined;
  }
}

/**
 * Polls `fn` until `isReady` accepts its result, returning that result. Unlike
 * the membership poll above there is no session to re-establish — use this for
 * ACE grants (`addACEsToResources`, `createStructuredData` with `entries`),
 * which propagate through the same dirty-marked ACL caches but are keyed on the
 * resource rather than the session.
 *
 * Only ever pass a side-effect-free `fn`: it may run many times.
 */
export async function pollUntilReady<T>(
  fn: () => Promise<T>,
  isReady: (value: T) => boolean,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
    label = 'resource'
  }: PollOptions = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (true) {
    // A denied request rejects rather than resolving, so a not-yet-propagated
    // grant must be treated as "not ready", not as a hard failure.
    let value: T | undefined;
    let failure: unknown;
    try {
      value = await fn();
    } catch (err) {
      failure = err;
    }

    if (failure === undefined && isReady(value as T)) {
      return value as T;
    }

    if (Date.now() >= deadline) {
      // Rethrow the real error when there was one — it names the actual
      // denial. Otherwise the call resolved but never satisfied `isReady`;
      // say so explicitly. Returning the un-ready value here instead would
      // hand the caller a stale result and surface 60s later as an unrelated
      // assertion failure, with nothing in the log about the wait.
      if (failure !== undefined) {
        throw failure;
      }
      throw new Error(
        `pollUntilReady: ${label} did not become ready within ` +
          `${timeoutMs}ms. last value=${safeStringify(value)}`
      );
    }

    await sleep(intervalMs);
  }
}

/** Best-effort rendering of a poll result for a timeout message. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unserializable]';
  }
}
