/**
 * E2E: createOrganizationInvite with consolidated-signup payload
 * (requestToJoinOrganization: true, userDetails with hashedPassword, etc.).
 */

import { v4 as uuidv4 } from 'uuid';
import { safe } from '../../src/helpers/commonHelper';

import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { OrganizationType } from '../../src/gql';
import _ from 'lodash';

let gqlClient: GraphqlClient;
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const citestMarker = (global as any).citestMarker || 'citest-should-delete';

const org1Setup = {
  org: {} as any,
  adminUser: {} as any,
  regularUser: {} as any
};

const applicationRoles = [
  {
    applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
    roleId: '912e377e-f4a4-4184-8db1-baa9670d8081'
  }
];

/** Same shape as consolidated admin signup: BLL sends registrationConfigurationId for idempotent replays. */
const consolidatedSignupCustomRegistrationId = uuidv4();

describe('citest_orginvite: Consolidated signup invite', () => {
  let newEmail: any;
  let firstInviteId: any;
  const createdInviteIds = new Set<string>();

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    const testOrg1 = await setupTestOrgAndUser(
      gqlClient,
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
    org1Setup.adminUser = testOrg1.listOptions.find((u: any) =>
      u.userName.includes(`${citestMarker}-consolidated-admin`)
    );
    org1Setup.regularUser = testOrg1.listOptions.find((u: any) =>
      u.userName.includes(`${citestMarker}-consolidated-regular`)
    );
  });

  describe('createOrganizationInvite with requestToJoinOrganization and userDetails', () => {
    it('happy path - invite created with request-to-join payload', async () => {
      const input = consolidatedSignupInviteInput();
      newEmail = input.email;

      const createOrgInviteRes = await gqlClient.sdk.createOrgInvite({
        input: { ...input }
      });

      const invite = createOrgInviteRes?.data?.createOrganizationInvite;
      expect(invite).toBeDefined();
      expect(invite.id).toBeDefined();
      expect(invite.email).toEqual(newEmail);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.status).toEqual('submitted');
      expect(invite.userDetails).toBeDefined();
      expect(invite.userDetails.hashedPassword).toBeUndefined();
      expect(invite.userDetails.firstName).toBe('Consolidated');
      expect(invite.userDetails.customRegistrationId).toBe(
        consolidatedSignupCustomRegistrationId
      );
      firstInviteId = invite.id;
      createdInviteIds.add(invite.id);
    });

    it('request-to-join with disableAutoApproval false is auto-approved', async () => {
      const input = consolidatedSignupInviteInput({
        email: `auto-approved-${uuidv4()}@example.com`,
        disableAutoApproval: false
      });

      const createOrgInviteRes = await gqlClient.sdk.createOrgInvite({
        input: { ...input }
      });

      const invite = createOrgInviteRes?.data?.createOrganizationInvite;
      expect(invite).toBeDefined();
      expect(invite.email).toEqual(input.email);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.status).toEqual('approved');
      createdInviteIds.add(invite.id);
    });

    it('request-to-join with disableAutoApproval omitted behaves like false (auto-approved)', async () => {
      const input = consolidatedSignupInviteInput({
        email: `auto-approved-omitted-${uuidv4()}@example.com`
      });
      delete (input as Partial<typeof input>).disableAutoApproval;

      const createOrgInviteRes = await gqlClient.sdk.createOrgInvite({
        input: { ...input }
      });

      const invite = createOrgInviteRes?.data?.createOrganizationInvite;
      expect(invite).toBeDefined();
      expect(invite.email).toEqual(input.email);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.status).toEqual('approved');
      createdInviteIds.add(invite.id);
    });

    it('idempotent replay: same email + org + userDetails.customRegistrationId returns same invite id', async () => {
      const input = consolidatedSignupInviteInput({ email: newEmail });

      const createOrgInviteRes = await gqlClient.sdk.createOrgInvite({
        input: { ...input }
      });

      const invite = createOrgInviteRes?.data?.createOrganizationInvite;
      expect(invite).toBeDefined();
      expect(invite.id).toEqual(firstInviteId);
      expect(invite.email).toEqual(newEmail);
    });

    it('userDetails.customFields is accepted (matches REST consolidated signup payload shape)', async () => {
      const regId = uuidv4();
      const input = consolidatedSignupInviteInput({
        email: `cf-details-${uuidv4()}@example.com`,
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

      const createOrgInviteRes = await gqlClient.sdk.createOrgInvite({
        input: { ...input }
      });

      const invite = createOrgInviteRes?.data?.createOrganizationInvite;
      expect(invite).toBeDefined();
      expect(invite.email).toEqual(input.email);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.userDetails.hashedPassword).toBeUndefined();
      expect(invite.userDetails.customFields).toEqual(
        input.userDetails.customFields
      );
      createdInviteIds.add(invite.id);
    });

    it('userDetails.acceptedTermsFileId round-trips (config-driven signup records ToS acceptance)', async () => {
      const acceptedTermsFileId = uuidv4();
      const input = consolidatedSignupInviteInput({
        email: `terms-details-${uuidv4()}@example.com`,
        userDetails: {
          firstName: 'Consolidated',
          lastName: 'User',
          hashedPassword: 'secrethashedpassword',
          customRegistrationId: uuidv4(),
          acceptedTermsFileId
        }
      });

      const createOrgInviteRes = await gqlClient.sdk.createOrgInvite({
        input: { ...input }
      });

      const invite = createOrgInviteRes?.data?.createOrganizationInvite;
      expect(invite).toBeDefined();
      expect(invite.email).toEqual(input.email);
      expect(invite.organization.id).toEqual(org1Setup.org.id);
      expect(invite.userDetails.hashedPassword).toBeUndefined();
      expect(invite.userDetails.acceptedTermsFileId).toEqual(
        acceptedTermsFileId
      );
      createdInviteIds.add(invite.id);
    });

    it('same email but different userDetails.customRegistrationId yields a new invite (not idempotent)', async () => {
      const email = `reg-switch-${uuidv4()}@example.com`;
      const regId1 = uuidv4();
      const regId2 = uuidv4();

      const first = consolidatedSignupInviteInput({ email });
      first.userDetails = {
        ...first.userDetails,
        customRegistrationId: regId1
      };

      const createOrgInviteRes1 = await gqlClient.sdk.createOrgInvite({
        input: { ...first }
      });
      const id1 = createOrgInviteRes1?.data?.createOrganizationInvite?.id;
      expect(id1).toBeDefined();
      if (id1) {
        createdInviteIds.add(id1);
      }

      const second = consolidatedSignupInviteInput({ email });
      second.userDetails = {
        ...second.userDetails,
        customRegistrationId: regId2
      };

      const createOrgInviteRes2 = await gqlClient.sdk.createOrgInvite({
        input: { ...second }
      });
      const id2 = createOrgInviteRes2?.data?.createOrganizationInvite?.id;
      expect(id2).toBeDefined();
      expect(id2).not.toEqual(id1);
      if (id2) {
        createdInviteIds.add(id2);
      }
    });

    it('invalid email returns GraphQL errors', async () => {
      const input = consolidatedSignupInviteInput({
        email: 'not-an-email',
        organizationId: org1Setup.org.id
      });

      const createOrgInviteRes = gqlClient.sdk.createOrgInvite({
        input: { ...input }
      });

      await expect(createOrgInviteRes).rejects.toThrow();
    });

    it('invalid organizationId returns GraphQL errors', async () => {
      const input = consolidatedSignupInviteInput({
        organizationId: '999999',
        email: `nonexistent-${uuidv4()}@example.com`
      });

      const createOrgInviteRes = gqlClient.sdk.createOrgInvite({
        input: { ...input }
      });

      await expect(createOrgInviteRes).rejects.toThrow();
    });
  });

  afterAll(async () => {
    if (org1Setup.org?.id) {
      const getInvitesRes = await safe(
        'fetch consolidated signup invites',
        () =>
          gqlClient.sdk.organization({
            id: org1Setup.org.id
          })
      );

      const invites = _.get(
        getInvitesRes,
        'data.organization.organizationInvites',
        []
      ) as any[];

      const inviteIdsToDelete = new Set([
        ...createdInviteIds,
        ...invites
          .filter((inv: any) => inv?.email?.includes('consolidated'))
          .map((inv: any) => inv.id)
      ]);

      await Promise.all(
        invites
          .filter(
            (inv: any) =>
              inv?.id &&
              inv.status !== 'deleted' &&
              inviteIdsToDelete.has(inv.id)
          )
          .map((inv: any) =>
            safe(`delete org invite ${inv.id}`, () =>
              gqlClient.sdk.deleteOrganizationInvite({
                id: inv.id
              })
            )
          )
      );
    }

    const userIds = [
      org1Setup.adminUser?.userId,
      org1Setup.regularUser?.userId
    ].filter((id): id is string => Boolean(id));

    await Promise.all(
      userIds.map((userId) =>
        safe(`delete user ${userId}`, () =>
          gqlClient.sdk.deleteUser({ id: userId })
        )
      )
    );

    if (org1Setup.org?.id) {
      await safe(`delete org ${org1Setup.org.id}`, () =>
        gqlClient.sdk.updateOrganization({
          input: {
            id: org1Setup.org.id,
            status: 'deleted'
          }
        })
      );
    }
  });
});

function createOrgAndUserInput(orgName: string) {
  const uniqueId = uuidv4();

  return {
    orgInput: {
      name: orgName + uniqueId,
      businessUnit: 'Legal',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: { features: { enableRBACFeature: 'disabled' } },
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
    userInputs: [
      {
        name: `${citestMarker}-consolidated-admin-${uniqueId}@veritone.com`,
        email: `${citestMarker}-consolidated-admin-${uniqueId}@veritone.com`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-consolidated-regular-${uniqueId}@veritone.com`,
        email: `${citestMarker}-consolidated-regular-${uniqueId}@veritone.com`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828']
      }
    ]
  };
}

function consolidatedSignupInviteInput(overrides = {}) {
  const unique = `consolidated-${Date.now()}-${uuidv4().slice(0, 8)}`;

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
