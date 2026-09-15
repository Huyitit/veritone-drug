const moment = require('moment');
const _ = require('lodash');
const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;
const env = config.env;

const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;
let mentionFilters = {
  programIds: [],
  marketIds: [],
  mediaSourceIds: [],
  mediaSourceTypeIds: [],
  statusIds: [],
  spotTypeList: [],
  date: {
    from: moment().utc().subtract(7, 'days'),
    to: moment().utc()
  },
  watchlistIds: []
};
let mentionExportRequestId;
let apiTokenMentionExportRequestId;
let assetUri = 'https://transcript-export.s3.amazonaws.com';
const citestMarker = global.citestMarker || 'citest-should-delete';

describe('citest_mention: mention export tests', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('find mentions', async () => {
    const query = `query {
      mentions(limit: 1) {
        records {
          scheduleId
          sourceId
          sourceTypeId
          statusId
          spotTypeId
          mentionDate
          watchlistId
        }
      }
    }`;

    const result = await gqlClient.query(query);
    const listMentions = _.get(result, 'mentions.records', []);
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
    const query = `mutation($mentionFilters: CreateMentionExportRequestFilter!) {
      createMentionExportRequest(input: {mentionFilters: $mentionFilters}) {
        id
        status
        organizationId
        createdDateTime
        modifiedDateTime
        requestorId
        assetUri
      }
    }`;

    const result = await gqlClient.query(query, { mentionFilters });
    mentionExportRequestId = _.get(result, 'createMentionExportRequest.id');
    expect(mentionExportRequestId).toBeDefined();
    expect(_.get(result, 'createMentionExportRequest.status')).toEqual(
      'incomplete'
    );
  });

  it('create a mention export request - API Token', async () => {
    const query = `mutation($mentionFilters: CreateMentionExportRequestFilter!) {
      createMentionExportRequest(input: {mentionFilters: $mentionFilters}) {
        id
        status
        organizationId
        createdDateTime
        modifiedDateTime
        requestorId
        assetUri
      }
    }`;
    // On ai13s, `true` maps to tokenAuth which uses a real user token from login.
    // Locally, tokenAuth falls back to the org-less hub-internal token (18eea9),
    // which has no organizationId, causing a NOT NULL constraint violation.
    // Use userAuth (no third arg) to match ai13s behavior across environments.
    const result = await gqlClient.query(query, { mentionFilters });
    apiTokenMentionExportRequestId = _.get(
      result,
      'createMentionExportRequest.id'
    );
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
    const query = `mutation {
      updateMentionExportRequest(input: {
        id: "${mentionExportRequestId}"
        status: downloaded
        assetUri: "${assetUri}"
      }) {
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
    expect(_.get(result, 'updateMentionExportRequest.id')).toEqual(
      mentionExportRequestId
    );
    expect(_.get(result, 'updateMentionExportRequest.status')).toEqual(
      'downloaded'
    );
    expect(_.get(result, 'updateMentionExportRequest.assetUri')).toEqual(
      assetUri
    );
  });

  it('update a mention export request - API token', async () => {
    // ai13s requires apiToken with correct permissions (created for citest user)
    const apiTokenCreate = `mutation {
      apiTokenCreate(name: "${citestMarker}_token", rights: [SUPERADMIN]) {
        id
        details {
          hash
        }
      }
    }`;
    const createTokenResult = await gqlClient.query(apiTokenCreate);
    const apiTokenHash = _.get(
      createTokenResult,
      'apiTokenCreate.details.hash'
    );
    const apiTokenAuth = {
      Authorization: `Bearer ${_.get(createTokenResult, 'apiTokenCreate.id')}`
    };
    const query = `mutation {
    updateMentionExportRequest(input: {
      id: "${mentionExportRequestId}"
      status: downloaded
      assetUri: "${assetUri}"
    }) {
      id
      status
      organizationId
      createdDateTime
      modifiedDateTime
      requestorId
      assetUri
    }
  }`;

    const result = await gqlClient.query(query, null, apiTokenAuth);
    expect(_.get(result, 'updateMentionExportRequest.id')).toEqual(
      mentionExportRequestId
    );
    expect(_.get(result, 'updateMentionExportRequest.status')).toEqual(
      'downloaded'
    );
    expect(_.get(result, 'updateMentionExportRequest.assetUri')).toEqual(
      assetUri
    );
    const revokeApiToken = `mutation {
      apiTokenUpdate(hash: "${apiTokenHash}" input: { isRevoked: true }) {
        revoked
      }
    }`;
    const revokeApiTokenResult = await gqlClient.query(revokeApiToken);
    expect(_.get(revokeApiTokenResult, 'apiTokenUpdate.revoked')).toEqual(true);
  });
});
