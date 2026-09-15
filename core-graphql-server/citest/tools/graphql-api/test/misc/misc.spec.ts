import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';

import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  CreateCognitiveSearchInWatchlist,
  DayOfWeek,
  OrganizationStatus,
  SearchIndex
} from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const config = helpers.config;
const env = config.env as string;
const isLocal = env.includes('local');
const citestMarker = (globalThis as any).citestMarker ?? 'citest-should-delete';

async function queryInternal(
  internalUrl: string,
  query: string,
  variables?: any
) {
  const respObj = await helpers.postRetry(
    internalUrl,
    { query, variables },
    helpers.requestOptions(config.apiToken as string),
    3
  );
  helpers.responseStatusParserThrowErrorOnNon200Status(respObj);
  return helpers.responseParserThrowErrorOnBodyError(respObj);
}

describe('citest_misc :Miscellaneous tests', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let s3uri: string;
  let getUri: string;

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

  it('get heartbeatStats', async () => {
    // graphqlServiceInfo's generated selection is {buildInfo, featureFlags},
    // missing heartbeatStats - raw query.
    const query = `
query {
  me { id }
  graphqlServiceInfo {
    heartbeatStats
  }
}
`;

    const result = await gqlClient.query(query);

    expect(
      _.get(result, 'graphqlServiceInfo.heartbeatStats.intervalSeconds')
    ).toEqual(10);
    expect(
      _.get(result, 'graphqlServiceInfo.heartbeatStats.lastRefresh')
    ).toBeDefined();
    expect(
      _.get(result, 'graphqlServiceInfo.heartbeatStats.graphqlRequests')
    ).toBeDefined();
  });

  it('get writable signed URL', async () => {
    const query = `{
  getSignedWritableUrl {
    bucket
    key
    expiresInSeconds
    expiresAtDateTime
    url
    getUrl
    unsignedUrl
  }

  getSignedWritableUrls(number: 10) {
    bucket
    key
    expiresInSeconds
    expiresAtDateTime
    url
    getUrl
    unsignedUrl
  }
}
`;

    const result = await gqlClient.query(query);

    expect(_.get(result, 'getSignedWritableUrl.bucket')).toBeDefined();
    expect(_.get(result, 'getSignedWritableUrl.key')).toBeDefined();
    expect(
      _.get(result, 'getSignedWritableUrl.expiresInSeconds')
    ).toBeDefined();
    expect(
      _.get(result, 'getSignedWritableUrl.expiresAtDateTime')
    ).toBeDefined();
    expect(_.get(result, 'getSignedWritableUrl.url')).toBeDefined();
    expect(_.get(result, 'getSignedWritableUrl.unsignedUrl')).toBeDefined();
    expect(_.get(result, 'getSignedWritableUrl.getUrl')).toBeDefined();
    expect(_.get(result, 'getSignedWritableUrls[9].url')).toBeDefined();
    expect(_.get(result, 'getSignedWritableUrls[9].getUrl')).toBeDefined();
    expect(_.get(result, 'getSignedWritableUrls[9].unsignedUrl')).toBeDefined();
    expect(
      _.get(result, 'getSignedWritableUrls[9].expiresInSeconds')
    ).toBeDefined();
    expect(
      _.get(result, 'getSignedWritableUrls[9].expiresAtDateTime')
    ).toBeDefined();
    expect(_.get(result, 'getSignedWritableUrls[9].key')).toBeDefined();
    // now verify that expiration time on the two signed URLs matches
    const sUrl = _.get(result, 'getSignedWritableUrl.url');
    const gUrl = _.get(result, 'getSignedWritableUrl.getUrl');
    const sUrlExpires = new URL(sUrl).searchParams.get('X-Amz-Expires');
    const gUrlExpires = new URL(gUrl).searchParams.get('X-Amz-Expires');
    expect(sUrlExpires).toBeDefined();
    expect(sUrlExpires).toEqual(gUrlExpires);
  });

  it('error on too many writable signed URLs requested', async () => {
    const query = `{
  tooMany: getSignedWritableUrls(number: 1001) {
    url
  }
}
`;

    await expect(gqlClient.query(query)).rejects.toThrow('invalid_input');
  });

  it('get writable signed URL with custom key', async () => {
    const key = uuidv4();
    const result = await gqlClient.sdk.getSignedWritableUrl({ key });
    const newkey = _.get(result, 'data.getSignedWritableUrl.key');
    s3uri = result.data.getSignedWritableUrl!.url;
    getUri = _.get(result, 'data.getSignedWritableUrl.getUrl')!;

    expect(result.data.getSignedWritableUrl!.bucket).toBeDefined();
    expect(result.data.getSignedWritableUrl!.expiresInSeconds).toBeDefined();
    expect(result.data.getSignedWritableUrl!.url).toBeDefined();
    expect(getUri).toBeDefined();
    expect(result.data.getSignedWritableUrl!.unsignedUrl).toBeDefined();
    expect(result.data.getSignedWritableUrl!.getUrl).toBeDefined();
  });

  it('be able to PUT to url', async () => {
    if (isLocal) return;

    await helpers
      .supertest(s3uri)
      .put('')
      .send({ test: 'test object' })
      .expect(200);
  });

  it('be able to GET from url', async () => {
    if (isLocal) return;

    await helpers.supertest(getUri).get('').expect(200);
  });

  it('get "my rights""', async () => {
    const result = await gqlClient.sdk.MyRights();

    expect(result.data.myRights?.operations).toBeDefined();
    expect(result.data.myRights?.resources).toBeDefined();
    // also test standard header responses here
    expect(result.headers.has('veritone-correlation-id')).toBe(true);
    expect(result.headers.has('veritone-request-id')).toBe(true);
    expect(result.headers.has('veritone-service-ip')).toBe(true);
    expect(result.headers.has('veritone-build-info')).toBe(true);
  });

  describe('Update Watchlist', () => {
    let watchlistId: string;

    // Need to rely on preexisting watchlist until other watchlists api are functional
    const date = new Date();
    date.setMilliseconds(0);

    beforeAll(async () => {
      const dateNow = Date.now();
      const stop = dateNow + 90 * 24 * 60 * 60 * 1000;
      const testName = `${citestMarker}+test_watchlist_${Date.now()}`;
      const variables = {
        details: {
          foo: 'bar',
          targetAudience: {
            foo: 'bar'
          },
          programIds: [-1],
          marketIds: [87, 24]
        },
        cogSearch2: {
          mentionStatusId: 1,
          profile: {
            and: [
              {
                state: {
                  search: 'foo2',
                  language: 'fr'
                },
                engineCategoryId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
              }
            ]
          }
        }
      };

      const testSourcesResult = await gqlClient.sdk.sources({ name: 'test' });
      const testSources = _.get(testSourcesResult, 'data.sources.records');
      const testSourceIds = (testSources || [])
        .map((tS: any) => tS.id)
        .splice(2);

      const result = await gqlClient.sdk.createWatchlist({
        input: {
          searchIndex: SearchIndex.Mine,
          stopDateTime: new Date(stop).toISOString(),
          name: testName,
          sourceTypeIds: ['1', '2', '5'],
          sourceIds: testSourceIds,
          details: variables.details,
          subscriptions: [
            {
              scheduledDay: DayOfWeek.Tuesday,
              scheduledTime: '07:11:22',
              scheduledTimeZone: 'EST',
              contact: {
                emailAddress: 'foo@bar.com',
                phoneNumber: '555-555-5555'
              }
            }
          ],
          cognitiveSearches: [
            {
              mentionStatusId: '1',
              jsonstring:
                '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
            },
            variables.cogSearch2 as unknown as CreateCognitiveSearchInWatchlist
          ]
        }
      });
      expect(result.data.createWatchlist).toBeDefined();
      watchlistId = result.data.createWatchlist!.id;
    });

    afterAll(async () => {
      // deleteWatchlist's generated selection ({id, message}) covers what
      // the legacy afterAll needed (it never asserted on the result) - use
      // the SDK.
      await safe('delete watchlist', () =>
        gqlClient.sdk.deleteWatchlist({ id: watchlistId })
      );
    });

    it('update the watchlist ', async () => {
      const result = await gqlClient.sdk.bulkUpdateWatchlist({
        input: { stopDate: date.toISOString() },
        filter: { ids: [watchlistId] }
      });

      expect(result.data.bulkUpdateWatchlist).toBeDefined();
      const r = result.data.bulkUpdateWatchlist!;
      expect(r.count).toEqual(1);
      expect(new Date(r.records![0]!.stopDateTime).getTime()).toEqual(
        date.getTime()
      );
    });
  });

  describe('timeZones query', () => {
    it('get time zone data', async () => {
      const result = await gqlClient.sdk.timeZones();

      expect(_.get(result, 'data.timeZones[0].name')).toBeDefined();
      expect(
        _.get(result, 'data.timeZones[0].abbreviations[0].name')
      ).toBeDefined();
      expect(
        _.get(result, 'data.timeZones[0].abbreviations[0].offset')
      ).toBeDefined();
      expect(
        _.get(result, 'data.timeZones[0].abbreviations[0].offset.length')
      ).toBeGreaterThan(0);
      expect(
        _.get(result, 'data.timeZones[0].abbreviations[0].offsetMinutes')
      ).toBeGreaterThanOrEqual(0);
    });
  });

  describe('queryMonitor test', () => {
    it('run queryMonitor mutation', async () => {
      if (isLocal) return;

      const query = `
      mutation {
        databaseQueryMonitor(enableKill:false) {
          database
          timestamp
          queryError
          summary
          queries {
      sql
            queryDurationSeconds
            userName
            pid
            applicationName
            clientIpAddress
            state
            queryStartTime
            action
          }
        }
      }
`;
      const result = await queryInternal(gqlClient.internalUrl!, query);

      expect(_.get(result, 'databaseQueryMonitor.length')).toEqual(3);
      expect(_.get(result, 'databaseQueryMonitor[0].timestamp')).toBeDefined();
      expect(_.get(result, 'databaseQueryMonitor[0].database')).toBeDefined();
      expect(_.get(result, 'databaseQueryMonitor[0].queries')).toBeDefined();
      expect(
        _.get(result, 'databaseQueryMonitor[0].summary.queryError')
      ).toEqual(0);
      expect(_.get(result, 'databaseQueryMonitor[0].queryError')).toEqual(null);
    });
  });

  describe('emitSystemEvent', () => {
    it('run emitSystemEvent mutation', async () => {
      const result = await gqlClient.sdk.emitSystemEvent({
        input: {
          topic: 'events',
          payload: {
            sender: 'core-graphql-server API test'
          }
        }
      });

      expect(_.get(result, 'data.emitSystemEvent.id')).toBeDefined();
      expect(
        _.get(result, 'data.emitSystemEvent.payload.sender')
      ).toBeDefined();
      expect(_.get(result, 'data.emitSystemEvent.topic')).toBeDefined();
      expect(_.get(result, 'data.emitSystemEvent.timestamp')).toBeDefined();
    });
  });

  // FIXME: requires superadmin right for grapqhl_test api token
  xdescribe('Scheduled Event', () => {
    let cronScheduleId: string, dateScheduleId: string;

    it('add a scheduled event', async () => {
      const query = `
        mutation ($cron: CreateScheduledEvent, $isoDateTime: CreateScheduledEvent) {
          cronSchedule: createScheduledEvent(input: $cron) {
            id
            name
            type
            schedule
            payload
          }
          dateSchedule: createScheduledEvent(input: $isoDateTime) {
            id
            name
            type
            schedule
            payload
          }
        }
    `;
      const variables = {
        cron: {
          name: `${citestMarker}-test_event_cron`,
          type: 'test_event_type',
          schedule: '0 0 1 1 *',
          payload: JSON.stringify({ json: 'payload' })
        },
        isoDateTime: {
          name: `${citestMarker}-test_event_date`,
          type: 'test_event_type',
          schedule: new Date().toISOString(),
          payload: JSON.stringify({ json: 'payload' })
        }
      };
      const result = await queryInternal(
        gqlClient.internalUrl!,
        query,
        variables
      );

      const cronSchedule = _.get(result, 'cronSchedule', {} as any);
      const dateSchedule = _.get(result, 'dateSchedule', {} as any);

      expect(cronSchedule.id).toBeDefined();
      expect(cronSchedule.name).toEqual(variables.cron.name);
      expect(cronSchedule.type).toEqual(variables.cron.type);
      expect(cronSchedule.schedule).toEqual(variables.cron.schedule);
      expect(cronSchedule.payload).toEqual(variables.cron.payload);
      cronScheduleId = cronSchedule.id;

      expect(dateSchedule.id).toBeDefined();
      expect(dateSchedule.name).toEqual(variables.isoDateTime.name);
      expect(dateSchedule.type).toEqual(variables.isoDateTime.type);
      expect(dateSchedule.schedule).toEqual(variables.isoDateTime.schedule);
      expect(dateSchedule.payload).toEqual(variables.isoDateTime.payload);
      dateScheduleId = dateSchedule.id;
    });

    it('update a scheduled event', async () => {
      const query = `
        mutation ($input: UpdateScheduledEvent) {
          updateScheduledEvent(input: $input) {
            id
            name
            type
            schedule
            payload
          }
        }
    `;
      const variables = {
        input: {
          id: cronScheduleId,
          name: `${citestMarker}-updated_test_event_cron`,
          type: 'updated_test_event_type',
          schedule: '0 0 0 1 1 0',
          payload: JSON.stringify({ json: 'updated payload' })
        }
      };
      const result = await queryInternal(
        gqlClient.internalUrl!,
        query,
        variables
      );

      const updated = _.get(result, 'updateScheduledEvent', {} as any);

      expect(updated.id).toBeDefined();
      expect(updated.name).toEqual(variables.input.name);
      expect(updated.type).toEqual(variables.input.type);
      expect(updated.schedule).toEqual(variables.input.schedule);
      expect(updated.payload).toEqual(variables.input.payload);
    });

    it('get scheduled event', async () => {
      const query = `
        query ($id: ID!, $ids: [ID!]!) {
          scheduledEvent(id: $id) {
            id
            name
            type
            schedule
            payload
          }
          scheduledEvents(ids: $ids) {
            count
            records {
              id
              name
              type
              schedule
              payload
            }
          }
        }
    `;
      const variables = {
        id: cronScheduleId,
        ids: [cronScheduleId, dateScheduleId]
      };
      const result = await queryInternal(
        gqlClient.internalUrl!,
        query,
        variables
      );

      const scheduledEvent = _.get(result, 'scheduledEvent', {} as any);
      const scheduledEvents = _.get(result, 'scheduledEvents', {} as any);

      expect(scheduledEvent.id).toEqual(cronScheduleId);
      expect(scheduledEvents.count).toEqual(2);
      expect(scheduledEvents.records.map((s: any) => s.id)).toEqual([
        cronScheduleId,
        dateScheduleId
      ]);
    });

    it('delete scheduled event', async () => {
      const query = `
        mutation ($id1: ID!, $id2: ID!) {
          cronSchedule: deleteScheduledEvent(id: $id1) {
            id
          }
          dateSchedule: deleteScheduledEvent(id: $id2) {
            id
          }
        }
    `;
      const variables = {
        id1: cronScheduleId,
        id2: dateScheduleId
      };
      const result = await queryInternal(
        gqlClient.internalUrl!,
        query,
        variables
      );

      const cronSchedule = _.get(result, 'cronSchedule', {} as any);
      const dateSchedule = _.get(result, 'dateSchedule', {} as any);

      expect(cronSchedule.id).toEqual(cronScheduleId);
      expect(dateSchedule.id).toEqual(dateScheduleId);
    });
  });
});
