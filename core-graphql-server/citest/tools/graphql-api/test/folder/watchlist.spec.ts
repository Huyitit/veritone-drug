import * as _ from 'lodash';

import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import { DayOfWeek, RootFolderType, SearchIndex } from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';
const testName = 'test_watchlist_' + Date.now();

let watchlistId: any,
  watchlistId1: any,
  watchlistId2: any,
  watchlistId3: any,
  watchlistId4: any;
let rootFolderId: any;
let subscriptionId: any;
let subscription2Id: any;
let subscription3Id: any;
let cognitiveSearchId: any;
let cognitiveSearch2Id: any;
let testSourceIds: any[] = [];
let testSourceTypeIds: any[] = [];

async function testBulkCreateWatchlist(
  client: GraphqlClient,
  useTokenAuth: boolean | string = false
) {
  const variables = {
    watchlists: [
      {
        stopDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        name: citestMarker + '-bulk_test_1_' + testName,
        cognitiveSearches: [
          {
            mentionStatusId: 1,
            profile: {
              and: [
                {
                  state: {
                    search: 'foo',
                    language: 'en'
                  },
                  engineCategoryId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
                }
              ]
            }
          }
        ],
        parentFolderId: rootFolderId,
        sourceIds: testSourceIds,
        subscriptions: [
          {
            scheduledDay: 'Sunday',
            scheduledTime: '07:11:22',
            scheduledTimeZone: 'EST',
            contact: {
              emailAddress: 'test@bar.com',
              phoneNumber: '123-445-5678'
            }
          }
        ]
      },
      {
        stopDateTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        name: citestMarker + '-bulk_test_2_' + testName,
        cognitiveSearches: [
          {
            mentionStatusId: 1,
            profile: {
              and: [
                {
                  state: {
                    search: 'foo1',
                    language: 'fr'
                  },
                  engineCategoryId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
                }
              ]
            }
          }
        ],
        parentFolderId: rootFolderId,
        sourceIds: testSourceIds,
        subscriptions: [
          {
            scheduledDay: 'Friday',
            scheduledTime: '09:11:22',
            scheduledTimeZone: 'EST',
            contact: {
              emailAddress: 'test+foo@bar.com',
              phoneNumber: '123-445-1234'
            }
          }
        ]
      }
    ]
  };
  const query = `
    mutation bulkCreateWatchlist($watchlists: [CreateWatchlist!]){
      bulkCreateWatchlist(input: {
        watchlists: $watchlists
      }) {
        records {
          id
          stopDateTime
          name
          cognitiveSearches {
            id
            mentionStatusId
          }
          folders {
            id
            treeObjectId
            name
          }
          sourceIds
          subscriptions {
            id
            scheduledDay
            scheduledTime
            scheduledTimeZone
            contact {
              emailAddress
              phoneNumber
            }
          }
        }
      }
    }
  `;
  try {
    const result: any = await client.query(query, variables);

    expect(result.bulkCreateWatchlist).toBeDefined();
    expect(result.bulkCreateWatchlist.records.length).toEqual(2);

    const records = result.bulkCreateWatchlist.records;

    for (const watchlist of records) {
      if (
        watchlist.name &&
        watchlist.name === citestMarker + '-bulk_test_1_' + testName
      ) {
        if (useTokenAuth === 'testToken') {
          watchlistId3 = watchlist.id;
        } else {
          watchlistId1 = watchlist.id;
        }
      } else {
        if (useTokenAuth === 'testToken') {
          watchlistId4 = watchlist.id;
        } else {
          watchlistId2 = watchlist.id;
        }
      }

      expect(watchlist.stopDateTime).toBeDefined();
      expect(watchlist.cognitiveSearches.length).toEqual(1);
      expect(watchlist.folders.length).toEqual(1);
      expect(watchlist.folders[0].id).toEqual(rootFolderId);
      expect(watchlist.sourceIds.length).toEqual(2);
      expect(watchlist.subscriptions.length).toEqual(1);
    }
  } catch (err: any) {
    // in case org.kvp.features.globalMedia is not enabled
    if (
      err.message &&
      err.message.includes('not_allowed', 0) &&
      err.message.includes('globalMedia', 0)
    ) {
      expect(err.message).toContain(
        'The organization is not provisioned to allow global media access.'
      );
    }
  }
}

describe('citest_folder: Watchlist tests', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);

    await isolatedSuperadmin.client.sdk.createRootFolders({
      rootFolderType: RootFolderType.Watchlist
    });

    const testSourcesResult: any = await isolatedSuperadmin.client.sdk.sources({
      name: 'test'
    });
    const testSources = (
      _.get(testSourcesResult, 'data.sources.records') || []
    ).map((tS: any) => tS);

    testSources.splice(2);
    testSourceIds = testSources.map((tS: any) => _.get(tS, 'id'));
    testSourceTypeIds = _.union(
      testSources.map((tS: any) => +_.get(tS, 'sourceType.id'))
    );
  });

  afterAll(async () => {
    // Delete remaining watchlists
    const watchlistIds = [
      watchlistId,
      watchlistId1,
      watchlistId2,
      watchlistId3,
      watchlistId4
    ].filter((id) => id);
    for (const id of watchlistIds) {
      await safe(`delete watchlist ${id}`, async () =>
        isolatedSuperadmin.client.sdk.deleteWatchlist({ id })
      );
    }

    // Delete remaining subscriptions
    const subscriptionIds = [
      subscriptionId,
      subscription2Id,
      subscription3Id
    ].filter((id) => id);
    for (const id of subscriptionIds) {
      await safe(`delete subscription ${id}`, async () => {
        await isolatedSuperadmin.client.sdk.deleteSubscription({ id });
      });
    }

    // Delete cognitive searches
    const cognitiveSearchIds = [cognitiveSearchId, cognitiveSearch2Id].filter(
      (id) => id
    );
    for (const id of cognitiveSearchIds) {
      await safe(`delete cognitive search ${id}`, async () => {
        await isolatedSuperadmin.client.sdk.deleteCognitiveSearch({ id });
      });
    }

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  it('should get watchlist root folder ID', async () => {
    const res = await isolatedSuperadmin.client.sdk.rootFolders({
      rootFolderType: RootFolderType.Watchlist
    });
    const rootFolders = res?.data?.rootFolders ?? [];
    expect(rootFolders[0]?.id).toBeDefined();
    rootFolderId = rootFolders[0]?.id;
  });

  it('should fail to create on invalid dates', async () => {
    const dateNow = new Date();
    // note that on dev the test org was configured with a 3-year span
    const start = new Date(
      dateNow.getTime() - 1400 * 24 * 60 * 60 * 1000
    ).toISOString();
    const stop = dateNow.toISOString();

    const vars = {
      stopDateTime: stop
    };
    await expect(async () =>
      isolatedSuperadmin.client.sdk.createWatchlist({
        input: {
          searchIndex: SearchIndex.Mine,
          stopDateTime: vars.stopDateTime,
          startDateTime: start,
          name: `${citestMarker}-${testName}-bad`,
          parentFolderId: rootFolderId,
          cognitiveSearches: [
            {
              mentionStatusId: '1',
              jsonstring:
                '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
            }
          ]
        }
      })
    ).rejects.toThrow(
      /The watchlist start date is earlier than the earliest allowed for your organization|The watchlist duration exceeds the maximum number .* set for your organization/
    );
  });

  it('should fail to create on invalid dates - too old', async () => {
    const dateNow = Date.now();
    const start = dateNow - 7 * 365 * 24 * 60 * 60 * 1000;
    const stop = start + 30 * 24 * 60 * 60 * 1000;

    const vars = {
      stopDateTime: new Date(stop).toISOString()
    };
    await expect(async () =>
      isolatedSuperadmin.client.sdk.createWatchlist({
        input: {
          searchIndex: SearchIndex.Mine,
          stopDateTime: vars.stopDateTime,
          name: `${citestMarker}-${testName}-bad`,
          sourceTypeIds: ['1', '2', '5'],
          sourceIds: ['23355', '179'],
          cognitiveSearches: [
            {
              mentionStatusId: '1',
              jsonstring:
                '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
            }
          ]
        }
      })
    ).rejects.toThrow(
      /The supplied startDateTime must be before the stopDateTime./
    );
  });

  it('should create a watchlist', async () => {
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
    const stop = Date.now() + 90 * 24 * 60 * 60 * 1000;

    const query = `
    mutation createWatchlist($details: JSONData, $cogSearch2: CreateCognitiveSearchInWatchlist!){
      createWatchlist(input: {
        searchIndex: mine
        stopDateTime: "${new Date(stop).toISOString()}"
        name: "${citestMarker}-${testName}"
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
    const result: any = await isolatedSuperadmin.client.query(query, variables);
    expect(result.createWatchlist).toBeDefined();
    watchlistId = result.createWatchlist.id;
    cognitiveSearchId = _.get(
      result,
      'createWatchlist.cognitiveSearches[0].id'
    );
    expect(cognitiveSearchId).toBeDefined();
    expect(_.get(result, 'createWatchlist.searchIndex')).toEqual('mine');
    expect(_.get(result, 'createWatchlist.subscriptions[0].id')).toBeDefined();
    expect(_.get(result, 'createWatchlist.details.programIds')).toEqual(
      expect.arrayContaining(['-1'])
    );
    expect(
      _.get(result, 'createWatchlist.cognitiveSearches[0].mentionStatusId')
    ).toBeDefined();
    expect(
      _.get(result, 'createWatchlist.cognitiveSearches[1].mentionStatusId')
    ).toBeDefined();
  });

  it('should return clear validation error when stopDateTime is before startDateTime', async () => {
    const stop = 1767178372;

    const variables = {
      stopDateTime: stop
    };

    await expect(async () =>
      isolatedSuperadmin.client.sdk.createWatchlist({
        input: {
          parentFolderId: rootFolderId,
          name: `${citestMarker}-${testName}-Test`,
          stopDateTime: variables.stopDateTime
        }
      })
    ).rejects.toThrow(
      /The supplied startDateTime must be before the stopDateTime\./
    );
  });

  it('should create watchlists in bulk - userToken', async () => {
    await testBulkCreateWatchlist(isolatedSuperadmin.client);
  });

  it('should create watchlists in bulk - apiToken', async () => {
    await testBulkCreateWatchlist(isolatedSuperadmin.client, 'testToken');
  });

  it('should fail on invalid source type id input', async () => {
    const query = `
    mutation {
      createWatchlist(input: {
        stopDateTime: "2019-12-28T22:48:57.000Z"
        name: "${citestMarker}-${testName}"
        sourceTypeIds: [1, 2, "foo"]
        cognitiveSearches: [
          {
            mentionStatusId: 1
            profile: {
              condition: {
                engineCategoryId: "foo"
                state: {
                  foo: "bar"
                }
              }
            }
          },
            {
          mentionStatusId: 1
          profile: {
            or: [ {
              condition: {
                engineCategoryId: "foo4"
                state: {
                  foo4: "bar"
                }
              }
            }, {
              and: [ {
                condition: {
                  engineCategoryId: "foo2"
                  state: {
                    foo2: "bar"
                  }
                }
              }, {
                condition: {
                  engineCategoryId: "foo3"
                  state: {
                    foo3: "bar"
                  }
                }
              }
            ]
          }
          ]
        }}]
      }) {
        id

        cognitiveSearches {
          id
            mentionStatusId
            mentionStatus {
              id
              name
            }
          profile
      }
      }
    }
`;

    await expect(async () =>
      isolatedSuperadmin.client.query(query)
    ).rejects.toThrow(
      /The supplied startDateTime must be before the stopDateTime./
    );
  });

  it('should create a subscription', async () => {
    const res = await isolatedSuperadmin.client.sdk.createSubscription({
      input: {
        targetId: watchlistId,
        scheduledDay: DayOfWeek.Monday,
        scheduledTime: '10:10:10',
        contact: {
          emailAddress: 'foo@bar.com',
          phoneNumber: '555-555-5555'
        }
      }
    });

    subscriptionId = res?.data?.createSubscription?.id;
    expect(subscriptionId).toBeDefined();
  });

  it('should create another subscription', async () => {
    const res = await isolatedSuperadmin.client.sdk.createSubscription({
      input: {
        targetId: watchlistId,
        scheduledDay: DayOfWeek.Tuesday,
        scheduledTime: '10:10:20',
        scheduledTimeZone: 'PST',
        contact: {
          emailAddress: 'foo@bar.com',
          phoneNumber: '555-555-6666'
        }
      }
    });

    subscription2Id = res?.data?.createSubscription?.id;
    expect(subscription2Id).toBeDefined();
  });

  it('should create a CSP', async () => {
    const res = await isolatedSuperadmin.client.sdk.createCognitiveSearch({
      input: {
        watchlistId,
        mentionStatusId: '1',
        profile: {
          and: [
            {
              state: {
                search: 'foobar',
                language: 'en'
              },
              engineCategoryId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
            }
          ]
        }
      }
    });

    cognitiveSearch2Id = res?.data?.createCognitiveSearch?.id;
    expect(cognitiveSearch2Id).toBeDefined();
    expect(res?.data?.createCognitiveSearch?.query).toBeDefined();
  });

  it('should update a CSP', async () => {
    const res = await isolatedSuperadmin.client.sdk.updateCognitiveSearch({
      input: {
        id: cognitiveSearch2Id,
        mentionStatusId: '2',
        jsonstring:
          '{"and":[{"state":{"search":"foobaz","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
      }
    });

    expect(res?.data?.updateCognitiveSearch?.id).toEqual(cognitiveSearch2Id);
    expect(res?.data?.updateCognitiveSearch?.mentionStatusId).toEqual('2');
    const sq = res?.data?.updateCognitiveSearch?.query;

    expect(sq).toBeDefined();
    expect(JSON.stringify(sq).includes('foobaz')).toEqual(true);
  });

  it('should get a watchlist', async () => {
    const query = `
      query {
        byName: watchlists(name: "${testName}" isDisabled: false limit:1) { count }
        q2: watchlist(id: ${watchlistId}) {
            id
            details
            name
            combinedSourceTypeIds
            sourceTypeIds
            query
            schedules {
       records {
         id
         sources {
           records {
             sourceTypeId
             id
           }
         }
       }
     }
          sourceIds
            cognitiveSearches {
              query
              id
              mentionStatus {
                id
                name
              }
              profile
              mentionStatusId
            }
            modifiedDateTime
            createdDateTime
            startDateTime
            stopDateTime

            folders {
              id
            }

            subscriptions {
              id
              createdDateTime
              modifiedDateTime
              jsondata
              isActive
              scheduledDay
              scheduledTime
              contact  {
                emailAddress
                webhookUri
                phoneNumber
              }

            }
        }

        q1: watchlists(orderBy: modifiedDateTime, limit:2) {
          records {
            id
            name
            cognitiveSearches {
              id
              profile
            }
            organizationId
            sourceTypeIds
            folders {
              id
            }
          }
          count
          offset
          limit
        }
      }
`;

    const result: any = await isolatedSuperadmin.client.query(query);

    expect(result.q1).toBeDefined();
    expect(_.get(result, 'byName.count')).toEqual(1);
    expect(_.get(result, 'q1.records[0].id')).toBeDefined();
    expect(_.get(result, 'q2.id')).toBeDefined();
    expect(_.get(result, 'q2.query')).toBeDefined();

    expect(_.get(result, 'q2.cognitiveSearches[0].profile')).toBeDefined();
    expect(
      _.get(result, 'q2.cognitiveSearches[0].mentionStatus.name')
    ).toBeDefined();
    expect(_.get(result, 'q2.cognitiveSearches[0].mentionStatus.id')).toEqual(
      '1'
    );
    expect(_.get(result, 'q2.cognitiveSearches[0].mentionStatusId')).toEqual(
      '1'
    );
    expect(_.get(result, 'q2.details.foo')).toEqual('bar');
    expect(_.get(result, 'q2.details.targetAudience.foo')).toEqual('bar');
    //expect(_.get(result,'q2.folders[0].id')).toEqual(rootFolderId);
    expect(_.get(result, 'q2.cognitiveSearches[0].query')).toBeDefined();

    expect(_.get(result, 'q2.subscriptions[0].id')).toBeDefined();
    expect(_.get(result, 'q2.subscriptions[0].jsondata')).toBeDefined();
    expect(_.get(result, 'q2.subscriptions[0].scheduledDay')).toBeDefined();
    expect(_.get(result, 'q2.details.programIds').includes('-1')).toEqual(true);
  });

  it('should disable a watchlist', async () => {
    const result: any = await isolatedSuperadmin.client.sdk.updateWatchlist({
      input: {
        isDisabled: true,
        id: watchlistId
      }
    });

    expect(result.data.updateWatchlist).toBeDefined();
    expect(_.get(result, 'data.updateWatchlist.id')).toEqual(watchlistId);
    expect(_.get(result, 'data.updateWatchlist.isDisabled')).toEqual(true);
  });

  it('should update a watchlist', async () => {
    const irrelevantSourceTypeIds = Array.from(Array(30).keys());
    const sourcesLength = testSourceTypeIds.length;
    let i = 0;
    while (sourcesLength === testSourceTypeIds.length) {
      if (!testSourceIds.find((tS) => tS === irrelevantSourceTypeIds[i])) {
        testSourceTypeIds.push(irrelevantSourceTypeIds[i]);
        return;
      }
      i++;
    }
    const name2 = citestMarker + '-' + testName + '-2';

    const result: any = await isolatedSuperadmin.client.sdk.updateWatchlist({
      input: {
        isDisabled: false,
        id: watchlistId,
        name: name2,
        details: {
          foo: 'bar2',
          targetAudience: {
            foo: 'bar2'
          },
          programIds: [-1]
        },
        searchIndex: SearchIndex.Mine,
        sourceTypeIds: testSourceTypeIds,
        sourceIds: testSourceIds,
        cognitiveSearches: [
          {
            mentionStatusId: '1',
            jsonstring:
              '{"and":[{"state":{"search":"foo2","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
          }
        ]
      }
    });

    expect(result.data.updateWatchlist).toBeDefined();
    cognitiveSearchId = _.get(
      result,
      'data.updateWatchlist.cognitiveSearches[0].id'
    );
    expect(cognitiveSearchId).toBeDefined();
    expect(_.get(result, 'data.updateWatchlist.id')).toEqual(watchlistId);
    expect(_.get(result, 'data.updateWatchlist.name')).toEqual(name2);
    expect(_.get(result, 'data.updateWatchlist.details.foo')).toEqual('bar2');
    expect(
      _.get(result, 'data.updateWatchlist.details.targetAudience.foo')
    ).toEqual('bar2');
    expect(_.get(result, 'data.updateWatchlist.searchIndex')).toEqual('mine');
    expect(_.get(result, 'data.updateWatchlist.sourceTypeIds')).toEqual([
      irrelevantSourceTypeIds[i].toString()
    ]); // only the sourceTypeId not related to an input source
    expect(_.get(result, 'data.updateWatchlist.details.programIds')).toEqual(
      expect.arrayContaining(['-1'])
    );
    expect(_.get(result, 'data.updateWatchlist.isDisabled')).toEqual(false);
  });

  it('should fail update watchlist on invalid dates', async () => {
    const dateNow = Date.now();
    const start = dateNow - 10 * 365 * 24 * 60 * 60 * 1000;

    await expect(async () =>
      isolatedSuperadmin.client.sdk.updateWatchlist({
        input: {
          id: watchlistId,
          stopDateTime: `${new Date(dateNow).toISOString()}`,
          startDateTime: `${new Date(start).toISOString()}`
        }
      })
    ).rejects.toThrow('invalid_input');
  });

  it('should find both watchlist and subscription and CSP', async () => {
    const query = `
      query {
        watchlist(id: ${watchlistId}) {
          id
        }
        subscription(id: ${subscriptionId}) {
          id
        }
        cognitiveSearch(id: ${cognitiveSearchId}) {
          id
        }
      }
  `;

    const result: any = await isolatedSuperadmin.client.query(query);

    expect(_.get(result, 'watchlist.id')).toEqual(watchlistId);
    expect(_.get(result, 'subscription.id')).toEqual(subscriptionId);
    expect(_.get(result, 'cognitiveSearch.id')).toEqual(cognitiveSearchId);
  });

  it('should delete a subscription', async () => {
    const result: any = await isolatedSuperadmin.client.sdk.deleteSubscription({
      id: subscriptionId
    });

    expect(_.get(result, 'data.deleteSubscription.id')).toEqual(subscriptionId);
  });

  it('should update a watchlist subscription by insert new subscriptions', async () => {
    const name2 = citestMarker + '-' + testName + '-2';
    const subscriptions = [
      {
        contact: {
          emailAddress: 'email1@domain.com',
          phoneNumber: '111-111-1111',
          webhookUri: 'http://website.com'
        }
      },
      {
        contact: {
          emailAddress: 'email2@domain.com',
          phoneNumber: '222-222-2222'
        }
      }
    ];

    const result: any = await isolatedSuperadmin.client.sdk.updateWatchlist({
      input: {
        id: watchlistId,
        name: name2,
        subscriptions
      }
    });
    expect(result.data.updateWatchlist).toBeDefined();

    let resSubs = _.get(result, 'data.updateWatchlist.subscriptions');
    expect(resSubs).toBeDefined();
    resSubs = _.sortBy(resSubs, ['contact.emailAddress']);
    expect(resSubs).toHaveLength(2);
    expect(resSubs[0].contact.emailAddress).toEqual('email1@domain.com');
    expect(resSubs[0].contact.phoneNumber).toEqual('111-111-1111');
    expect(resSubs[0].contact.webhookUri).toEqual('http://website.com');
    subscription3Id = resSubs[1].id;
    expect(_.get(result, 'data.updateWatchlist.id')).toEqual(watchlistId);
    expect(_.get(result, 'data.updateWatchlist.name')).toEqual(name2);
  });

  it('should update a watchlist subscription by update existing and delete non-user-input subscriptions', async () => {
    const newWatchlistName = citestMarker + '-' + testName + '-edit';
    const subscriptions = [
      {
        contact: {
          emailAddress: 'email2@domain.com',
          phoneNumber: '999-999-9999',
          webhookUri: 'http://website9.com'
        }
      },
      {
        contact: {
          emailAddress: 'email3@domain.com',
          phoneNumber: '222-222-2222'
        }
      }
    ];

    const result: any = await isolatedSuperadmin.client.sdk.updateWatchlist({
      input: {
        id: watchlistId,
        name: newWatchlistName,
        subscriptions
      }
    });

    expect(result.data.updateWatchlist).toBeDefined();

    let resSubs = _.get(result, 'data.updateWatchlist.subscriptions');
    resSubs = _.sortBy(resSubs, ['contact.emailAddress']);
    expect(resSubs).toBeDefined();
    expect(resSubs).toHaveLength(2);
    expect(resSubs[0].contact.emailAddress).toEqual('email2@domain.com');
    expect(resSubs[0].contact.phoneNumber).toEqual('999-999-9999');
    expect(resSubs[0].contact.webhookUri).toEqual('http://website9.com');
    expect(resSubs[0].id).toEqual(subscription3Id);
    expect(resSubs[1].contact.emailAddress).toEqual('email3@domain.com');
    expect(resSubs[1].contact.phoneNumber).toEqual('222-222-2222');
  });

  it('should delete a cognitive search', async () => {
    const result: any =
      await isolatedSuperadmin.client.sdk.deleteCognitiveSearch({
        id: cognitiveSearch2Id
      });

    expect(_.get(result, 'data.deleteCognitiveSearch.id')).toEqual(
      cognitiveSearch2Id
    );
  });

  it('should delete a watchlist', async () => {
    const result: any = await isolatedSuperadmin.client.sdk.deleteWatchlist({
      id: watchlistId
    });

    expect(result.data.deleteWatchlist).toBeDefined();
    expect(result.data.deleteWatchlist.id).toEqual(watchlistId);
  });

  it('should delete watchlists', async () => {
    const watchlistIds = [
      watchlistId1,
      watchlistId2,
      watchlistId3,
      watchlistId4
    ];
    const items = [];
    for (let i = 0; i < watchlistIds.length; i++) {
      const id = watchlistIds[i];
      if (!id || id === '') {
        continue;
      }
      items.push(
        `
        deleteWatchlist${i + 1}: deleteWatchlist(id: "${id}") {
          id
          message
        }
        `
      );
    }
    if (items.length > 0) {
      const query = `
        mutation {
          ${items.join('')}
        }
      `;
      const result: any = await isolatedSuperadmin.client.query(query);

      if (watchlistId1) {
        expect(result.deleteWatchlist1).toBeDefined();
        expect(result.deleteWatchlist1.id).toEqual(watchlistId1);
      }
      if (watchlistId2) {
        expect(result.deleteWatchlist2).toBeDefined();
        expect(result.deleteWatchlist2.id).toEqual(watchlistId2);
      }
      if (watchlistId3) {
        expect(result.deleteWatchlist3).toBeDefined();
        expect(result.deleteWatchlist3.id).toEqual(watchlistId3);
      }
      if (watchlistId4) {
        expect(result.deleteWatchlist4).toBeDefined();
        expect(result.deleteWatchlist4.id).toEqual(watchlistId4);
      }
    }
  });

  it('should get mention status options', async () => {
    const result: any =
      await isolatedSuperadmin.client.sdk.mentionStatusOptions();

    expect(_.get(result, 'data.mentionStatusOptions')).toBeDefined();
    expect(_.get(result, 'data.mentionStatusOptions[0].id')).toBeDefined();
    expect(_.get(result, 'data.mentionStatusOptions[0].name')).toBeDefined();
  });

  it('should find both watchlist and subscription deleted', async () => {
    await expect(async () =>
      isolatedSuperadmin.client.sdk.watchlist({ id: watchlistId })
    ).rejects.toThrow('not_found');
  });

  it('should find both watchlist and subscription deleted', async () => {
    await expect(async () =>
      isolatedSuperadmin.client.sdk.subscription({ id: subscriptionId })
    ).rejects.toThrow('not_found');
  });

  it('should find both watchlist and subscription deleted', async () => {
    await expect(async () =>
      isolatedSuperadmin.client.sdk.subscription({ id: subscription2Id })
    ).rejects.toThrow('not_found');
  });
});
