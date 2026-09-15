import { helpers } from '.';
import { OrganizationType } from '../gql';
import { GraphqlClient } from '../graphqlUtil';

export const createCollaboratorOrgWithUser = async (
  orgNamePrefix: string,
  appKey: number,
  gqlClient: GraphqlClient
) => {
  const orgResult = await gqlClient.sdk.createOrganization({
    input: {
      name: `${orgNamePrefix}-${appKey}`,
      businessUnit: 'citest',
      types: [OrganizationType.Agency, OrganizationType.Broadcaster],
      metadata: {
        features: {
          enableRBACFeature: 'disabled'
        }
      },
      applications: [
        {
          applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
          applicationKey: 'cms'
        }
      ]
    }
  });
  const orgId = orgResult?.data?.createOrganization?.id as string;
  if (!orgId) throw 'orgId is undefined';

  const orgDetails = await gqlClient.sdk.organization({
    id: orgId
  });
  const orgGuid = orgDetails?.data?.organization?.guid;
  if (!orgGuid) throw 'orgGuid is undefined';

  const password = `${appKey}-${orgNamePrefix}`;
  const userResult = await gqlClient.sdk.createUser({
    input: {
      name: `${orgNamePrefix}-${appKey}@localhost`,
      password,
      organizationId: orgId
    }
  });
  const userId = userResult?.data?.createUser?.id as string;
  const userName = userResult?.data?.createUser?.name as string;

  if (!userId) throw 'userId is undefined';

  const loginResult = await gqlClient.sdk.userLogin({
    input: {
      userName,
      password,
      organizationGuid: orgGuid
    }
  });
  const token = loginResult?.data?.userLogin?.token as string;
  if (!token) {
    throw 'token is undefined';
  }

  return {
    orgId,
    userId,
    headers: helpers.requestOptions(token)
  };
};
