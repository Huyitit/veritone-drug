const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const { safe } = require('../../helpers/cleanup/utils');

const config = helpers.config;
const citestMarker = global.citestMarker || 'citest-should-delete';

const _ = require('lodash');
const testName = 'test_watchlist_' + Date.now();
const moment = require('moment');
let watchlistId, watchlistId1, watchlistId2, watchlistId3, watchlistId4;
let rootFolderId;
let subscriptionId;
let subscription2Id;
let subscription3Id;
let cognitiveSearchId;
let cognitiveSearch2Id;
let testSourceIds = [];
let testSourceTypeIds = [];

async function testBulkCreateWatchlist(gqlClient, useTokenAuth = false) {
  const variables = {
    watchlists: [
      {
        stopDateTime: moment().add(1, 'hour').toISOString(),
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
        stopDateTime: moment().add(10, 'minutes').toISOString(),
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
    const result = await gqlClient.query(query, variables);

    expect(result.bulkCreateWatchlist).toBeDefined();
    expect(result.bulkCreateWatchlist.records.length).toEqual(2);

    const records = result.bulkCreateWatchlist.records;

    for (const watchlist of records) {
      if (
        watchlist.name &&
        watchlist.name === citestMarker + '-bulk_test_1_' + testName
      ) {
        if (useTokenAuth == 'testToken') {
          watchlistId3 = watchlist.id;
        } else {
          watchlistId1 = watchlist.id;
        }
      } else {
        if (useTokenAuth == 'testToken') {
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
  } catch (err) {
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
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    const getTestSourcesQuery = `{
      sources (name: "test") {
        records {
          id          
          name
          sourceType {
            id
          }
        }
      }
    }`;
    const testSourcesResult = await gqlClient.query(getTestSourcesQuery);
    const testSources = (_.get(testSourcesResult, 'sources.records') || []).map(
      (tS) => tS
    );

    testSources.splice(2);
    testSourceIds = testSources.map((tS) => _.get(tS, 'id'));
    testSourceTypeIds = _.union(
      testSources.map((tS) => +_.get(tS, 'sourceType.id'))
    );
  });

  it('should get watchlist root folder ID', async () => {
    const query = `
    query {
      wf: rootFolders(type: watchlist) {
        id
      }
    }
    `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'wf[0].id')).toBeDefined();
    rootFolderId = result.wf[0].id;
  });

  it('should fail to create on invalid dates', async () => {
    const dateNow = moment();
    // note that on dev the test org was configured with a 3-year span
    const start = dateNow.subtract(1400, 'days').toISOString();
    const stop = dateNow.toISOString();
    const query = `
    mutation createWatchlist($stopDateTime: DateTime!){
      createWatchlist(input: {
        searchIndex: mine
        stopDateTime: $stopDateTime
        startDateTime: "${start}"
        name: "${citestMarker}-${testName}-bad"
        parentFolderId: "${rootFolderId}"
        cognitiveSearches: [
          {
            mentionStatusId: 1
            jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foo\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"
          }
        ]
      }) {
        id
        startDateTime
        stopDateTime
      }
    }
`;
    const vars = {
      stopDateTime: stop
    };
    await expect(async () => gqlClient.query(query, vars)).rejects.toThrow(
      /The watchlist start date is earlier than the earliest allowed for your organization./
    );
  });

  it('should fail to create on invalid dates - too old', async () => {
    const dateNow = Date.now();
    const start = dateNow - 7 * 365 * 24 * 60 * 60 * 1000;
    const stop = start + 30 * 24 * 60 * 60 * 1000;
    const query = `
    mutation createWatchlist($stopDateTime: DateTime!){
      createWatchlist(input: {
        searchIndex: mine
        stopDateTime: $stopDateTime
        name: "${citestMarker}-${testName}-bad"
        sourceTypeIds: [1, 2, 5]
        sourceIds: [23355, 179]
        cognitiveSearches: [
          {
            mentionStatusId: 1
            jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foo\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"
          },
        ]
      }) {
        id
      }
    }
`;
    const vars = {
      stopDateTime: `${moment(stop).toISOString()}`
    };
    await expect(async () => gqlClient.query(query, vars)).rejects.toThrow(
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
    const dateNow = Date.now();
    const stop = dateNow + 90 * 24 * 60 * 60 * 1000;

    const query = `
    mutation createWatchlist($details: JSONData, $cogSearch2: CreateCognitiveSearchInWatchlist!){
      createWatchlist(input: {
        searchIndex: mine
        stopDateTime: "${moment(stop).toISOString()}"
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
    const result = await gqlClient.query(query, variables);
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
      stopDateTime: stop,
    };

    const query = `
      mutation createWatchlist($stopDateTime: DateTime!) {
        createWatchlist(input: {
          parentFolderId: "${rootFolderId}"
          name: "${citestMarker}-${testName}-Test"
          stopDateTime: $stopDateTime
        }) {
          id
        }
      }
    `;

    await expect(async () => gqlClient.query(query, variables)).rejects.toThrow(
      /The supplied startDateTime must be before the stopDateTime\./
    );
  });

  it('should create watchlists in bulk - userToken', async () => {
    await testBulkCreateWatchlist(gqlClient);
  });

  it('should create watchlists in bulk - apiToken', async () => {
    await testBulkCreateWatchlist(gqlClient, 'testToken');
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

    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      /The supplied startDateTime must be before the stopDateTime./
    );
  });

  it('should create a subscription', async () => {
    const query = `
    mutation {
      createSubscription(input: {
        targetId: ${watchlistId}
        scheduledDay: Monday
        scheduledTime: "10:10:10"
        contact: {
          emailAddress: "foo@bar.com"
          phoneNumber: "555-555-5555"
        }
      }) {
        id
        jsondata
        targetId
        isActive
      }
    }
  `;
    const result = await gqlClient.query(query);

    subscriptionId = _.get(result, 'createSubscription.id');
    expect(subscriptionId).toBeDefined();
  });

  it('should create another subscription', async () => {
    const query = `
    mutation {
      createSubscription(input: {
        targetId: ${watchlistId}
        scheduledDay: Tuesday
        scheduledTime: "10:10:20"
        scheduledTimeZone: "PST"
        contact: {
          emailAddress: "foo@bar.com"
          phoneNumber: "555-555-6666"
        }
      }) {
        id
        jsondata
        targetId
        isActive
      }
    }
  `;
    const result = await gqlClient.query(query);

    subscription2Id = _.get(result, 'createSubscription.id');
    expect(subscription2Id).toBeDefined();
  });

  it('should create a CSP', async () => {
    const variables = JSON.stringify({
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
    });

    const query = `
    mutation createCognitiveSearch($profile: JSONData){
      createCognitiveSearch(input: {
        watchlistId: ${watchlistId}
        mentionStatusId: 1
        profile: $profile
      }) {
        id
        query
        profile
      }
    }
  `;
    const result = await gqlClient.query(query, variables);
    cognitiveSearch2Id = _.get(result, 'createCognitiveSearch.id');
    expect(cognitiveSearch2Id).toBeDefined();
    expect(_.get(result, 'createCognitiveSearch.query')).toBeDefined();
  });

  it('should update a CSP', async () => {
    const query = `
    mutation {
      updateCognitiveSearch(input: {
        id: ${cognitiveSearch2Id}
        mentionStatusId: 2
        jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foobaz\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"

      }) {
        id
        mentionStatusId
        profile
        query
      }
    }
  `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'updateCognitiveSearch.id')).toEqual(
      cognitiveSearch2Id
    );
    expect(_.get(result, 'updateCognitiveSearch.mentionStatusId')).toEqual('2');
    const sq = _.get(result, 'updateCognitiveSearch.query');

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

    const result = await gqlClient.query(query);

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
    const query = `
      mutation {
        updateWatchlist(input: {
          isDisabled: true
          id: ${watchlistId}
        }) {
          id
          isDisabled
        }
      }
`;

    const result = await gqlClient.query(query);

    expect(result.updateWatchlist).toBeDefined();
    expect(_.get(result, 'updateWatchlist.id')).toEqual(watchlistId);
    expect(_.get(result, 'updateWatchlist.isDisabled')).toEqual(true);
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
    let name2 = citestMarker + '-' + testName + '-2';
    const query = `
      mutation {
        updateWatchlist(input: {
          isDisabled: false
          id: ${watchlistId}
          name: "${name2}"
          details: {
            foo: "bar2"
            targetAudience: {
              foo: "bar2"
            }
            programIds: [-1]
          }
          searchIndex: mine
          sourceTypeIds: [${testSourceTypeIds}]
          sourceIds: [${testSourceIds}]
          cognitiveSearches: [
            {
              mentionStatusId: 1
              jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foo2\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"
            }
          ]
        }) {
          id
          name
          startDateTime
          stopDateTime
          modifiedDateTime
          createdDateTime
          sourceTypeIds
          sourceIds
          details
          searchIndex
          cognitiveSearches {
            id
          }
          isDisabled
        }
      }
`;

    const result = await gqlClient.query(query);

    expect(result.updateWatchlist).toBeDefined();
    cognitiveSearchId = _.get(
      result,
      'updateWatchlist.cognitiveSearches[0].id'
    );
    expect(cognitiveSearchId).toBeDefined();
    expect(_.get(result, 'updateWatchlist.id')).toEqual(watchlistId);
    expect(_.get(result, 'updateWatchlist.name')).toEqual(name2);
    expect(_.get(result, 'updateWatchlist.details.foo')).toEqual('bar2');
    expect(_.get(result, 'updateWatchlist.details.targetAudience.foo')).toEqual(
      'bar2'
    );
    expect(_.get(result, 'updateWatchlist.searchIndex')).toEqual('mine');
    expect(_.get(result, 'updateWatchlist.sourceTypeIds')).toEqual([
      irrelevantSourceTypeIds[i].toString()
    ]); // only the sourceTypeId not related to an input source
    expect(_.get(result, 'updateWatchlist.details.programIds')).toEqual(
      expect.arrayContaining(['-1'])
    );
    // Will enable after deploy the fix for Issue-440
    // expect(_.get(result, 'updateWatchlist.details.marketIds')).toEqual(
    //   expect.arrayContaining(['24', '87'])
    // );
    expect(_.get(result, 'updateWatchlist.isDisabled')).toEqual(false);
  });

  it('should fail update watchlist on invalid dates', async () => {
    const dateNow = Date.now();
    const start = dateNow - 10 * 365 * 24 * 60 * 60 * 1000;
    const query = `
      mutation {
        updateWatchlist(input: {
          id: ${watchlistId}
          stopDateTime: "${moment(dateNow).toISOString()}"
          startDateTime: "${moment(start).toISOString()}"
        }) {
          id
        }
      }
`;

    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'invalid_input'
    );
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

    const result = await gqlClient.query(query);

    expect(_.get(result, 'watchlist.id')).toEqual(watchlistId);
    expect(_.get(result, 'subscription.id')).toEqual(subscriptionId);
    expect(_.get(result, 'cognitiveSearch.id')).toEqual(cognitiveSearchId);
  });

  it('should delete a subscription', async () => {
    const query = `
      mutation {
        deleteSubscription(id: "${subscriptionId}") {
          id
          message
        }
      }
  `;

    const result = await gqlClient.query(query);

    expect(_.get(result, 'deleteSubscription.id')).toEqual(subscriptionId);
  });

  it('should update a watchlist subscription by insert new subscriptions', async () => {
    let name2 = citestMarker + '-' + testName + '-2';
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
    const query = `
        mutation($subscriptions: [CreateSubscriptionInWatchlist!]) {
          updateWatchlist(input: {
            id: ${watchlistId}
            name: "${name2}"
            subscriptions: $subscriptions
          }) {
            id
            name
            subscriptions {
              id
              contact {
                emailAddress
                phoneNumber
                webhookUri
              }
            }
          }
        }
      `;

    const result = await gqlClient.query(query, { subscriptions });
    expect(result.updateWatchlist).toBeDefined();

    let resSubs = _.get(result, 'updateWatchlist.subscriptions');
    expect(resSubs).toBeDefined();
    resSubs = _.sortBy(resSubs, ['contact.emailAddress']);
    expect(resSubs).toHaveLength(2);
    expect(resSubs[0].contact.emailAddress).toEqual('email1@domain.com');
    expect(resSubs[0].contact.phoneNumber).toEqual('111-111-1111');
    expect(resSubs[0].contact.webhookUri).toEqual('http://website.com');
    subscription3Id = resSubs[1].id;
    expect(_.get(result, 'updateWatchlist.id')).toEqual(watchlistId);
    expect(_.get(result, 'updateWatchlist.name')).toEqual(name2);
  });

  it('should update a watchlist subscription by update existing and delete non-user-input subscriptions', async () => {
    let newWatchlistName = citestMarker + '-' + testName + '-edit';
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
    const query = `
        mutation($subscriptions: [CreateSubscriptionInWatchlist!]) {
          updateWatchlist(input: {
            id: ${watchlistId}
            name: "${newWatchlistName}"
            subscriptions: $subscriptions
          }) {
            id
            name
            subscriptions {
              id
              contact {
                emailAddress
                phoneNumber
                webhookUri
              }
            }
          }
        }
      `;

    const result = await gqlClient.query(query, { subscriptions });

    expect(result.updateWatchlist).toBeDefined();

    let resSubs = _.get(result, 'updateWatchlist.subscriptions');
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
    const query = `
      mutation {
        deleteCognitiveSearch(id: "${cognitiveSearch2Id}") {
          id
          message
        }
      }
  `;

    const result = await gqlClient.query(query);

    expect(_.get(result, 'deleteCognitiveSearch.id')).toEqual(
      cognitiveSearch2Id
    );
  });

  it('should delete a watchlist', async () => {
    const query = `
mutation {
  deleteWatchlist(id: "${watchlistId}") {
    id
    message
  }
}
`;

    const result = await gqlClient.query(query);

    expect(result.deleteWatchlist).toBeDefined();
    expect(result.deleteWatchlist.id).toEqual(watchlistId);
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
      const watchlistId = watchlistIds[i];
      if (!watchlistId || watchlistId === '') {
        continue;
      }
      items.push(
        `
        deleteWatchlist${i + 1}: deleteWatchlist(id: "${watchlistId}") {
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
      const result = await gqlClient.query(query);

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
    const query = `
      query {
        mentionStatusOptions {
          id
          name
        }
      }
`;

    const result = await gqlClient.query(query);

    expect(_.get(result, 'mentionStatusOptions')).toBeDefined();
    expect(_.get(result, 'mentionStatusOptions[0].id')).toBeDefined();
    expect(_.get(result, 'mentionStatusOptions[0].name')).toBeDefined();
  });

  it('should find both watchlist and subscription deleted', async () => {
    const query = `
      query {
        wl: watchlist(id: ${watchlistId}) {
          id
        }
      }
  `;

    expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
  });

  it('should find both watchlist and subscription deleted', async () => {
    const query = `
      query {
        sub1: subscription(id: ${subscriptionId}) {
          id
        }
      }
  `;

    expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
  });

  it('should find both watchlist and subscription deleted', async () => {
    const query = `
      query {
        sub2: subscription(id: ${subscription2Id}) {
          id
        }
      }
  `;

    expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
  });

  afterAll(async () => {
    // Delete remaining watchlists
    const watchlistIds = [watchlistId, watchlistId1, watchlistId2, watchlistId3, watchlistId4].filter(id => id);
    for (const id of watchlistIds) {
      await safe(`delete watchlist ${id}`, async () => {
        const deleteWatchlistQuery = `mutation {
          deleteWatchlist(id: ${id}) {
            id
            message
          }
        }`;
        await gqlClient.query(deleteWatchlistQuery);
      });
    }

    // Delete remaining subscriptions
    const subscriptionIds = [subscriptionId, subscription2Id, subscription3Id].filter(id => id);
    for (const id of subscriptionIds) {
      await safe(`delete subscription ${id}`, async () => {
        const deleteSubscriptionQuery = `mutation {
          deleteSubscription(id: ${id}) {
            id
            message
          }
        }`;
        await gqlClient.query(deleteSubscriptionQuery);
      });
    }

    // Delete cognitive searches
    const cognitiveSearchIds = [cognitiveSearchId, cognitiveSearch2Id].filter(id => id);
    for (const id of cognitiveSearchIds) {
      await safe(`delete cognitive search ${id}`, async () => {
        const deleteCognitiveSearchQuery = `mutation {
          deleteCognitiveSearch(id: ${id}) {
            id
            message
          }
        }`;
        await gqlClient.query(deleteCognitiveSearchQuery);
      });
    }
  });
});
