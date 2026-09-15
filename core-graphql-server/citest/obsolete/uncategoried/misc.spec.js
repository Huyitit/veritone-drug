const GraphqlClient = require('../../helpers/gql.js');
const helpers = require('../../helpers/index');

const config = helpers.config;
const env = config.env;
const uuid = require('uuid');
const _ = require('lodash');
const URL = require('url-parse');
const moment = require('moment');
const citestMarker = global.citestMarker || 'citest-should-delete';
const isLocal = env.includes('local');

describe('citest_misc :Miscellaneous tests', () => {
  let gqlClient, s3uri, getUri;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('get heartbeatStats', async () => {
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
    const isAi13S = env === 'ai13s';
    let regex;
    if (isAi13S) {
      regex = new RegExp(`${env}`);
    } else {
      const envPart = isLocal ? '' : env.substring(4);
      regex = new RegExp(`${envPart}.*api.*veritone.com`);
    }
    // expect(_.get(result, 'getSignedWritableUrl.bucket')).toMatch(regex);
    // expect(_.get(result, 'getSignedWritableUrls[9].bucket')).toMatch(regex);
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
    const sUrlParams = new URL(sUrl, true).query;
    const gUrlParams = new URL(gUrl, true).query;
    expect(sUrlParams['X-Amz-Expires']).toBeDefined();
    expect(sUrlParams['X-Amz-Expires']).toEqual(gUrlParams['X-Amz-Expires']);
  });

  it('error on too many writable signed URLs requested', async () => {
    const query = `{
  tooMany: getSignedWritableUrls(number: 1001) {
    url
  }
}
`;

    expect(async () => gqlClient.query(query)).rejects.toThrow('invalid_input');
  });

  it('get writable signed URL with custom key', async () => {
    const key = uuid.v4();
    const query = `{
  getSignedWritableUrl(key: "${key}") {
    bucket
    key
    expiresInSeconds
    url
    getUrl
    unsignedUrl
  }
}
`;

    const result = await gqlClient.query(query);
    const newkey = _.get(result, 'getSignedWritableUrl.key');
    s3uri = result.getSignedWritableUrl.url;
    getUri = _.get(result, 'getSignedWritableUrl.getUrl');

    expect(result.getSignedWritableUrl.bucket).toBeDefined();
    expect(newkey).toEqual(expect.stringContaining(key));
    expect(result.getSignedWritableUrl.expiresInSeconds).toBeDefined();
    expect(result.getSignedWritableUrl.url).toBeDefined();
    expect(getUri).toBeDefined();
    expect(result.getSignedWritableUrl.unsignedUrl).toBeDefined();
    expect(result.getSignedWritableUrl.getUrl).toBeDefined();
  });

  it('be able to PUT to url', async () => {
    if (isLocal) return;

    return helpers
      .supertest(s3uri)
      .put('')
      .send({ test: 'test object' })
      .expect(200);
  });

  it('be able to GET from url', async () => {
    if (isLocal) return;

    return helpers.supertest(getUri).get('').expect(200);
  });

  it('get "my rights""', async () => {
    const query = `{
  myRights {
    operations
    resources
  }
}
`;

    const result = await gqlClient.query(query);

    expect(_.get(result, 'myRights.operations')).toBeDefined();
    expect(_.get(result, 'myRights.resources')).toBeDefined();
    // also test standard header responses here

    expect(result._response.headers).toHaveProperty('veritone-correlation-id');
    expect(result._response.headers).toHaveProperty('veritone-request-id');
    expect(result._response.headers).toHaveProperty('veritone-service-ip');
    expect(result._response.headers).toHaveProperty('veritone-build-info');
  });

  describe('Update Watchlist', () => {
    let watchlistId;

    // Need to rely on preexisting watchlist until other watchlists api are functional
    const date = new Date();
    date.setMilliseconds(0);
    beforeAll(async () => {
      const dateNow = Date.now();
      const stop = dateNow + 90 * 24 * 60 * 60 * 1000;
      const testName = citestMarker + '+test_watchlist_' + Date.now();
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
      const varString = JSON.stringify(variables);

      const getTestSourcesQuery = `{
        sources (name: "test") {
          records {
            id
            details
            name
          }
        }
      }`;
      const testSourcesResult = await gqlClient.query(getTestSourcesQuery);
      const testSources = _.get(testSourcesResult, 'sources.records');
      const testSourceIds = (testSources || []).map((tS) => tS.id).splice(2);

      const query = `
      mutation createWatchlist($details: JSONData, $cogSearch2: CreateCognitiveSearchInWatchlist!){
        createWatchlist(input: {
          searchIndex: mine
          stopDateTime: "${moment(stop).toISOString()}"
          name: "${testName}"
          sourceTypeIds: [1, 2, 5]
          sourceIds: [${testSourceIds}]
          details: $details
          subscriptions: [
            {
              scheduledDay: Tuesday
              scheduledTime: "07:11:22"
              scheduledTimeZone: "EST"
              contact: {
                emailAddress: "foo@bar.com"
                phoneNumber: "555-555-5555"
              }
            }
          ]
          cognitiveSearches: [
            {
              mentionStatusId: 1
              jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foo\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"
            },
            $cogSearch2
          ]
        }) {
          id
          details
          query
          searchIndex
          subscriptions {
            id
          }
          folders {
            id
          }
          cognitiveSearches {
            query
            id
            mentionStatusId
            mentionStatus {
              id
              name
            }
            profile

          }
          sourceIds

          schedules {
            records {
              id
              name
              sources {
                records {
                  id
                  name
                }
              }
            }
          }
        }
      }
  `;
      const result = await gqlClient.query(query, variables);
      expect(result.createWatchlist).toBeDefined();
      watchlistId = result.createWatchlist.id;
    });

    afterAll(async () => {
      const query = `
        mutation {
            deleteWatchlist(id: "${watchlistId}") {
                id
                message
            }
        }`;
      await gqlClient.query(query);
    });
    it('update the watchlist ', async () => {
      const query = `
      mutation {
        bulkUpdateWatchlist(input: {
          stopDate: "${date.toISOString()}"
        },
        filter: {
          ids: [${watchlistId}]
        }) {
          limit
          count
          records {
            id
            name
            organizationId
            stopDateTime
            startDateTime
          }
        }
      }`;
      const result = await gqlClient.query(query);

      expect(result.bulkUpdateWatchlist).toBeDefined();
      const r = result.bulkUpdateWatchlist;
      expect(r.count).toEqual(1);
      expect(new Date(r.records[0].stopDateTime).getTime()).toEqual(
        date.getTime()
      );
    });
  });

  describe('timeZones query', () => {
    it('get time zone data', async () => {
      const query = `
      query {
    timeZones {
      name
      abbreviations {
        name
        offset
        offsetMinutes
      }
    }
  }
`;
      const result = await gqlClient.query(query);

      expect(_.get(result, 'timeZones[0].name')).toBeDefined();
      expect(_.get(result, 'timeZones[0].abbreviations[0].name')).toBeDefined();
      expect(
        _.get(result, 'timeZones[0].abbreviations[0].offset')
      ).toBeDefined();
      expect(
        _.get(result, 'timeZones[0].abbreviations[0].offset.length')
      ).toBeGreaterThan(0);
      expect(
        _.get(result, 'timeZones[0].abbreviations[0].offsetMinutes')
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
      const result = await gqlClient.queryInternal(query);

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
      const query = `
      mutation {
        emitSystemEvent(input: {
          topic: "events"
          payload: {
            sender: "core-graphql-server API test"
          }
        }) {
          id
          timestamp
          topic
          payload
        }
      }
`;
      const result = await gqlClient.query(query);

      expect(_.get(result, 'emitSystemEvent.id')).toBeDefined();
      expect(_.get(result, 'emitSystemEvent.payload.sender')).toBeDefined();
      expect(_.get(result, 'emitSystemEvent.topic')).toBeDefined();
      expect(_.get(result, 'emitSystemEvent.timestamp')).toBeDefined();
    });
  });

  // FIXME: requires superadmin right for grapqhl_test api token
  xdescribe('Scheduled Event', () => {
    let cronScheduleId, dateScheduleId;

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
          name: citestMarker + '-test_event_cron',
          type: 'test_event_type',
          schedule: '0 0 1 1 *',
          payload: JSON.stringify({ json: 'payload' })
        },
        isoDateTime: {
          name: citestMarker + '-test_event_date',
          type: 'test_event_type',
          schedule: moment().toISOString(),
          payload: JSON.stringify({ json: 'payload' })
        }
      };
      const result = await gqlClient.queryInternal(query, variables);

      const cronSchedule = _.get(result, 'cronSchedule', {});
      const dateSchedule = _.get(result, 'dateSchedule', {});

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
          name: citestMarker + '-updated_test_event_cron',
          type: 'updated_test_event_type',
          schedule: '0 0 0 1 1 0',
          payload: JSON.stringify({ json: 'updated payload' })
        }
      };
      const result = await gqlClient.queryInternal(query, variables);

      const updated = _.get(result, 'updateScheduledEvent', {});

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
      const result = await gqlClient.queryInternal(query, variables);

      const scheduledEvent = _.get(result, 'scheduledEvent', {});
      const scheduledEvents = _.get(result, 'scheduledEvents', {});

      expect(scheduledEvent.id).toEqual(cronScheduleId);
      expect(scheduledEvents.count).toEqual(2);
      expect(scheduledEvents.records.map((s) => s.id)).toEqual([
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
      const result = await gqlClient.queryInternal(query, variables);

      const cronSchedule = _.get(result, 'cronSchedule', {});
      const dateSchedule = _.get(result, 'dateSchedule', {});

      expect(cronSchedule.id).toEqual(cronScheduleId);
      expect(dateSchedule.id).toEqual(dateScheduleId);
    });
  });
});
