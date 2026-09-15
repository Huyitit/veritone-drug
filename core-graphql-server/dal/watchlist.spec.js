//jest.mock('fs');

const dbConnections = {
  media_platform: {
    read: {
      map: function (...args) {
        const sources = [
          { sourceId: 1, sourceTypeId: 1001 },
          { sourceId: 11, sourceTypeId: 1001 },
          { sourceId: 2, sourceTypeId: 2002 },
          { sourceId: 3, sourceTypeId: 3003 }
        ];
        const idArgs = args[1];
        return sources.filter((s) => idArgs.indexOf(s.sourceId) > -1);
      }
    }
  }
};
const config = {
  recordingIdParser: {
    prefix: 'mri-',
    baseUri: 'https://api.aws-dev.veritone.com/media-streamer'
  },
  featureFlags: {
    enforceWatchlistRangeLimits: true
  },
  messaging: {
    disableV2: true
  },
  db: dbConnections,
  s3: {
    region: 'us-east-1'
  }
};
const watchlistDal = require('./watchlist.js')({
  config,
  dbConnections,
  dal: {
    folder: {}
  }
});

const moment = require('moment');
const _ = require('lodash');
const mockUtil = global.mockUtil;
const context = mockUtil.makeContext();
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const dal = require('./watchlist.js')(serviceContext);

describe('watchlist', () => {
  describe('#require', () => {
    it('should load module', () => {
      expect(dal).toBeInstanceOf(Object);
    });
  });
  describe('#getWatchlist', () => {
    it('should get watchlist and emit an audit log event', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 1234,
          name: 'test',
          organizationId: '7682'
        }
      ]);
      serviceContext.config.featureFlags.readAuditEvents = true;
      const res = await dal.getWatchlist(
        {
          id: 1234
        },
        context
      );
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'read',
          actionResult: 'success'
        })
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(1234);
      expect(res.name).toBe('test');
      expect(res.organizationId).toBe('7682');
    });

    it('should get watchlist and not emit an audit log event without platform flag (metrics still fire)', async () => {
      serviceContext.config.featureFlags.readAuditEvents = false;
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 1234,
          name: 'test',
          organizationId: '7682'
        }
      ]);
      const res = await dal.getWatchlist(
        {
          id: 1234
        },
        context
      );
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toEqual(0);
      expect(res).toBeDefined();
    });
    it('should get watchlist not disabled', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 1234,
            name: 'test',
            organizationId: '7682'
          }
        ],
        false
      );
      const res = await dal.getWatchlist(
        {
          id: 1234,
          name: 'test',
          isDisabled: false,
          orderBy: 'tracking_unit_id',
          orderDirection: 'ASC',
          offset: 1,
          limit: 10
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(1234);
      expect(res.name).toBe('test');
      expect(res.organizationId).toBe('7682');
    });
    it('should get watchlist disabled', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 1234,
            name: 'test',
            organizationId: '7682'
          }
        ],
        false
      );
      const res = await dal.getWatchlist(
        {
          id: 1234,
          name: 'test',
          isDisabled: true,
          orderBy: 'tracking_unit_id',
          orderDirection: 'ASC',
          offset: 1,
          limit: 10
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(1234);
      expect(res.name).toBe('test');
      expect(res.organizationId).toBe('7682');
    });
    it('should get watchlists by name', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 1234,
            name: 'test1',
            organizationId: '7682'
          }
        ],
        false,
        ['tracking_unit_name ilike', '$1', '$2'],
        (_sql, args) => {
          expect(args[0]).toBe('test1%');
          expect(args[1]).toBe('test2%');
          return true;
        }
      );
      const res = await dal.getWatchlists(
        {
          names: ['test1', 'test2'],
          nameMatch: 'startsWith'
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.records).toBeDefined();
      expect(res.records[0]).toBeDefined();
      expect(res.records[0].id).toBe(1234);
      expect(res.records[0].name).toBe('test1');
      expect(res.records[0].organizationId).toBe('7682');
    });
    it('should fail if not found', async () => {
      try {
        serviceContext.dbConnections['media_platform'].read._push([]);
        const res = await dal.getWatchlist(
          {
            id: 1234
          },
          context
        );
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should fail if id is null', async () => {
      try {
        const res = await dal.getWatchlist(
          {
            id: null
          },
          context
        );
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('Invalid ID format. An id cannot be null.');
      }
    });
    it('should fail if invalid id format and emit audit event when platform flag is enabled', async () => {
      serviceContext.config.featureFlags.readAuditEvents = true;
      try {
        const res = await dal.getWatchlist(
          {
            id: 'abc'
          },
          context
        );
      } catch (err) {
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'read',
            actionResult: 'failure'
          })
        );
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe(
          'Invalid ID format. An ID must be a UUID or numerical string.'
        );
      }
    });
  });
  describe('#bulkCreateWatchlists', () => {
    it('should create watchlist in bulk', async () => {
      const now = moment();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'live_prerecorded',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(1, 'day').valueOf()
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 456,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          start_date_time: now.valueOf(),
          stop_date_time: now.add(2, 'day').valueOf()
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tracking_unit_id: 123,
          user_id: 'u123',
          mention_status_id: 1,
          csp: [[], []],
          query: {}
        }
      ]);
      const res = await dal.bulkCreateWatchlists(
        {
          input: {
            watchlists: [
              {
                searchIndex: 'mine',
                stopDateTime: now.add(1, 'day').toISOString(),
                startDateTime: now.toISOString(),
                name: 'test 123',
                cognitiveSearches: [
                  {
                    mentionStatusId: 1,
                    jsonstring:
                      '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
                  }
                ],
                enableExpirationNotification: true
              },
              {
                searchIndex: 'mine',
                stopDateTime: now.add(2, 'day').toISOString(),
                startDateTime: now.toISOString(),
                name: 'test 456',
                enableExpirationNotification: false
              }
            ]
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.count).toBe(2);
      expect(res.records.length).toBe(2);
      // event + event access media
      expect(serviceContext.messageUtil._counter()).toBe(4);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[2].event).toBe('watchlist_created'); // private event
      expect(messages[0].actionInfo).toEqual(expect.any(Object)); // public event
      expect(messages[0].actionInfo.actionName).toEqual('create');
      expect(messages[0].actionInfo.actionResult).toEqual(`success`);
    });
  });
  describe('#createWatchlist', () => {
    // these tests use their own dal object since they are newer
    // and use the newer full serviceContext mock.
    it('should create watchlist', async () => {
      const now = moment();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'live_prerecorded',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          details: {},
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: null,
          creative_id: null,
          enable_expiration_notification: true
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tracking_unit_id: 123,
          user_id: 'u123',
          mention_status_id: 1,
          csp: [[], []],
          query: {}
        }
      ]);
      const res = await dal.createWatchlist(
        {
          input: {
            searchIndex: 'mine',
            stopDateTime: now.add(30, 'day').valueOf(),
            startDateTime: now.valueOf(),
            name: 'test wl',
            cognitiveSearches: [
              {
                mentionStatusId: 1,
                jsonstring:
                  '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
              }
            ],
            enableExpirationNotification: true,
            watchlistType: 'live_prerecorded'
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.isDisabled).toBe(false);
      expect(res.enableExpirationNotification).toBe(true);
      expect(res.watchlistType).toBe('live_prerecorded');
      // event + event access media
      expect(serviceContext.messageUtil._counter()).toBe(2);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[1].event).toBe('watchlist_created'); // private event
      expect(messages[0].actionInfo).toEqual(expect.any(Object)); // public event
      expect(messages[0].actionInfo.actionName).toEqual('create');
      expect(messages[0].actionInfo.actionResult).toEqual(`success`);
    });

    it('should create watchlist with source type is General (5)', async () => {
      const now = moment();
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [5],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          details: {},
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: null,
          creative_id: null
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tracking_unit_id: 123,
          user_id: 'u123',
          mention_status_id: 1,
          csp: [],
          query: {}
        }
      ]);
      const res = await dal.createWatchlist(
        {
          input: {
            searchIndex: 'mine',
            stopDateTime: now.add(30, 'day').valueOf(),
            startDateTime: now.valueOf(),
            name: 'test wl',
            cognitiveSearches: [
              {
                mentionStatusId: 1,
                jsonstring:
                  '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
              }
            ]
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.isDisabled).toBe(false);
      expect(res.watchlistType).toBe('tracking');
    });
    it('should create watchlist with marketIds', async () => {
      const now = moment();
      // get source info
      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: 1,
          source_type_id: 1001
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          details: {
            marketIds: [1, 2, 45]
          },
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 1,
          creative_id: null
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        [],
        [
          {
            tracking_unit_id: 123,
            user_id: 'u123',
            mention_status_id: 1,
            csp: [],
            query: {
              query: 'query'
            }
          }
        ]
      ]);
      serviceContext.dbConnections['media_platform'].write._push([]);
      // dalFolder file object
      _.set(serviceContext, 'dal.folder.fileObject', () => {
        return {};
      });
      // get exist subscription
      serviceContext.dbConnections['subscription'].read._push([
        {
          id: 123,
          organization_id: 7682,
          created_date_time: now.valueOf(),
          modified_date_time: now.valueOf(),
          object_type_id: null,
          target_id: 123,
          email_address: 'test@veritone.com'
        }
      ]);
      // subscriptions
      serviceContext.dbConnections['subscription'].write._push([
        {
          id: 123,
          organization_id: '7682'
        }
      ]);
      // save program ids
      serviceContext.dbConnections['media_platform'].write._push([
        { program_id: 123 }
      ]);
      // save market ids
      serviceContext.dbConnections['media_platform'].write._push([
        { market_id: 123 }
      ]);
      // save source ids
      serviceContext.dbConnections['media_platform'].write._push([
        { media_source_id: 123 }
      ]);
      const res = await dal.createWatchlist(
        {
          input: {
            searchIndex: 'mine',
            stopDateTime: now.add(30, 'day').valueOf(),
            startDateTime: now.valueOf(),
            name: 'test wl',
            parentFolderId: 123,
            sourceTypeIds: [1001],
            details: {
              marketIds: [123],
              targetAudience: 123,
              programIds: [123]
            },
            sourceIds: [1],
            cognitiveSearches: [
              {
                mentionStatusId: 1,
                jsonstring:
                  '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
              }
            ],
            subscriptions: [
              {
                targetId: 123,
                contact: {
                  emailAddress: 'test@veritone.com'
                }
              }
            ]
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.isDisabled).toBe(false);
    });

    it('should return original validation error when stopDateTime is before current date', async () => {
      const pastStopDateTime = moment().subtract(1, 'day').valueOf();

      try {
        await dal.createWatchlist(
          {
            input: {
              name: 'Test Watchlist',
              stopDateTime: pastStopDateTime,
            },
          },
          mockUtil.makeContext()
        );
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('The supplied startDateTime must be before the stopDateTime.');
        expect(err.name).not.toBe('internal_error');
        expect(err.message).not.toBe('Create watchlist failed.');
      }
    });
  });
  describe('#updateWatchlist', () => {
    it('should disable watchlist', async () => {
      const now = moment();

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 1,
          creative_id: null
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]); // markets
      serviceContext.dbConnections['media_platform'].read._push([]); // programs
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 4,
          creative_id: null
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]); // markets for inserted watchlist
      serviceContext.dbConnections['media_platform'].read._push([]); // programs for inserted watchlist
      serviceContext.dbConnections['media_platform'].read._push([]); // cognitive searches in create event
      serviceContext.dbConnections['media_platform'].read._push([
        {
          // refresh result
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 4,
          creative_id: null
        }
      ]);

      const res = await dal.updateWatchlist(
        {
          input: {
            id: '123',
            isDisabled: true
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.isDisabled).toBe(true);
      // event + event access media
      expect(serviceContext.messageUtil._counter()).toBe(2);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[1].event).toBe('watchlist_updated'); // private event
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
    });
    it('should update watchlist', async () => {
      const now = moment();
      // get watchlist
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 1,
          creative_id: null
        }
      ]);
      // populateDetails
      serviceContext.dbConnections['media_platform'].read._push([]); // markets
      serviceContext.dbConnections['media_platform'].read._push([]); // programs
      // get source info
      serviceContext.dbConnections['media_platform'].read._push([
        {
          source_id: 1,
          source_type_id: 1001
        }
      ]);
      // update watchlist
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 4,
          creative_id: null,
          enable_expiration_notification: false
        }
      ]);
      // save program ids
      serviceContext.dbConnections['media_platform'].write._push([
        { program_id: 123 }
      ]);
      // // populateDetails for inserted watchlist
      serviceContext.dbConnections['media_platform'].read._push([{ id: 123 }]); // markets
      serviceContext.dbConnections['media_platform'].read._push([{ id: 123 }]); // programs
      // save source ids
      serviceContext.dbConnections['media_platform'].write._push([
        { media_source_id: 123 }
      ]);
      // parentFolderId file object
      _.set(serviceContext, 'dal.folder.getParentFolder', () => {
        return Promise.resolve({
          id: 123,
          objectId: 1,
          treeObjectId: 2
        });
      });
      _.set(serviceContext, 'dal.folder.moveWatchlist', () => {
        return Promise.resolve({});
      });
      // getCognitiveSearches
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            mention_status_id: 1,
            cognitive_profile_id: 1,
            watchlist_id: 123,
            query: {
              query: 'query'
            }
          }
        ],
        false
      );
      // get exist subscription
      serviceContext.dbConnections['subscription'].read._push([
        {
          id: 123,
          organization_id: 7682,
          created_date_time: now.valueOf(),
          modified_date_time: now.valueOf(),
          object_type_id: null,
          target_id: 123,
          email_address: 'test@veritone.com'
        }
      ]);
      // subscriptions
      serviceContext.dbConnections['subscription'].write._push([
        {
          id: 123,
          organization_id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]); // cognitive searches in create event
      serviceContext.dbConnections['media_platform'].read._push([
        {
          // refresh result
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 4,
          enable_expiration_notification: false
        }
      ]);

      const res = await dal.updateWatchlist(
        {
          input: {
            id: '123',
            isDisabled: true,
            stopDateTime: now.add(30, 'day').valueOf(),
            startDateTime: now.valueOf(),
            sourceTypeIds: [1001],
            name: 'test',
            searchIndex: 'mine',
            details: {
              marketIds: [123],
              targetAudience: 123,
              programIds: [123]
            },
            sourceIds: [1],
            parentFolderId: 123,
            cognitiveSearches: [
              // {
              //   mentionStatusId: 1,
              //   profile: {
              //     engineCategoryId: 123
              //   }
              // }
            ],
            subscriptions: [
              {
                targetId: 123,
                contact: {
                  emailAddress: 'test@veritone.com'
                }
              }
            ],
            enableExpirationNotification: false
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.isDisabled).toBe(true);
      expect(res.enableExpirationNotification).toBe(false);
      // event + event access media
      expect(serviceContext.messageUtil._counter()).toBe(2);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[1].event).toBe('watchlist_updated'); // private event
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
    });

    it('should delete null markets, programs and sources', async () => {
      const now = moment();
      // get watchlist
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 1,
          creative_id: null
        }
      ]);
      // populateDetails
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 50 },
        { id: 51 }
      ]); // markets
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 10000 },
        { id: 100001 }
      ]); // programs
      // update watchlist
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 4,
          creative_id: null,
          enable_expiration_notification: false
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);
      // delete program ids
      serviceContext.dbConnections['media_platform'].write._push([]);
      // populateDetails for updated watchlist
      serviceContext.dbConnections['media_platform'].read._push([]); // markets
      serviceContext.dbConnections['media_platform'].read._push([]); // programs
      // parentFolderId file object
      _.set(serviceContext, 'dal.folder.getParentFolder', () => {
        return Promise.resolve({
          id: 123,
          objectId: 1,
          treeObjectId: 2
        });
      });
      _.set(serviceContext, 'dal.folder.moveWatchlist', () => {
        return Promise.resolve({});
      });

      // getCognitiveSearches
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            mention_status_id: 1,
            cognitive_profile_id: 1,
            watchlist_id: 123,
            query: {
              query: 'query'
            }
          }
        ],
        false
      );
      // get exist subscription
      serviceContext.dbConnections['subscription'].read._push([
        {
          id: 123,
          organization_id: 7682,
          created_date_time: now.valueOf(),
          modified_date_time: now.valueOf(),
          object_type_id: null,
          target_id: 123,
          email_address: 'test@veritone.com'
        }
      ]);
      // subscriptions
      serviceContext.dbConnections['subscription'].write._push([
        {
          id: 123,
          organization_id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]); // cognitive searches in create event
      serviceContext.dbConnections['media_platform'].read._push([
        {
          // refresh result
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 4,
          enable_expiration_notification: false
        }
      ]);

      const res = await dal.updateWatchlist(
        {
          input: {
            id: '123',
            isDisabled: true,
            stopDateTime: now.add(30, 'day').valueOf(),
            startDateTime: now.valueOf(),
            sourceTypeIds: [1001],
            name: 'test',
            searchIndex: 'mine',
            details: {
              marketIds: [],
              targetAudience: 123,
              programIds: []
            },
            sourceIds: [],
            parentFolderId: 123,
            cognitiveSearches: [
              // {
              //   mentionStatusId: 1,
              //   profile: {
              //     engineCategoryId: 123
              //   }
              // }
            ],
            subscriptions: [
              {
                targetId: 123,
                contact: {
                  emailAddress: 'test@veritone.com'
                }
              }
            ],
            enableExpirationNotification: false
          }
        },
        mockUtil.makeContext()
      );

      expect(res).toBeDefined();
      expect(res.isDisabled).toBe(true);
      expect(res.enableExpirationNotification).toBe(false);
    });
    it('should fail if missing id', async () => {
      const now = moment();
      serviceContext.dbConnections['media_platform'].write._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 1,
          creative_id: null
        }
      ]);
      // markets
      serviceContext.dbConnections['media_platform'].read._push([]);
      // programs
      serviceContext.dbConnections['media_platform'].read._push([]);
      // Watchlist
      serviceContext.dbConnections['media_platform'].read._push([]);

      try {
        const res = await dal.updateWatchlist(
          {
            input: {
              id: '123',
              isDisabled: true
            }
          },
          mockUtil.makeContext()
        );
        expect.fail('not found');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('not_found');
      }
    });
  });
  describe('#deleteWatchlist', () => {
    it('dalFolder.unfileObject throw an error', async () => {
      const serviceCtx = require('../test/serviceContext.mock.js')();
      serviceCtx.dal.folder.unfileObject = async (
        context,
        args,
        objectType
      ) => {
        throw new Error('(unfileObject) Failed to unfile');
      };
      const dal = require('./watchlist.js')(serviceCtx);
      // detele all watch list
      serviceCtx.dbConnections['media_platform'].write._push([
        {
          cognitive_profile_id: 'cognitive_profile_id'
        },
        {
          tracking_unit_program_link_id: 'tracking_unit_program_link_id'
        },
        {
          tracking_unit_media_source_link_id:
            'tracking_unit_media_source_link_id'
        },
        {
          comment_id: 'comment_id'
        },
        {
          rating_id: 'rating_id'
        },
        {
          mention_id: '123',
          organization_id: 7682,
          mention_date: new Date()
        },
        {
          tracking_unit_id: 'tracking_unit_id'
        }
      ]);
      // delete watchlist subscriptions
      serviceCtx.dbConnections['subscription'].write._push([
        {
          subscription_id: 'subscription_id'
        }
      ]);
      try {
        await dal.deleteWatchlist(
          {
            id: 1234
          },
          context
        );
      } catch (err) {
        expect(err).toBeDefined();
        expect(`${err}`).toContain('(unfileObject) Failed to unfile');
      }
    });
    it('should delete watchlist', async () => {
      // detele all watch list
      serviceContext.dbConnections['media_platform'].write._push([
        {
          cognitive_profile_id: 'cognitive_profile_id'
        },
        {
          tracking_unit_program_link_id: 'tracking_unit_program_link_id'
        },
        {
          tracking_unit_media_source_link_id:
            'tracking_unit_media_source_link_id'
        },
        {
          comment_id: 'comment_id'
        },
        {
          rating_id: 'rating_id'
        },
        {
          mention_id: '123',
          organization_id: 7682,
          mention_date: new Date()
        },
        {
          tracking_unit_id: 'tracking_unit_id'
        }
      ]);
      // delete watchlist subscriptions
      serviceContext.dbConnections['subscription'].write._push([
        {
          subscription_id: 'subscription_id'
        }
      ]);
      const res = await dal.deleteWatchlist(
        {
          id: 1234
        },
        context
      );

      expect(res).toBeDefined();
      expect(res.id).toBe(1234);
      // should emit 1 message mentions_deleted (internal)
      const messages = serviceContext.messageUtil._messages();
      expect(serviceContext.messageUtil._counter()).toBe(2);
      expect(messages[0].event).toBe('mentions_deleted');
      expect(messages[0].type).toBe('mention');
      expect(messages[1].event).toBe('watchlist_deleted');
      expect(messages[1].type).toBe('watchlist');
    });
  });
  describe('#bulkUpdateWatchlist', () => {
    const now = moment();
    it('should bulk update watchlist', async () => {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          name: 'test',
          source_type_id: null,
          source_type_ids: [],
          organization_id: 7682,
          application_id: 'app1',
          watchlist_type: 'tracking',
          modified_date_time: now.valueOf(),
          created_date_time: now.valueOf(),
          start_date_time: now.valueOf(),
          stop_date_time: now.add(30, 'day').valueOf(),
          target_audience: null,
          market_id: null,
          details: {
            marketIds: [1, 2, 45]
          },
          search_index: true,
          track_all: false,
          advertiser_id: null,
          brand_id: null,
          tracking_unit_state_lookup_id: 1,
          creative_id: null
        }
      ]);
      const res = await dal.bulkUpdateWatchlist(context, {
        filter: {
          ids: [123]
        },
        input: {
          stopDate: now.add(30, 'day').valueOf()
        }
      });
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe(123);
      expect(res.records[0].name).toBe('test');
    });
    it('should fail if ids not array', async () => {
      try {
        const res = await dal.bulkUpdateWatchlist(context, {
          filter: {
            ids: 123
          },
          input: {
            stopDate: now.add(30, 'day').valueOf()
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('Invalid Ids');
      }
    });
    it('should fail if ids empty', async () => {
      try {
        const res = await dal.bulkUpdateWatchlist(context, {
          filter: {
            ids: []
          },
          input: {
            stopDate: now.add(30, 'day').valueOf()
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('Invalid Ids');
      }
    });
    it('should fail if ids isNaN', async () => {
      try {
        const res = await dal.bulkUpdateWatchlist(context, {
          filter: {
            ids: [null, 'abc']
          },
          input: {
            stopDate: now.add(30, 'day').valueOf()
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('Invalid Ids');
      }
    });
    it('should fail if stopDate is null', async () => {
      try {
        const res = await dal.bulkUpdateWatchlist(context, {
          filter: {
            ids: [123]
          },
          input: {
            stopDate: null
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.message).toBe('stop date is required');
      }
    });
  });
  describe('#getMentionStatusOptions', () => {
    it('should get mention status options', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test'
        }
      ]);
      var res = await dal.getMentionStatusOptions(null, context);
      expect(res).toBeDefined();
      expect(res[0].id).toBe(123);
      expect(res[0].name).toBe('test');
    });
  });
  describe('#getMentionStatusOption', () => {
    it('should get mention status option', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test'
        }
      ]);
      var res = await dal.getMentionStatusOption({ id: 123 });
      expect(res).toBeDefined();
      expect(res.id).toBe(123);
      expect(res.name).toBe('test');
    });
  });
  describe('#fileWatchlist', () => {
    it('should return watch list', async () => {
      // get watch list
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test',
          organizationId: '7682'
        }
      ]);
      // dalFolder file object
      _.set(serviceContext, 'dal.folder.fileObject', () => {
        return {};
      });
      var res = await dal.fileWatchlist(
        {
          input: {
            watchlistId: 123,
            organizationId: 7682,
            parentFolderId: 123
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(123);
      expect(res.name).toBe('test');
    });
  });
  describe('#unfileWatchlist', () => {
    it('should unfile watchlist', async () => {
      // get watch list
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123,
          name: 'test',
          organizationId: '7682'
        }
      ]);
      // dalFolder file object
      _.set(serviceContext, 'dal.folder.unfileObject', () => {
        return {};
      });
      var res = await dal.unfileWatchlist(
        {
          input: {
            watchlistId: 123,
            organizationId: 7682,
            folderId: 123
          }
        },
        context
      );
      expect(res).toBeDefined();
    });
  });
  describe('#createSubscription', () => {
    it('should create subscription', async () => {
      serviceContext.dbConnections['subscription'].write._push(
        [
          {
            id: 'subscription_id',
            organization_id: '7682'
          }
        ],
        false
      );
      var res = await dal.createSubscription(context, {
        input: {
          targetId: 123,
          contact: {
            emailAddress: 'test@veritone.com'
          }
        }
      });
      expect(res).toBeDefined();
      expect(res.id).toBe('subscription_id');
      expect(res.organizationId).toBe('7682');
    });
  });
  describe('#createSubscriptions', () => {
    const now = moment();

    it('should clear exist before create subscriptions', async () => {
      // get exist subscription
      serviceContext.dbConnections['subscription'].read._push([
        {
          id: 123,
          organization_id: 7682,
          created_date_time: now.valueOf(),
          modified_date_time: now.valueOf(),
          object_type_id: null,
          target_id: 123,
          email_address: 'test@veritone.com'
        }
      ]);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: 123,
          organization_id: '7682'
        }
      ]);
      var res = await dal.createSubscriptions(
        context,
        [
          {
            targetId: 123,
            contact: {
              emailAddress: 'test@veritone.com'
            }
          }
        ],
        true,
        123
      );
      expect(res).toBeDefined();
      expect(res.id).toBe(123);
      expect(res.organizationId).toBe('7682');
    });
    it('should throw if genUpdateSubscriptionQuery invalid time zone', async () => {
      // get exist subscription
      serviceContext.dbConnections['subscription'].read._push([
        {
          id: 123,
          organization_id: 7682,
          created_date_time: now.valueOf(),
          modified_date_time: now.valueOf(),
          object_type_id: null,
          target_id: 123,
          email_address: 'test@veritone.com'
        }
      ]);

      serviceContext.dbConnections['subscription'].write._push([
        {
          id: 123,
          organization_id: '7682'
        }
      ]);
      try {
        var res = await dal.createSubscriptions(
          context,
          [
            {
              targetId: 123,
              contact: {
                emailAddress: 'test@veritone.com'
              },
              scheduledTimeZone: 'undefined'
            }
          ],
          true,
          123
        );
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe(
          'The value provided for scheduledTimeZone was not valid. Make ' +
            'sure that it represents a valid time zone in offset (-0800),' +
            'abbreviated ("PST"), or full ("America/Los_Angeles") format'
        );
      }
    });
    it('should throw if genCreateSubscriptionQuery invalid time zone', async () => {
      serviceContext.dbConnections['subscription'].write._push([
        {
          id: 123,
          organization_id: '7682'
        }
      ]);
      try {
        var res = await dal.createSubscriptions(context, [
          {
            targetId: 123,
            contact: {
              emailAddress: 'test@veritone.com'
            },
            scheduledTimeZone: 'undefined'
          }
        ]);
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe(
          'The value provided for scheduledTimeZone was not valid. Make ' +
            'sure that it represents a valid time zone in offset (-0800),' +
            'abbreviated ("PST"), or full ("America/Los_Angeles") format'
        );
      }
    });
    it('should throw error if missing wlId', async () => {
      try {
        var res = await dal.createSubscriptions(
          context,
          [
            {
              targetId: 123,
              contact: {
                emailAddress: 'test@veritone.com'
              }
            }
          ],
          true,
          null
        );
        expect.fail('not found');
      } catch (err) {
        expect(err.message).toBe(
          'watchlistId must be supplied if clear existing is set'
        );
      }
    });
  });
  describe('#deleteSubscription', () => {
    it('should delete subscription', async () => {
      serviceContext.dbConnections['subscription'].write._push(
        [
          {
            id: 123,
            organization_id: '7682'
          }
        ],
        false
      );
      var res = await dal.deleteSubscription(context, {
        id: 123,
        organization_id: '7682'
      });
      expect(res).toBeDefined();
      expect(res.id).toBe(123);
      expect(res.message).toBe('Subscription deleted');
    });
  });
  describe('#getSubscription', () => {
    it('should get subscription', async () => {
      serviceContext.dbConnections['subscription'].write._push(
        [
          {
            id: 'subscription_id',
            organization_id: '7682'
          }
        ],
        false
      );
      var res = await dal.getSubscription({ id: 123, organizationId: 7682 });
      expect(res).toBeDefined();
      expect(res.id).toBe('subscription_id');
      expect(res.organizationId).toBe('7682');
    });
    it('should throw not found', async () => {
      serviceContext.dbConnections['subscription'].write._push([], false);
      try {
        const res = await dal.getSubscription({
          id: 123,
          organizationId: 7682
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
  });
  describe('#getCognitiveSearches', () => {
    it('should get cognitive searches', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            owner_user_id: 'owner_user_id',
            mention_status_id: 'mention_status_id',
            watchlist_id: 123
          }
        ],
        false
      );
      var res = await dal.getCognitiveSearches({
        id: 123,
        organizationId: 7682
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0].id).toBe(123);
      expect(res[0].ownerUserId).toBe('owner_user_id');
    });
  });
  describe('#getCognitiveSearch', () => {
    it('should get cognitive search', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            owner_user_id: 'owner_user_id',
            mention_status_id: 'mention_status_id',
            watchlist_id: 123
          }
        ],
        false
      );
      var res = await dal.getCognitiveSearch({
        id: 123,
        organizationId: 7682
      });
      expect(res).toBeDefined();
      expect(res.id).toBe(123);
      expect(res.ownerUserId).toBe('owner_user_id');
    });
    it('should throw not found', async () => {
      serviceContext.dbConnections['media_platform'].write._push([], false);
      try {
        const res = await dal.getCognitiveSearch({
          id: 123,
          organizationId: 7682
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
  });
  describe('#updateCognitiveSearch', () => {
    it('should update cognitive search', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            mention_status_id: 'mention_status_id',
            watchlist_id: 123
          }
        ],
        false
      );
      var res = await dal.updateCognitiveSearch(context, {
        input: {
          id: 123,
          organizationId: 7682,
          profile: { engineCategoryId: 123 },
          mentionStatusId: 123
        }
      });
      expect(res).toBeDefined();
      expect(res.id).toBe(123);
    });
  });
  describe('#createCognitiveSearch', () => {
    it('should create cognitive search', async () => {
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 123,
            watchlist_id: 123,
            mention_status_id: 'mention_status_id',
            owner_user_id: 'owner_user_id'
          }
        ],
        false
      );
      var res = await dal.createCognitiveSearch(context, {
        input: {
          id: 123,
          organizationId: 7682,
          profile: { engineCategoryId: 123 },
          mentionStatusId: 123,
          watchlistId: 123
        }
      });
      expect(res).toBeDefined();
      expect(res.id).toBe(123);
    });
  });
  describe('#deleteCognitiveSearch', () => {
    it('should delete cognitive search', async () => {
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 123,
            organization_id: 6782
          }
        ],
        false
      );
      var res = await dal.deleteCognitiveSearch({
        id: 123,
        organizationId: 7682
      });
      expect(res).toBeDefined();
      expect(res.id).toBe(123);
      expect(res.message).toBe('CognitiveSearchProfile deleted');
    });
  });
  describe('#populateDetails', () => {
    it('should return populate details', async () => {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123,
          organization_id: 6782
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 123
        }
      ]);
      var res = await dal.populateDetails({
        id: 123,
        organizationId: 7682,
        marketId: 123,
        targetAudience: 123
      });
      expect(res).toBeDefined();
      expect(res.marketIds[0]).toBe('123');
      expect(res.programIds[0]).toBe('123');
    });
  });
  describe('#createCSPs', () => {
    it('should createCSPs', async () => {
      serviceContext.dbConnections['media_platform'].write._push(
        [
          [],
          [
            {
              id: 123,
              mention_status_id: 1,
              cognitive_profile_id: 1,
              watchlist_id: 123,
              query: {
                query: 'query'
              }
            }
          ]
        ],
        false
      );
      var res = await dal.createCSPs(context, {
        cognitiveSearches: [
          {
            mentionStatusId: 1,
            jsonstring:
              '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
          }
        ]
      });
      expect(res).toBeDefined();
    });
    it('should return empty if queries', async () => {
      var res = await dal.createCSPs(context, {});
      expect(res).toBeDefined();
      expect(res.length).toBe(0);
    });
    it('should throw error if cognitiveSearches jsonString not right', async () => {
      try {
        var res = await dal.createCSPs(context, {
          cognitiveSearches: [{ jsonstring: '{123' }]
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe(
          'The cognitiveSearchProfiles field did not contain valid JSON.'
        );
      }
    });
    it('should throw error if invalid input', async () => {
      try {
        var res = await dal.createCSPs(context, {
          cognitiveSearches: [{}]
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe(
          'Either the jsonstring or profile field must be passed to createCognitiveSearch.cognitiveSearchProfiles.'
        );
      }
    });
  });
  describe('#toV3Query', () => {
    it('should convert toV3Query ', async () => {
      var res = await dal.toV3Query({
        and: [
          {
            state: { search: 'foo', language: 'en' },
            engineCategoryId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
          }
        ]
      });
      expect(res).toBeDefined();
    });
    it('should throw error if invalid input', async () => {
      try {
        var res = await dal.toV3Query({});
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe(
          'The provided cognitive search profile contained well-formed JSON ' +
            'but did not represent a valid search profile.'
        );
      }
    });
  });
  describe('#getSearchQuery', () => {
    it('should get cognitive searches', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 123,
            owner_user_id: 'owner_user_id',
            mention_status_id: 'mention_status_id',
            watchlist_id: 123,
            query: {}
          }
        ],
        false
      );
      var res = await dal.getSearchQuery({
        id: 123,
        organizationId: 7682
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(1);
    });
  });
  describe('#getSourceIds', () => {
    it('should get source ids', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 123
        }
      ]);
      var res = await dal.getSourceIds(123);
      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0]).toBe('123');
    });
  });
  describe('#checkWatchlistRange', () => {
    const context1 = {
      _authInfo: {
        organization: {
          kvp: {
            features: {
              watchlistLimits: {
                maximumDurationDays: 120,
                minimumStartDate: moment().subtract(180, 'days').toISOString()
              }
            }
          }
        }
      }
    };
    const context2 = {
      _authInfo: {
        organization: {
          kvp: {
            features: {
              watchlistLimits: {
                // maximumDurationDays: 120, check default of 180
                maximumStartAgeDays: 120
              }
            }
          }
        }
      }
    };
    const context3 = {
      _authInfo: {
        organization: {
          kvp: {
            features: {
              watchlistLimits: {
                maximumStartAgeDays: 1,
                minimumStartDate: moment().subtract(30, 'days').toISOString()
              }
            }
          }
        }
      }
    };
    it('should fail on too large duration', async () => {
      let res, err;
      const testStart = new Date('2018-01-02T00:37:20.186Z').getTime();
      const testEnd = new Date('2018-06-02T00:37:20.186Z').getTime();

      try {
        res = await watchlistDal.checkWatchlistRange(
          testStart,
          testEnd,
          context1
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
    });
    it('should fail whatever', async () => {
      let res, err;
      const dateNow = moment();
      const start = dateNow.subtract(366, 'days').toISOString(); // dateNow - 365 * 24 * 60 * 60 * 1000;
      const stop = dateNow.toISOString();
      try {
        res = await watchlistDal.checkWatchlistRange(start, stop, context1);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
    });
    it('should fail on too large duration with default setting', async () => {
      let res, err;
      const testStart = new Date('2018-01-02T00:37:20.186Z').getTime();
      const testEnd = new Date('2018-07-02T00:37:20.186Z').getTime();

      try {
        res = await watchlistDal.checkWatchlistRange(
          testStart,
          testEnd,
          context2
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
    });
    it('should pass on allowed duration with default setting', async () => {
      let err;
      const testStart = Date.now() - 100 * 24 * 60 * 60 * 1000;
      const testEnd = testStart + 30 * 24 * 60 * 60 * 1000;
      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context2);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
    it('should fail on start date too early', async () => {
      let err;
      const testStart = new Date('2017-12-02T00:37:20.186Z').getTime();
      const testEnd = new Date('2018-01-02T00:37:20.186Z').getTime();

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context1);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err.name).toBe('invalid_input');
    });
    it('should fail on start date too early with min allowed setting', async () => {
      let err;
      const testStart = moment().subtract(121, 'days').valueOf();
      const testEnd = testStart + 10 * 24 * 60 * 60 * 1000;

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context2);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err.name).toBe('invalid_input');
    });
    it('should pass on start date ok with min allowed setting', async () => {
      let err;
      const testStart = Date.now() - 100 * 24 * 60 * 60 * 1000;
      const testEnd = testStart + 30 * 24 * 60 * 60 * 1000;

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context2);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
    it('should fail on start date start date after end date', async () => {
      let err;
      const testStart = new Date('2018-01-02T00:37:20.186Z').getTime();
      const testEnd = new Date('2018-01-01T00:37:20.186Z').getTime();

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context1);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err.name).toBe('invalid_input');
    });
    it('should allow watchlist within limits', async () => {
      let err;
      const testStart = moment().subtract(179, 'days').valueOf();
      const testEnd = moment().subtract(178, 'days').valueOf();

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context1);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
    it('should allow watchlist within limits - all defaults', async () => {
      let err;
      const testStart = Date.now() - 140 * 24 * 60 * 60 * 1000;
      const testEnd = testStart + 30 * 24 * 60 * 60 * 1000;

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context1);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
    it('should fail on too early start date - all defaults', async () => {
      let err;
      const testStart = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const testEnd = testStart + 30 * 24 * 60 * 60 * 1000;

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context1);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err.name).toBe('invalid_input');
    });
    it('should fail on too long duration - all defaults', async () => {
      let err;
      const testStart = Date.now() - 180 * 24 * 60 * 60 * 1000;
      const testEnd = testStart + 182 * 24 * 60 * 60 * 1000;

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context1);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err.name).toBe('invalid_input');
    });
    it('should pass on allowed duration with min date computed', async () => {
      let err;
      const testStart = Date.now() - 22 * 60 * 60 * 1000;
      const testEnd = testStart + 30 * 24 * 60 * 60 * 1000;

      try {
        await watchlistDal.checkWatchlistRange(testStart, testEnd, context1);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
    it('should return if hidden behind feature flag', async () => {
      config.featureFlags.enforceWatchlistRangeLimits = false;
      const watchlistDal2 = require('./watchlist.js')({
        config,
        dbConnections,
        dal: {
          folder: {}
        }
      });

      const testStart = Date.now() - 100 * 24 * 60 * 60 * 1000;
      const testEnd = testStart + 30 * 24 * 60 * 60 * 1000;
      const res = await watchlistDal2.checkWatchlistRange(
        testStart,
        testEnd,
        context2
      );
      expect(res).toBeUndefined();
    });
  });
  describe('#mapSourceTypeIds', () => {
    it('should should fail with invalid source id', (done) => {
      const input = { sourceIds: ['abc'] };
      watchlistDal
        .mapSourceTypeIds(input)
        .then((result) => Promise.reject('Expected an error here'))
        .catch((err) => {
          expect(err).toBeDefined();
          expect(err).toHaveProperty('name', 'invalid_input');
        });
      done();
    });
    it('should should fail with non-existing sourceId', (done) => {
      const input = { sourceIds: [1, 2, 123] };
      watchlistDal
        .mapSourceTypeIds(input)
        .then((result) => Promise.reject('Expected an error here'))
        .catch((err) => {
          expect(err).toBeDefined();
          expect(err).toHaveProperty('name', 'invalid_input');
        });
      done();
    });
    it('should should fail with invalid source type id', (done) => {
      const input = { sourceTypeIds: ['abc'] };
      watchlistDal
        .mapSourceTypeIds(input)
        .then((result) => Promise.reject('Expected an error here'))
        .catch((err) => {
          expect(err).toBeDefined();
          expect(err).toHaveProperty('name', 'invalid_input');
        });
      done();
    });
    it('should only map a sourceTypeId for one source', async () => {
      const input = { sourceIds: [1] };
      const result = await watchlistDal.mapSourceTypeIds(input);
      expect(result.stId).toBe(1001);
      expect(result.stIds).toBeNull();
    });
    it('should only map a sourceTypeId for more than one source', async () => {
      const input = { sourceIds: [1, 2, 11] };
      const result = await watchlistDal.mapSourceTypeIds(input);
      expect([1001, 2002, 1001]).toEqual(expect.arrayContaining([result.stId]));
      expect(result.stIds).toBeNull();
    });
    it('should map sourceTypeId and sourceTypeIds for one source type', async () => {
      const input = { sourceTypeIds: [1001] };
      const result = await watchlistDal.mapSourceTypeIds(input);
      expect(result.stId).toBe(1001);
      expect(result.stIds).toEqual([1001]);
    });
    it('should map sourceTypeId and sourceTypeIds for more than one source type', async () => {
      const input = { sourceTypeIds: [1001, 2002] };
      const result = await watchlistDal.mapSourceTypeIds(input);
      expect(result.stId).toBe(1001);
      expect(result.stIds).toEqual([1001, 2002]);
    });
    it('should map sourceTypeId and sourceTypeIds for both source and source types in the input', async () => {
      const input = { sourceIds: [1, 2], sourceTypeIds: [3003] };
      const result = await watchlistDal.mapSourceTypeIds(input);
      expect(result.stId).toBe(3003);
      expect(result.stIds).toEqual([3003]);
    });
    it('should map sourceTypeId and sourceTypeIds for both source and source types in the input (with duplicates)', async () => {
      const input = { sourceIds: [1, 2], sourceTypeIds: [3003, 1001, 2002] };
      const result = await watchlistDal.mapSourceTypeIds(input);
      expect(result.stId).toBe(3003);
      expect(result.stIds).toEqual([3003]);
    });
    it('should assign default sourceTypeId and sourceTypeIds for empty input', async () => {
      const input = { sourceTypeIds: [] };
      const result = await watchlistDal.mapSourceTypeIds(input);
      expect(result.stId).toBe(5);
      expect(result.stIds).toEqual([5]);
    });
    it('should assign default sourceTypeId and sourceTypeIds for undefined input', async () => {
      const input = {};
      const result = await watchlistDal.mapSourceTypeIds(input);
      expect(result.stId).toBe(5);
      expect(result.stIds).toEqual([5]);
    });
  });
  describe('#convertSearchIndex', () => {
    it('should fail if globalMedia setting diabled', async () => {
      const input = {};
      _.set(context, '_authInfo.organization.kvp.features.globalMedia', false);
      try {
        await dal.convertSearchIndex(context, input);
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_allowed');
        expect(err.message).toBe(
          'The organization is not provisioned to allow global media access.'
        );
      }
    });
  });
  describe('#_getPayloadForDeletedWatchlistEvent', () => {
    const context = {
      requestContext: {
        userInfo: {
          userId: 'cc3e239d-a757-4c4d-b1fd-bd3d4c239221'
        }
      },
      requestInfo: {
        requestId: 'veritone-request-id',
        correlationId: 'veritone-correlation-id'
      }
    };

    it('should throw an error if missing the input', () => {
      try {
        dal._getPayloadForDeletedWatchlistEvent(context);
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('Missing watchlist info.');
      }
    });

    it('should return the payload successfully', () => {
      const data = {
        type: 'watchlist',
        event: 'watchlist_deleted',
        trackingUnitId: 'watchlist_id',
        trackingUnitName: 'watchlist_name',
        organizationId: '123',
        applicationId: 'f8cbf311-d00d-4557-8f5c-19d25c6e4f76',
        userId: 'cc3e239d-a757-4c4d-b1fd-bd3d4c239221',
        requestId: 'veritone-request-id',
        correlationId: 'veritone-correlation-id'
      };
      const input = {
        id: 'watchlist_id',
        name: 'watchlist_name',
        organizationId: 123,
        applicationId: 'f8cbf311-d00d-4557-8f5c-19d25c6e4f76',
        userId: 'cc3e239d-a757-4c4d-b1fd-bd3d4c239221'
      };
      try {
        const result = dal._getPayloadForDeletedWatchlistEvent(context, input);
        expect(result).toEqual(data);
      } catch (err) {
        expect(err).toBeUndefined();
      }
    });
  });
  describe('#emitNewWatchlistEvent', () => {
    it('should not throw when watchlist has no id (error path from failed creation)', async () => {
      // This simulates the catch block in bulkCreateWatchlists calling
      // emitNewWatchlistEvent with an id-less object when creation fails
      // before any DB write (e.g. checkWatchlistRange validation failure).
      let thrownError;
      try {
        await dal.emitNewWatchlistEvent(
          mockUtil.makeContext(),
          { errorMessage: 'The supplied startDateTime must be before the stopDateTime.' },
          null,
          null,
          { name: 'WatchListCreated', action: 'create', type: 'watchlist', event: 'watchlist_created' },
          new Error('The supplied startDateTime must be before the stopDateTime.')
        );
      } catch (err) {
        thrownError = err;
      }

      // must not throw — the internal event emission should be skipped silently
      expect(thrownError).toBeUndefined();
    });

    it('should emit only the public event (not the internal one) when watchlist has no id', async () => {
      await dal.emitNewWatchlistEvent(
        mockUtil.makeContext(),
        { name: 'Test', organizationId: '7682', errorMessage: 'validation failed' }, // no id
        null,
        null,
        { name: 'WatchListCreated', action: 'create', type: 'watchlist', event: 'watchlist_created' },
        new Error('validation failed')
      );

      const messages = serviceContext.messageUtil._messages();
      // only the public event should be emitted (actionInfo present),
      // the internal 'watchlist_created' event must NOT be emitted
      const internalEvent = messages.find((m) => m.event === 'watchlist_created' && !m.actionInfo);
      expect(internalEvent).toBeUndefined();
    });
  });
});
