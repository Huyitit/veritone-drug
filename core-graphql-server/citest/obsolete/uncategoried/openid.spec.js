const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const CsvParser = require('json2csv').Parser;
const fs = require('fs');
const CoreAdminClient = require('../../helpers/coreAdmin.js');
const { createIsolatedSuperadmin } = require('../../helpers/superadminSession.js');
const jobDb = require('../../helpers/jobDb.js');

let connectId;
let organizationGuid;
let userIds = [];
let orgId;
let connectUserId;
let scimUserId;
const citestMarker = global.citestMarker || 'citest-should-delete';
const SCIM_USER_EXTERNAL_ID = citestMarker + '-test_citest_user_' + Date.now();
const SCIM_USER_USERNAME = `${citestMarker}_${Date.now()}@citest.onmicrosoft.com`;
const SCIM_USER_EMAIL = `citest_${Date.now()}@citest.onmicrosoft.com`;
const SCIM_USER_DISPLAY_NAME = `Citest User ${Date.now()}`;
const SCIM_USER_DISPLAY_NAME_NEW = `Citest New User ${Date.now()} New`;
const SCIM_USER_FAMILY_NAME = `User ${Date.now()}`;
const SCIM_USER_FAMILY_NAME_NEW = `User ${Date.now()} New`;
const SCIM_USER_GIVEN_NAME = `Citest`;
const SCIM_USER_GIVEN_NAME_NEW = `Citest New`;
const SCIM_USER_EMAIL_NEW = `new_email_${SCIM_USER_USERNAME}`;
const SCIM_USER_USERNAME_NEW = `new_username_${SCIM_USER_USERNAME}`;

// Enable after OpenID feature release.
describe('citest_openid: OpenID Provider tests', () => {
  let gqlClient, coreAdminClient, session;
  let scimApiTokenHash; // top-level tokenHash, for afterAll revoke

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    coreAdminClient = new CoreAdminClient(env);

    // T07: this suite previously authenticated BOTH gqlClient (via connect()) AND
    // coreAdminClient (via connect() with no arg, which internally calls signin() using the
    // same config.userName/password) as the SHARED superadmin (sys_graphql_citest_superadmin).
    // removeAllUserSessions kills by userId, not by token — so any concurrent spec's real
    // org-delete/user-delete/OLP-toggle collaterally logs out BOTH sessions at once, even
    // though this suite itself never deletes an org (only revokes its own scim token). Isolate
    // via createIsolatedSuperadmin so this suite's identity is a member of no org but its own
    // throwaway one; pass its GQL session token directly into coreAdminClient.connect() to
    // skip the separate shared-superadmin signin() entirely. Same guardrail as the T14-T26
    // sibling fixes.
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options;
    await coreAdminClient.connect(session.token);

    // coreAdminClient.tokenAuth defaults to config.apiToken (18eea9, org-less).
    // SCIM createUser extracts requestorOrgId from tokenInfo.organization.organizationId,
    // which is null for the org-less 18eea9 token — createUserSCIM throws UnauthorizedError.
    //
    // Fix: create an org-linked token with explicit user:* rights via the admin API TOKEN
    // path (POST /api/admin/tokens). GQL apiTokenCreate cannot be used here — AuthPermissionType
    // enum values map to functional-permissions bits, not to the literal strings that
    // requireRights() checks (e.g. 'user:create'), so any GQL token would still fail the SCIM
    // requireRights(['user:create']) guard with 403.
    //
    // T07 Round 4: useTokenAuth (bearer = 18eea9/config.apiToken) 403s in real CI —
    // config.apiToken (CI's TESTS_TOKEN) resolves to an unrelated real internal credential in
    // CI, not the citest 18eea9 fixture (see T07.md; CI-secrets issue, not fixable from test
    // code). Both routes also accept user-session auth (canCreateToken()/canAccessToken() in
    // core-admin-server/route/middleware.js), which both short-circuit on
    // userInfo.isSuperAdmin() regardless of org — so route both calls through the isolated
    // superadmin's session (coreAdminClient.userAuth, already connected above) instead.
    const scimOrgId = session.orgId;
    if (scimOrgId) {
      const scimToken = await coreAdminClient.post(
        coreAdminClient.url + '/admin/tokens',
        {
          orgId: scimOrgId,
          token: {
            json: {
              isRevoked: false,
              internal: false,
              tokenLabel: `${citestMarker}_scim_token`,
              rights: ['user:create', 'user:update', 'user:read', 'user:delete']
            }
          }
        }
        // no useTokenAuth — defaults to coreAdminClient.userAuth (isolated superadmin session)
      );
      const scimTokenId = _.get(scimToken, 'tokenId');
      scimApiTokenHash = _.get(scimToken, 'tokenHash');
      if (scimTokenId) {
        coreAdminClient.tokenAuth = helpers.requestOptions(scimTokenId);
      }
    }
  });

  afterAll(async () => {
    if (scimApiTokenHash) {
      // user-session auth (see beforeAll comment) — not coreAdminClient.tokenAuth, which was
      // overridden to the scim token itself above
      await coreAdminClient.post(
        coreAdminClient.url + '/admin/tokens/' + scimApiTokenHash + '/revoke',
        {}
      );
    }
    await session?.cleanup();
  });

  it('get current user and org', async () => {
    const query = `
      query {
        me {
          id
          organizationId
          organizationGuid
          organizationGuids
        }
      }
    `;
    const result = await gqlClient.query(query);
    const me = _.get(result, 'me');

    expect(me).toBeDefined();
    expect(me.id).toBeDefined();

    organizationGuid = _.get(
      me,
      'organizationGuid',
      _.get(me, 'organizationGuids[0]')
    );
    orgId = _.get(me, 'organizationId');
  });

  it('create OpenID Provider', async () => {
    const query = `
      mutation {
        createOpenIdProvider(input: {
          name: "${citestMarker} CiTest OpenID Provider test"
          clientId: "test-client-id"
          clientSecret: "test-client-secret-1"
          issuerUrl: "https://login.microsoftonline.com/testAppId/v2.0/.well-known/openid-configuration/test"
        }) {
          id
          loginUrl
          name
          isGlobal
        }
      }
    `;
    const result = await gqlClient.query(query);
    const createOpenIdProvider = _.get(result, 'createOpenIdProvider');
    connectId = _.get(createOpenIdProvider, 'id');
    expect(connectId).toBeDefined();
    expect(createOpenIdProvider.loginUrl).toBeDefined();
    expect(createOpenIdProvider.name).toEqual(
      citestMarker + ' CiTest OpenID Provider test'
    );
    expect(createOpenIdProvider.isGlobal).toEqual(false);
  });

  it('update OpenID Provider', async () => {
    const query = `
      mutation updateOpenIdProvider {
        updateOpenIdProvider(input: {
          id: "${connectId}"
          name: "${citestMarker} CiTest OpenID Provider"
          description: "CiTest OpenID Provider description"
          websiteUrl: "https://login.microsoftonline.com"
          clientSecret: "test-client-secret"
          issuerUrl: "https://login.microsoftonline.com/testAppId/v2.0/.well-known/openid-configuration"
          btnText: "Azure AD Login"
          btnLogo: "https://seeklogo.com/images/A/azure-active-directory-logo-C196F4B2D3-seeklogo.com.png"
          btnColor: "#FFFFFF"
        }) {
          id
          loginUrl
          name
          description
          websiteUrl
          loginButtonStyle {
            btnText
            btnLogo
            btnColor
          }
          isGlobal
        }
      }
    `;
    const result = await gqlClient.query(query);
    const updateOpenIdProvider = _.get(result, 'updateOpenIdProvider');
    expect(updateOpenIdProvider.id).toEqual(connectId);
    expect(updateOpenIdProvider.loginUrl).toBeDefined();
    expect(updateOpenIdProvider.name).toEqual(
      citestMarker + ' CiTest OpenID Provider'
    );
    expect(updateOpenIdProvider.description).toEqual(
      'CiTest OpenID Provider description'
    );
    expect(updateOpenIdProvider.websiteUrl).toEqual(
      'https://login.microsoftonline.com'
    );
    expect(updateOpenIdProvider.loginButtonStyle.btnText).toEqual(
      'Azure AD Login'
    );
    expect(updateOpenIdProvider.loginButtonStyle.btnLogo).toEqual(
      'https://seeklogo.com/images/A/azure-active-directory-logo-C196F4B2D3-seeklogo.com.png'
    );
    expect(updateOpenIdProvider.loginButtonStyle.btnColor).toEqual('#FFFFFF');
    expect(updateOpenIdProvider.isGlobal).toEqual(false);
  });

  /**
   * resolvers/OpenIdProvider.js#loginUrl
   * prefers a per-connector redirectBaseUrl, else falls back to config.services.coreAdminUri.
   * The redirectBaseUrl-override half isn't covered here: this CI environment's own config sets
   * allowedOriginHosts to [] (local_ci_server.json), so every redirectBaseUrl is rejected by
   * design in this environment — see the rejection case below instead of an "override applies"
   * positive case.
   */
  it('loginUrl (no redirectBaseUrl) is a well-formed URL ending in /openid/:id/login', async () => {
    const query = `
      query {
        openIdProvider(id: "${connectId}") {
          id
          loginUrl
        }
      }
    `;
    const result = await gqlClient.query(query);
    const loginUrl = _.get(result, 'openIdProvider.loginUrl');
    expect(loginUrl).toBeDefined();
    expect(loginUrl.endsWith(`/openid/${connectId}/login`)).toBe(true);
    expect(() => new URL(loginUrl)).not.toThrow();
  });

  it('rejects a redirectBaseUrl update outside the configured allowedOriginHosts', async () => {
    const query = `
      mutation {
        updateOpenIdProvider(input: {
          id: "${connectId}"
          redirectBaseUrl: "https://custom-login.veritone.com"
        }) {
          id
        }
      }
    `;
    await expect(gqlClient.query(query)).rejects.toThrow(/redirect url is not allowed/i);
  });

  /**
   * allowedRedirectTargets input validation on provider
   * create/update, distinct from the per-login redirectUrl check exercised in Item 4 below.
   */
  it('rejects a malformed allowedRedirectTargets entry', async () => {
    const query = `
      mutation {
        updateOpenIdProvider(input: {
          id: "${connectId}"
          allowedRedirectTargets: ["not-a-valid-url"]
        }) {
          id
        }
      }
    `;
    await expect(gqlClient.query(query)).rejects.toThrow(/redirect url is invalid/i);
  });

  it('rejects an allowedRedirectTargets host outside the configured allowlist', async () => {
    const query = `
      mutation {
        updateOpenIdProvider(input: {
          id: "${connectId}"
          allowedRedirectTargets: ["https://evil.example.com"]
        }) {
          id
        }
      }
    `;
    await expect(gqlClient.query(query)).rejects.toThrow(/redirect urls are not allowed/i);
  });

  it('accepts an allowedRedirectTargets host within the configured allowlist', async () => {
    const query = `
      mutation {
        updateOpenIdProvider(input: {
          id: "${connectId}"
          allowedRedirectTargets: ["https://foo.veritone.com"]
        }) {
          id
          allowedRedirectTargets
        }
      }
    `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'updateOpenIdProvider.allowedRedirectTargets')).toEqual([
      'https://foo.veritone.com'
    ]);
  });

  /**
   * redirectUrlEncoded validation on GET /openid/:connectId/login. Only the rejection paths are
   * covered here — both throw before the route reaches passport's real-IdP discovery step (see
   * initialClientAndStrategy), which this suite's fake issuerUrl can never complete, so a
   * "successfully redirects to the IdP" case isn't reachable in this environment.
   */
  it('rejects a malformed redirectUrl before contacting the identity provider', async () => {
    const url = `${coreAdminClient.url}/admin/openid/${connectId}/login?redirectUrl=not-a-valid-url`;
    await coreAdminClient.get(url, coreAdminClient.userAuth, 400);
  });

  it('rejects a redirectUrl host outside the admin server allowlist', async () => {
    const url = `${coreAdminClient.url}/admin/openid/${connectId}/login?redirectUrl=${encodeURIComponent(
      'https://evil.example.com/page'
    )}`;
    await coreAdminClient.get(url, coreAdminClient.userAuth, 401);
  });

  it('rejects a redirectUrlEncoded value that decodes to a disallowed host', async () => {
    const encoded = encodeURIComponent(
      Buffer.from('https://evil.example.com/page').toString('base64')
    );
    const url = `${coreAdminClient.url}/admin/openid/${connectId}/login?redirectUrlEncoded=${encoded}`;
    await coreAdminClient.get(url, coreAdminClient.userAuth, 401);
  });

  it('get OpenID Provider by id', async () => {
    const query = `
      query {
        openIdProvider(id: "${connectId}") {
          id
          loginUrl
          name
          isGlobal
        }
      }
    `;
    const result = await gqlClient.query(query);
    const openIdProvider = _.get(result, 'openIdProvider');
    expect(openIdProvider).toBeDefined();
    expect(openIdProvider.id).toEqual(connectId);
    expect(openIdProvider.loginUrl).toBeDefined();
    expect(openIdProvider.name).toEqual(
      citestMarker + ' CiTest OpenID Provider'
    );
    expect(openIdProvider.isGlobal).toEqual(false);
  });

  it('get OpenID Providers list by ids', async () => {
    const query = `
      query {
        openIdProviders(ids: ["${connectId}"], orgId: ${orgId}) {
          count
          records {
            id
            loginUrl
            name
            isGlobal
          }
        }
      }
    `;
    const result = await gqlClient.query(query);
    const openIdProviders = _.get(result, 'openIdProviders');
    expect(openIdProviders).toBeDefined();
    expect(openIdProviders.count).toEqual(1);
    expect(openIdProviders.records[0].id).toEqual(connectId);
    expect(openIdProviders.records[0].loginUrl).toBeDefined();
    expect(openIdProviders.records[0].name).toEqual(
      citestMarker + ' CiTest OpenID Provider'
    );
    expect(openIdProviders.records[0].isGlobal).toEqual(false);
  });

  it('upload UserId CSV file with ConnectId', async () => {
    const numUserTest = 3;
    const lstUserUpload = [];
    const testFile = `citest/data/test_upload_user_${Date.now()}.csv`;
    let countCurrentUser = 0;
    let csvFields = [
      'userName',
      'firstName',
      'lastName',
      'developer:Editor',
      'collections:Viewer',
      'discovery:Viewer',
      'cms:Viewer',
      'connectId[0]'
    ];

    while (countCurrentUser < numUserTest) {
      lstUserUpload.push({
        userName: `${citestMarker}-citest_user_upload_${countCurrentUser}+${Date.now()}@citest.com`,
        firstName: `firstName test ${countCurrentUser}`,
        lastName: `lastName test ${countCurrentUser}`,
        'developer:Editor': 'No',
        'collections:Viewer': 'Yes',
        'discovery:Viewer': 'Yes',
        'cms:Viewer': 'Yes',
        'connectId[0]': connectId
      });
      countCurrentUser++;
    }

    let csvData;
    try {
      const csvParser = new CsvParser({ fields: csvFields });

      csvData = csvParser.parse(lstUserUpload);
    } catch (error) {
      console.log('Error when parsing and writing CSV File', error);
    }

    if (csvData) {
      fs.writeFileSync(testFile, csvData);

      try {
        if (organizationGuid) {
          const url =
            coreAdminClient.url +
            '/admin/users/org/' +
            organizationGuid +
            '/csv';
          const result = await coreAdminClient.uploadFileMultipart(
            testFile,
            url,
            coreAdminClient.userAuth
          );

          expect(result).toBeDefined();
          expect(result.userResults).toBeDefined();
          expect(Object.keys(result.userResults).length).toEqual(numUserTest);

          _.forEach(Object.keys(result.userResults), function (key) {
            const user = result.userResults[key];
            const userId = _.get(user, 'createdUser.userId');

            userIds.push(userId);
          });
        }
      } finally {
        fs.unlinkSync(testFile);
      }
    }
  });

  it('download users CSV file', async () => {
    if (organizationGuid) {
      const url =
        coreAdminClient.url + '/admin/users/org/' + organizationGuid + '/csv';
      const result = await coreAdminClient.get(url, coreAdminClient.userAuth);

      expect(result).toBeDefined();
    }
  });

  it('create user via SCIM endpoint', async () => {
    const url = coreAdminClient.url + '/admin/scim/' + connectId + '/users';
    const data = {
      schemas: [
        'urn:ietf:params:scim:schemas:core:2.0:User',
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'
      ],
      externalId: SCIM_USER_EXTERNAL_ID,
      userName: SCIM_USER_USERNAME,
      active: true,
      displayName: SCIM_USER_DISPLAY_NAME,
      emails: [
        {
          primary: true,
          type: 'work',
          value: SCIM_USER_EMAIL
        }
      ],
      meta: {
        resourceType: 'User'
      },
      name: {
        formatted: SCIM_USER_DISPLAY_NAME,
        familyName: SCIM_USER_FAMILY_NAME,
        givenName: SCIM_USER_GIVEN_NAME
      }
    };
    const res = await coreAdminClient.post(url, data, true);

    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    expect(res.externalId).toEqual(SCIM_USER_EXTERNAL_ID);
    expect(res.userName).toEqual(SCIM_USER_USERNAME);
    expect(res.name.formatted).toEqual(SCIM_USER_DISPLAY_NAME);
    expect(res.name.familyName).toEqual(SCIM_USER_FAMILY_NAME);
    expect(res.name.givenName).toEqual(SCIM_USER_GIVEN_NAME);
    expect(res.active).toEqual(true);

    connectUserId = res.id;
  });

  it('get user created by SCIM endpoint.', async () => {
    const query = `
      query {
        users(name: "${SCIM_USER_USERNAME}") {
          records {
            id
            email
            name
            firstName
            lastName
          }
        }
      }
    `;
    const result = await gqlClient.query(query);
    const users = _.get(result, 'users.records');
    const scimUser = _.head(users);
    expect(scimUser).toBeDefined();
    expect(scimUser.id).toBeDefined();
    expect(scimUser.email).toEqual(SCIM_USER_EMAIL);
    expect(scimUser.name).toEqual(SCIM_USER_USERNAME);
    expect(scimUser.firstName).toEqual(SCIM_USER_GIVEN_NAME);
    expect(scimUser.lastName).toEqual(SCIM_USER_FAMILY_NAME);

    scimUserId = scimUser.id;
    userIds.push(scimUserId); // add to userIds for deleting after the tests completed
  });

  it('update user via SCIM endpoint', async () => {
    const url =
      coreAdminClient.url +
      '/admin/scim/' +
      connectId +
      '/users/' +
      connectUserId;
    const data = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        {
          op: 'Replace',
          path: 'name.givenName',
          value: SCIM_USER_GIVEN_NAME_NEW
        },
        {
          op: 'Replace',
          path: 'name.familyName',
          value: SCIM_USER_FAMILY_NAME_NEW
        },
        {
          op: 'Replace',
          path: 'name.formatted',
          value: SCIM_USER_DISPLAY_NAME_NEW
        },
        {
          op: 'Replace',
          path: 'emails[type eq "work"].value',
          value: SCIM_USER_EMAIL_NEW
        },
        {
          op: 'Replace',
          path: 'userName',
          value: SCIM_USER_USERNAME_NEW
        }
      ]
    };
    const res = await coreAdminClient.post(url, data, true, true);
    expect(res).toBeDefined();
    expect(res.id).toEqual(connectUserId);
    expect(res.name.formatted).toEqual(SCIM_USER_DISPLAY_NAME_NEW);
    expect(res.name.familyName).toEqual(SCIM_USER_FAMILY_NAME_NEW);
    expect(res.name.givenName).toEqual(SCIM_USER_GIVEN_NAME_NEW);
    expect(res.userName).toEqual(SCIM_USER_USERNAME_NEW);
    const newListEmailObjects = _.get(res, 'emails');
    const newPrimaryEmailObject = _.first(
      _.filter(newListEmailObjects, { type: 'work', primary: true })
    );
    const newEmail = _.get(newPrimaryEmailObject, 'value');
    expect(newEmail).toEqual(SCIM_USER_EMAIL_NEW);
  });

  // FIXME: fails in ai13s
  it('get updated user by id', async () => {
    const query = `
      query {
        user(id: "${scimUserId}") {
          id
          firstName
          lastName
          name
          email
        }
      }
    `;
    const result = await gqlClient.query(query);
    const user = _.get(result, 'user');
    expect(user).toBeDefined();
    expect(user.id).toEqual(scimUserId);
    expect(user.firstName).toEqual(SCIM_USER_GIVEN_NAME_NEW);
    expect(user.lastName).toEqual(SCIM_USER_FAMILY_NAME_NEW);
    expect(user.name).toEqual(SCIM_USER_USERNAME_NEW);
    expect(user.email).toEqual(SCIM_USER_EMAIL_NEW);
  });

  it('create user via SCIM endpoint with any username', async () => {
    const url = coreAdminClient.url + '/admin/scim/' + connectId + '/users';
    const data = {
      schemas: [
        'urn:ietf:params:scim:schemas:core:2.0:User',
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'
      ],
      externalId: SCIM_USER_EXTERNAL_ID,
      userName: citestMarker + '-citest_username',
      active: true,
      displayName: SCIM_USER_DISPLAY_NAME,
      emails: [
        {
          primary: true,
          type: 'work',
          value: SCIM_USER_EMAIL
        }
      ],
      meta: {
        resourceType: 'User'
      },
      name: {
        formatted: SCIM_USER_DISPLAY_NAME,
        familyName: SCIM_USER_FAMILY_NAME,
        givenName: SCIM_USER_GIVEN_NAME
      }
    };
    const res = await coreAdminClient.post(url, data, true);

    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    expect(res.externalId).toEqual(SCIM_USER_EXTERNAL_ID);
    // the response is the same as input but the username is assigned with the email in DB
    expect(res.userName).toEqual(citestMarker + '-citest_username');
    expect(res.name.formatted).toEqual(SCIM_USER_DISPLAY_NAME);
    expect(res.name.familyName).toEqual(SCIM_USER_FAMILY_NAME);
    expect(res.name.givenName).toEqual(SCIM_USER_GIVEN_NAME);
    expect(res.active).toEqual(true);
  });

  it('get user created by SCIM endpoint, whose username is email', async () => {
    const query = `
      query {
        users(name: "${SCIM_USER_EMAIL}") {
          records {
            id
            email
            name
            firstName
            lastName
          }
        }
      }
    `;
    const result = await gqlClient.query(query);
    const users = _.get(result, 'users.records');
    const scimUser = _.head(users);
    expect(scimUser).toBeDefined();
    expect(scimUser.id).toBeDefined();
    expect(scimUser.email).toEqual(SCIM_USER_EMAIL);
    expect(scimUser.name).toEqual(SCIM_USER_EMAIL);

    userIds.push(scimUser.id); // add to userIds for deleting after the tests completed
  });

  it('delete users', async () => {
    if (!_.isEmpty(userIds)) {
      let queryDeleteUsers = '';

      for (let i = 0; i < userIds.length; i++) {
        const id = userIds[i];
        queryDeleteUsers += `
          deleteUser${i}: deleteUser(id: "${id}") {
            id
            message
          }
        `;
      }

      const query = `
        mutation {
          ${queryDeleteUsers}
        }
      `;
      const result = await gqlClient.query(query);

      for (let i = 0; i < userIds.length; i++) {
        expect(_.get(result, `deleteUser${i}`)).toBeDefined();
      }
    }
  });

/**
 * async eventing handler that backfills
 * external_credential_id for legacy OIDC providers. Every provider created through the API
 * already gets an external_credential_id at creation time (VE-11385 follow-up, PR 2938), so
 * there is no way to produce a "legacy" row through the public surface — jobDb directly nulls
 * the column first to simulate the pre-migration state the handler targets. Guarded the same
 * way exportRequest.spec.js guards its eventing-dependent cases.
 */
  it('backfills external_credential_id via the update_legacy_encryption_for_open_id_providers system event', async () => {
    if (!helpers.canTestEventing()) {
      return;
    }

    await jobDb.clearOpenIdExternalCredentialId(connectId);
    expect(await jobDb.getOpenIdExternalCredentialId(connectId)).toBeNull();

    const query = `
      mutation {
        emitSystemEvent(input: {
          topic: "System"
          payload: {
            event: "update_legacy_encryption_for_open_id_providers"
          }
        }) {
          id
        }
      }
    `;
    await gqlClient.query(query);

    await helpers.sleep(5000);
    let afterId
    for (let i = 0; i < 10 && !afterId; i++) {
      await helpers.sleep(2000);
      afterId = await jobDb.getOpenIdExternalCredentialId(connectId);
      if(!afterId) {
        console.log(`Waiting for external_credential_id backfill for connectId ${connectId}...`);
      } else {
        break;
      }
    }
    expect(afterId).not.toBeNull();
  });

  it('delete OpenID Provider by id', async () => {
    const query = `
      mutation {
        deleteOpenIdProvider(id: "${connectId}") {
          id
          message
        }
      }
    `;
    const result = await gqlClient.query(query);
    const deleteOpenIdProvider = _.get(result, 'deleteOpenIdProvider');
    expect(deleteOpenIdProvider).toBeDefined();
    expect(deleteOpenIdProvider.id).toEqual(connectId);
  });
});

/**
 * GET /openid/org/:username must return a user's
 * OpenID providers from a non-default org when their default org has none. Self-contained
 * describe block (own isolated sessions/orgs) so it can't interfere with the main suite's
 * shared gqlClient/coreAdminClient/connectId lifecycle above.
 */
describe('citest_openid cross-org provider discovery', () => {
  let gqlClient1, gqlClient2, coreAdminClient;
  let session1, session2;
  let providerConnectId, testUserName, session1OrgGuid;

  beforeAll(async () => {
    const env = helpers.config.env;
    gqlClient1 = new GraphqlClient(env);
    gqlClient2 = new GraphqlClient(env);
    coreAdminClient = new CoreAdminClient(env);

    // session1's own org will hold the OIDC provider; session2's own org is the test user's
    // default org, deliberately left with no provider of its own.
    session1 = await createIsolatedSuperadmin({ gqlClient: gqlClient1 });
    gqlClient1.userAuth = session1.options;
    session2 = await createIsolatedSuperadmin({ gqlClient: gqlClient2 });
    gqlClient2.userAuth = session2.options;

    await coreAdminClient.connect(session1.token);

    const meOrgQuery = `{ me { organizationGuid } }`;
    const session1Me = await gqlClient1.query(meOrgQuery, null);
    session1OrgGuid = _.get(session1Me, 'me.organizationGuid');

    const meNameQuery = `{ me { name } }`;
    const session2Me = await gqlClient2.query(meNameQuery, null);
    testUserName = _.get(session2Me, 'me.name');

    const createProviderQuery = `
      mutation {
        createOpenIdProvider(input: {
          name: "${citestMarker} Item1 CrossOrg Provider"
          clientId: "test-client-id"
          clientSecret: "test-client-secret"
          issuerUrl: "https://login.microsoftonline.com/testAppId/v2.0/.well-known/openid-configuration/test"
        }) {
          id
        }
      }
    `;
    const providerResult = await gqlClient1.query(createProviderQuery, null);
    providerConnectId = _.get(providerResult, 'createOpenIdProvider.id');

    // session1 is superadmin, so it can add session2's user into its own org as a SECONDARY
    // (non-default) membership without session1 needing to be a member of session2's org.
    await gqlClient1.query(
      `mutation($userId: ID, $orgGuid: ID!) {
        addUserToOrganization(userId: $userId, organizationGuid: $orgGuid) { id }
      }`,
      { userId: session2.userId, orgGuid: session1OrgGuid }
    );
  });

  afterAll(async () => {
    if (providerConnectId) {
      await gqlClient1
        .query(`mutation { deleteOpenIdProvider(id: "${providerConnectId}") { id } }`)
        .catch(() => {});
    }
    await session2?.cleanup();
    await session1?.cleanup();
  });

  it('returns providers from a non-default org when the default org has none', async () => {
    const url = `${coreAdminClient.url}/admin/openid/org/${encodeURIComponent(testUserName)}`;
    const res = await coreAdminClient.get(url, coreAdminClient.userAuth);
    // Note: this raw admin REST response uses `connectId`, not `id` (the GraphQL OpenIdProvider
    // type aliases it to `id`, but this endpoint doesn't go through that resolver).
    const records = _.get(res, 'body.results', []);
    const found = records.find((p) => p.connectId === providerConnectId);
    expect(found).toBeDefined();
  });
});

/**
 * the openid role record auto-created for a
 * brand-new SCIM role key must be persisted with default roleIds populated (previously created
 * with none). Self-contained describe block with its own provider/session, independent of the
 * main suite's connectId.
 */
describe('citest_openid default roleIds on first-time SCIM openid role creation', () => {
  let gqlClient, coreAdminClient, session;
  let scimApiTokenHash;
  let providerConnectId;
  let scimCreatedUserId;
  const openidRoleKey = `aiware_${citestMarker}_role_${Date.now()}`;

  beforeAll(async () => {
    const env = helpers.config.env;
    gqlClient = new GraphqlClient(env);
    coreAdminClient = new CoreAdminClient(env);
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options;
    await coreAdminClient.connect(session.token);

    // Same SCIM-token bootstrap as the main suite's beforeAll — see the detailed comment there
    // for why a dedicated org-linked token is required instead of the default apiToken.
    const scimToken = await coreAdminClient.post(coreAdminClient.url + '/admin/tokens', {
      orgId: session.orgId,
      token: {
        json: {
          isRevoked: false,
          internal: false,
          tokenLabel: `${citestMarker}_role_scim_token`,
          rights: ['user:create', 'user:update', 'user:read', 'user:delete']
        }
      }
    });
    const scimTokenId = _.get(scimToken, 'tokenId');
    scimApiTokenHash = _.get(scimToken, 'tokenHash');
    if (scimTokenId) {
      coreAdminClient.tokenAuth = helpers.requestOptions(scimTokenId);
    }

    const createProviderQuery = `
      mutation {
        createOpenIdProvider(input: {
          name: "${citestMarker} Item3 Provider"
          clientId: "test-client-id"
          clientSecret: "test-client-secret"
          issuerUrl: "https://login.microsoftonline.com/testAppId/v2.0/.well-known/openid-configuration/test"
        }) {
          id
        }
      }
    `;
    const providerResult = await gqlClient.query(createProviderQuery, null);
    providerConnectId = _.get(providerResult, 'createOpenIdProvider.id');
  });

  afterAll(async () => {
    if (scimCreatedUserId) {
      await gqlClient
        .query(`mutation { deleteUser(id: "${scimCreatedUserId}") { id } }`)
        .catch(() => {});
    }
    if (providerConnectId) {
      await gqlClient
        .query(`mutation { deleteOpenIdProvider(id: "${providerConnectId}") { id } }`)
        .catch(() => {});
    }
    if (scimApiTokenHash) {
      await coreAdminClient
        .post(coreAdminClient.url + '/admin/tokens/' + scimApiTokenHash + '/revoke', {})
        .catch(() => {});
    }
    await session?.cleanup();
  });

  it('populates roleIds on the openid role record created for a brand-new SCIM role key', async () => {
    const scimUrl = coreAdminClient.url + '/admin/scim/' + providerConnectId + '/users';
    const timestamp = Date.now();
    const scimData = {
      schemas: [
        'urn:ietf:params:scim:schemas:core:2.0:User',
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'
      ],
      externalId: `${citestMarker}-item3-${timestamp}`,
      userName: `${citestMarker}_item3_${timestamp}@citest.onmicrosoft.com`,
      active: true,
      displayName: 'Citest Item3 User',
      emails: [
        { primary: true, type: 'work', value: `citest_item3_${timestamp}@citest.com` }
      ],
      meta: { resourceType: 'User' },
      name: { formatted: 'Citest Item3 User', familyName: 'Item3', givenName: 'Citest' },
      roles: [{ value: openidRoleKey }]
    };
    const scimRes = await coreAdminClient.post(scimUrl, scimData, true);
    expect(scimRes.id).toBeDefined();
    scimCreatedUserId = scimRes.id;

    const roleUrl =
      coreAdminClient.url +
      '/admin/organizations/' +
      session.orgId +
      '/openid-roles/' +
      encodeURIComponent(openidRoleKey);
    const roleRes = await coreAdminClient.get(roleUrl, coreAdminClient.userAuth);
    const openidRole = _.get(roleRes, 'body');
    expect(openidRole).toBeDefined();
    expect(Array.isArray(openidRole.roleIds)).toBe(true);
    expect(openidRole.roleIds.length).toBeGreaterThan(0);
  });
});
