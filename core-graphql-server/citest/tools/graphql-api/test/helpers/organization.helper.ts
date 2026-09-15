import { buildRequestHeaders, GraphqlClient } from '../../src/graphqlUtil';

// TYPES (optional but recommended)
type SetupInput = {
  orgInput: any;
  userInputs: any[];
};

type SetupResult = {
  org: any;
  listOptions: any[];
};

export async function setupTestOrgAndUser(
  gqlClient: GraphqlClient,
  orgAndUserInput: SetupInput,
  filterOrgs?: any
): Promise<SetupResult> {
  const { orgInput, userInputs } = orgAndUserInput;

  let orgData: any;

  // FIND OR CREATE ORG
  if (filterOrgs) {
    const res = await gqlClient.sdk.organizations(filterOrgs);

    const orgs = res?.data?.organizations?.records || [];

    if (orgs.length > 0) {
      orgData = orgs[0];
    }
  }

  if (!orgData) {
    const createRes = await gqlClient.sdk.createOrganization({
      input: orgInput
    });

    orgData = createRes?.data?.createOrganization;
  }

  // CREATE USERS
  const usersData: any[] = [];

  for (const user of userInputs) {
    let count = 0;
    const res = await gqlClient.sdk.createUser({
      input: {
        ...user,
        organizationId: orgData.id
      }
    });

    const createdUser = res?.data?.createUser;

    usersData.push({
      ...createdUser,
      password: user.password || 'testPassword'
    });
  }

  const listOptions = await Promise.all(
    usersData.map(async user => {
      const headers = await buildRequestHeaders(gqlClient, {
        userName: user.name,
        password: user.password
        // organizationGuid: user.organization.guid
      });

      return {
        userName: user.name,
        password: user.password,
        userId: user.id,
        email: user.email,
        requestOptions: headers
      };
    })
  );

  // GET ORG AGAIN (fresh data) - use the list query since it has no cap on `users`
  const orgRes = await gqlClient.sdk.organizations({
    id: orgData.id
  });

  const refreshedOrg = orgRes?.data?.organizations?.records?.[0];

  // RETURN
  return {
    org: refreshedOrg,
    listOptions
  };
}

type GetOrgInviteInput = {
  orgId: string;
  organizationInviteId?: string;
  inviteStatuses?: string[];
  inviteType?: string;
  email?: string;
  passwordResetToken?: boolean;
};

export async function helpGetOrgInviteByOrgId(
  client: { gqlClient: any; options?: any },
  input: GetOrgInviteInput
) {
  const { gqlClient, options } = client;

  const res = await gqlClient.sdk.organization(
    {
      id: input.orgId
    },
    options
  );

  let invites = res?.data?.organization?.organizationInvites;

  if (input.inviteStatuses?.length) {
    invites = invites.filter((i: any) =>
      input.inviteStatuses!.includes(i.status)
    );
  }

  if (input.email) {
    invites = invites.filter((i: any) => i.email === input.email);
  }

  return {
    organization: {
      organizationInvites: invites
    }
  };
}
