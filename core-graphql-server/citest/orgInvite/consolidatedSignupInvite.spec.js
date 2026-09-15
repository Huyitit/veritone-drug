/**
 * E2E: createOrganizationInvite with consolidated-signup payload
 * (requestToJoinOrganization: true, userDetails with hashedPassword, etc.).
 */

const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');
const orgHelpers = require('../helpers/organization.js');
const userHelpers = require('../helpers/user.js');
const orgInviteHelpers = require('../helpers/orgInvite.js');
const _ = require('lodash');
const uuid = require('uuid');
const { safe } = require('../helpers/cleanup/utils.js');

const config = helpers.config;
const env = config.env;
const gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';

const superAdmin = { options: {}, token: '' };
const org1Setup = { org: {}, adminUser: {}, regularUser: {} };

const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];

/** Same shape as consolidated admin signup: BLL sends registrationConfigurationId for idempotent replays. */
const consolidatedSignupCustomRegistrationId = uuid.v4();

const createdUserIds = new Set();
const createdInviteIds = new Set();

function createOrgAndUserInput(orgName) {
  const uniqueId = uuid.v4();
  return {
    orgInput: {
      name: orgName + uniqueId,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: { features: { enableRBACFeature: 'disabled' } },
      apps: [
        {
          applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
          applicationKey: 'cms'
        },
        global.enableDefaultDesktopApp || true
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
    userInputs: [
      {
        key: 'adminUser',
        name: `${citestMarker}-consolidated-admin+${uniqueId}@veritone.com`,
        email: `${citestMarker}-consolidated-admin+${uniqueId}@veritone.com`,
        roleIds: [
          'ddca9b68-d775-4934-8ffd-7aecc779b652',
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
        ].filter(Boolean)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-consolidated-regular+${uniqueId}@veritone.com`,
        email: `${citestMarker}-consolidated-regular+${uniqueId}@veritone.com`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
      }
    ]
  };
}

function consolidatedSignupInviteInput(overrides = {}) {
  const unique = `consolidated-${Date.now()}-${uuid.v4().slice(0, 8)}`;

  return {
    organizationId: org1Setup.org.id,
    email: `${unique}@example.com`,
    message: 'Consolidated signup invite',
    applicationRoles,
    requestToJoinOrganization: true,
    disableAutoApproval: true,
    userDetails: {
      firstName: 'Consolidated',
      lastName: 'User',
      hashedPassword: 'secrethashedpassword',
      customFields: null,
      customRegistrationId: consolidatedSignupCustomRegistrationId
    },
    ...overrides
  };
}

describe('citest_orginvite: Consolidated signup invite', () => {
  let newEmail;
  let firstInviteId;

  beforeAll(async () => {
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdmin.token = result.token;
    superAdmin.options = helpers.requestOptions(result.token);

    const testOrg1 = await orgHelpers.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superAdmin.token },
      createOrgAndUserInput(citestMarker + '-consolidated-org-'),
      {
        limit: 1,
        name: `${citestMarker}-consolidated-org-`,
        nameMatch: 'contains',
        kvpProperty: 'features.enableRBACFeature',
        kvpValue: 'disabled',
        status: 'active'
      }
    );
    org1Setup.org = testOrg1.org;
    org1Setup.adminUser = testOrg1.listOptions.find(
      (u) => u.key === 'adminUser'
    );
    org1Setup.regularUser = testOrg1.listOptions.find(
      (u) => u.key === 'regularUser'
    );

    trackCreatedUser(org1Setup.adminUser.userId);
    trackCreatedUser(org1Setup.regularUser.userId);
  });

  describe('createOrganizationInvite with requestToJoinOrganization and userDetails', () => {
    it('happy path - invite created with request-to-join payload', async () => {
      const input = consolidatedSignupInviteInput();
      newEmail = input.email;

      const res = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: superAdmin.options },
        input
      );

      const invite = _.get(res, 'createOrganizationInvite');
      expect(invite).toBeDefined();
      expect(invite.id).toBeDefined();
      expect(invite.email).toEqual(newEmail);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.status).toEqual('submitted');
      expect(invite.userDetails).toBeDefined();
      expect(invite.userDetails.hashedPassword).toBeUndefined();
      expect(invite.userDetails.firstName).toEqual('Consolidated');
      expect(invite.userDetails.customRegistrationId).toEqual(
        consolidatedSignupCustomRegistrationId
      );
      firstInviteId = invite.id;
      trackCreatedInvite(invite.id);
    });

    it('request-to-join with disableAutoApproval false is auto-approved', async () => {
      const input = consolidatedSignupInviteInput({
        email: `auto-approved-${uuid.v4()}@example.com`,
        disableAutoApproval: false
      });

      const res = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: superAdmin.options },
        input
      );

      const invite = _.get(res, 'createOrganizationInvite');
      expect(invite).toBeDefined();
      expect(invite.email).toEqual(input.email);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.status).toEqual('approved');
      trackCreatedInvite(invite.id);
    });

    it('request-to-join with disableAutoApproval omitted behaves like false (auto-approved)', async () => {
      const input = consolidatedSignupInviteInput({
        email: `auto-approved-omitted-${uuid.v4()}@example.com`
      });
      delete input.disableAutoApproval;

      const res = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: superAdmin.options },
        input
      );

      const invite = _.get(res, 'createOrganizationInvite');
      expect(invite).toBeDefined();
      expect(invite.email).toEqual(input.email);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.status).toEqual('approved');
      trackCreatedInvite(invite.id);
    });

    it('idempotent replay: same email + org + userDetails.customRegistrationId returns same invite id', async () => {
      const input = consolidatedSignupInviteInput({ email: newEmail });

      const res = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: superAdmin.options },
        input
      );

      const invite = _.get(res, 'createOrganizationInvite');
      expect(invite).toBeDefined();
      expect(invite.id).toEqual(firstInviteId);
      expect(invite.email).toEqual(newEmail);
      trackCreatedInvite(invite.id);
    });

    it('userDetails.customFields is accepted (matches REST consolidated signup payload shape)', async () => {
      const regId = uuid.v4();
      const input = consolidatedSignupInviteInput({
        email: `cf-details-${uuid.v4()}@example.com`,
        userDetails: {
          firstName: 'Consolidated',
          lastName: 'User',
          hashedPassword: 'secrethashedpassword',
          customFields: [
            { id: 'e2e-custom-q1', value: 'answer-one' },
            { id: 'e2e-custom-q2', value: '2' }
          ],
          customRegistrationId: regId
        }
      });

      const res = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: superAdmin.options },
        input
      );

      const invite = _.get(res, 'createOrganizationInvite');
      expect(invite).toBeDefined();
      expect(invite.email).toEqual(input.email);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.userDetails.hashedPassword).toBeUndefined();
      expect(invite.userDetails.customFields).toEqual(
        input.userDetails.customFields
      );
      trackCreatedInvite(invite.id);
    });

    it('userDetails.acceptedTermsFileId round-trips (config-driven signup records ToS acceptance)', async () => {
      const acceptedTermsFileId = uuid.v4();
      const input = consolidatedSignupInviteInput({
        email: `terms-details-${uuid.v4()}@example.com`,
        userDetails: {
          firstName: 'Consolidated',
          lastName: 'User',
          hashedPassword: 'secrethashedpassword',
          customRegistrationId: uuid.v4(),
          acceptedTermsFileId
        }
      });

      const res = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: superAdmin.options },
        input
      );

      const invite = _.get(res, 'createOrganizationInvite');
      expect(invite).toBeDefined();
      expect(invite.email).toEqual(input.email);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.userDetails.hashedPassword).toBeUndefined();
      expect(invite.userDetails.acceptedTermsFileId).toEqual(
        acceptedTermsFileId
      );
      trackCreatedInvite(invite.id);
    });

    it('same email but different userDetails.customRegistrationId yields a new invite (not idempotent)', async () => {
      const email = `reg-switch-${uuid.v4()}@example.com`;
      const regId1 = uuid.v4();
      const regId2 = uuid.v4();

      const first = consolidatedSignupInviteInput({ email });
      first.userDetails = {
        ...first.userDetails,
        customRegistrationId: regId1
      };
      const res1 = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: superAdmin.options },
        first
      );
      const id1 = _.get(res1, 'createOrganizationInvite.id');
      expect(id1).toBeDefined();
      trackCreatedInvite(id1);

      const second = consolidatedSignupInviteInput({ email });
      second.userDetails = {
        ...second.userDetails,
        customRegistrationId: regId2
      };
      const res2 = await orgInviteHelpers.helpCreateOrgInvite(
        { gqlClient, options: superAdmin.options },
        second
      );
      const id2 = _.get(res2, 'createOrganizationInvite.id');
      expect(id2).toBeDefined();
      expect(id2).not.toEqual(id1);
      trackCreatedInvite(id2);
    });

    it('invalid email returns GraphQL errors', async () => {
      const input = consolidatedSignupInviteInput({
        email: 'not-an-email',
        organizationId: org1Setup.org.id
      });

      await expect(
        orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: superAdmin.options },
          input
        )
      ).rejects.toThrow();
    });

    it('invalid organizationId returns GraphQL errors', async () => {
      const input = consolidatedSignupInviteInput({
        organizationId: '999999',
        email: `nonexistent-${uuid.v4()}@example.com`
      });

      await expect(
        orgInviteHelpers.helpCreateOrgInvite(
          { gqlClient, options: superAdmin.options },
          input
        )
      ).rejects.toThrow();
    });
  });

  afterAll(async () => {
    await safeDeleteTrackedOrgInvites();
    await safeDeleteUsers(Array.from(createdUserIds));
    await safeDeleteOrganization(org1Setup.org.id);
  });
});

function trackCreatedUser(userId) {
  if (userId) {
    createdUserIds.add(userId);
  }
}

function trackCreatedInvite(inviteId) {
  if (inviteId) {
    createdInviteIds.add(inviteId);
  }
}

async function safeDeleteTrackedOrgInvites() {
  const inviteIds = Array.from(createdInviteIds).filter(Boolean);

  if (_.isEmpty(inviteIds) || !superAdmin.options) {
    return;
  }

  await safe('delete tracked organization invites', async () => {
    await Promise.allSettled(
      inviteIds.map((inviteId) =>
        orgInviteHelpers.helpDeleteOrgInvite(
          { gqlClient, options: superAdmin.options },
          inviteId
        )
      )
    );
  });
}

async function safeDeleteUsers(userIds) {
  const ids = _.uniq(userIds.filter(Boolean));

  if (_.isEmpty(ids) || !superAdmin.options) {
    return;
  }

  await safe('delete test users', async () => {
    await Promise.allSettled(
      ids.map((userId) =>
        userHelpers.deleteUser(
          {
            gqlClient,
            options: superAdmin.options
          },
          userId
        )
      )
    );
  });
}

async function safeDeleteOrganization(orgId) {
  if (!orgId || !superAdmin.options) {
    return;
  }

  await safe(`delete organization ${orgId}`, async () => {
    await orgHelpers.deleteOrganization(
      {
        gqlClient,
        options: superAdmin.options
      },
      orgId
    );
  });
}
