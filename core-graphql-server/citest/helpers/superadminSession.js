const _ = require('lodash');
const uuid = require('uuid');
const helpers = require('./index');
const orgHelper = require('./organization');
const userHelper = require('./user');

// T11/T12: the "Super Admin" role alone grants only a narrow admin/org/user/group/package/slug
// mask — it does NOT include CMS/Collections/Discovery/Folder rights, nor the literal
// `superadmin`/`admin.org.create` scopes (@scopes(["superadmin"]) resolves via
// fpl.permissions.superadmin, a DIFFERENT permission id than the `veritone.superadmin` bit the
// Super Admin role does grant — confirmed by live DB query against the bootstrap superadmin's
// actual 7-role set below). Empirically verified (2026-07-01, live run against getPackageRbac.spec.js)
// that Super Admin + aiWARE Administrator alone still 403s on createOrganization
// (rightsRequired: ["superadmin","admin.org.create"], rightsGranted: 200 rights, neither present).
// Adding aiWARE Instance Administrator closes the gap — it is the only one of the bootstrap
// superadmin's 7 roles with a mask shape distinct enough to plausibly carry the literal
// superadmin bit (confirmed by direct DB query: `SELECT r.role_id, r.role_name, r.permissions
// FROM sso_user_role ur JOIN role r ON r.role_id=ur.role_id JOIN sso_user u ON u.user_id=ur.user_id
// WHERE u.user_name='sys_graphql_citest_superadmin@veritone.com'` returns CI Tester, CMS Editor,
// Collections Editor, Developer Admin, Discovery Editor, aiWARE Administrator, and aiWARE Instance
// Administrator — this helper grants the minimum subset re-verified live to pass createOrganization).
const ROLE_IDS = [
  '3459c3de-493f-443a-8ad0-ddb9f3f6c76d', // Super Admin — org/user/group/package/slug admin rights
  '032218c3-d47e-4287-9d16-7bb867c01266', // aiWARE Administrator — broad content-access rights
  'cb18eb9c-3264-434a-8a8d-e6b2d680f66e' // aiWARE Instance Administrator — literal superadmin/admin.org.create scope
];
const citestMarker = global.citestMarker || 'citest-should-delete';

// The bootstrap connection below is the shared, org-7682-member superadmin — the exact
// account T12 found gets collaterally logged out by an unrelated OLP-toggle event
// (terminateOrgSessions enumerates every session indexed under an org GUID, including a
// superadmin who is simply a member). Once the throwaway user is created and logged in,
// it's immune (member of no other org) — but the brief bootstrap window itself is not.
// Confirmed live (run-11, packageGrant.rbac.multiOrg.spec.js): createTestOrganization
// failed with the same authentication_error T12 documents, inside this bootstrap step.
// Retry the whole bootstrap-through-login sequence with a fresh connect() on that
// specific, known, external failure mode — this is not a propagation-race sleep-poll,
// it's resilience against a real async session-kill event outside this code's control.
const BOOTSTRAP_RETRY_ATTEMPTS = 3;

function isAuthenticationError(err) {
  return /"name":"authentication_error"/.test(String(err && err.message));
}

// Creates a brand-new, single-use org + superadmin user, isolated from every other
// org/session in the run. Use this instead of the raw `gqlClient.connect()` session
// whenever a spec needs a superadmin session but must not risk being a collateral
// casualty of another spec's org-scoped session termination (T12: an OLP toggle on
// org X logs out EVERY session merely indexed under org X's GUID, including a
// superadmin who is simply a member — not just the target org's own users).
async function createIsolatedSuperadmin({ gqlClient }) {
  let lastErr;
  for (let attempt = 1; attempt <= BOOTSTRAP_RETRY_ATTEMPTS; attempt++) {
    try {
      return await bootstrapAndCreate(gqlClient);
    } catch (err) {
      lastErr = err;
      if (!isAuthenticationError(err) || attempt === BOOTSTRAP_RETRY_ATTEMPTS) {
        throw err;
      }
      // eslint-disable-next-line no-console
      console.error(
        `createIsolatedSuperadmin: bootstrap attempt ${attempt} hit authentication_error ` +
          '(likely a T12-class OLP-toggle collateral session kill) — retrying with a fresh connect()',
        err
      );
    }
  }
  throw lastErr;
}

async function bootstrapAndCreate(gqlClient) {
  const bootstrap = await gqlClient.connect();
  const bootstrapOptions = helpers.requestOptions(bootstrap.token);
  const bootstrapClient = { gqlClient, options: bootstrapOptions };

  const org = await orgHelper.createTestOrganization(bootstrapClient, {
    name: `${citestMarker}-isolated-superadmin-org-${uuid.v4()}`,
    businessUnit: 'Developer',
    kvp: {}
  });

  const email = `citest-isolated-sa-${uuid.v4()}@localhost`;
  const password = uuid.v4();
  const user = await userHelper.createUser(bootstrapClient, {
    name: email,
    password,
    orgId: org.id,
    rolesIds: ROLE_IDS
  });

  const loginRes = await gqlClient.query(
    `mutation($u: String!, $p: String!) {
      userLogin(input: { userName: $u, password: $p }) { token apiToken }
    }`,
    { u: email, p: password }
  );
  const token = _.get(loginRes, 'userLogin.token');
  if (!token) {
    throw new Error(`createIsolatedSuperadmin: userLogin returned no token for ${email}`);
  }
  const options = helpers.requestOptions(token);

  async function cleanup() {
    // Issue the delete mutations directly with explicit bootstrapOptions rather than
    // going through userHelper.deleteUser (which ignores its client's `options` field
    // and instead relies on gqlClient.userAuth — implicit global state this helper
    // must not depend on to be self-contained and correct regardless of what the
    // calling spec has done to gqlClient.userAuth by the time cleanup() runs).
    // Delete the user before the org: deleting the org first while it still has a
    // member user risks an orphaned/undeletable user record depending on cascade
    // behavior on organization/sso_user.
    await gqlClient
      .query(`mutation { deleteUser(id: "${user.id}") { id } }`, null, bootstrapOptions)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`createIsolatedSuperadmin cleanup: failed to delete user ${user.id}`, err);
      });
    await orgHelper.deleteOrganization(bootstrapClient, org.id).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`createIsolatedSuperadmin cleanup: failed to delete org ${org.id}`, err);
    });
  }

  return { token, options, orgId: org.id, userId: user.id, cleanup };
}

module.exports = { createIsolatedSuperadmin };
