const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');

const moment = require('moment');
const config = helpers.config;
const env = config.env;
const _ = require('lodash');

let mentionStart, mentionEnd;
let arrayMentionId = [];
let arrayShareTokenId = [];
let folderId;

const yesterday = moment.utc().subtract(1, 'd');
const tomorrow = moment.utc().add(1, 'd');
const twoDaysAgo = moment.utc().subtract(2, 'd');
const citestMarker = global.citestMarker || 'citest-should-delete';

const userSnippets = [
  {
    startTime: 19,
    endTime: 51,
    text:
      "5 percent off mattresses 40 percent off sheets and pillows that's on line of Brooklyn betting dot com or any of the 15 valley",
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
  let watchlistId;
  let mentionId;
  let mediaId;
  let currentUser;
  let shareTokenId;

  async function createWatchlist() {
    const query = `mutation {
      createWatchlist(input: {
        searchIndex: mine
        startDateTime: "${twoDaysAgo.toISOString()}"
        stopDateTime: "${tomorrow.toISOString()}"
        name: "${citestMarker}-ci-test-mentions"
        sourceTypeIds: [1, 2, 5]
        cognitiveSearches: [
          {
            mentionStatusId: 1
            jsonstring: "{\\"and\\":[{\\"state\\":{\\"search\\":\\"foo\\",\\"language\\":\\"en\\"}, \\"engineCategoryId\\":\\"67cd4dd0-2f75-445d-a6f0-2f297d6cd182\\"}]}"
          }
        ]
      }) {
        id
      }
    }`;

    const result = await gqlClient.query(query);
    return _.get(result, 'createWatchlist.id');
  }

  async function createTDO() {
    // create 3 minute media
    const time = moment.utc().subtract(1, 'day');
    const query = `mutation {
      createTDO(input: {
        status: "uploaded"
        isPublic: true
        startDateTime: "${time.toISOString()}"
        stopDateTime: "${time.add(3, 'm').toISOString()}"
      }) {
        id
      }
    }`;
    const result = await gqlClient.query(query);
    return _.get(result, 'createTDO.id');
  }

  async function getCurrentUser() {
    const query = `query {
      me {
        id
        name
        firstName
        lastName
        imageUrl
      }
    }`;

    const result = await gqlClient.query(query);
    return _.get(result, 'me');
  }

  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    watchlistId = await createWatchlist();
    mediaId = await createTDO();
    currentUser = await getCurrentUser();

    expect(watchlistId).toBeDefined();
    expect(mediaId).toBeDefined();
    expect(currentUser).toBeDefined();
  });

  afterAll(async () => {
    const queryWatchlist = `mutation {
      deleteWatchlist(id: "${watchlistId}"){ id }}`;
    const queryTdo = `mutation {
      deleteTDO(id: "${mediaId}"){ id }}`;

    await gqlClient.query(queryWatchlist);
    await gqlClient.query(queryTdo);
  });

  it('create mentions in bulk - throw watchlist is obsolated', async () => {
    const time = moment().utc().subtract(1, 'd').add(30, 's');
    const query = `
      mutation {
        createMentions(input: {
          mentions: [{
            mediaId: ${mediaId},
            programId: 25451,
            watchlistId: ${watchlistId},
            mentionDateTime: "${time.toISOString()}",
            mentionHitCount: 1,
            snippetsString: "[{\\"startTime\\":334.179,\\"endTime\\":390.179,\\"text\\":\\" $25 $21 $free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced\\"}]",
            cognitiveEngineResultsString: "{\\"stationPlayout\\":{\\"documentCommon\\":{\\"station\\":\\"WVEE\\",\\"stationBand\\":\\"FM \\",\\"stationHeadline\\":\\"V-103\\",\\"publicStationId\\":17992},\\"series\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}}"
            hitStartDateTime: "${time.toISOString()}"
            hitEndDateTime:"${time.add(5, 's').toISOString()}",
            watchlistUpdatingTimestamp: 123
          },
          {
            mediaId: ${mediaId},
            programId: 25451,
            watchlistId: ${watchlistId},
            mentionDateTime: "${time.add(15, 's').toISOString()}",
            mentionHitCount: 1,
            cognitiveEngineResultsString: "{\\"stationPlayout\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}"
            hitStartDateTime: "${time.toISOString()}",
            hitEndDateTime: "${time.add(5, 's').toISOString()}",
            watchlistUpdatingTimestamp: 123
          },
          {
            mediaId: ${mediaId},
            programId: 25451,
            watchlistId: ${watchlistId},
            mentionDateTime: "${time.toISOString()}",
            mentionHitCount: 0,
            snippets: [{startTime:334.179,endTime:390.179,text:"free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"}],
            cognitiveEngineResults: {stationPlayout:{documentCommon:{station:"WVEE",stationBand:"FM",stationHeadline:"V-103",publicStationId:17992},series:[{start:335000,end:359000,_is_query_hit_:true,nextRadioEventType:"campaign",duration:24000,spotType:30000,ufId:"A00084227447",adHeadline:"",adText:"V103-WENDYS ON AIR",advertiser:"WH-WENDYS",songArtist:"",songTitle:"",songAlbum:"",absoluteStart:1.509749435e+09,absoluteEnd:1.509749459e+09}]}}
            hitStartDateTime: "${time.toISOString()}"
            hitEndDateTime:"${time.add(5, 's').toISOString()}",
            watchlistUpdatingTimestamp: 123
          }]
        }) {
          records {
            id
            mentionDate
            organizationId
            brandId
            campaignId
            spotTypeId
            audienceMarketCount
            cognitiveEngineResults
            mentionSnippets {
              text
              startTime
              endTime
            }
            cognitiveEngineResults
            watchlistId
          }
        }
      }`;

    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'resource_unavailable'
    );
  });

  it('create mentions in bulk', async () => {
    const time = moment.utc().subtract(1, 'd').add(30, 's');
    // TODO remove hard-coded program ID
    const query = `
      mutation {
        createMentions(input: {
          mentions: [{
            mediaId: ${mediaId},
            programId: -1,
            watchlistId: ${watchlistId},
            mentionDateTime: "${time.toISOString()}",
            mentionHitCount: 1,
            snippetsString: "[{\\"startTime\\":334.179,\\"endTime\\":390.179,\\"text\\":\\" $25 $21 $free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced\\"}]",
            cognitiveEngineResultsString: "{\\"stationPlayout\\":{\\"documentCommon\\":{\\"station\\":\\"WVEE\\",\\"stationBand\\":\\"FM \\",\\"stationHeadline\\":\\"V-103\\",\\"publicStationId\\":17992},\\"series\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}}"
            hitStartDateTime: "${time.toISOString()}"
            hitEndDateTime:"${time.add(5, 's').toISOString()}"
          },
          {
            mediaId: ${mediaId},
            programId: -1,
            watchlistId: ${watchlistId},
            mentionDateTime: "${time.add(15, 's').toISOString()}",
            mentionHitCount: 1,
            cognitiveEngineResultsString: "{\\"stationPlayout\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}"
            hitStartDateTime: "${time.toISOString()}",
            hitEndDateTime: "${time.add(5, 's').toISOString()}",
          },
          {
            mediaId: ${mediaId},
            programId: -1,
            watchlistId: ${watchlistId},
            mentionDateTime: "${time.toISOString()}",
            mentionHitCount: 0,
            snippets: [{startTime:334.179,endTime:390.179,text:"free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced"}],
            cognitiveEngineResults: {stationPlayout:{documentCommon:{station:"WVEE",stationBand:"FM",stationHeadline:"V-103",publicStationId:17992},series:[{start:335000,end:359000,_is_query_hit_:true,nextRadioEventType:"campaign",duration:24000,spotType:30000,ufId:"A00084227447",adHeadline:"",adText:"V103-WENDYS ON AIR",advertiser:"WH-WENDYS",songArtist:"",songTitle:"",songAlbum:"",absoluteStart:1.509749435e+09,absoluteEnd:1.509749459e+09}]}}
            hitStartDateTime: "${time.toISOString()}"
            hitEndDateTime:"${time.add(5, 's').toISOString()}"
          }]
        }) {
          records {
            id
            mentionDate
            organizationId
            brandId
            campaignId
            spotTypeId
            audienceMarketCount
            cognitiveEngineResults
            mentionSnippets {
              text
              startTime
              endTime
            }
            cognitiveEngineResults
            watchlistId
          }
        }
      }`;

    const result = await gqlClient.query(query);

    const records = _.get(result, 'createMentions.records');

    if (records && records.length > 0) {
      records.forEach((mention) => {
        arrayMentionId.push(mention.id);
      });

      expect(records.length).toEqual(3);
      expect(records[0].watchlistId).toEqual(watchlistId);
      expect(records[1].watchlistId).toEqual(watchlistId);
      expect(records[2].mentionSnippets[0].startTime).toEqual(334.179);
      expect(
        records[2].cognitiveEngineResults.stationPlayout.documentCommon.station
      ).toEqual('WVEE');
    }
  });

  it('create a single mention - throw watchlist is obsolated', async () => {
    mentionStart = moment.utc().subtract(1, 'd').subtract(4, 'm');
    mentionEnd = moment.utc().subtract(1, 'd').add(5, 's');

    const query = `
      mutation {
        createMention(input: {
          mediaId: ${mediaId},
          programId: -1,
          watchlistId: ${watchlistId},
          mentionDateTime: "${mentionStart.toISOString()}",
          mentionHitCount: 0,
          snippetsString: "[{\\"startTime\\":334.179,\\"endTime\\":390.179,\\"text\\":\\"free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced\\"}]",
          cognitiveEngineResultsString: "{\\"stationPlayout\\":{\\"documentCommon\\":{\\"station\\":\\"WVEE\\",\\"stationBand\\":\\"FM \\",\\"stationHeadline\\":\\"V-103\\",\\"publicStationId\\":17992},\\"series\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}}"
          hitStartDateTime: "${mentionStart.toISOString()}"
          hitEndDateTime: "${mentionEnd.toISOString()}",
          watchlistUpdatingTimestamp: 123
        }) {
          id
          mentionDate
          organizationId
          brandId
          campaignId
          spotTypeId
          audienceMarketCount
          cognitiveEngineResults
          mentionSnippets {
            text
            startTime
            endTime
          }
          watchlistId
          statusId
        }
      }`;

    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'resource_unavailable'
    );
  });

  it('create a single mention not in the cache', async () => {
    mentionStart = moment.utc().subtract(1, 'd').subtract(4, 'm');
    mentionEnd = moment.utc().subtract(1, 'd').add(5, 's');
    const query = `
  mutation {
    createMention(input: {
      mediaId: ${mediaId},
      programId: -1,
      watchlistId: ${watchlistId},
      mentionDateTime: "${mentionStart.toISOString()}",
      mentionHitCount: 0,
      snippetsString: "[{\\"startTime\\":334.179,\\"endTime\\":390.179,\\"text\\":\\"free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced\\"}]",
      cognitiveEngineResultsString: "{\\"stationPlayout\\":{\\"documentCommon\\":{\\"station\\":\\"WVEE\\",\\"stationBand\\":\\"FM \\",\\"stationHeadline\\":\\"V-103\\",\\"publicStationId\\":17992},\\"series\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}}"
      hitStartDateTime: "${mentionStart.toISOString()}"
      hitEndDateTime: "${mentionEnd.toISOString()}"
    }) {
      id
      mentionDate
      organizationId
      brandId
      campaignId
      spotTypeId
      audienceMarketCount
      cognitiveEngineResults
      mentionSnippets {
        text
        startTime
        endTime
      }
      watchlistId
      statusId
    }
  }`;

    const result = await gqlClient.query(query);

    mentionId = _.get(result, 'createMention.id');
    expect(_.get(result, 'createMention.mentionSnippets.length')).toEqual(1);
    expect(_.get(result, 'createMention.watchlistId')).toEqual(watchlistId);
  });

  it('create mention from the cache', async () => {
    const query = `
  mutation {
    createMention(input: {
      mediaId: ${mediaId},
      programId: -1,
      watchlistId: ${watchlistId},
      mentionDateTime: "${mentionStart.toISOString()}",
      mentionHitCount: 0,
      snippetsString: "[{\\"startTime\\":334.179,\\"endTime\\":390.179,\\"text\\":\\"free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced\\"}]",
      cognitiveEngineResultsString: "{\\"stationPlayout\\":{\\"documentCommon\\":{\\"station\\":\\"WVEE\\",\\"stationBand\\":\\"FM \\",\\"stationHeadline\\":\\"V-103\\",\\"publicStationId\\":17992},\\"series\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}}"
      hitStartDateTime: "${mentionStart.toISOString()}"
      hitEndDateTime: "${mentionEnd.toISOString()}"
    }) {
      id
      mentionDate
      organizationId
      brandId
      campaignId
      spotTypeId
      audienceMarketCount
      cognitiveEngineResults
      mentionSnippets {
        text
        startTime
        endTime
      }
      watchlistId
    }
  }`;

    try {
      const result = await gqlClient.query(query);
      expect(
        _.get(result, 'createMention.watchlistId'),
        `result=${JSON.stringify(result, null, 2)}`
      ).toEqual(watchlistId);
    } catch (err) {
      expect(err.message, `err=${JSON.stringify(err, null, 2)}`).toEqual(
        expect.stringContaining('Duplicate mention found')
      );
    }
  });

  it('update a mention', async () => {
    const query = `
    mutation ($mention: UpdateMention!) {
      updateMention(input: $mention) {
        id
        adCreative
        complianceStatusId
        privateNote
        publicNote
        spotTypeId
        statusId

        userSnippets {
          startTime
          endTime
          text
          transcriptStartDate
          transcriptEndDate
          snippets {
            text
            startTime
            endTime
          }
        }
      }
    }`;
    const variables = {
      mention: {
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
    };

    const result = await gqlClient.query(query, variables);
    const updatedMention = _.get(result, 'updateMention', {});
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
    const query = `mutation($mentionId: ID!, $commentText: String!) {
      createMentionComment(input: {
        mentionId: $mentionId
        commentText: $commentText
      }) {
        userId
        userImage
        firstName
        lastName
        commentText
        commentId
      }
    }`;
    const variables = {
      mentionId,
      commentText: 'the new comment'
    };

    const result = await gqlClient.query(query, variables);

    const createMentionComment = _.get(result, 'createMentionComment', {});
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
    const query = `
    mutation ($mentions: UpdateMentions!) {
      updateMentions(input: $mentions) {
        id
        statusId
        userSnippets {
          startTime
          endTime
          text
          transcriptStartDate
          transcriptEndDate
          snippets {
            text
            startTime
            endTime
          }
        }
      }
    }`;
    const variables = {
      mentions: {
        ids: [mentionId],
        statusId: '3'
      }
    };

    const result = await gqlClient.query(query, variables);
    const updatedMention = _.get(result, 'updateMentions', []);
    expect(updatedMention.length).toEqual(1);
    expect(updatedMention[0].statusId).toEqual('3');
    expect(updatedMention[0].id).toEqual(mentionId);
    expect(updatedMention[0].userSnippets).toEqual(userSnippets);
  });

  // fails in ai13s due to the reason in a fixme comment above
  it('query mentions', async () => {
    const query = `
    query {
      mentions(
        limit:1
        orderBy: [
          {field: mentionDate, direction: asc}
        ]

      dateTimeFilter: [
        {
          fromDateTime: "${twoDaysAgo}",
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
    const query = `
      mutation {
        createMention(input: {
          mediaId: ${mediaId}
          programId: 75191
          snippetsString: "[{\\"hits\\":[{\\"queryTerm\\":\\"football\\",\\"startTime\\":453.419,\\"endTime\\":453.889}],\\"startTime\\":453.419,\\"endTime\\":483.071,\\"text\\":\\"football in the 80s that's true . Ivor Davies and John Farnham in the day they had Ripper mullet says Mark I'm at Davis is getting a lot of traction here on the tex line he did have a superb mullet Elliott has written Ivor Davies of Ice House support it spotted an awesome curly mullet during the man of colours period and don't forget Dermot Brereton of the a a fellow vehicle at the time with the purple perm mullet . 0 yes I think Kate is on the phone and\\"}]"
          mentionHitCount: 1
          mentionDateTime: "${mentionStart.toISOString()}"
          cognitiveEngineResultsString: "{}"
          queryTerm: ""
        }) {
          id
          mentionSnippets {
            startTime
            endTime
            text
            hits {
              endTime
              startTime
              queryTerm
            }
          }
          mentionDate
          mentionHitCount
          organizationId
          mediaId
          scheduleId
          cognitiveEngineResults
          scheduledJob {
            id
          }
        }
      }
    `;
    try {
      const result = await gqlClient.query(query);
      expect(_.get(result, 'createMention.id')).toBeDefined();
    } catch (err) {
      expect(err).toEqual(expect.stringContains('Duplicate mention found'));
    }
  });

  it('share mention to a recipient and get a share-token', async () => {
    const query = `
      mutation{
        shareMention(input: {
          mentionId: ${mentionId}
          shareMessage: "${citestMarker}-ci-test share mention here"
          recipients: ["${config.userName}"]
          shareOptions: {
            showImage: true
            showComments: true
            showRating: true
            showHeader: true
            showEngineResults: true
            showHits: true
            showAffiliateStripdown: true
            showDownload: true
            showDescription: true
          }
        }) {
          id
          recipients
          shareMessage
          shareOptionsJson
          folderId
          mentionId
          mediaShare {
            token
            isSegmented
          }
        }
      }
    `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'shareMention.id')).toBeDefined();
    shareTokenId = _.get(result, 'shareMention.id');
    expect(_.get(result, 'shareMention.mentionId')).toEqual(
      mentionId.toString()
    );
    expect(_.get(result, 'shareMention.mediaShare')).toBeDefined();
    expect(_.get(result, 'shareMention.mediaShare.token')).toBeDefined();
    expect(_.get(result, 'shareMention.mediaShare.isSegmented')).toBeDefined();
  });

  it('share mention in bulk to a recipient and get share-token', async () => {
    const query = `
      mutation {
        shareMentionInBulk(input: {
          mentionIds: [${mentionId}]
          shareOptions: {
            showImage: true
            showComments: true
            showRating: true
            showHeader: true
            showEngineResults: true
            showHits: true
            showAffiliateStripdown: true
            showDownload: true
            showDescription: true
          }
        }) {
          id
          mentionId
          mediaShare {
            token
          }
        }
      }
    `;

    const result = await gqlClient.query(query);

    const results = _.get(result, 'shareMentionInBulk');
    expect(results.length).toEqual(1);

    results.forEach((res) => {
      expect(res.id).toBeDefined();
      expect(res.mentionId).toBeDefined();
      expect(res.mediaShare).toBeDefined();
      expect(res.mediaShare.token).toBeDefined();
      arrayShareTokenId.push(res.id);
    });
  });

  it('get shareMention detail by share-token', async () => {
    const query = `
      query {
        sharedMention: sharedMention (shareId: "${shareTokenId}") {
          id
          organizationId
          sourceTypeId
          sourceId
          scheduledJobId
          scheduledJob
          mediaId
          advertiserId
          brandId
          campaignId
          watchlistId
          organization
          share {
            id
          }
        }
      }
    `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'sharedMention.id')).toBeDefined();
    expect(_.get(result, 'sharedMention.id')).toEqual(mentionId.toString());
    expect(_.get(result, 'sharedMention.organizationId')).not.toEqual(null);
    expect(_.get(result, 'sharedMention.organization')).not.toEqual(null);
    expect(_.get(result, 'sharedMention.organization.id')).toBeDefined();
    expect(_.get(result, 'sharedMention.scheduledJob')).toBeDefined();
    expect(_.get(result, 'sharedMention.share')).toBeDefined();
  });

  it('create new folder to test query mention with folderId', async () => {
    const query = `
    mutation {
      createCollection(input: {
        name: "${citestMarker}-hello",
        image: "https://s3.amazonaws.com/dev-api.veritone.com/testphoto.jpg",
        parentFolderId: ""
      }) {
        id,
        name,
        imageUrl,
        signedImageUrl
      }
    }`;

    const result = await gqlClient.query(query);
    folderId = result.createCollection.id;
    expect(folderId).toBeDefined();
  });

  //FIXME: incomplete test
  // fails in ai13s due to the reason in a fixme comment above
  it('create new mention collection to test query mention with folderId', async () => {
    const query = `
        mutation {
          createCollectionMention(input: {
            folderId: ${folderId}
            mentionId: ${mentionId}
          }) {
            folderId,
            mentionId
          }
        }`;

    await gqlClient.query(query);
  });

  // fails in ai13s due to the reason in a fixme comment above
  it('query mentions with folderId', async () => {
    const query = `
    query {
      mentions(
        folderId: "${folderId}"
        ) {
        count
        records {
          id
          mentionDate
        }
      }
    }
    `;

    const result = await gqlClient.query(query);

    expect(_.get(result, 'mentions.count')).toEqual(1);
    expect(_.get(result, 'mentions.records[0].id')).toBeDefined();
    expect(_.get(result, 'mentions.records[0].id')).toEqual(mentionId);
  });
  it('delete folder after test query mentions by folderId', async () => {
    const query = `
    mutation {
      deleteCollection(folderId: ${folderId}) {
        id,
        message
      }
    }
    `;

    await gqlClient.query(query);
  });
});
