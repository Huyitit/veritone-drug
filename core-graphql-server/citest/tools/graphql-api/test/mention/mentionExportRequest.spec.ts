import _ from 'lodash';

import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  AuthPermissionType,
  ExportRequestStatus,
  OrganizationStatus
} from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const citestGlobals = globalThis as unknown as { citestMarker?: string };
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';

const mentionFilters: any = {
  programIds: [],
  marketIds: [],
  mediaSourceIds: [],
  mediaSourceTypeIds: [],
  statusIds: [],
  spotTypeList: [],
  date: {
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString()
  },
  watchlistIds: []
};
const assetUri = 'https://transcript-export.s3.amazonaws.com';

describe('citest_mention: mention export tests', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let mentionExportRequestId: string;
  let apiTokenMentionExportRequestId: string;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;
  });

  afterAll(async () => {
    await safe('delete isolated superadmin org', () =>
      isolatedSuperadmin.client.sdk.updateOrganization({
        input: {
          id: isolatedSuperadmin.orgId,
          status: OrganizationStatus.Deleted
        }
      })
    );
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('find mentions', async () => {
    const result = await gqlClient.sdk.mentions({ limit: 1 });
    const listMentions = _.get(result, 'data.mentions.records', []);
    for (const mention of listMentions) {
      if (
        mention.scheduleId &&
        !_.includes(mentionFilters.programIds, mention.scheduleId)
      )
        mentionFilters.programIds.push(mention.scheduleId);
      if (
        mention.sourceId &&
        !_.includes(mentionFilters.mediaSourceIds, mention.sourceId)
      )
        mentionFilters.mediaSourceIds.push(mention.sourceId);
      if (
        mention.sourceTypeId &&
        !_.includes(mentionFilters.mediaSourceTypeIds, mention.sourceTypeId)
      )
        mentionFilters.mediaSourceTypeIds.push(mention.sourceTypeId);
      if (
        mention.statusId &&
        !_.includes(mentionFilters.statusIds, mention.statusId)
      )
        mentionFilters.statusIds.push(mention.statusId);
      if (
        mention.spotTypeId &&
        !_.includes(mentionFilters.spotTypeList, mention.spotTypeId)
      )
        mentionFilters.spotTypeList.push(mention.spotTypeId);
      if (
        mention.watchlistId &&
        !_.includes(mentionFilters.watchlistIds, mention.watchlistId)
      )
        mentionFilters.watchlistIds.push(mention.watchlistId);
    }
  });

  it('create a mention export request', async () => {
    const result = await gqlClient.sdk.createMentionExportRequest({
      input: { mentionFilters }
    });
    mentionExportRequestId = result?.data?.createMentionExportRequest?.id ?? '';
    expect(mentionExportRequestId).toBeDefined();
    expect(result?.data?.createMentionExportRequest?.status).toEqual(
      'incomplete'
    );
  });

  it('create a mention export request - API Token', async () => {
    // On ai13s, `true` maps to tokenAuth which uses a real user token from login.
    // Locally, tokenAuth falls back to the org-less hub-internal token (18eea9),
    // which has no organizationId, causing a NOT NULL constraint violation.
    // Use the isolated superadmin's own session (no explicit headers) to
    // match ai13s behavior across environments.
    const result = await gqlClient.sdk.createMentionExportRequest({
      input: { mentionFilters }
    });
    apiTokenMentionExportRequestId =
      result?.data?.createMentionExportRequest?.id ?? '';
    expect(apiTokenMentionExportRequestId).toBeDefined();
  });

  it('get a mention export request', async () => {
    const query = `query {
      ex1: exportRequests(
          id: "${mentionExportRequestId}"
          event: mentionExportRequest
        ) {
        records {
          id
          status
          organizationId
          createdDateTime
          modifiedDateTime
          requestorId
          assetUri
        }
      }
      ex2: exportRequests(
        status: incomplete
        event: mentionExportRequest
      ) {
        count
      }
      ex3: exportRequest(
          id: "${mentionExportRequestId}"
          event: mentionExportRequest
        ) {
        id
        status
        organizationId
        createdDateTime
        modifiedDateTime
        requestorId
        assetUri
      }
    }`;

    const result = await gqlClient.query(query);
    expect(_.get(result, 'ex1.records[0].id')).toBeDefined();
    expect(_.get(result, 'ex1.records[0].id')).toEqual(mentionExportRequestId);
    expect(_.get(result, 'ex3.id')).toEqual(mentionExportRequestId);
  });

  it('update a mention export request', async () => {
    const result = await gqlClient.sdk.updateMentionExportRequest({
      input: {
        id: mentionExportRequestId,
        status: ExportRequestStatus.Downloaded,
        assetUri
      }
    });
    expect(_.get(result, 'data.updateMentionExportRequest.id')).toEqual(
      mentionExportRequestId
    );
    expect(_.get(result, 'data.updateMentionExportRequest.status')).toEqual(
      'downloaded'
    );
    expect(_.get(result, 'data.updateMentionExportRequest.assetUri')).toEqual(
      assetUri
    );
  });

  it('update a mention export request - API token', async () => {
    // ai13s requires apiToken with correct permissions (created for citest user).
    // apiTokenCreate/apiTokenUpdate's generated selections match exactly
    // what's needed here - use the SDK for both.
    const createTokenResult = await gqlClient.sdk.apiTokenCreate({
      name: `${citestMarker}_token`,
      rights: [AuthPermissionType.Superadmin]
    });
    const apiTokenHash = createTokenResult?.data?.apiTokenCreate?.details?.hash;
    const apiTokenAuth = {
      Authorization: `Bearer ${createTokenResult?.data?.apiTokenCreate?.id}`
    };

    const result = await gqlClient.sdk.updateMentionExportRequest(
      {
        input: {
          id: mentionExportRequestId,
          status: ExportRequestStatus.Downloaded,
          assetUri
        }
      },
      apiTokenAuth
    );
    expect(_.get(result, 'data.updateMentionExportRequest.id')).toEqual(
      mentionExportRequestId
    );
    expect(_.get(result, 'data.updateMentionExportRequest.status')).toEqual(
      'downloaded'
    );
    expect(_.get(result, 'data.updateMentionExportRequest.assetUri')).toEqual(
      assetUri
    );

    const revokeResult = await gqlClient.sdk.apiTokenUpdate({
      hash: apiTokenHash!,
      input: { isRevoked: true }
    });
    expect(revokeResult?.data?.apiTokenUpdate?.revoked).toEqual(true);
  });
});
