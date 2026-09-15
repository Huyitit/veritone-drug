import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const testName = `test_saved_search_intergration_${Date.now()}`;

describe('citest_savedSearch: saved search tests', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let savedSearchId: string;

  beforeAll(async () => {
    /**
     * T14: this suite previously ran on the SHARED superadmin session
     * (sys_graphql_citest_superadmin), which is an admin MEMBER of every
     * test org that org creates (createOrganization enrolls the caller via
     * addAdminToOrganization). Many concurrent specs delete their test org
     * in teardown; org-delete enumerates all active members of that org and
     * calls removeAllUserSessions(userId) on each - which is GLOBAL, not
     * org-scoped, and deletes every one of the superadmin's session tokens,
     * including this suite's, at any point during the run. The fix is the
     * same isolation guardrail T10/T12 established for this exact class of
     * collateral session kill: use a throwaway superadmin that is a member
     * of no org except its own, so no other spec's org/user-delete can ever
     * enumerate or kill its session. See test/helpers/superadminSession.ts.
     */
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
  });

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('Create a Saved Search', async () => {
    const result = await gqlClient.sdk.createSavedSearch({
      input: {
        name: testName,
        sharedWithOrganization: true,
        csp: {
          name: testName,
          sharedWithOrganization: true
        }
      }
    });
    expect(result.data.createSavedSearch).toBeDefined();
    expect(result.data.createSavedSearch.name).toBeDefined();
    expect(result.data.createSavedSearch.id).toBeDefined();
    savedSearchId = result.data.createSavedSearch.id;
  });

  it('Replace a Saved Search', async () => {
    const result = await gqlClient.sdk.replaceSavedSearch({
      input: {
        id: savedSearchId,
        name: `${testName}_replace`,
        sharedWithOrganization: false,
        csp: {
          isSearch: true
        }
      }
    });
    expect(result.data.replaceSavedSearch).toBeDefined();
    expect(result.data.replaceSavedSearch.id).toBeDefined();
    expect(result.data.replaceSavedSearch.name).toBeDefined();
    savedSearchId = result.data.replaceSavedSearch.id;
  });

  it('Get List Saved Search', async () => {
    const result = await gqlClient.sdk.savedSearches({
      limit: 30,
      offset: 0,
      includeShared: false
    });
    expect(result.data.savedSearches).toBeDefined();
    expect(result.data.savedSearches.records!.length).toBeGreaterThan(0);
  });

  it('Delete a Saved Search', async () => {
    const result = await gqlClient.sdk.deleteSavedSearch({
      id: savedSearchId
    });
    expect(result.data.deleteSavedSearch.id).toEqual(savedSearchId);
  });
});
