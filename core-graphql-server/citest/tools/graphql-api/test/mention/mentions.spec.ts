import _ from 'lodash';

import { safe } from '../../src/helpers/commonHelper';
import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { OrganizationStatus, SearchIndex } from '../../src/gql';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

const config = helpers.config;
const citestGlobals = globalThis as unknown as { citestMarker?: string };
const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const addSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000);
const addMinutes = (d: Date, m: number) =>
  new Date(d.getTime() + m * 60 * 1000);

const tomorrow = new Date(Date.now() + ONE_DAY_MS);
const twoDaysAgo = new Date(Date.now() - 2 * ONE_DAY_MS);

const userSnippets = [
  {
    startTime: 19,
    endTime: 51,
    text: "5 percent off mattresses 40 percent off sheets and pillows that's on line of Brooklyn betting dot com or any of the 15 valley",
    transcriptStartDate: '2018-11-23T18:51:03.090Z',
    transcriptEndDate: '2018-11-23T18:55:23.600Z',
    snippets: [
      {
        text: '5 percent',
        startTime: 19,
        endTime: 22.22
      },
      {
        text: 'off sheets',
        startTime: 22.22,
        endTime: 22.23
      },
      {
        text: 'line of Brooklyn',
        startTime: 22.23,
        endTime: 25.25
      },
      {
        text: '15 valley',
        startTime: 25.26,
        endTime: 27.54
      }
    ]
  }
];

describe('citest_mention: mention test', () => {
  let isolatedSuperadmin: IsolatedSuperadmin;
  let gqlClient: GraphqlClient;
  let watchlistId: string;
  let mentionId: string;
  let mediaId: string;
  let currentUser: any;
  let shareTokenId: string;
  let mentionStart: Date;
  let mentionEnd: Date;
  const arrayMentionId: string[] = [];
  const arrayShareTokenId: string[] = [];
  let folderId: string;

  async function createWatchlist(): Promise<string> {
    // createWatchlist's generated selection includes `id`, which is all
    // this needs - use the SDK.
    const result = await gqlClient.sdk.createWatchlist({
      input: {
        searchIndex: SearchIndex.Mine,
        startDateTime: twoDaysAgo.toISOString(),
        stopDateTime: tomorrow.toISOString(),
        name: `${citestMarker}-ci-test-mentions`,
        sourceTypeIds: ['1', '2', '5'],
        cognitiveSearches: [
          {
            mentionStatusId: '1',
            jsonstring:
              '{"and":[{"state":{"search":"foo","language":"en"}, "engineCategoryId":"67cd4dd0-2f75-445d-a6f0-2f297d6cd182"}]}'
          }
        ]
      }
    });
    return result?.data?.createWatchlist?.id ?? '';
  }

  async function createTDO(): Promise<string> {
    // create 3 minute media. createTDO's generated selection includes `id`,
    // which is all this needs - use the SDK.
    const start = new Date(Date.now() - ONE_DAY_MS);
    const result = await gqlClient.sdk.createTDO({
      input: {
        status: 'uploaded',
        isPublic: true,
        startDateTime: start.toISOString(),
        stopDateTime: addMinutes(start, 3).toISOString()
      }
    });
    return result?.data?.createTDO?.id ?? '';
  }

  async function getCurrentUser(): Promise<any> {
    const result = await gqlClient.sdk.me();
    return _.get(result, 'data.me');
  }

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    gqlClient = isolatedSuperadmin.client;

    watchlistId = await createWatchlist();
    mediaId = await createTDO();
    currentUser = await getCurrentUser();

    expect(watchlistId).toBeDefined();
    expect(mediaId).toBeDefined();
    expect(currentUser).toBeDefined();
  });

  afterAll(async () => {
    // deleteWatchlist/deleteTDO's generated selections ({id, message} /
    // {id, message}) are more than sufficient - this cleanup never asserted
    // on the result - use the SDK for both.
    await safe('delete watchlist', () =>
      gqlClient.sdk.deleteWatchlist({ id: watchlistId })
    );
    await safe('delete tdo', () => gqlClient.sdk.deleteTDO({ id: mediaId }));
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

  it('create mentions in bulk - throw watchlist is obsolated', async () => {
    // createMentions' generated selection is a superset of what every test
    // in this file reads off the result, so the SDK is used for every
    // createMentions call in this file.
    let time = addSeconds(new Date(Date.now() - ONE_DAY_MS), 30);
    const hitEnd1 = addSeconds(time, 5);
    time = addSeconds(time, 20); // mention2 mentionDateTime (time.add(15,'s') after hitEnd1's +5s)
    const hitEnd2 = addSeconds(time, 5);
    // mention3 reuses the value left by mention2 (no `.add()` before use in
    // the legacy chain), then advances +5s for its own hitEndDateTime.
    const mention3Start = hitEnd2;
    const hitEnd3 = addSeconds(mention3Start, 5);

    await expect(
      gqlClient.sdk.createMentions({
        input: {
          mentions: [
            {
              mediaId,
              programId: '25451',
              watchlistId,
              mentionDateTime: addSeconds(
                new Date(Date.now() - ONE_DAY_MS),
                30
              ).toISOString(),
              mentionHitCount: 1,
              snippetsString:
                '[{"startTime":334.179,"endTime":390.179,"text":" $25 $21 $free minutes from the airport polo is what\'s happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy\'s listen to the remote Abro show for your chance to score a lunchtime treat try Wendy\'s new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that\'s what\'s on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we\'d all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"}]',
              cognitiveEngineResultsString:
                '{"stationPlayout":{"documentCommon":{"station":"WVEE","stationBand":"FM ","stationHeadline":"V-103","publicStationId":17992},"series":[{"start":335000,"end":359000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":24000,"spotType":30000,"ufId":"A00084227447","adHeadline":"","adText":"V103-WENDYS ON AIR","advertiser":"WH-WENDYS","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1509749435,"absoluteEnd":1509749459},{"start":359000,"end":390000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":41000,"spotType":30000,"ufId":"P00068567344","adHeadline":"","adText":"N/A","advertiser":"WRAITH","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1509749459,"absoluteEnd":1.5097495e9}]}}',
              hitStartDateTime: addSeconds(
                new Date(Date.now() - ONE_DAY_MS),
                30
              ).toISOString(),
              hitEndDateTime: hitEnd1.toISOString(),
              watchlistUpdatingTimestamp: 123
            },
            {
              mediaId,
              programId: '25451',
              watchlistId,
              mentionDateTime: time.toISOString(),
              mentionHitCount: 1,
              cognitiveEngineResultsString:
                '{"stationPlayout":[{"start":335000,"end":359000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":24000,"spotType":30000,"ufId":"A00084227447","adHeadline":"","adText":"V103-WENDYS ON AIR","advertiser":"WH-WENDYS","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1509749435,"absoluteEnd":1509749459},{"start":359000,"end":390000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":41000,"spotType":30000,"ufId":"P00068567344","adHeadline":"","adText":"N/A","advertiser":"WRAITH","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1509749459,"absoluteEnd":1.5097495e9}]}',
              hitStartDateTime: time.toISOString(),
              hitEndDateTime: hitEnd2.toISOString(),
              watchlistUpdatingTimestamp: 123
            },
            {
              mediaId,
              programId: '25451',
              watchlistId,
              mentionDateTime: mention3Start.toISOString(),
              mentionHitCount: 0,
              snippets: [
                {
                  startTime: 334.179,
                  endTime: 390.179,
                  text: "free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"
                }
              ],
              cognitiveEngineResults: {
                stationPlayout: {
                  documentCommon: {
                    station: 'WVEE',
                    stationBand: 'FM',
                    stationHeadline: 'V-103',
                    publicStationId: 17992
                  },
                  series: [
                    {
                      start: 335000,
                      end: 359000,
                      _is_query_hit_: true,
                      nextRadioEventType: 'campaign',
                      duration: 24000,
                      spotType: 30000,
                      ufId: 'A00084227447',
                      adHeadline: '',
                      adText: 'V103-WENDYS ON AIR',
                      advertiser: 'WH-WENDYS',
                      songArtist: '',
                      songTitle: '',
                      songAlbum: '',
                      absoluteStart: 1509749435,
                      absoluteEnd: 1509749459
                    }
                  ]
                }
              },
              hitStartDateTime: mention3Start.toISOString(),
              hitEndDateTime: hitEnd3.toISOString(),
              watchlistUpdatingTimestamp: 123
            }
          ]
        }
      })
    ).rejects.toThrow('resource_unavailable');
  });

  it('create mentions in bulk', async () => {
    let time = addSeconds(new Date(Date.now() - ONE_DAY_MS), 30);
    const hitEnd1 = addSeconds(time, 5);
    time = addSeconds(time, 20);
    const hitEnd2 = addSeconds(time, 5);
    const mention3Start = hitEnd2;
    const hitEnd3 = addSeconds(mention3Start, 5);

    const result = await gqlClient.sdk.createMentions({
      input: {
        mentions: [
          {
            mediaId,
            programId: '-1',
            watchlistId,
            mentionDateTime: addSeconds(
              new Date(Date.now() - ONE_DAY_MS),
              30
            ).toISOString(),
            mentionHitCount: 1,
            snippetsString:
              '[{"startTime":334.179,"endTime":390.179,"text":" $25 $21 $free minutes from the airport polo is what\'s happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy\'s listen to the remote Abro show for your chance to score a lunchtime treat try Wendy\'s new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that\'s what\'s on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we\'d all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"}]',
            cognitiveEngineResultsString:
              '{"stationPlayout":{"documentCommon":{"station":"WVEE","stationBand":"FM ","stationHeadline":"V-103","publicStationId":17992},"series":[{"start":335000,"end":359000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":24000,"spotType":30000,"ufId":"A00084227447","adHeadline":"","adText":"V103-WENDYS ON AIR","advertiser":"WH-WENDYS","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1509749435,"absoluteEnd":1509749459},{"start":359000,"end":390000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":41000,"spotType":30000,"ufId":"P00068567344","adHeadline":"","adText":"N/A","advertiser":"WRAITH","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1509749459,"absoluteEnd":1.5097495e9}]}}',
            hitStartDateTime: addSeconds(
              new Date(Date.now() - ONE_DAY_MS),
              30
            ).toISOString(),
            hitEndDateTime: hitEnd1.toISOString()
          },
          {
            mediaId,
            programId: '-1',
            watchlistId,
            mentionDateTime: time.toISOString(),
            mentionHitCount: 1,
            cognitiveEngineResultsString:
              '{"stationPlayout":[{"start":335000,"end":359000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":24000,"spotType":30000,"ufId":"A00084227447","adHeadline":"","adText":"V103-WENDYS ON AIR","advertiser":"WH-WENDYS","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1509749435,"absoluteEnd":1509749459},{"start":359000,"end":390000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":41000,"spotType":30000,"ufId":"P00068567344","adHeadline":"","adText":"N/A","advertiser":"WRAITH","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1509749459,"absoluteEnd":1.5097495e9}]}',
            hitStartDateTime: time.toISOString(),
            hitEndDateTime: hitEnd2.toISOString()
          },
          {
            mediaId,
            programId: '-1',
            watchlistId,
            mentionDateTime: mention3Start.toISOString(),
            mentionHitCount: 0,
            snippets: [
              {
                startTime: 334.179,
                endTime: 390.179,
                text: "free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"
              }
            ],
            cognitiveEngineResults: {
              stationPlayout: {
                documentCommon: {
                  station: 'WVEE',
                  stationBand: 'FM',
                  stationHeadline: 'V-103',
                  publicStationId: 17992
                },
                series: [
                  {
                    start: 335000,
                    end: 359000,
                    _is_query_hit_: true,
                    nextRadioEventType: 'campaign',
                    duration: 24000,
                    spotType: 30000,
                    ufId: 'A00084227447',
                    adHeadline: '',
                    adText: 'V103-WENDYS ON AIR',
                    advertiser: 'WH-WENDYS',
                    songArtist: '',
                    songTitle: '',
                    songAlbum: '',
                    absoluteStart: 1509749435,
                    absoluteEnd: 1509749459
                  }
                ]
              }
            },
            hitStartDateTime: mention3Start.toISOString(),
            hitEndDateTime: hitEnd3.toISOString()
          }
        ]
      }
    });

    const records = result?.data?.createMentions?.records ?? [];

    if (records.length > 0) {
      records.forEach((mention: any) => {
        arrayMentionId.push(mention.id);
      });

      expect(records.length).toEqual(3);
      expect(records[0].watchlistId).toEqual(watchlistId);
      expect(records[1].watchlistId).toEqual(watchlistId);
      expect(records[2].mentionSnippets?.[0]?.startTime).toEqual(334.179);
      expect(
        (records[2].cognitiveEngineResults as any).stationPlayout.documentCommon
          .station
      ).toEqual('WVEE');
    }
  });

  it('create a single mention - throw watchlist is obsolated', async () => {
    mentionStart = addMinutes(new Date(Date.now() - ONE_DAY_MS), -4);
    mentionEnd = addSeconds(new Date(Date.now() - ONE_DAY_MS), 5);

    await expect(
      gqlClient.sdk.createMention({
        input: {
          mediaId,
          programId: '-1',
          watchlistId,
          mentionDateTime: mentionStart.toISOString(),
          mentionHitCount: 0,
          snippetsString:
            '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport polo is what\'s happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy\'s listen to the remote Abro show for your chance to score a lunchtime treat try Wendy\'s new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that\'s what\'s on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we\'d all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"}]',
          cognitiveEngineResultsString:
            '{"stationPlayout":{"documentCommon":{"station":"WVEE","stationBand":"FM ","stationHeadline":"V-103","publicStationId":17992},"series":[{"start":335000,"end":359000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":24000,"spotType":30000,"ufId":"A00084227447","adHeadline":"","adText":"V103-WENDYS ON AIR","advertiser":"WH-WENDYS","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1.509749435e+09,"absoluteEnd":1.509749459e+09},{"start":359000,"end":390000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":41000,"spotType":30000,"ufId":"P00068567344","adHeadline":"","adText":"N/A","advertiser":"WRAITH","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1.509749459e+09,"absoluteEnd":1.5097495e+09}]}}',
          hitStartDateTime: mentionStart.toISOString(),
          hitEndDateTime: mentionEnd.toISOString(),
          watchlistUpdatingTimestamp: 123
        }
      })
    ).rejects.toThrow('resource_unavailable');
  });

  it('create a single mention not in the cache', async () => {
    mentionStart = addMinutes(new Date(Date.now() - ONE_DAY_MS), -4);
    mentionEnd = addSeconds(new Date(Date.now() - ONE_DAY_MS), 5);

    const result = await gqlClient.sdk.createMention({
      input: {
        mediaId,
        programId: '-1',
        watchlistId,
        mentionDateTime: mentionStart.toISOString(),
        mentionHitCount: 0,
        snippetsString:
          '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport polo is what\'s happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy\'s listen to the remote Abro show for your chance to score a lunchtime treat try Wendy\'s new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that\'s what\'s on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we\'d all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"}]',
        cognitiveEngineResultsString:
          '{"stationPlayout":{"documentCommon":{"station":"WVEE","stationBand":"FM ","stationHeadline":"V-103","publicStationId":17992},"series":[{"start":335000,"end":359000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":24000,"spotType":30000,"ufId":"A00084227447","adHeadline":"","adText":"V103-WENDYS ON AIR","advertiser":"WH-WENDYS","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1.509749435e+09,"absoluteEnd":1.509749459e+09},{"start":359000,"end":390000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":41000,"spotType":30000,"ufId":"P00068567344","adHeadline":"","adText":"N/A","advertiser":"WRAITH","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1.509749459e+09,"absoluteEnd":1.5097495e+09}]}}',
        hitStartDateTime: mentionStart.toISOString(),
        hitEndDateTime: mentionEnd.toISOString()
      }
    });

    mentionId = _.get(result, 'data.createMention.id', '');
    expect(_.get(result, 'data.createMention.mentionSnippets.length')).toEqual(
      1
    );
    expect(_.get(result, 'data.createMention.watchlistId')).toEqual(
      watchlistId
    );
  });

  it('create mention from the cache', async () => {
    try {
      const result = await gqlClient.sdk.createMention({
        input: {
          mediaId,
          programId: '-1',
          watchlistId,
          mentionDateTime: mentionStart.toISOString(),
          mentionHitCount: 0,
          snippetsString:
            '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport polo is what\'s happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy\'s listen to the remote Abro show for your chance to score a lunchtime treat try Wendy\'s new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that\'s what\'s on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we\'d all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"}]',
          cognitiveEngineResultsString:
            '{"stationPlayout":{"documentCommon":{"station":"WVEE","stationBand":"FM ","stationHeadline":"V-103","publicStationId":17992},"series":[{"start":335000,"end":359000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":24000,"spotType":30000,"ufId":"A00084227447","adHeadline":"","adText":"V103-WENDYS ON AIR","advertiser":"WH-WENDYS","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1.509749435e+09,"absoluteEnd":1.509749459e+09},{"start":359000,"end":390000,"_is_query_hit_":true,"nextRadioEventType":"campaign","duration":41000,"spotType":30000,"ufId":"P00068567344","adHeadline":"","adText":"N/A","advertiser":"WRAITH","songArtist":"","songTitle":"","songAlbum":"","absoluteStart":1.509749459e+09,"absoluteEnd":1.5097495e+09}]}}',
          hitStartDateTime: mentionStart.toISOString(),
          hitEndDateTime: mentionEnd.toISOString()
        }
      });
      expect(_.get(result, 'data.createMention.watchlistId')).toEqual(
        watchlistId
      );
    } catch (err: any) {
      expect(err.message).toEqual(
        expect.stringContaining('Duplicate mention found')
      );
    }
  });

  it('update a mention', async () => {
    const result = await gqlClient.sdk.updateMention({
      input: {
        id: mentionId,
        adCreative: {
          title: citestMarker + 'my name title 2',
          isci: 'b',
          adId: '123'
        },
        privateNote: 'This is a private note',
        publicNote: 'This is a public note',
        complianceStatusId: '2',
        spotTypeId: '7',
        statusId: '2',
        userSnippets
      }
    });
    const updatedMention: any = _.get(result, 'data.updateMention', {});
    expect(updatedMention.id).toEqual(mentionId);
    expect(updatedMention.complianceStatusId).toEqual('2');
    expect(updatedMention.spotTypeId).toEqual('7');
    expect(updatedMention.statusId).toEqual('2');
    expect(updatedMention.adCreative.title).toEqual(
      citestMarker + 'my name title 2'
    );
    expect(updatedMention.userSnippets).toEqual(userSnippets);
  });

  /* FIXME: this operation requires "collections.mentions.update" permission
    ignoring SA or org admin permissions. Need to decide whether to account
    for higher level permissions or create citest user with all permissions
    supported at the moment
  */
  it('create a mention comment', async () => {
    const result = await gqlClient.sdk.createMentionComment({
      input: {
        mentionId,
        commentText: 'the new comment'
      }
    });

    const createMentionComment: any = _.get(
      result,
      'data.createMentionComment',
      {}
    );
    expect(createMentionComment.commentId).toBeDefined();
    expect(createMentionComment.commentText).toEqual('the new comment');
    expect(createMentionComment.userId).toEqual(currentUser.id);
    // Check this because the signedUri for imageUrl will generate different results for each call.
    // So it is impossible to compare them.
    if (currentUser.imageUrl) {
      expect(createMentionComment.userImage).toBeDefined();
    }
    expect(createMentionComment.firstName).toEqual(currentUser.firstName);
    expect(createMentionComment.lastName).toEqual(currentUser.lastName);
  });

  it('update a list of mentions', async () => {
    const result = await gqlClient.sdk.updateMentions({
      input: {
        ids: [mentionId],
        statusId: '3'
      }
    });
    const updatedMention = _.get(result, 'data.updateMentions', []);
    expect(updatedMention.length).toEqual(1);
    expect(updatedMention?.[0]?.statusId).toEqual('3');
    expect(updatedMention?.[0]?.id).toEqual(mentionId);
    expect(updatedMention?.[0]?.userSnippets).toEqual(userSnippets);
  });

  // fails in ai13s due to the reason in a fixme comment above
  it('query mentions', async () => {
    // `mentions`' generated variables have no orderBy/dateTimeFilter, and
    // `mention`'s generated selection has no `comments` sub-selection -
    // both stay raw queries.
    const query = `
    query {
      mentions(
        limit:1
        orderBy: [
          {field: mentionDate, direction: asc}
        ]

      dateTimeFilter: [
        {
          fromDateTime: "${twoDaysAgo.toISOString()}",
          field: mentionDate
        }
      ]) {
        count
        records {
          id
          mentionDate
        }
      }
      mention(mentionId: ${mentionId}) {
        id
        comments {
          count
          records {
            userId
            userImage
            firstName
            lastName
          }
        }
      }
    }
    `;

    const result = await gqlClient.query(query);

    expect(_.get(result, 'mentions.count')).toEqual(1);
    expect(_.get(result, 'mentions.records[0].id')).toBeDefined();
    expect(_.get(result, 'mention')).toBeDefined();
    expect(_.get(result, 'mention.id')).toEqual(mentionId);
    // Check the mention comment
    expect(_.get(result, 'mention.comments.count')).toEqual(1);
    expect(_.get(result, 'mention.comments.records[0].userId')).toEqual(
      currentUser.id
    );
    if (currentUser.imageUrl) {
      expect(
        _.get(result, 'mention.comments.records[0].userImage')
      ).toBeDefined();
    }
    expect(_.get(result, 'mention.comments.records[0].firstName')).toEqual(
      currentUser.firstName
    );
    expect(_.get(result, 'mention.comments.records[0].lastName')).toEqual(
      currentUser.lastName
    );
  });

  it('create a new mention without watchlist', async () => {
    try {
      const result = await gqlClient.sdk.createMention({
        input: {
          mediaId,
          programId: '75191',
          snippetsString:
            '[{"hits":[{"queryTerm":"football","startTime":453.419,"endTime":453.889}],"startTime":453.419,"endTime":483.071,"text":"football in the 80s that\'s true . Ivor Davies and John Farnham in the day they had Ripper mullet says Mark I\'m at Davis is getting a lot of traction here on the tex line he did have a superb mullet Elliott has written Ivor Davies of Ice House support it spotted an awesome curly mullet during the man of colours period and don\'t forget Dermot Brereton of the a a fellow vehicle at the time with the purple perm mullet . 0 yes I think Kate is on the phone and"}]',
          mentionHitCount: 1,
          mentionDateTime: mentionStart.toISOString(),
          cognitiveEngineResultsString: '{}',
          queryTerm: ''
        }
      });
      expect(_.get(result, 'data.createMention.id')).toBeDefined();
    } catch (err: any) {
      expect(String(err)).toEqual(
        expect.stringContaining('Duplicate mention found')
      );
    }
  });

  it('share mention to a recipient and get a share-token', async () => {
    const result = await gqlClient.sdk.shareMention({
      input: {
        mentionId,
        shareMessage: `${citestMarker}-ci-test share mention here`,
        recipients: [config.userName],
        shareOptions: {
          showImage: true,
          showComments: true,
          showRating: true,
          showHeader: true,
          showEngineResults: true,
          showHits: true,
          showAffiliateStripdown: true,
          showDownload: true,
          showDescription: true
        }
      }
    });

    expect(_.get(result, 'data.shareMention.id')).toBeDefined();
    shareTokenId = _.get(result, 'data.shareMention.id', '');
    expect(_.get(result, 'data.shareMention.mentionId')).toEqual(
      mentionId.toString()
    );
    expect(_.get(result, 'data.shareMention.mediaShare')).toBeDefined();
    expect(_.get(result, 'data.shareMention.mediaShare.token')).toBeDefined();
    expect(
      _.get(result, 'data.shareMention.mediaShare.isSegmented')
    ).toBeDefined();
  });

  it('share mention in bulk to a recipient and get share-token', async () => {
    const result = await gqlClient.sdk.shareMentionInBulk({
      input: {
        mentionIds: [mentionId],
        shareOptions: {
          showImage: true,
          showComments: true,
          showRating: true,
          showHeader: true,
          showEngineResults: true,
          showHits: true,
          showAffiliateStripdown: true,
          showDownload: true,
          showDescription: true
        }
      }
    });

    const results = _.get(result, 'data.shareMentionInBulk');
    expect(results?.length).toEqual(1);

    results?.forEach((res: any) => {
      expect(res.id).toBeDefined();
      expect(res.mentionId).toBeDefined();
      expect(res.mediaShare).toBeDefined();
      expect(res.mediaShare.token).toBeDefined();
      arrayShareTokenId.push(res.id);
    });
  });

  it('get shareMention detail by share-token', async () => {
    const result = await gqlClient.sdk.sharedMention({
      shareId: shareTokenId
    });

    expect(_.get(result, 'data.sharedMention.id')).toBeDefined();
    expect(_.get(result, 'data.sharedMention.id')).toEqual(
      mentionId.toString()
    );
    expect(_.get(result, 'data.sharedMention.organizationId')).not.toEqual(
      null
    );
    expect(_.get(result, 'data.sharedMention.organization')).not.toEqual(null);
    expect(_.get(result, 'data.sharedMention.organization.id')).toBeDefined();
    expect(_.get(result, 'data.sharedMention.scheduledJob')).toBeDefined();
    expect(_.get(result, 'data.sharedMention.share')).toBeDefined();
  });

  it('create new folder to test query mention with folderId', async () => {
    const result = await gqlClient.sdk.createCollection({
      input: {
        name: `${citestMarker}-hello`,
        image: 'https://s3.amazonaws.com/dev-api.veritone.com/testphoto.jpg',
        parentFolderId: ''
      }
    });
    folderId = result.data.createCollection!.id;
    expect(folderId).toBeDefined();
  });

  //FIXME: incomplete test
  // fails in ai13s due to the reason in a fixme comment above
  it('create new mention collection to test query mention with folderId', async () => {
    await gqlClient.sdk.createCollectionMention({
      input: {
        folderId,
        mentionId
      }
    });
  });

  // fails in ai13s due to the reason in a fixme comment above
  it('query mentions with folderId', async () => {
    const result = await gqlClient.sdk.mentions({ folderId });

    expect(_.get(result, 'data.mentions.count')).toEqual(1);
    expect(_.get(result, 'data.mentions.records[0].id')).toBeDefined();
    expect(_.get(result, 'data.mentions.records[0].id')).toEqual(mentionId);
  });

  it('delete folder after test query mentions by folderId', async () => {
    await gqlClient.sdk.deleteCollection({ id: folderId });
  });
});
