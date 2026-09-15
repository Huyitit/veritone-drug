import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';
import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import * as helpers from '../../../../helpers/index';
import chakram from 'chakram';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { OrganizationInviteAction, OrganizationType } from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';

let gqlClient: GraphqlClient;
let adminRequestHeaders: Record<string, string>;
let regularUserRequestHeaders: Record<string, string>;
const config = helpers.config;
const MAILPIT_BASE_URL =
  process.env.NODE_ENV === 'test'
    ? 'http://mailpit:8025' // run on ci pipeline
    : 'http://localhost:8025'; // run on local

let organizationInviteId: string | undefined;
let organizationInviteId1: string | undefined;
const inviteIds: { [key: string]: string[] } = {
  superAdmin: [],
  orgAdmin: [],
  regular: []
};
const createdInviteIds = new Set<string>();
const createdUserIds = new Set<string>();

const org1Setup = {
  org: {} as any,
  adminUser: { requestOptions: {} as Record<string, string> } as any,
  regularUser: { requestOptions: {} as Record<string, string> } as any,
  newUser: { requestOptions: {} as Record<string, string> } as any
};

const org2Setup = {
  org: {} as any,
  adminUser: { requestOptions: {} as Record<string, string> } as any,
  regularUser: { requestOptions: {} as Record<string, string> } as any,
  newUser: { requestOptions: {} as Record<string, string> } as any
};

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const emailRunId = uuidv4();
const testUserEmail = `${citestMarker}-test-user-email-${emailRunId}@test.com`;
const testUserEmail1 = `${citestMarker}-test-user-email-${emailRunId}-1@test.com`;
const testUserEmail2 = `${citestMarker}-test-user-email-${emailRunId}-2@test.com`;
const testUserEmail3 = `${citestMarker}-test-user-email-${emailRunId}-3@test.com`;
const testUserEmail4 = `${citestMarker}-test-user-email-${emailRunId}-4@test.com`;
const regularInviteEmail = `${citestMarker}-regular-user-${emailRunId}@veritone.com`;
const internalInviteEmail = `${citestMarker}-internal-${emailRunId}@veritone.com`;
const nameOrg = citestMarker + '-organization-invite';

let emailCount = 0;
const inviteEmails = new Set<string>();
const userAgent = config.userAgent || 'core-graphql-server test';

function requestOptions(token: string) {
  return {
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
      Accept: '*/*',
      'Veritone-Correlation-ID': uuidv4(),
      'X-Veritone-Application': 'GraphQL-CI-Test'
    }
  };
}

function trackInvite(inviteId?: string) {
  expect(inviteId).toBeDefined();

  if (inviteId) {
    createdInviteIds.add(inviteId);
  }
}

function trackInviteEmail(email: string) {
  emailCount++;
  inviteEmails.add(email);
}

function getGraphqlErrorMessage(error: any): string {
  return (
    _.get(error, 'response.errors[0].data.serviceMessage') ||
    _.get(error, 'response.errors[0].message') ||
    _.get(error, 'message') ||
    ''
  );
}

describe('citest_orginvite: Multi Orgs Invitation tests', () => {
  let uniqueEmail: string;
  const uniqueId = uuidv4();

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    // create org 1
    const testOrg1 = await setupTestOrgAndUser(
      gqlClient,
      createOrgAndUserInput(citestMarker + '-org-invite-1-')
    );

    org1Setup.org = testOrg1.org;
    org1Setup.adminUser = testOrg1.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-admin-user-`)
    );
    adminRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org1Setup.adminUser.userName,
      password: org1Setup.adminUser.password
    });

    org1Setup.regularUser = testOrg1.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-regular-user-`)
    );
    regularUserRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: org1Setup.regularUser.userName,
      password: org1Setup.regularUser.password
    });

    // create org 2
    const org2Input = createOrgAndUserInput(citestMarker + '-org-invite-2-');
    org2Input.userInputs = org2Input.userInputs.filter((userInput) =>
      userInput.name.includes(`${citestMarker}-regular-user-`)
    );
    const testOrg2 = await setupTestOrgAndUser(gqlClient, org2Input);

    org2Setup.org = testOrg2.org;

    org2Setup.regularUser = testOrg2.listOptions.find((option) =>
      option.userName.includes(`${citestMarker}-regular-user-`)
    );

    uniqueEmail = `${citestMarker}+${uniqueId}@veritone.com`;
  });

  it('Should not found an invitation by email', async () => {
    const organizationRes =
      await gqlClient.query(`query getPendingOrganizationInvites{
      organization(id: "${org1Setup.org.id}") {
        organizationInvites(statuses: [submitted, approved], email: "${testUserEmail}") {
          id
          email
          status
          expirationDate
        }
        isUserPendingMember(email:"${testUserEmail}")
      }
    }`);

    const invites = organizationRes?.organization?.organizationInvites;
    expect(invites).toBeDefined();
    expect(invites?.length).toEqual(0);
    expect(organizationRes?.organization?.isUserPendingMember).toBeDefined();
    expect(organizationRes?.organization?.isUserPendingMember).toEqual(false);
  });

  it('should create and complete an organization invitation flow', async () => {
    const createOrgInviteRes = await gqlClient.sdk.createOrgInvite({
      input: {
        organizationId: org1Setup.org.id,
        email: testUserEmail,
        message: 'test email 1',
        applicationRoles: [
          {
            applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0', //Developer app
            roleId: '912e377e-f4a4-4184-8db1-baa9670d8081' //Editor role
          }
        ]
      },
      includePasswordResetToken: true
    });

    const invite = createOrgInviteRes?.data?.createOrganizationInvite;
    expect(invite).toBeDefined();
    expect(invite.status).toEqual('approved');
    trackInviteEmail(testUserEmail);

    organizationInviteId = invite.id;
    trackInvite(organizationInviteId);

    const passwordResetToken = invite.passwordResetToken;
    expect(passwordResetToken).toBeDefined();
    const requestOption = requestOptions(passwordResetToken!);

    const inviteRes = await gqlClient.sdk.updateOrgInvite(
      {
        input: {
          organizationInviteId,
          action: OrganizationInviteAction.Complete,
          applicationRoles: []
        }
      },
      requestOption as any
    );

    expect(inviteRes?.data?.updateOrganizationInvite.id).toBeDefined();

    await safe(`track created invite user ${testUserEmail}`, async () => {
      const usersRes = await gqlClient.sdk.users({
        name: testUserEmail,
        includeAllOrgUsers: true,
        limit: 10
      } as any);
      const createdUser = usersRes?.data?.users?.records?.find(
        (user: any) =>
          user.email === testUserEmail || user.name === testUserEmail
      );

      if (createdUser?.id) {
        createdUserIds.add(createdUser.id);
      }
    });
  });

  it('get invitation by email and statuses', async () => {
    const query = `query 
    getPendingOrganizationInvites{
      organization(id: "${org1Setup.org.id}") {
        organizationInvites(statuses: [submitted, approved, completed], email: "${testUserEmail}") {
          id
          email
          status
          expirationDate
        }
        isUserPendingMember(email:"${testUserEmail}")
      }
    }`;
    const result = await gqlClient.query(query);
    expect(result.organization).toBeDefined();
    expect(result.organization.organizationInvites).toBeDefined();
    expect(result.organization.organizationInvites?.length).toEqual(1);
    expect(result.organization.organizationInvites?.[0]?.email).toEqual(
      testUserEmail
    );
    expect(result.organization.isUserPendingMember).toEqual(true);
  });

  it('get invitation by email and status and statuses', async () => {
    const query = `query getPendingOrganizationInvites{
      organization(id: "${org1Setup.org.id}") {
        organizationInvites(status: approved, statuses: [submitted, completed], email: "${testUserEmail}") {
          id
          email
          status
          expirationDate
        }
        isUserPendingMember(email:"${testUserEmail}")
      }
    }`;

    const result = await gqlClient.query(query);
    expect(result.organization).toBeDefined();
    expect(result.organization.organizationInvites).toBeDefined();
    expect(result.organization.organizationInvites?.length).toEqual(1);
    expect(result.organization.organizationInvites?.[0]?.email).toEqual(
      testUserEmail
    );
    expect(result.organization.isUserPendingMember).toEqual(true);
  });

  it('Should not be a user member by a new email', async () => {
    const query = `query getPendingOrganizationInvites{
      organization(id: "${org1Setup.org.id}") {
        isUserPendingMember(email:"xxx${testUserEmail}")
      }
    }`;
    const result = await gqlClient.query(query);

    expect(result.organization).toBeDefined();
    expect(result.organization.isUserPendingMember).toEqual(false);
  });

  it('get invitation by organizationInviteId', async () => {
    const result = await gqlClient.sdk.organization({
      id: org1Setup.org.id
    });

    expect(result?.data?.organization).toBeDefined();
    expect(result?.data?.organization?.organizationInvites).toBeDefined();
    expect(result?.data?.organization?.organizationInvites?.length).toEqual(1);
    expect(result?.data?.organization?.organizationInvites?.[0]?.email).toEqual(
      testUserEmail
    );
  });

  it('should throw error if organizationInviteId is not a valid UUID', async () => {
    const invalidId = 'not-a-uuid';
    const query = `query getOrganizationInviteByInvalidId{
      organization(id: "${org1Setup.org.id}") {
        organizationInvites(organizationInviteId: "${invalidId}") {
          id
          email
        }
      }    
    }`;

    await expect(gqlClient.query(query)).rejects.toThrow(
      'organizationInviteId is invalid'
    );
  });

  it('should succeed when seatLimit is unlimited (null)', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: null,
        adminSeatLimit: null
      }
    );

    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${org1Setup.org.id}"
          message: "test email 2"
          email: "${testUserEmail1}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
            }
          ]
        }
      ) {
        id
        status
      }
    }
      `;
    const result = await gqlClient.query(query, adminRequestHeaders);
    const inviteId = result?.createOrganizationInvite?.id;
    expect(result?.createOrganizationInvite).toBeDefined();
    expect(['submitted', 'approved']).toContain(
      result?.createOrganizationInvite?.status
    );
    trackInvite(inviteId);

    const deleteOrganizationInvitequery = `
      mutation {
        deleteOrganizationInvite(organizationInviteId: "${inviteId}") {
          id
          message
        }
      }
    `;
    const deleteOrgRes = await gqlClient.query(deleteOrganizationInvitequery);
    expect(deleteOrgRes?.deleteOrganizationInvite?.id).toEqual(inviteId);
  });

  it('should fail when seatLimit is set to 1 and the current user count exceeds the limit', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 1,
        adminSeatLimit: 1
      }
    );

    const createInviteRes = gqlClient.sdk.createOrgInvite({
      input: {
        organizationId: org1Setup.org.id,
        email: testUserEmail2,
        message: 'test email 3',
        applicationRoles: [
          {
            applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0', //Developer app
            roleId: '912e377e-f4a4-4184-8db1-baa9670d8081' //Editor role
          }
        ]
      }
    });

    await expect(createInviteRes).rejects.toThrow(
      'Organization seat limit exceeded. Cannot invite new users.'
    );
  });

  it('should fail when seatLimit is exceeded even though adminSeatLimit still has available slots', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 1,
        adminSeatLimit: 150000
      }
    );

    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${org1Setup.org.id}"
          message: "test email 4"
          email: "second-${testUserEmail2}"
          applicationRoles: [
            ${
              isDesktopAppEnabled
                ? ''
                : `{
                    applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
                    roleId: "ddca9b68-d775-4934-8ffd-7aecc779b652"
                  },`
            }
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
              roleId: "032218c3-d47e-4287-9d16-7bb867c01266"
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    await expect(gqlClient.query(query)).rejects.toThrow(
      'Organization seat limit exceeded. Cannot invite new users.'
    );

    // update seatLimit and adminSeatLimit to be large numbers again for next tests
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: null,
        adminSeatLimit: 150000
      }
    );
  });

  it('should create an organization invitation for regular user', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${org1Setup.org.id}"
          message: "test email 5"
          email: "${testUserEmail2}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }
      `;
    const result = await gqlClient.query(
      query,
      null,
      regularUserRequestHeaders
    );
    expect(result.createOrganizationInvite.id).toBeDefined();
    organizationInviteId1 = result.createOrganizationInvite.id;
    trackInvite(organizationInviteId1);
  });

  it('should fail when seat limit exceeded during approval', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 1,
        adminSeatLimit: null
      }
    );

    expect(organizationInviteId1).toBeDefined();
    const approveRes = gqlClient.sdk.updateOrgInvite(
      {
        input: {
          organizationInviteId: organizationInviteId1!,
          action: OrganizationInviteAction.Approve,
          applicationRoles: []
        }
      },
      adminRequestHeaders as any
    );

    await expect(approveRes).rejects.toThrow('Cannot approve this invitation');
  });

  it('should succeed when seat limit allows approval', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 150000,
        adminSeatLimit: null
      }
    );

    expect(organizationInviteId1).toBeDefined();
    const approveQuery = `mutation {
      updateOrganizationInvite(input: {
        organizationInviteId: "${organizationInviteId1}"
        action: approve
        applicationRoles: []
      }) { id status }
    }`;
    const result = await gqlClient.query(
      approveQuery,
      null,
      adminRequestHeaders
    );
    expect(result.updateOrganizationInvite.id).toBe(organizationInviteId1);
    trackInviteEmail(testUserEmail2);
  });

  it('should fail when seat limit exceeded during resend', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 1,
        adminSeatLimit: null
      }
    );

    expect(organizationInviteId1).toBeDefined();
    const resendRes = gqlClient.sdk.updateOrgInvite({
      input: {
        organizationInviteId: organizationInviteId1!,
        action: OrganizationInviteAction.Resend,
        applicationRoles: []
      }
    });

    await expect(resendRes).rejects.toThrow('Cannot resend this invitation');
  });

  it('should succeed when seat limit allows resend', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 150000,
        adminSeatLimit: null
      }
    );

    expect(organizationInviteId1).toBeDefined();
    const res = await gqlClient.sdk.updateOrgInvite(
      {
        input: {
          organizationInviteId: organizationInviteId1!,
          action: OrganizationInviteAction.Resend,
          applicationRoles: []
        }
      },
      adminRequestHeaders
    );

    expect(res?.data?.updateOrganizationInvite?.id).toBe(organizationInviteId1);
    trackInviteEmail(testUserEmail2);
  });

  it('should succeed to createUser when seat limit allows', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 150000,
        adminSeatLimit: null
      }
    );

    const createUserRes = await gqlClient.sdk.createUser({
      input: {
        name: `${citestMarker}-user_${uuidv4()}@localhost`,
        password: '123456789',
        organizationId: `${org1Setup.org.id}`,
        roleIds: ['032218c3-d47e-4287-9d16-7bb867c01266'],
        firstName: 'First',
        lastName: 'Last',
        jsondata: {
          foo: 'bar'
        }
      }
    });

    const user = createUserRes?.data?.createUser;
    expect(user?.id).toBeDefined();
    expect(user?.name).toBeDefined();

    if (user?.id) {
      createdUserIds.add(user.id);
    }
  });

  it('should fail to createUser when seat limit is exceeded', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 1,
        adminSeatLimit: null
      }
    );

    const createUserRes = gqlClient.sdk.createUser({
      input: {
        name: `${citestMarker}-user_over_${uuidv4()}@localhost`,
        password: '123456789',
        organizationId: `${org1Setup.org.id}`,
        roleIds: ['912e377e-f4a4-4184-8db1-baa9670d8081'],
        firstName: 'First',
        lastName: 'Last',
        jsondata: {
          foo: 'bar'
        }
      }
    });

    await expect(createUserRes).rejects.toThrow(/seat limit exceeded/i);
  });

  it('should allow createUser when seatLimit is exceeded if the user email is internal domain', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 1,
        adminSeatLimit: null
      }
    );

    const createUserRes = await gqlClient.sdk.createUser(
      {
        input: {
          name: `${citestMarker}-internal_${uuidv4()}@veritone.com`,
          password: '123456789',
          organizationId: `${org1Setup.org.id}`,
          roleIds: ['032218c3-d47e-4287-9d16-7bb867c01266'],
          firstName: 'Internal',
          lastName: 'User'
        }
      },
      adminRequestHeaders
    );

    const user = createUserRes?.data?.createUser;
    expect(user?.id).toBeDefined();
    expect(user?.name).toContain('@veritone.com');

    if (user?.id) {
      createdUserIds.add(user.id);
    }
  });

  it('should error when adding an existing user and seat limit is full', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      { seatLimit: 1 }
    );

    const createInviteRes = gqlClient.sdk.createOrgInvite({
      input: {
        organizationId: org1Setup.org.id,
        email: org2Setup.regularUser.userName,
        message: 'test email 6',
        applicationRoles: [
          {
            applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0', //Developer app
            roleId: '912e377e-f4a4-4184-8db1-baa9670d8081' //Editor role
          }
        ]
      }
    });

    await expect(createInviteRes).rejects.toThrow(
      'Organization seat limit exceeded. Cannot invite new users.'
    );
  });

  it('should succeed when adding an existing user and seat limit allows', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 150000,
        adminSeatLimit: null
      }
    );

    const query = `mutation {
    createOrganizationInvite(
      input: {
        organizationId: "${org1Setup.org.id}"
        message: "test email 7"
        email: "${org2Setup.regularUser.userName}"
        applicationRoles: [
          {
            applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
            roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
          }
        ]
      }
    ) {
      id
      status
    }
  }`;

    const res = await gqlClient.query(query, null, regularUserRequestHeaders);
    expect(res.createOrganizationInvite.id).toBeDefined();
    expect(res.createOrganizationInvite.status).toEqual('submitted');
    trackInvite(res.createOrganizationInvite.id);
  });

  // Unaccepted invites
  it('should not count unaccepted invites towards seat limit', async () => {
    await updateOrgLimits(
      gqlClient,
      org2Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 2
      }
    );

    // Create an invite but do not approve
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${org2Setup.org.id}"
          message: "test email 8"
          email: "${testUserEmail3}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    const res = await gqlClient.query(query);
    expect(res.createOrganizationInvite.id).toBeDefined();
    trackInvite(res.createOrganizationInvite.id);
    trackInviteEmail(testUserEmail3);

    // Seat limit still allows another invite
    const secondQuery = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${org2Setup.org.id}"
          message: "test email 9"
          email: "${testUserEmail4}"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    const secondRes = await gqlClient.query(secondQuery);
    expect(secondRes.createOrganizationInvite.id).toBeDefined();
    trackInvite(secondRes.createOrganizationInvite.id);
    trackInviteEmail(testUserEmail4);
  });

  // Internal users
  it('should not count internal/exempted users for external-only seat limit enforcement', async () => {
    await updateOrgLimits(
      gqlClient,
      org1Setup.org.id,
      gqlClient.sessionToken!,
      {
        seatLimit: 1,
        adminSeatLimit: null
      }
    );

    const query = `mutation {
    createOrganizationInvite(
      input: {
        organizationId: "${org1Setup.org.id}"
        message: "test email 10"
        email: "${internalInviteEmail}"
        applicationRoles: [
          {
            applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
            roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
          }
        ]
      }
    ) {
      id
      status
    }
  }`;
    const res = await gqlClient.query(query, null, regularUserRequestHeaders);
    expect(res.createOrganizationInvite.id).toBeDefined();
    expect(res.createOrganizationInvite.status).toEqual('submitted');
    trackInvite(res.createOrganizationInvite.id);
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'OrganizationInvite flow - %s invite handling',
    (tokenType) => {
      let tokenOptions: any;
      beforeAll(() => {
        tokenOptions = tokenType === 'superAdmin' ? null : adminRequestHeaders;
      });

      it('should create invite successfully on first attempt', async () => {
        const query = `mutation {
          createOrganizationInvite(
            input: {
              organizationId: "${org1Setup.org.id}"
              email: "${uniqueEmail}"
              message: "test email 11"
              applicationRoles: [
                {
                  applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
                  roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
                }
              ]
            }
          ) {
            id
            status
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        const invite = result.createOrganizationInvite;
        trackInvite(invite.id);
        inviteIds[tokenType].push(invite.id);
        expect(invite.status).toBeDefined();
        expect(invite.status).toEqual('approved');
        trackInviteEmail(uniqueEmail);
      });

      it('should return invite after first creation', async () => {
        const query = `query organizationInvites{
          organization(id: "${org1Setup.org.id}") {
            organizationInvites(statuses: [submitted, approved], email: "${uniqueEmail}") {
              id
              email
              status
              expirationDate
            }
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        expect(result.organization.organizationInvites).toBeDefined();
        expect(result.organization.organizationInvites[0].id).toBe(
          inviteIds[tokenType][0]
        );
        expect(result.organization.organizationInvites.length).toEqual(1);
      });

      it('should re-create invite successfully (clears old invite)', async () => {
        const query = `mutation {
          createOrganizationInvite(
            input: {
              organizationId: "${org1Setup.org.id}"
              email: "${uniqueEmail}"
              message: "test email 12"
              applicationRoles: [
                {
                  applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0"
                  roleId: "912e377e-f4a4-4184-8db1-baa9670d8081"
                }
              ]
            }
          ) {
            id
            status
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        const invite = result.createOrganizationInvite;
        trackInvite(invite.id);
        inviteIds[tokenType].push(invite.id);
        expect(invite.status).toBeDefined();
        expect(invite.status).toEqual('approved');
        trackInviteEmail(uniqueEmail);
      });

      it('should return the previous invite with status "deleted" after a new one is created', async () => {
        const query = `query organizationInvites{
          organization(id: "${org1Setup.org.id}") {
            organizationInvites(organizationInviteId:"${inviteIds[tokenType][0]}" statuses: [deleted], email: "${uniqueEmail}") {
              id
              email
              status
              expirationDate
            }
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        expect(result).toBeDefined();
        expect(result.organization.organizationInvites).toBeDefined();
        expect(result.organization.organizationInvites.length).toEqual(1);
      });

      it('should only have one active invite after re-creationn', async () => {
        const query = `query organizationInvites{
          organization(id: "${org1Setup.org.id}") {
            organizationInvites(statuses: [submitted, approved], email: "${uniqueEmail}") {
              id
              email
              status
              expirationDate
            }
          }
        }`;
        const result = await gqlClient.query(query, null, tokenOptions);
        expect(result.organization.organizationInvites).toBeDefined();
        expect(result.organization.organizationInvites.length).toEqual(1);
        expect(result.organization.organizationInvites[0].id).toBe(
          inviteIds[tokenType][1]
        );
      });
    }
  );

  it('Regular User should fail to re-create invite due to active conflict', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${org1Setup.org.id}"
          email: "${uniqueEmail}"
          message: "test email 13"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    let err;
    try {
      res = await gqlClient.query(query, null, regularUserRequestHeaders);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
  });

  it('Regular User should create invite successfully on first attempt', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${org1Setup.org.id}"
          email: "${regularInviteEmail}"
          message: "test email 14"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    const result = await gqlClient.query(
      query,
      null,
      regularUserRequestHeaders
    );
    const invite = result.createOrganizationInvite;
    trackInvite(invite.id);
    inviteIds.regular.push(invite.id);
    expect(invite.status).toBeDefined();
    expect(invite.status).toEqual('submitted');
  });

  it('Regular User should re-create invite successfully (clears old invite)', async () => {
    const query = `mutation {
      createOrganizationInvite(
        input: {
          organizationId: "${org1Setup.org.id}"
           email: "${regularInviteEmail}"
          message: "test email 15"
          applicationRoles: [
            {
              applicationId: "b9dba7b8-501a-4219-995b-5e6eadfb5ae0" # Developer app
              roleId: "912e377e-f4a4-4184-8db1-baa9670d8081" # Editor role
            }
          ]
        }
      ) {
        id
        status
      }
    }`;
    const result = await gqlClient.query(
      query,
      null,
      regularUserRequestHeaders
    );
    const invite = result.createOrganizationInvite;
    expect(invite.id).toBeDefined();
    expect(invite.status).toEqual('submitted');
    trackInvite(invite.id);
    // Update the invite ID for cleanup (old one was deleted)
    inviteIds.regular.pop();
    inviteIds.regular.push(invite.id);
  });

  it('delete OrganizationInvites', async () => {
    const getOrg1InvitesRes = await gqlClient.sdk.organization({
      id: org1Setup.org.id
    });

    const activeInviteIds = (
      getOrg1InvitesRes?.data?.organization?.organizationInvites ?? []
    )
      .filter(
        (invite: any) =>
          invite?.id &&
          invite.status !== 'deleted' &&
          createdInviteIds.has(invite.id)
      )
      .map((invite: any) => invite.id);

    for (const id of _.uniq(activeInviteIds)) {
      const query = `
      mutation {
        deleteOrganizationInvite(organizationInviteId: "${id}") {
          id
          message
        }
      }
    `;
      const result = await gqlClient.query(query);
      expect(result.deleteOrganizationInvite.id).toEqual(id);
    }
  });

  afterAll(async () => {
    // validate no email sent externally and email sent to mailpit
    const { messageIds } = await getEmailCountFromMailpit();

    // remove test emails after test
    if (messageIds.size > 0) {
      await safe('delete mailpit org invite messages', async () =>
        chakram.delete(`${MAILPIT_BASE_URL}/api/v1/messages`, {
          ids: Array.from(messageIds)
        })
      );
    }

    for (const orgId of _.compact([org1Setup.org?.id, org2Setup.org?.id])) {
      await deleteRemainingInvites(orgId);
    }

    if (org1Setup.org?.guid && org2Setup.regularUser?.userId) {
      await safe(
        `remove org2 regular user ${org2Setup.regularUser.userId} from org1`,
        () =>
          gqlClient.sdk.removeUserFromOrganization({
            organizationGuid: org1Setup.org.guid,
            userId: org2Setup.regularUser.userId
          })
      );
    }

    const setupUserIds = _.compact([
      org1Setup.adminUser?.userId,
      org1Setup.regularUser?.userId,
      org2Setup.adminUser?.userId,
      org2Setup.regularUser?.userId
    ]);

    for (const userId of _.uniq([...createdUserIds, ...setupUserIds])) {
      await safe(`delete user ${userId}`, () =>
        gqlClient.sdk.deleteUser({ id: userId })
      );
    }

    for (const org of [org1Setup.org, org2Setup.org]) {
      if (org?.id) {
        await safe(`delete org ${org.id}`, () =>
          gqlClient.sdk.updateOrganization({
            input: {
              id: org.id,
              status: 'deleted'
            }
          })
        );
      }
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
      metadata: {
        billing: {
          pausedProcessing: false
        },
        features: {
          automaticPackageCreation: 'enabled'
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
    userInputs: [
      {
        name: `${citestMarker}-admin-user-${uniqueId}@localhost.com`,
        email: `${citestMarker}-admin-user-${uniqueId}@localhost.com`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-regular-user-${uniqueId}@localhost.com`,
        email: `${citestMarker}-regular-user-${uniqueId}@localhost.com`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };
}

async function updateOrgLimits(
  gqlClient: any,
  applicationOrgId: string,
  superToken: string,
  {
    seatLimit,
    adminSeatLimit
  }: { seatLimit?: number | null; adminSeatLimit?: number | null }
) {
  const apps: any = [
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
  ].filter((app) => app);

  if (isDesktopAppEnabled) {
    apps.push({
      applicationKey: 'aiware_desktop',
      name: 'AIWare Desktop'
    });
  }

  return helpers.updateOrganization(
    gqlClient.authUrl,
    applicationOrgId,
    superToken,
    {
      seatLimit,
      adminSeatLimit,
      organizationName: `${nameOrg}-updated-${uuidv4()}`,
      businessUnit: 'Legal',
      kvp: {
        test: 'value',
        features: {
          automaticPackageCreation: 'enabled'
        }
      },
      apps
    }
  );
}

type MailpitMessage = {
  ID: string;
  To?: {
    Address?: string;
  }[];
};
type MailpitResponse = {
  body?: {
    messages?: MailpitMessage[];
  };
};

async function getEmailCountFromMailpit(): Promise<{
  messagesCount: number;
  messageIds: Set<string>;
}> {
  let messagesCount = 0;
  const maxRetries = 5;
  let retries = 0;
  const messageIds = new Set<string>();

  while (messagesCount < emailCount && retries < maxRetries) {
    const res = (await chakram.get(
      `${MAILPIT_BASE_URL}/api/v1/messages`
    )) as MailpitResponse;

    const messages = res.body?.messages ?? [];

    messagesCount = messages.filter((message) => {
      const email = message.To?.[0]?.Address;
      const isValidMessage = email ? inviteEmails.has(email) : false;

      if (isValidMessage) {
        messageIds.add(message.ID);
      }

      return isValidMessage;
    }).length;

    console.log(`Attempt ${retries + 1}: messagesCount = ${messagesCount}`);

    if (messagesCount < emailCount) {
      await helpers.sleep(10000);
    }

    retries++;
  }

  return { messagesCount, messageIds };
}

async function deleteRemainingInvites(orgId: string) {
  const getInvitesRes = await safe(`fetch org invites ${orgId}`, () =>
    gqlClient.sdk.organization({
      id: orgId
    })
  );

  const invites = getInvitesRes?.data?.organization?.organizationInvites ?? [];

  await Promise.all(
    invites
      .filter(
        (invite: any) =>
          invite?.id &&
          invite.status !== 'deleted' &&
          createdInviteIds.has(invite.id)
      )
      .map((invite: any) =>
        safe(`delete org invite ${invite.id}`, () =>
          gqlClient.sdk.deleteOrganizationInvite({
            id: invite.id
          })
        )
      )
  );
}
