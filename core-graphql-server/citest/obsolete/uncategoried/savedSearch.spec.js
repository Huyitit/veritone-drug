const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../../helpers/superadminSession');

const config = helpers.config;

const _ = require('lodash');
const testName = 'test_saved_search_intergration_' + Date.now();
let savedSearchId;

describe('citest_savedSearch: saved search tests', () => {
  let gqlClient;
  let session;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    await gqlClient.connect();

    // T14: This suite previously ran on the SHARED superadmin session (sys_graphql_citest_superadmin),
    // which is an admin MEMBER of every test org that org creates (createOrganization enrolls the
    // caller via addAdminToOrganization). Many concurrent specs (MAX_WORKERS=2) delete their test org
    // in teardown; org-delete enumerates all active members of that org and calls
    // removeAllUserSessions(userId) on each — which is GLOBAL, not org-scoped, and DELetes every one
    // of the superadmin's session tokens, including this suite's, at any point during the run (not
    // just during setup). Bearer validation is per-token-key existence, so a killed token can never
    // recover by re-querying it.
    //
    // The old fix attempt was a 120x1s poll re-querying the same (possibly-dead) token — a sleep-based
    // mitigation that only shrinks the vulnerable window without removing the race (T67-class anti-
    // pattern; see branch philosophy). The correct fix is the same isolation guardrail T10/T12 already
    // established for this exact class of collateral session kill: use a throwaway superadmin that is
    // a member of no org except its own, so no other spec's org-delete/user-delete/OLP-toggle can ever
    // enumerate or kill its session. See helpers/superadminSession.js.
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options; // preserve implicit-auth call sites below
  });

  afterAll(async () => {
    await session?.cleanup();
  });

  it('Create a Saved Search', async () => {
    const query = `mutation {
            createSavedSearch (input: {
              name: "${testName}"
              sharedWithOrganization: true
              csp: {
                name: "${testName}"
                sharedWithOrganization: true
              }
            }) {
              id
              organizationId
              organization {
                id
                name
              }
              ownerId
              owner {
                id
                name
              }
              name
              sharedWithOrganization
              createdDateTime
              modifiedDateTime
              csp
            }
        }`;

    const result = await gqlClient.query(query);
    expect(result.createSavedSearch).toBeDefined();
    expect(result.createSavedSearch.name).toBeDefined();
    expect(result.createSavedSearch.id).toBeDefined();
    savedSearchId = result.createSavedSearch.id;
  });

  it('Replace a Saved Search', async () => {
    const query = `mutation {
            replaceSavedSearch(input: {
              id: "${savedSearchId}"
              name: "${testName}_replace"
              sharedWithOrganization: false
              csp: {
                isSearch: true
              }
            }) {
              id
              organizationId
              organization {
                id
                name
              }
              ownerId
              owner {
                id
                name
              }
              name
              sharedWithOrganization
              createdDateTime
              modifiedDateTime
            }
        }`;

    const result = await gqlClient.query(query);
    expect(result.replaceSavedSearch).toBeDefined();
    expect(result.replaceSavedSearch.id).toBeDefined();
    expect(result.replaceSavedSearch.name).toBeDefined();
    savedSearchId = result.replaceSavedSearch.id;
  });

  it('Get List Saved Search', async () => {
    const query = `query {
            savedSearches (
              limit: 30
              offset: 0
              includeShared: false
            ) {
              records {
                id
                organizationId
                ownerId
                owner {
                  id
                  name
                  jsondata
                }
                name
                sharedWithOrganization
                createdDateTime
                modifiedDateTime
                csp
              }
            }
          }`;

    const result = await gqlClient.query(query);
    expect(result.savedSearches).toBeDefined();
    expect(result.savedSearches.records.length).toBeGreaterThan(0);
  });

  it('Delete a Saved Search', async () => {
    const query = `mutation {
            deleteSavedSearch(id: "${savedSearchId}") {
              id
            }
        }`;

    const result = await gqlClient.query(query);
    expect(result.deleteSavedSearch.id).toEqual(savedSearchId);
  });
});
