const helpers = require('../helpers/index.js');
const {
  DEFAULT_ENV_TO_RUN_IN,
  DEFAULT_ENV_TO_ISO,
  buildAndInitializeAuditLogHelpers,
  validateExpectedEvents
} = require('./helpers.auditLog.js');
const moment = require('moment');
const _ = require('lodash');

let watchListId = null;
let watchListIds = [];

const config = helpers.config;
const describeif = (condition, ...args) =>
  //condition ? describe(...args) : 
  describe.skip(...args);

describeif((config.env === DEFAULT_ENV_TO_RUN_IN),
   'audit-log-watchList @nightly', () => {
  const OPTIONS = {
    configurableEvents: ['WatchListUpdate', 'WatchListCreate', 'AccessMedia']
  };
  let helpersAuditLog, CONFIG_ADMIN_API_TOKEN, CONFIG_ADMIN_TOKEN;

  let testSourceIds = [];
  let testSourceTypeIds = [];
  beforeAll(async () => {
    helpersAuditLog = await buildAndInitializeAuditLogHelpers(config, OPTIONS);
    const result = await helpersAuditLog.loginWithConfiguredUser();
    CONFIG_ADMIN_TOKEN = result.userLogin.token;
    CONFIG_ADMIN_API_TOKEN = result.apiToken || config.apiToken;
    expect(CONFIG_ADMIN_TOKEN).toBeDefined();
    expect(CONFIG_ADMIN_API_TOKEN).toBeDefined();
  });

  afterAll(async () => {
    for (const id of watchListIds) {
      await helpersAuditLog.deleteWatchList(CONFIG_ADMIN_TOKEN, id);
    }
  });

  it('should index audit log events WatchListCreate WHEN creating a watchList', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const watchListName = helpersAuditLog.createRandomString('test_watchlist');

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
    const dateNow = Date.now();
    const stop = dateNow + 90 * 24 * 60 * 60 * 1000;

    let result = await helpersAuditLog.createWatchList(
      CONFIG_ADMIN_TOKEN,
      stop,
      watchListName,
      testSourceIds,
      variables,
      correlationID
    );
    watchListId = result.createWatchlist.id;
    watchListIds.push(watchListId);

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'create',
        actionResult: 'success',
        actionDetails: `Created watchlist ${watchListName}`,
        targetId: watchListId,
        targetType: 'tt_Watchlist',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'watchlist',
        eventName: 'WatchListCreate',
        organizationName: 'Veritone, Inc.'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log events WatchListCreate WHEN creating a watchList is failed', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const watchListName = helpersAuditLog.createRandomString('test_watchlist');

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
    const start = Date.now() - 7 * 365 * 24 * 60 * 60 * 1000;
    const stop = start + 30 * 24 * 60 * 60 * 1000;

    try {
      await helpersAuditLog.createWatchList(
        CONFIG_ADMIN_TOKEN,
        stop,
        watchListName,
        testSourceIds,
        variables,
        correlationID
      );
    } catch (error) {
      const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
        error
      );
      const expectedAuditLogItems = [
        {
          actionName: 'create',
          actionResult: 'failure',
          actionDetails: `Failed to create watchlist undefined`,
          eventType: 'watchlist',
          eventName: 'WatchListCreate',
        }
      ];
      const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
        correlationID,
        expectedAuditLogItems
      );
  
      validateExpectedEvents({
        auditLogItems,
        expectedAuditLogItems,
        correlationID,
        correlationIDResponse
      });
    }
  });

  it.skip('should index audit log events WatchListUpdate WHEN updating a watchList', async () => {
    const correlationID = helpersAuditLog.buildCorrelationID();
    const watchListName = helpersAuditLog.createRandomString('test_watchlist');

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
    const dateNow = Date.now();
    const stop = dateNow + 90 * 24 * 60 * 60 * 1000;

    let result = await helpersAuditLog.createWatchList(
      CONFIG_ADMIN_TOKEN,
      stop,
      watchListName,
      testSourceIds,
      variables,
      correlationID
    );

    watchListId = result.createWatchlist.id;
    watchListIds.push(watchListId);
    const updateWatchListName = `${watchListName}-UPDATED`;
    result = await helpersAuditLog.updateWatchList(
      CONFIG_ADMIN_TOKEN,
      watchListId,
      updateWatchListName,
      testSourceTypeIds,
      testSourceIds,
      correlationID
    );
    expect(result.updateWatchlist).toBeDefined();

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      {
        actionName: 'update',
        actionResult: 'success',
        actionDetails: `Updated watchlist ${updateWatchListName}`,
        targetId: watchListId,
        targetType: 'tt_Watchlist',
        userName: helpers.config.userName,
        userAgent: 'core-graphql-server test',
        organizationId: _.toString(helpersAuditLog._organizationID),
        originatorApplication: 'GraphQL-CI-Test',
        originatorService: 'core-graphql-server',
        eventType: 'watchlist',
        eventName: 'WatchListUpdate',
        organizationName: 'Veritone, Inc.'
      }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );

    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log event WatchListUpdate WHEN updating a watchlist fails', async () => {
    const mutation = `
      mutation update {
        updateWatchlist(input: {
          name: "XYZ"
          id: "ABC"
        }) {
          name
        }
      }
    `;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(mutation, null, headers)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );
        const expectedAuditLogItems = [
          {
            actionName: 'update',
            actionResult: 'failure',
            actionDetails: `Failed to update watchlist undefined`,
            eventName: 'WatchListUpdate',
            eventType: 'watchlist'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );

        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });
  });

  it('should index audit log when querying watchlists', async () => {
    if (_.isEmpty(watchListIds)) {
      const stop = dateNow + 90 * 24 * 60 * 60 * 1000;
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
      await helpersAuditLog.createWatchList(
      CONFIG_ADMIN_TOKEN,
      stop,
      watchListName,
      testSourceIds,
      variables,
      correlationID
    );
    }
    const query = `query {
        watchlists {
          records {
            id
          }         
        }
      }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    const result = await helpersAuditLog._gqlClient.query(query, null, headers);
    expect(!_.isEmpty(result.watchlists.records)).toBeTruthy();

    const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
      result
    );
    const expectedAuditLogItems = [
      { eventType: 'media', eventName: 'AccessMedia', actionResult: 'success' }
    ];
    const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
      correlationID,
      expectedAuditLogItems
    );
    validateExpectedEvents({
      auditLogItems,
      expectedAuditLogItems,
      correlationID,
      correlationIDResponse
    });
  });

  it('should index audit log when failing to fetch a watchlist', async () => {
    const query = `query {
        watchlist (id: "XYZ") {
          name
        }
      }`;
    const correlationID = helpersAuditLog.buildCorrelationID();
    const headers = helpersAuditLog.buildHeadersWithBearerToken(
      CONFIG_ADMIN_TOKEN,
      correlationID
    );
    await helpersAuditLog._gqlClient
      .query(query, null, headers)
      .catch(async (err) => {
        const correlationIDResponse = helpersAuditLog.getCorrelationIDFromResponse(
          err
        );
        const expectedAuditLogItems = [
          {
            eventType: 'media',
            eventName: 'AccessMedia',
            actionResult: 'failure'
          }
        ];
        const auditLogItems = await helpersAuditLog.getAuditLogItemsByFilter(
          correlationID,
          expectedAuditLogItems
        );
        validateExpectedEvents({
          auditLogItems,
          expectedAuditLogItems,
          correlationID,
          correlationIDResponse
        });
      });
  });
});
