import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';
// @ts-ignore
import chakram from 'chakram';

import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { OrganizationStatus, OrganizationType } from '../../src/gql/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const config = helpers.config;
const citestGlobals = globalThis as unknown as {
  citestMarker?: string;
  enableDefaultDesktopApp?: boolean;
};
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = citestGlobals.enableDefaultDesktopApp ?? true;

interface CreateTokenArgs {
  orgGuid?: string | null;
  orgId: string;
  userId?: string;
}

async function createToken(
  args: CreateTokenArgs,
  options: Record<string, any>
) {
  const url = `${config.core_admin_url}/admin/tokens`;
  const res = await chakram.post(
    url,
    {
      token: {
        userId: args.userId,
        applicationId: args.orgGuid,
        json: {
          rights: [
            'user:create',
            'user:update',
            'user:read',
            'user:delete',
            'token:create'
          ]
        },
        internal: true
      },
      orgId: args.orgId
    },
    options
  );
  return _.get(res, 'body', {});
}

async function revokeToken(tokenHash: string, options: Record<string, any>) {
  const url = `${config.core_admin_url}/admin/tokens/${tokenHash}/revoke`;
  const res = await chakram.post(url, {}, options);
  return _.get(res, 'body', {});
}

describe('citest_token: token tests', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let superUserId: string;
  let superToken: string;
  let superAdminOptions: Record<string, any>;
  let testOrg: {
    id: string;
    guid?: string | null;
    name?: string | null;
  };
  let orgLessToken: string;
  const tokenHashes: string[] = [];
  const tokens: string[] = [];

  beforeAll(async () => {
    const bootstrapClient: GraphqlClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN
    );
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);

    superUserId = isolatedSuperadmin.userId;
    superToken = isolatedSuperadmin.token;
    superAdminOptions = helpers.requestOptions(superToken);

    const orgRes = await isolatedSuperadmin.client.sdk.createOrganization({
      input: {
        name: `${citestMarker}-api-token-org-${uuidv4()}`,
        businessUnit: 'Legal',
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
      }
    });
    const createdOrg = orgRes?.data?.createOrganization;
    expect(createdOrg?.id).toBeDefined();
    testOrg = {
      id: createdOrg!.id,
      guid: createdOrg!.guid,
      name: createdOrg!.name
    };
    expect(testOrg.name).toContain(`${citestMarker}-api-token`);
  });

  afterAll(async () => {
    await safe('delete test org', () =>
      isolatedSuperadmin.client.sdk.updateOrganization(
        { input: { id: testOrg.id, status: OrganizationStatus.Deleted } },
        isolatedSuperadmin.options
      )
    );
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  describe('Create API token', () => {
    describe('no providing userId', () => {
      it('create token - assign token to organization admin', async () => {
        const res = await createToken(
          { orgGuid: testOrg.guid, orgId: testOrg.id },
          superAdminOptions
        );
        const tokenId = _.get(res, 'tokenId');
        const tokenHash = _.get(res, 'tokenHash');
        const userId = _.get(res, 'userId');
        expect(tokenId).toBeDefined();
        expect(tokenHash).toBeDefined();
        expect(userId).toEqual(superUserId);

        tokenHashes.push(tokenHash);
        tokens.push(tokenId);
        orgLessToken = tokenId;
      });
    });

    describe('providing userId', () => {
      let ownerUserId: string;

      it('create user', async () => {
        const userRes = await isolatedSuperadmin.client.sdk.createUser({
          input: {
            name: `${citestMarker}-token-citest-regular-user-${uuidv4()}@localhost`,
            organizationId: testOrg.id,
            firstName: 'Token-User',
            lastName: 'Regular',
            jsondata: {
              firstName: 'Token-User',
              lastName: 'Regular'
            }
          }
        });
        ownerUserId = userRes?.data?.createUser?.id ?? '';
        expect(ownerUserId).toBeDefined();
      });

      it('create token by superadmin', async () => {
        const res = await createToken(
          { orgGuid: testOrg.guid, orgId: testOrg.id, userId: ownerUserId },
          superAdminOptions
        );
        const tokenHash = _.get(res, 'tokenHash');
        const userId = _.get(res, 'userId');
        expect(tokenHash).toBeDefined();
        expect(userId).toEqual(ownerUserId);

        tokenHashes.push(tokenHash);
        tokens.push(res.tokenId);
      });

      it('create token by org less token', async () => {
        const res = await createToken(
          { orgGuid: testOrg.guid, orgId: testOrg.id, userId: ownerUserId },
          helpers.requestOptions(orgLessToken)
        );
        const tokenHash = _.get(res, 'tokenHash');
        const userId = _.get(res, 'userId');
        expect(tokenHash).toBeDefined();
        expect(userId).toEqual(ownerUserId);

        tokenHashes.push(tokenHash);
        tokens.push(res.tokenId);
      });

      it('delete a user', async () => {
        const result = await isolatedSuperadmin.client.sdk.deleteUser({
          id: ownerUserId
        });
        expect(result?.data?.deleteUser?.id).toEqual(ownerUserId);
      });
    });
  });

  describe('Validate API tokens', () => {
    it('validate tokens', async () => {
      for (const token of tokens) {
        const tokenHeaders = helpers.requestOptions(token).headers;
        const res = await isolatedSuperadmin.client.sdk.meBasic(
          undefined,
          tokenHeaders
        );
        expect(res?.data?.me?.id).toBeDefined();
      }
    });
  });

  describe('Revoke tokens', () => {
    it('revoke tokens', async () => {
      for (const tokenHash of tokenHashes) {
        const res = await revokeToken(tokenHash, superAdminOptions);
        expect(_.get(res, 'json.isRevoked', false)).toEqual(true);
      }
    });
  });
});
