const config = require('../helpers').config;
const orgHelper = require('../helpers/organization');
const userHelper = require('../helpers/user');
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../helpers/superadminSession');
const env = config.env;
const util = require('../../util.js')({});
const _ = require('lodash');

const isCurrentEnvLocal = () => (env.includes('local') ? describe : xdescribe);
const citestMarker = global.citestMarker || 'citest-should-delete';

isCurrentEnvLocal()('Audit log tests', function () {
  const password = `${Date.now()}`;
  const uuid = require('uuid');
  let gqlClient;
  let orgForSuperAdmin,
    orgForOrgAdminAndRegularUser,
    existOrgAdminAndRegularUser;
  let superAdminUser, orgAdminUser, regularUser;
  let orgAdminLogged, regularUserLogged;
  let superToken;
  let session;
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    superAdminUser = await gqlClient.connect();

    // Wait for the eventing/ES pipeline to be warm before running any tests.
    // Eventing's NSQ consumer registers asynchronously after its HTTP healthcheck
    // passes (can take 60-90s), so events fired early in beforeAll queue in NSQ
    // and arrive in a burst. Polling here absorbs that delay so tests don't race.
    {
      const superAdminOptions = {
        headers: { Authorization: `Bearer ${superAdminUser.token}` }
      };
      const warmupQuery = `query ($userId: String) {
        instanceAuditLog(input: { eventNames: LoginSucceeded, userId: $userId, limit: 1 }) {
          records { id }
        }
      }`;
      for (let i = 0; i < 180; i++) {
        const r = await gqlClient.query(
          warmupQuery,
          { userId: superAdminUser.userId },
          superAdminOptions
        );
        if (r.instanceAuditLog.records.length > 0) break;
        await util.sleep(1000);
      }
    }

    // T15: This spec's afterAll issues the REAL REST org-delete (helpers.deleteOrganization)
    // on orgForOrgAdminAndRegularUser. That endpoint enumerates every ACTIVE MEMBER of the
    // org and calls removeAllUserSessions(userId) on each — a GLOBAL, not org-scoped, wipe of
    // every one of that user's session tokens. createOrganization enrolls its CALLER as an
    // admin member (addAdminToOrganization), so whoever creates this org becomes a member and
    // gets their session killed by that afterAll delete. Previously this spec created its org
    // on the SHARED superadmin session (sys_graphql_citest_superadmin, via gqlClient.userAuth
    // from connect()), so the delete collaterally killed the shared superadmin everywhere —
    // including in any concurrently-running spec (MAX_WORKERS=2) relying on that same shared
    // session (the T14 victim class). Fix: create/own this spec's org via an ISOLATED throwaway
    // superadmin so ONLY that (already-being-torn-down) identity is the enrolled member the
    // delete kills. This mirrors T14's fix exactly. The explicit superAdminOptions used for the
    // eventing-warmup polling and the test-body reads below intentionally stay on the shared
    // superadmin (they pass an explicit auth arg that bypasses userAuth, and they assert on the
    // shared superadmin's own/cross-org audit logs) — those reads never call removeAllUserSessions.
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options; // route implicit-auth create/find calls through the isolated identity

    orgForSuperAdmin = await orgHelper.getTestOrganization(
      { gqlClient },
      { id: superAdminUser.organizationId }
    );

    existOrgAdminAndRegularUser = await orgHelper.getTestOrganization(
      { gqlClient },
      { name: 'citest' }
    );
    let availableOrg = checkForAvailableOrg(existOrgAdminAndRegularUser);
    if (existOrgAdminAndRegularUser.length === 0 || !availableOrg) {
      console.log('creating new test organization');
      orgForOrgAdminAndRegularUser = await orgHelper.createTestOrganization(
        { gqlClient },
        {
          name: `${citestMarker}-org-testing-${uuid.v4()}`,
          businessUnit: 'Legal',
          types: ['agency', 'broadcaster'],
          kvp: {
            test: 'value',
            features: {
              automaticPackageCreation: 'enabled'
            }
          },
          apps: [],
          remainingBudget: 0,
          isLimitEnforced: true
        }
      );
    } else {
      console.log('organization for CI test exist, using it: ');
      orgForOrgAdminAndRegularUser = availableOrg;
    }

    orgAdminUser = await userHelper.createUser(
      { gqlClient },
      {
        name: `${citestMarker}-org-admin-testUser-${uuid.v4()}@localhost`,
        password: password,
        orgId: orgForOrgAdminAndRegularUser.id,
        rolesIds: [userHelper.roles.orgAdmin]
      }
    );

    regularUser = await userHelper.createUser(
      { gqlClient },
      {
        name: `${citestMarker}-regular-user-testUser-${uuid.v4()}@localhost`,
        password: password,
        orgId: orgForOrgAdminAndRegularUser.id,
        rolesIds: []
      }
    );

    orgAdminLogged = await userHelper.loginUser(
      { gqlClient },
      {
        userName: orgAdminUser.name,
        password: password
      }
    );

    regularUserLogged = await userHelper.loginUser(
      { gqlClient },
      {
        userName: regularUser.name,
        password: password
      }
    );

    // Second warmup: wait for orgAdmin's LoginSucceeded event to be indexed.
    // The first warmup only guarantees the superAdmin event is indexed; orgAdmin
    // logs in after that warmup exits, so its event is still in the eventing
    // defer window (up to ~15s) when the tests start. Polling here with the
    // superAdmin token (cross-org access) absorbs that delay.
    {
      const superAdminOptions = {
        headers: { Authorization: `Bearer ${superAdminUser.token}` }
      };
      const orgAdminWarmupQuery = `query ($userId: String, $organizationId: ID) {
        instanceAuditLog(input: { eventNames: LoginSucceeded, userId: $userId, organizationId: $organizationId, limit: 1 }) {
          records { id }
        }
      }`;
      for (let i = 0; i < 60; i++) {
        const r = await gqlClient.query(
          orgAdminWarmupQuery,
          { userId: orgAdminLogged.user.id, organizationId: orgAdminLogged.organization.id },
          superAdminOptions
        );
        if (r.instanceAuditLog.records.length > 0) break;
        await util.sleep(1000);
      }
    }
  });

  afterAll(async () => {
    try {
      if (existOrgAdminAndRegularUser.length === 0) {
        console.log(
          `doing soft deleting to the organization ${orgForOrgAdminAndRegularUser.id} created for the ci test`
        );
        superToken = await helpers.signin(gqlClient.authUrl);
        await helpers.deleteOrganization(
          gqlClient.authUrl,
          orgForOrgAdminAndRegularUser.id,
          superToken.token
        );
      }
      console.log('deleting org admin and regular user');
      // The real org-delete above wiped the ISOLATED superadmin's session (it was this org's
      // enrolled member), so gqlClient.userAuth is now dead. Re-connect() restores a live
      // SHARED-superadmin session so the two deleteUser calls (which resolve auth implicitly
      // via userAuth) run on a valid token instead of silently leaking the users.
      await gqlClient.connect();
      await userHelper.deleteUser({ gqlClient }, orgAdminUser.id);
      await userHelper.deleteUser({ gqlClient }, regularUser.id);
    } catch (err) {
      console.error('error deleting organizations or users');
    }
    // T15: tear down the isolated superadmin's own throwaway org+user. cleanup() uses the
    // bootstrapOptions captured in its own closure (not gqlClient.userAuth), so it is unaffected
    // by the connect() above and by userAuth being dead; both its deletes have internal .catch.
    // Run outside the try/catch so it executes even if the block above threw.
    await session?.cleanup();
  });

  it('Super admin get audit log from its own organization', async () => {
    const options = {
      headers: { Authorization: `Bearer ${superAdminUser.token}` }
    };
    const result = await getInstanceAuditLog(
      { gqlClient, options },
      {
        organizationId: superAdminUser.organizationId,
        userId: superAdminUser.userId
      }
    );
    const log = result[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(
      superAdminUser.organizationId.toString()
    );
    expect(log.userId).toEqual(superAdminUser.userId);
  });

  it('Super admin get audit log from other organization', async () => {
    const options = {
      headers: { Authorization: `Bearer ${superAdminUser.token}` }
    };
    const result = await getInstanceAuditLog(
      { gqlClient, options },
      {
        organizationId: orgAdminLogged.organization.id,
        userId: orgAdminLogged.user.id
      }
    );
    const log = result[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(orgAdminLogged.organization.id);
    expect(log.userId).toEqual(orgAdminLogged.user.id);
  });

  // by default, it'll recover the audit log entries from the last week.
  it('Super admin get audit log from other organization without using input.', async () => {
    const options = {
      headers: { Authorization: `Bearer ${superAdminUser.token}` }
    };
    const result = await getInstanceAuditLog({ gqlClient, options });
    expect(result.length).toBeGreaterThan(0);
  });

  it('Org admin get audit log from its own organization', async () => {
    const options = {
      headers: { Authorization: `Bearer ${orgAdminLogged.token}` }
    };
    const result = await getInstanceAuditLog(
      { gqlClient, options },
      {
        organizationId: orgAdminLogged.organization.id,
        userId: orgAdminLogged.user.id
      }
    );
    const log = result[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(orgAdminLogged.organization.id);
    expect(log.userId).toEqual(orgAdminLogged.user.id);
  });

  it('Org admin get audit log from other user within its own organization', async () => {
    const options = {
      headers: { Authorization: `Bearer ${orgAdminLogged.token}` }
    };
    const result = await getInstanceAuditLog(
      { gqlClient, options },
      {
        organizationId: regularUserLogged.organization.id,
        userId: regularUserLogged.user.id
      }
    );
    const log = result[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(orgAdminLogged.organization.id);
    expect(orgAdminLogged.organization.id).toEqual(
      regularUserLogged.organization.id
    );
    expect(log.userId).toEqual(regularUserLogged.user.id);
  });

  it('Regular user can get only its own audit log entries', async () => {
    const options = {
      headers: { Authorization: `Bearer ${regularUserLogged.token}` }
    };
    const result = await getInstanceAuditLog(
      { gqlClient, options },
      {
        organizationId: orgAdminLogged.organization.id,
        userId: orgAdminLogged.user.id
      }
    );
    const log = result[0];
    expect(log.eventName).toEqual('LoginSucceeded');
    expect(log.organizationId).toEqual(regularUserLogged.organization.id);
    expect(log.userId).toEqual(regularUserLogged.user.id);
  });

  it('Org admin can not get audit log from other user outside its own organization', async () => {
    const options = {
      headers: { Authorization: `Bearer ${orgAdminLogged.token}` }
    };
    let resp;
    try {
      const result = await getInstanceAuditLog(
        { gqlClient, options },
        {
          organizationId: superAdminUser.organizationId,
          userId: superAdminUser.userId
        }
      );
    } catch (err) {
      resp = err;
    }
    const errObj = JSON.parse(resp.message)[0];
    expect(errObj.message).toEqual(
      'Only a super admin can get audit logs from different organizations'
    );
    expect(errObj.data.organizationId).toEqual(
      _.toNumber(superAdminUser.organizationId)
    );
  });

  it('Regular user can not get audit log from other user outside its own organization', async () => {
    const options = {
      headers: { Authorization: `Bearer ${regularUserLogged.token}` }
    };
    let resp;
    try {
      const result = await getInstanceAuditLog(
        { gqlClient, options },
        {
          organizationId: superAdminUser.organizationId,
          userId: superAdminUser.userId
        }
      );
    } catch (err) {
      resp = err;
    }
    const errObj = JSON.parse(resp.message)[0];
    expect(errObj.message).toEqual(
      'Only a super admin can get audit logs from different organizations'
    );
    expect(errObj.data.organizationId).toEqual(
      _.toNumber(superAdminUser.organizationId)
    );
  });
});

async function getInstanceAuditLog(client, input) {
  const query = `query ($userId: String, $organizationId: ID) {
            instanceAuditLog(input: {
                eventNames: LoginSucceeded
                userId: $userId
                organizationId: $organizationId
                offset: 0
                limit: 3
                orderBy: [
                    {
                        field: createdDateTime
                        direction: desc
                    }
                ]
            }
            ){
                records{
                    id
                    eventId
                    organizationId
                    organizationGuid
                    organizationName
                    userId
                    userName
                    clientIpAddress
                    clientUserAgent
                    description
                    createdDateTime
                    eventType
                    eventName
                    targetType
                    objectId
                    actionResult
                    actionName
                    originatorApplication
                    originatorService
                    impersonatorUserId
                    impersonatorUserName
                    correlationId
                }
                count
                offset
                limit
                toDateTime
                fromDateTime
            }
        }`;
  const { gqlClient, options } = client;
  let result = await gqlClient.query(query, input, options);
  let attempts = 0;
  // 30s bounded wait. The beforeAll warmup ensures the eventing pipeline is already
  // processing events before any test runs, so this loop should exit on the first try.
  while (result.instanceAuditLog.records.length === 0 && attempts < 30) {
    console.log('The audit log entry is still not available in Elasticsearch.');
    await util.sleep(1000);
    result = await gqlClient.query(query, input, options);
    attempts++;
  }
  return result.instanceAuditLog.records;
}

const checkForAvailableOrg = (orgs) => {
  for (let org of orgs) {
    if (org.status === 'active') {
      return org;
    }
  }
  return null;
};
