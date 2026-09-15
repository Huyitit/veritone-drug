const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const organizationId = 7682;
const mediaId = 1234567890;
const programId = 40123;

const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

describe('mention', () => {
  const context = {};
  let mentionDal, sdoFileDownload, mpRead, mpWrite, coreRead, audienceRead;
  beforeEach(() => {
    sdoFileDownload = jest.fn();
    mpRead = jest.fn();
    mpWrite = jest.fn();
    coreRead = jest.fn();
    audienceRead = jest.fn();
    _.set(serviceContext, 'dbConnections.media_platform.read.query', mpRead);
    _.set(serviceContext, 'dbConnections.media_platform.write.query', mpWrite);
    _.set(serviceContext, 'dbConnections.media_platform.write.map', mpWrite);
    _.set(serviceContext, 'dbConnections.core.read.query', coreRead);
    _.set(serviceContext, 'dbConnections.core.read.map', coreRead);
    _.set(serviceContext, 'dbConnections.audience.read.query', audienceRead);

    jest.mock('../resolvers/util.js', () => (serviceContext) => {
      return {
        getSignedUrl: jest
          .fn()
          .mockResolvedValue('https://signed.com/file.json'),
        download: sdoFileDownload
      };
    });

    mentionDal = require('./mention')(serviceContext);
  });

  afterAll(() => {
    jest.resetModules();
  });

  describe('#createMention', () => {
    test('should create a new radio mention without explicitly specified dataSource', async () => {
      const mediaSourceTypeId = 1;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];

      mpRead.mockResolvedValue(getMediaSourceResponse);

      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      const getSDOResponse = [
        {
          uri: 'http://fakeuri.com/sdo.json',
          schemaId: '0d0bc61f-5793-4d80-a980-9b041cabf661'
        }
      ];
      coreRead
        .mockResolvedValueOnce(getTDODetailsResponse)
        .mockResolvedValue(getSDOResponse);

      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );

      sdoFileDownload.mockResolvedValueOnce(
        JSON.stringify(require('../test/assets/sdos/radioAsset.json'))
      );
      const snippetsString =
        '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport"}]';
      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          snippetsString,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z'
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.dmaAffiliates).toBe(1);
      expect(mention.dmaAqhAudience).toBe(42651);
      expect(mention.dmaAqhCharacteristics).toBe(
        '1 => 126, 3 => 3763, 4 => 2912, 5 => 3183, 6 => 926, 7 => 7650, 8 => 288, 10 => 613, 11 => 2575, 12 => 1884, 13 => 2048, 14 => 4117, 15 => 6988, 82 => 3995, 254 => 697, 255 => 558, 267 => 80, 268 => 248'
      );
      expect(mention.dmaMarkets).toBe(4);
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:26.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
      expect(mention.mentionSnippets).toBe(snippetsString);
      expect(mention.metadata.audienceProvider).toBe('Nielsen');
    });

    test('should create a new radio mention with explicitly specified dataSource', async () => {
      const mediaSourceTypeId = 1;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];

      mpRead.mockResolvedValue(getMediaSourceResponse);

      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      const getSDOResponse = [
        {
          uri: 'http://fakeuri.com/sdo.json',
          schemaId: '0d0bc61f-5793-4d80-a980-9b041cabf661'
        }
      ];
      coreRead
        .mockResolvedValueOnce(getTDODetailsResponse)
        .mockResolvedValue(getSDOResponse);

      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );

      sdoFileDownload.mockResolvedValueOnce(
        JSON.stringify(require('../test/assets/sdos/radioAssetNumeris.json'))
      );
      const snippetsString =
        '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport"}]';
      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          snippetsString,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z'
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.dmaAffiliates).toBe(1);
      expect(mention.dmaAqhAudience).toBe(42651);
      expect(mention.dmaAqhCharacteristics).toBe(
        '1 => 126, 3 => 3763, 4 => 2912, 5 => 3183, 6 => 926, 7 => 7650, 8 => 288, 10 => 613, 11 => 2575, 12 => 1884, 13 => 2048, 14 => 4117, 15 => 6988, 82 => 3995, 254 => 697, 255 => 558, 267 => 80, 268 => 248'
      );
      expect(mention.dmaMarkets).toBe(4);
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:26.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
      expect(mention.mentionSnippets).toBe(snippetsString);
      expect(mention.metadata.audienceProvider).toBe('Numeris');
    });

    test('should create a mention with provided audience data for radio source type', async () => {
      const mediaSourceTypeId = 1;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];
      mpRead.mockResolvedValue(getMediaSourceResponse);

      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      coreRead.mockResolvedValueOnce(getTDODetailsResponse);
      const snippetsString =
        '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport"}]';
      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );
      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          snippetsString,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z',
          audience: {
            audienceTotal: 12345
          }
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.dmaAffiliates).toBe(0);
      expect(mention.dmaMarkets).toBe(0);
      expect(mention.dmaAqhAudience).toBe(12345);
      expect(mention.dmaAqhCharacteristics).toBe(
        '1 => 0, 3 => 0, 4 => 0, 5 => 0, 6 => 0, 7 => 0, 8 => 0, 10 => 0, 11 => 0, 12 => 0, 13 => 0, 14 => 0, 15 => 0, 82 => 0, 254 => 0, 255 => 0, 267 => 0, 268 => 0'
      );
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:26.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
      expect(mention.mentionSnippets).toBe(snippetsString);
    });

    test('should create a mention with provided audience data for youtube source type', async () => {
      const mediaSourceTypeId = 3;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];
      mpRead.mockResolvedValue(getMediaSourceResponse);

      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      coreRead.mockResolvedValueOnce(getTDODetailsResponse);
      const snippetsString =
        '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport"}]';
      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );
      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          snippetsString,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z',
          audience: {
            audienceTotal: 12345
          }
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.dmaAffiliates).toBe(undefined);
      expect(mention.dmaMarkets).toBe(undefined);
      expect(mention.dmaAqhAudience).toBe(undefined);
      expect(mention.dmaAqhCharacteristics).toBe(undefined);
      expect(mention.onlineViews).toBe(12345);
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:26.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
      expect(mention.mentionSnippets).toBe(snippetsString);
    });

    test('should create a new national tv mention', async () => {
      const mediaSourceTypeId = 2;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];

      mpRead.mockResolvedValue(getMediaSourceResponse);

      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      const getSDOResponse = [
        {
          uri: 'http://fakeuri.com/sdo.json',
          schemaId: '85db55b9-33e0-46ca-b7b0-39a6feeff5ec'
        }
      ];
      coreRead
        .mockResolvedValueOnce(getTDODetailsResponse)
        .mockResolvedValue(getSDOResponse);

      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );

      sdoFileDownload.mockResolvedValueOnce(
        JSON.stringify(require('../test/assets/sdos/nationalTVAsset.json'))
      );

      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          snippetsString:
            '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport"}]',
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z'
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.dmaAqhCharacteristics).toBe(
        '1 => 5342, 3 => 39968, 4 => 87078, 5 => 0, 6 => 156242, 7 => 212532, 8 => 8763, 10 => 27748, 11 => 61616, 12 => 0, 13 => 91128, 14 => 143237, 15 => 253552, 82 => 129742, 254 => 17463, 255 => 0, 267 => 10099, 268 => 0'
      );
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:26.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
    });

    test('should create a new local tv mention', async () => {
      const mediaSourceTypeId = 2;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];

      mpRead.mockResolvedValue(getMediaSourceResponse);

      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      const getSDOResponse = [
        {
          uri: 'http://fakeuri.com/sdo.json',
          schemaId: 'a86e58a1-0c0d-4057-9f2f-244e4fc0eb2a'
        }
      ];
      coreRead
        .mockResolvedValueOnce(getTDODetailsResponse)
        .mockResolvedValue(getSDOResponse);

      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );

      sdoFileDownload.mockResolvedValueOnce(
        JSON.stringify(require('../test/assets/sdos/localTVAsset.json'))
      );

      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          snippetsString:
            '[{"startTime":334.179,"endTime":390.179,"text":"free minutes from the airport"}]',
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z'
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.dmaAqhCharacteristics).toBe(
        '1 => 0, 3 => 1469, 4 => 9059, 5 => 0, 6 => 7626, 7 => 32645, 8 => 0, 10 => 711, 11 => 8524, 12 => 0, 13 => 9888, 14 => 48088, 15 => 111410, 82 => 28450, 254 => 2943, 255 => 0, 267 => 974, 268 => 0'
      );
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:26.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
    });

    test('should create a mention with no transcript and cognitive category data', async () => {
      const mediaSourceTypeId = 5;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];

      mpRead.mockResolvedValue(getMediaSourceResponse);
      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      coreRead.mockResolvedValue(getTDODetailsResponse);
      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );

      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          cognitiveEngineResults: {
            ocr: [
              { start: 200000, end: 201000 },
              { start: 233000, end: 234000 }
            ]
          },
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z'
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:04.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
    });

    test('should create a mention with no transcript and structured data with timing', async () => {
      const mediaSourceTypeId = 5;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];

      mpRead.mockResolvedValue(getMediaSourceResponse);
      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      coreRead.mockResolvedValue(getTDODetailsResponse);
      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );

      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          cognitiveEngineResults: {
            structuredData: {
              sdo_test: {
                series: [
                  { start: 200000, end: 201000 },
                  { start: 233000, end: 234000 }
                ]
              }
            }
          },
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z'
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:04.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
    });

    test('should create a mention with no transcript and no timing', async () => {
      const mediaSourceTypeId = 5;
      const getMediaSourceResponse = [
        {
          media_source_id: 123,
          live_timezone: 'America/Los_Angeles',
          media_source_type_id: mediaSourceTypeId,
          metadata: {}
        }
      ];

      mpRead.mockResolvedValue(getMediaSourceResponse);
      const getTDODetailsResponse = [
        {
          details: {}
        }
      ];
      coreRead.mockResolvedValue(getTDODetailsResponse);
      mpWrite.mockImplementation((sql, values) =>
        Promise.resolve([convertSQLValuesToMention(values)])
      );

      const args = {
        input: {
          organizationId,
          mediaId,
          programId,
          mentionDateTime: '2017-11-03T22:50:30Z',
          mentionHitCount: 0,
          cognitiveEngineResults: {
            structuredData: {
              sdo_test: {
                test: test
              }
            }
          },
          hitStartDateTime: '2017-11-03T22:50:30.000Z',
          hitEndDateTime: '2017-11-03T22:51:30.000Z'
        }
      };
      const mention = await mentionDal.createMention(context, args);

      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mention.mediaId).toBe(mediaId);
      expect(mention.mediaSourceId).toBe(123);
      expect(mention.mediaSourceTypeId).toBe(mediaSourceTypeId);
      expect(mention.mentionDate).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.mentionEndDate).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.hitStartDateTime).toBe('2017-11-03T22:50:30.000Z');
      expect(mention.hitEndDateTime).toBe('2017-11-03T22:51:30.000Z');
      expect(mention.mentionStatusId).toBe(1);
      expect(mention.mentionStateLookupId).toBe(1);
    });
  });

  describe('#get mentions', () => {
    test('should retrieve campaign', async () => {
      const campaignData = {
        id: 1234,
        name: 'campaign-name',
        start_date: '2014-07-01 07:00:00+00',
        stop_date: '2014-07-31 07:00:00+00',
        budget: 1144471,
        demographics: { foo: 'bar' },
        organization_id: 2234,
        advertiser_id: 3234,
        brand_id: 4234
      };

      serviceContext.dbConnections['media_platform'].read._push([campaignData]);
      const campaign = await mentionDal.getCampaign({
        id: 1234,
        organizationId: 5234
      });

      expect(campaign.id).toEqual(campaignData.id);
      expect(campaign.name).toEqual(campaignData.name);
      expect(campaign.startDate).toEqual(campaignData.start_date);
      expect(campaign.stopDate).toEqual(campaignData.stop_date);
      expect(campaign.budget).toEqual(campaignData.budget);
      expect(campaign.demographics).toEqual(campaignData.demographics);
      expect(campaign.organizationId).toEqual(campaignData.organization_id);
      expect(campaign.advertiserId).toEqual(campaignData.advertiser_id);
      expect(campaign.brandId).toEqual(campaignData.brand_id);
    });
    test('should retrieve campaign with error invalid input', async () => {
      try {
        await mentionDal.getCampaign({
          organizationId: 5234
        });
      } catch (e) {
        expect(e.name).toEqual('invalid_input');
        expect(e.message).toEqual('Invalid campaignId');
      }
    });

    test('should retrieve mention comment', async () => {
      const commentData = {
        comment_id: 1234,
        mention_id: 2234,
        user_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
        comment_text: 'comment text',
        date_created: '2015-03-06 05:03:04.60346',
        date_modified: '2015-03-06 05:03:04.60346'
      };

      serviceContext.dbConnections['media_platform'].read._push([commentData]);
      const comments = await mentionDal.getMentionComment(context, {
        id: 2234,
        organizationId: 5234
      });

      expect(comments.records.length).toEqual(comments.count);
      const comment = comments.records[0];
      expect(typeof comment).toEqual('object');
      expect(comment.commentId).toEqual(commentData.comment_id);
      expect(comment.mentionId).toEqual(commentData.mention_id);
      expect(comment.userId).toEqual(commentData.user_id);
      expect(comment.commentText).toEqual(commentData.comment_text);
      expect(comment.dateCreated).toEqual(commentData.date_created);
      expect(comment.dateModified).toEqual(commentData.date_modified);
    });

    test('should retrieve mention rating', async () => {
      const ratingData = {
        rating_id: 1234,
        mention_id: 2234,
        user_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
        rating_value: 5,
        date_created: '2015-03-06 05:03:04.60346',
        date_modified: '2015-03-06 05:03:04.60346'
      };

      serviceContext.dbConnections['media_platform'].read._push([ratingData]);
      const ratings = await mentionDal.getMentionRating(context, {
        id: 2234,
        organizationId: 5234
      });

      expect(ratings.records.length).toEqual(ratings.count);
      const rating = ratings.records[0];
      expect(typeof rating).toEqual('object');
      expect(rating.ratingId).toEqual(ratingData.rating_id);
      expect(rating.mentionId).toEqual(ratingData.mention_id);
      expect(rating.userId).toEqual(ratingData.user_id);
      expect(rating.ratingValue).toEqual(ratingData.rating_value);
      expect(rating.dateCreated).toEqual(ratingData.date_created);
      expect(rating.dateModified).toEqual(ratingData.date_modified);
    });

    //Having problem with AT TIME ZONE 'UTC' in QUERY
    test('read mention', async () => {
      const mentionData = [
        {
          id: 1234,
          status_id: 2234,
          compliance_status_id: 3234,
          spot_type_id: 4234,
          mention_snippets: { foo: 'foo' },
          user_snippets: { bar: 'bar' },
          rating: 1,
          private_note: 'private note',
          public_note: 'public note',
          organization_id: 5234,
          advertiser_id: 6234,
          brand_id: 7234,
          schedule_id: 8234,
          campaign_id: 9234,
          watchlist_id: 10234,
          ad_creative: { blu: 'blu' },
          media_id: 1334,
          source_id: 2334,
          source_type_id: 3334,
          mention_date: '2017-11-03T22:50:30Z',
          cognitive_engine_results: { bla: 'bla' },
          is_match: true,
          hash: 4234,
          fingerprint: { booz: 'booz' },
          hit_start_date_time: '2017-11-03T22:50:30Z',
          hit_end_date_time: '2017-11-03T22:50:30Z',
          end_date_time: '2017-11-03T22:50:30.000Z',
          metadata: { zaa: 'zaa' }
        }
      ];
      //mpRead.mockResolvedValue([]);
      //mpRead.mockResolvedValue(mentionData);
      serviceContext.dbConnections['media_platform'].read._push(
        mentionData,
        false
      );
      const mention = await mentionDal.getMention(context, {
        id: 1234,
        organizationId: 5234
      });
      expect(mention.id).toEqual(mentionData[0].id);
    });
    //
  });

  describe('#mapStructuredDataCorrelationResultsForMention', function () {
    it('should handle null/undefined schemaID with invalid_input error', async function () {
      try {
        await mentionDal._mapStructuredDataCorrelationResultsForMention(
          mockUtil.makeContext(),
          {
            records: [
              {
                jsondata: {
                  metadata: {
                    schemaIds: [null]
                  }
                }
              }
            ]
          }
        );
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should handle valid schema IDs', async function () {
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            schema: {},
            organizationId: '7682',
            dataRegistryMetadataId: '183c95db-90dc-41f6-9522-7b29e4bccb6a',
            majorVersion: 1,
            minorVersion: 0,
            status: 'published',
            storageName: 'storage1'
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: '183c95db-90dc-41f6-9522-7b29e4bccb6a',
            name: 'test reg',
            source: '',
            organizationId: '7682',
            isSystem: false
          }
        ],
        false
      );
      const res = await mentionDal._mapStructuredDataCorrelationResultsForMention(
        mockUtil.makeContext(),
        {
          records: [
            {
              jsondata: {
                metadata: {
                  schemaIds: [
                    '783c95db-90dc-41f6-9522-7b29e4bccb6a',
                    '683c95db-90dc-41f6-9522-7b29e4bccb6a'
                  ]
                },
                series: [
                  {
                    structuredData: {
                      '783c95db-90dc-41f6-9522-7b29e4bccb6a': { foo: 'bar' }
                    }
                  }
                ]
              }
            }
          ]
        }
      );
    });
  });
  describe('#createMentions', function () {
    test('should create mentions in bulk', async function () {
      const now = moment();
      // TODO this mock setup is not quite right. can get better
      // line coverage by extending it later.
      mpRead
        .mockResolvedValue([{}])
        .mockResolvedValueOnce([
          {
            media_source_id: 12345,
            live_timezone: 'PST',
            media_source_type_id: 1,
            metadata: {}
          }
        ])
        .mockResolvedValueOnce([
          {
            media_source_id: 12346,
            live_timezone: 'EST',
            media_source_type_id: 2,
            metadata: {}
          }
        ]);
      coreRead.mockResolvedValue([
        {
          uri: 'http://localhost:3000/whatever',
          schemaId: 's123'
        }
      ]);
      // TODO fix mock setup and add a third mention to input that
      // triggers duplicate check
      //mpRead.mockResolvedValueOnce([]); // first mention duplicate check
      //mpRead.mockResolvedValueOnce([]); // second mention duplicate check
      mpWrite.mockResolvedValue([
        {
          id: 1,
          status_id: 1,
          mention_snippets: [],
          organization_id: 7682,
          watchlist_id: 567,
          media_id: 123,
          source_id: 12345,
          source_type_id: 1,
          program_id: 321,
          mention_date: now.toISOString(),
          cognitive_engine_results: [],
          hit_start_date: now.subtract(2, 'minutes').toISOString(),
          hit_end_date: now.subtract(1, 'minutes').toISOString(),
          mention_end_date: now.subtract(1, 'minutes').toISOString()
        },
        {
          id: 2,
          media_id: 234,
          source_id: 12346,
          source_type_id: 2,
          program_id: 432,
          mention_snippets: [],
          cognitive_engine_results: []
        }
      ]);
      serviceContext.dbConnections['audience'].read._push([], false);
      const res = await mentionDal.createMentions(mockUtil.makeContext(), {
        input: {
          mentions: [
            {
              // full input, not pre-existing
              mediaId: 123,
              programId: 234,
              snippets: {
                foo: 'bar'
              },
              mentionStatusId: 1,
              mentionDateTime: now.toISOString(),
              hitStartDateTime: now.subtract(2, 'minutes').toISOString(),
              hitEndDateTime: now.subtract(1, 'minutes').toISOString(),
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
              metadata: {
                foo: 'bar'
              },
              watchlistId: 567
            },
            {
              // minimal input
              mediaId: 234,
              programId: 345,
              snippets: [],
              cognitiveEngineResultsString: '[]'
            }
          ]
        }
      });
    });
    test('should throw error invalid input missing input', async function () {
      try {
        await mentionDal.createMentions(mockUtil.makeContext(), {});
      } catch (e) {
        expect(e.name).toEqual('invalid_input');
        expect(e.message).toEqual('array BulkCreateMentionList cannot be null');
      }
    });
  });
  describe('#getDbMediaSourceAndType', function () {
    test('should retrieve get media source type from db successfully', async () => {
      let mediaSourceType = {
        media_source_id: 1234,
        live_timezone: 2234,
        media_source_type_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
        metadata: 5
      };

      mpRead.mockResolvedValueOnce([mediaSourceType]);
      const mediaSourceAndType = await mentionDal.getDbMediaSourceAndType(123);

      expect(mediaSourceAndType.mediaSourceId).toBe(
        mediaSourceType.media_source_id
      );
    });
    test('should retrieve get media source type from cache successfully', async () => {
      let mediaSourceType = {
        media_source_id: 1234,
        live_timezone: 2234,
        media_source_type_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
        metadata: 5
      };

      mpRead.mockResolvedValueOnce([mediaSourceType]);
      await mentionDal.getDbMediaSourceAndType(123);
      const mediaSourceAndType = await mentionDal.getDbMediaSourceAndType(123);

      expect(mediaSourceAndType.mediaSourceId).toBe(
        mediaSourceType.media_source_id
      );
    });
    test('should throw error not found media source and type', async () => {
      let mediaSourceType = {
        media_source_id: 1234,
        live_timezone: 2234,
        media_source_type_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
        metadata: 5
      };

      mpRead.mockResolvedValueOnce([]);
      try {
        await mentionDal.getDbMediaSourceAndType(123);
      } catch (e) {
        expect(e.name).toEqual('not_found');
        expect(e.message).toEqual(
          'Missing media source association for mediaId: 123'
        );
      }
    });
  });
  describe('#getAudienceDataYoutube', function () {
    test('should throw error with mention is null', async () => {
      try {
        await mentionDal.getAudienceDataYoutube();
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Missing mention to retrieve audience data'
        );
      }
    });
    test('should throw error mentionDate is null', async () => {
      let mention = {
        mediaId: 2234
      };

      try {
        await mentionDal.getAudienceDataYoutube(mention);
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Missing mentionDate to retrieve audience data'
        );
      }
    });
    test('should throw error mediaId is null', async () => {
      let mention = {
        mentionDate: new Date()
      };

      try {
        await mentionDal.getAudienceDataYoutube(mention);
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Missing mediaId to retrieve audience data'
        );
      }
    });
    test('should get audience successfully with null', async () => {
      let mention = {
        mentionDate: new Date(),
        mediaId: 1234
      };
      mpRead.mockResolvedValue([]);
      let audience = await mentionDal.getAudienceDataYoutube(mention, 'UTC');
      expect(audience).toBe(null);
    });
    test('should get audience successfully with audience from db', async () => {
      let mention = {
        mentionDate: new Date(),
        mediaId: 1234,
        audience_characteristics: 'string 123',
        audience_aqh: '123'
      };
      let audience = {
        markets: 1,
        affiliates: 1
      };
      mpRead.mockResolvedValue([audience]);
      let audienceResult = await mentionDal.getAudienceDataYoutube(
        mention,
        'UTC'
      );
      expect(audienceResult.markets).toBe(audience.markets);
      expect(audienceResult.affiliates).toBe(audience.affiliates);
    });
    test('should get audience successfully with audience from cache', async () => {
      let mention = {
        mentionDate: new Date(),
        mediaId: 1234,
        audience_characteristics: 'string 123',
        audience_aqh: '123'
      };
      let audience = {
        markets: 1,
        affiliates: 1
      };
      mpRead.mockResolvedValue([audience]);
      await mentionDal.getAudienceDataYoutube(mention, 'UTC');
      let audienceResult = await mentionDal.getAudienceDataYoutube(
        mention,
        'UTC'
      );
      expect(audienceResult.markets).toBe(audience.markets);
      expect(audienceResult.affiliates).toBe(audience.affiliates);
    });
    test('should throw error when too many result from db', async () => {
      let mention = {
        mentionDate: new Date(),
        mediaId: 1234,
        audience_characteristics: 'string 123',
        audience_aqh: '123'
      };
      let audience = {
        markets: 1,
        affiliates: 1
      };
      try {
        mpRead.mockResolvedValue([audience, audience]);
        await mentionDal.getAudienceDataYoutube(mention, 'UTC');
      } catch (err) {
        expect(err.message).toEqual(
          'Multiple YouTube audience records returned for media 1234'
        );
      }
    });
  });
  describe('#getSDOAudienceData', function () {
    test('should throw error with mention is null', async () => {
      try {
        await mentionDal.getSDOAudienceData(context, null);
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Missing mention to retrieve TV audience data'
        );
      }
    });
    test('should throw error mediaId is null', async () => {
      let mention = {
        mentionDate: new Date()
      };

      try {
        await mentionDal.getSDOAudienceData(context, mention);
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual(
          'Missing mediaId to retrieve TV audience data'
        );
      }
    });
    test('should get audience successfully with null', async () => {
      let mention = {
        mentionDate: new Date(),
        mediaId: 1234
      };
      coreRead.mockResolvedValueOnce([]);
      let audience = await mentionDal.getSDOAudienceData(context, mention);
      expect(audience).toBe(null);
    });
  });
  describe('#mapTranscriptEngineResultsToSnippets', function () {
    test('should mapping successfully', async () => {
      let series = [
        {
          startTimeMs: 100000,
          stopTimeMs: 100000,
          words: ['test', 'foo']
        }
      ];
      let result = await mentionDal.mapTranscriptEngineResultsToSnippets(
        series
      );
      expect(result[0].startTime).toBe(series[0].startTimeMs / 1000);
    });
  });
  describe('#generateGetEngineResultArguments', function () {
    test('should generate args successfully', async () => {
      let engineCategoryId = 123,
        sourceId = 345,
        mentionStartDateTime = new Date(),
        mentionEndDateTime = new Date(),
        args = {
          organizationIds: [7682],
          organizationId: 7682,
          applicationId: 1234,
          applicationIds: [1234]
        };
      let result = mentionDal.generateGetEngineResultArguments({
        engineCategoryId,
        sourceId,
        mentionStartDateTime,
        mentionEndDateTime,
        args
      });
      expect(result.sourceId).toBe(sourceId);
    });
  });
  describe('#normalizeStringInputs', function () {
    test('should normalizeStringInputs successfully', async () => {
      let input = {
        snippetsString: '{"foo":"bar"}'
      };
      let result = mentionDal.normalizeStringInputs(input);
      expect(input.snippets.foo).toBe('bar');
    });
    test('should throw error with snippetsString invalid input ', async () => {
      let input = {
        snippetsString: 'foo'
      };
      try {
        mentionDal.normalizeStringInputs(input);
      } catch (e) {
        expect(e.name).toEqual('invalid_input');
        expect(e.message).toEqual(
          'The string supplied in the CreateMention.snippetsString parameter must contain valid JSON.'
        );
      }
    });
    test('should throw error with cognitiveEngineResultsString invalid input ', async () => {
      let input = {
        snippetsString: '{"foo":"bar"}',
        cognitiveEngineResultsString: 'bar'
      };
      try {
        mentionDal.normalizeStringInputs(input);
      } catch (e) {
        expect(e.name).toEqual('invalid_input');
        expect(e.message).toEqual(
          'The string supplied in the CreateMention.snippetsString parameter must contain valid JSON.'
        );
      }
    });
  });
  describe('#updateMentions', function () {
    test('should throw error when missing statusId', async () => {
      let input = {};
      try {
        await mentionDal.updateMentions(context, { input });
      } catch (e) {
        expect(e.name).toEqual('invalid_input');
        expect(e.message).toEqual('Missing statusId to bulk update mentions');
      }
    });
    test('should throw error when missing mentions ids', async () => {
      let input = {
        statusId: 2
      };
      try {
        await mentionDal.updateMentions(context, { input });
      } catch (e) {
        expect(e.message).toEqual('mentionId parameter is required');
      }
    });
    test('should update mentions successfully', async () => {
      let input = {
        ids: [1],
        statusId: 3
      };
      mpWrite.mockResolvedValue([
        {
          watchlistId: '123',
          sourceId: '123'
        }
      ]);
      const res = await mentionDal.updateMentions(context, { input });
      expect(res[0].watchlistId).toEqual('123');
    });
  });
  describe('#updateMention', function () {
    test('should throw error when missing mentions ids', async () => {
      let input = {
        statusId: 2
      };
      try {
        await mentionDal.updateMention(context, { input });
      } catch (e) {
        expect(e.message).toEqual('mentionId parameter is required');
      }
    });
    test('should update mention successfully', async () => {
      let input = {
        id: 1,
        statusId: 3
      };
      mpWrite.mockResolvedValue([
        {
          watchlistId: '123',
          sourceId: '123'
        }
      ]);
      const res = await mentionDal.updateMention(context, { input });

      expect(res.watchlistId).toEqual('123');
    });
  });
  describe('#getTrackingUnit', function () {
    test('should return null when trackingUnitId is null', async () => {
      const res = await mentionDal.getTrackingUnit(null);
      expect(res).toEqual(null);
    });
    test('should get tracking unit from db successfully', async () => {
      mpRead.mockResolvedValue([
        {
          tracking_unit_id: '123',
          tracking_unit_name: 'name',
          tracking_unit_type: 'tracking'
        }
      ]);
      const res = await mentionDal.getTrackingUnit(123);
      expect(res.trackingUnitId).toEqual('123');
      expect(res.trackingUnitType).toEqual('tracking');
    });
    test('should get tracking unit from cache successfully', async () => {
      mpRead.mockResolvedValue([
        {
          tracking_unit_id: '123',
          tracking_unit_name: 'name'
        }
      ]);
      await mentionDal.getTrackingUnit(123);
      const res = await mentionDal.getTrackingUnit(123);
      expect(res.trackingUnitId).toEqual('123');
    });
  });
  describe('#getMention', function () {
    test('should throw error not found', async () => {
      serviceContext.dbConnections['media_platform'].read._push([], false);
      try {
        await mentionDal.getMention(context, { id: null });
      } catch (e) {
        expect(e.name).toEqual('not_found');
        expect(e.message).toEqual('Mention not found');
      }
    });
    test('should get mention successfully', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '297407241',
            organization_id: '7682',
            source_id: '-1',
            mention_date: '2019-05-23T00:46:40.393Z',
            hit_end_date_time: '2019-05-23T00:46:55.393Z',
            hit_start_date_time: '2019-05-23T00:46:45.393Z',
            status_id: '1'
          }
        ],
        false
      );

      const res = await mentionDal.getMention(context, { id: 297407241 });
      expect(res.id).toEqual('297407241');
    });
  });
  describe('#getMentions', function () {
    test('should get mention successfully', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '297407241',
            organization_id: '7682',
            source_id: '-1',
            mention_date: '2019-05-23T00:46:40.393Z',
            hit_end_date_time: '2019-05-23T00:46:55.393Z',
            hit_start_date_time: '2019-05-23T00:46:45.393Z',
            status_id: '1'
          }
        ],
        false
      );

      const res = await mentionDal.getMentions(context, {
        folderId: 123,
        orderBy: [
          {
            field: 'id',
            direction: 'asc'
          }
        ]
      });
      expect(res.count).toEqual(1);
    });
    test('should throw internal_error when invalid order by', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '297407241',
          organization_id: '7682',
          source_id: '-1',
          mention_date: '2019-05-23T00:46:40.393Z',
          hit_end_date_time: '2019-05-23T00:46:55.393Z',
          hit_start_date_time: '2019-05-23T00:46:45.393Z',
          status_id: '1'
        }
      ]);
      try {
        await mentionDal.getMentions(context, {
          id: 297407241,
          folderId: 123,
          orderBy: [
            {
              field: 'mentionId',
              direction: 'asc'
            }
          ]
        });
      } catch (e) {
        expect(e.name).toEqual('internal_error');
      }
    });
  });
  describe('#getSpotTypeIdByName', function () {
    test('should throw error when missing snippets or cognitiveEngineResults', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);

      const res = await mentionDal.getSpotTypeIdByName('test');
      expect(res).toBe(null);
    });
    test('should get spot type successfully', async () => {
      mpRead.mockResolvedValue({
        rows: [
          {
            spot_type_id: 123
          }
        ]
      });
      const res = await mentionDal.getSpotTypeIdByName('test');
      expect(res).toEqual(123);
    });
    test('should get spot type from cache successfully', async () => {
      mpRead.mockResolvedValue({
        rows: [
          {
            spot_type_id: 123
          }
        ]
      });
      await mentionDal.getSpotTypeIdByName('test');
      const res = await mentionDal.getSpotTypeIdByName('test');
      expect(res).toEqual(123);
    });
  });
  describe('#getExistsMention', function () {
    test('should return null with not found mention', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const mention = {
        id: '297407241',
        organizationId: '7682',
        sourceId: '-1',
        mentionDate: new Date('2019-05-23T00:46:40.393Z'),
        mentionEndDate: new Date('2019-05-23T00:46:40.393Z'),
        hitEndDate: new Date('2019-05-23T00:46:55.393Z'),
        hitStartDate: new Date('2019-05-23T00:46:45.393Z'),
        statusId: '1',
        complianceStatusId: null,
        spotTypeId: null,
        mentionSnippets: [
          {
            text: 'Snippet 3',
            startTime: 334.179,
            endTime: 390.179
          }
        ],
        userSnippets: null,
        ratings: {
          count: 0
        },
        privateNote: null,
        publicNote: null,
        advertiserId: null,
        brandId: null,
        scheduleId: '-1',
        campaignId: null,
        watchlistId: null,
        adCreative: null,
        mediaId: '500028663',
        sourceTypeId: '5',
        cognitiveEngineResults: null,
        isMatch: true,
        hash: null,
        fingerprint: null,
        metadata: {
          veritonePermissions: {
            isPublic: true,
            acls: [
              {
                groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
                permission: 'owner'
              }
            ]
          },
          startDateTime: 1558572190,
          stopDateTime: 1558572370,
          security: {
            global: true
          },
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          status: 'uploaded'
        }
      };
      const res = await mentionDal.getExistsMention(mention);
      expect(res).toBe(null);
    });
    test('should return mention', async () => {
      const mention = {
        id: '297407241',
        organizationId: '7682',
        sourceId: '-1',
        mentionDate: new Date('2019-05-23T00:46:40.393Z'),
        mentionEndDate: new Date('2019-05-23T00:46:40.393Z'),
        hitEndDate: new Date('2019-05-23T00:46:55.393Z'),
        hitStartDate: new Date('2019-05-23T00:46:45.393Z'),
        statusId: '1',
        complianceStatusId: null,
        spotTypeId: null,
        mentionSnippets: [
          {
            text: 'Snippet 3',
            startTime: 334.179,
            endTime: 390.179
          }
        ],
        userSnippets: null,
        ratings: {
          count: 0
        },
        privateNote: null,
        publicNote: null,
        advertiserId: null,
        brandId: null,
        scheduleId: '-1',
        campaignId: null,
        watchlistId: null,
        adCreative: null,
        mediaId: '500028663',
        sourceTypeId: '5',
        cognitiveEngineResults: null,
        isMatch: true,
        hash: null,
        fingerprint: null,
        metadata: {
          veritonePermissions: {
            isPublic: true,
            acls: [
              {
                groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
                permission: 'owner'
              }
            ]
          },
          startDateTime: 1558572190,
          stopDateTime: 1558572370,
          security: {
            global: true
          },
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          status: 'uploaded'
        }
      };
      mpRead.mockResolvedValue([mention]);
      const res = await mentionDal.getExistsMention(mention);
      expect(res.mediaId).toBe(mention.mediaId);
    });
  });
  describe('#addDetailMention', function () {
    test('should throw error invalid input', async () => {
      mpRead.mockResolvedValue([
        {
          media_source_id: 1234,
          live_timezone: 2234,
          media_source_type_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
          metadata: 5
        }
      ]);
      mpRead.mockResolvedValue([
        {
          tracking_unit_id: 1234,
          tracking_unit_name: 2234,
          organization_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
          advertiser_id: 5,
          brand_id: 5,
          campaign_id: 5
        }
      ]);
      coreRead.mockResolvedValue([
        {
          details: {}
        }
      ]);
      const mention = {
        id: '297407241',
        organizationId: '7682',
        sourceId: '-1',
        mentionDate: new Date('2019-05-23T00:46:40.393Z'),
        mentionEndDate: new Date('2019-05-23T00:46:40.393Z'),
        hitEndDate: new Date('2019-05-23T00:46:55.393Z'),
        hitStartDate: new Date('2019-05-23T00:46:45.393Z'),
        statusId: '1',
        complianceStatusId: null,
        spotTypeId: null,
        privateNote: null,
        publicNote: null,
        advertiserId: null,
        brandId: null,
        scheduleId: '-1',
        campaignId: null,
        watchlistId: 123,
        adCreative: null,
        mediaId: '500028663',
        sourceTypeId: '5',
        isMatch: true,
        hash: null,
        fingerprint: null
      };
      try {
        await mentionDal.addDetailMention(context, mention, 7682);
      } catch (e) {
        expect(e.name).toEqual('invalid_input');
        expect(e.message).toEqual(
          'cognitiveEngineResults and snippets cannot be null'
        );
      }
    });
    test('should throw error resource_conflict', async () => {
      mpRead.mockResolvedValue([
        {
          media_source_id: 1234,
          live_timezone: 2234,
          media_source_type_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
          metadata: 5
        }
      ]);
      mpRead.mockResolvedValue([
        {
          tracking_unit_id: 1234,
          tracking_unit_name: 2234,
          organization_id: 'cb5e52b4-a986-4e2b-b525-482319df3350',
          advertiser_id: 5,
          brand_id: 5,
          campaign_id: 5
        }
      ]);
      coreRead.mockResolvedValue([
        {
          details: {}
        }
      ]);
      const mention = {
        id: '297407241',
        organizationId: '7682',
        sourceId: '-1',
        mentionDate: new Date('2019-05-23T00:46:40.393Z'),
        mentionEndDate: new Date('2019-05-23T00:46:40.393Z'),
        hitEnd_Date: new Date('2019-05-23T00:46:55.393Z'),
        hitStartDate: new Date('2019-05-23T00:46:45.393Z'),
        statusId: '1',
        complianceStatusId: null,
        spotTypeId: null,
        privateNote: null,
        publicNote: null,
        advertiserId: null,
        brandId: null,
        scheduleId: '-1',
        campaignId: null,
        watchlistId: 123,
        adCreative: null,
        mediaId: '500028663',
        sourceTypeId: '5',
        isMatch: true,
        hash: null,
        fingerprint: null,
        snippets: 123
      };
      try {
        await mentionDal.addDetailMention(context, mention, 7682);
      } catch (e) {
        expect(e.name).toEqual('resource_conflict');
      }
    });
  });

  describe('#updateModifiedMentionsAudienceData', function () {
    const mentions = [
      {
        shouldUpdateAudienceData: true,
        mentionId: 1201,
        dmaAffiliates: 1,
        dmaMarkets: 6,
        dmaAqhAudience: 1200,
        dmaAqhCharacteristics:
          '1 => 45, 3 => 283, 4 => 478, 5 => 123, 6 => 702, 7 => 50, 8 => 0, 10 => 118, 11 => 157, 12 => 110, 13 => 0, 14 => 519, 15 => 0, 82 => 39, 254 => 169, 255 => 55, 267 => 0, 268 => 222',
        metadata: {
          audienceProvider: 'Nielsen'
        },
        watchlistId: 1234
      },
      {
        shouldUpdateAudienceData: true,
        mentionId: 1202,
        onlineViews: 123,
        watchlistId: 8888
      }
    ];

    it('should return empty list if no mentions', async () => {
      const actual = await mentionDal.updateModifiedMentionsAudienceData([]);
      expect(actual).toEqual([]);
    });

    it('should not update modified mentions if "shouldSyncExistingMentions" is false', async () => {
      const actual = await mentionDal.updateModifiedMentionsAudienceData(
        [],
        false
      );
      mpWrite.mockResolvedValueOnce([
        {
          id: 1201
        }
      ]);
      expect(mpWrite.mock.calls.length).toBe(0);
      expect(actual).toEqual([]);
    });

    it('should update modified mentions', async () => {
      mpWrite.mockResolvedValueOnce([
        {
          id: 1201
        },
        {
          id: 1202
        }
      ]);
      const sql = `
        UPDATE mention as m
        SET 
          dma_affiliates = temp.dma_affiliates,
          dma_markets = temp.dma_markets,
          dma_aqh_audience = temp.dma_aqh_audience,
          dma_aqh_characteristics = temp.dma_aqh_characteristics,
          metadata = temp.metadata,
          online_views = temp.online_views
        FROM (values
          ($1::bigint, $2, $3, $4, $5::hstore, $6::json, $7),($8::bigint, $9, $10, $11, $12::hstore, $13::json, $14)
        ) as temp (
          mention_id,
          dma_affiliates,
          dma_markets,
          dma_aqh_audience,
          dma_aqh_characteristics,
          metadata,
          online_views
        )
        WHERE m.mention_id = temp.mention_id
        RETURNING m.*;
      `;
      const values = [
        1201,
        1,
        6,
        1200,
        '1 => 45, 3 => 283, 4 => 478, 5 => 123, 6 => 702, 7 => 50, 8 => 0, 10 => 118, 11 => 157, 12 => 110, 13 => 0, 14 => 519, 15 => 0, 82 => 39, 254 => 169, 255 => 55, 267 => 0, 268 => 222',
        '{"audienceProvider":"Nielsen"}',
        undefined,
        1202,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        123
      ];

      const actual = await mentionDal.updateModifiedMentionsAudienceData(
        mentions,
        true
      );
      expect(mpWrite.mock.calls.length).toBe(1);
      expect(mpWrite).toHaveBeenCalledWith(sql, values);
      expect(actual[0].id).toBe(1201);
      expect(actual[1].id).toBe(1202);
    });
  });
});
const convertSQLValuesToMention = (values) => {
  const properties = [
    'mention_status_id',
    'compliance_status_id',
    'spot_type_id',
    'mention_snippets',
    'user_snippets',
    'mention_hit_count',
    'mention_date',
    'organization_id',
    'advertiser_id',
    'brand_id',
    'campaign_id',
    'tracking_unit_id',
    'program_id',
    'buy_id',
    'offer_id',
    'media_id',
    'rating',
    'private_note',
    'public_note',
    'dma_markets',
    'dma_affiliates',
    'dma_aqh_audience',
    'dma_aqh_characteristics',
    'online_views',
    'media_source_id',
    'media_source_type_id',
    'mention_state_lookup_id',
    'mention_hash',
    'query_term',
    'is_match',
    'metadata',
    'fingerprint',
    'ad_creative',
    'mention_end_date',
    'cognitive_engine_results',
    'hit_start_date',
    'hit_end_date'
  ];

  const result = {};
  for (let i = 0; i < properties.length; i++) {
    result[_.camelCase(properties[i])] = values[i];
  }
  return result;
};
