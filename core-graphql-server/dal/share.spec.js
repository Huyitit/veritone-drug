const _ = require('lodash');
const moment = require('moment');
const util = require('../test/mockUtil')();
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const errors = require('../error')({});

let sentEmailCount = 0;
let emailData;
let dalShare;

const discoveryMentionEmailTemplate = 'share-mention-star';
const discoveryMentionEmailTemplateWithMessage =
  'share-mention-star-with-message';
const collectionMentionEmailTemplate = 'share-mention-one-app';
const collectionEmailTemplate = 'share-collection-one-app';

const mediaDbWrite = serviceContext.dbConnections['media_platform'].write;
const mediaDbRead = serviceContext.dbConnections['media_platform'].read;

serviceContext.config.featureFlags = {};
serviceContext.config.pageUris = {
  collectionsShareLinkUrl: 'https://collections.aws-dev.veritone.com/share/',
  discoveryShareLinkUrl:
    'https://enterprise.aws-dev.veritone.com/media-detail/#/sharedMention/enterprise/'
};
serviceContext.config.limitShareMentionInBulk = 3;

describe('share', function () {
  // set up some test artifacts
  const testMediaShare = {
    mediaShareId: 'a-media-share-token',
    mediaShareInput: {
      mediaType: 'mediastream',
      sourceId: 12354,
      tdoId: '43212',
      scheduledJobId: 7890,
      startDateTime: '2018-12-01T00:00:00.000Z',
      stopDateTime: '2018-12-02T00:00:00.000Z'
    },
    mediaShareResult: {
      id: 'a-media-share-token',
      serviceName: 'media-streamer',
      expireDateTime: null,
      mediaType: 'mediastream',
      sourceId: 12354,
      tdoId: 43212,
      scheduledJobId: 7890,
      startDateTime: '2018-12-01T00:00:00.000Z',
      stopDateTime: '2018-12-02T00:00:00.000Z'
    }
  };
  const testSharedMention = {
    sharedMentionId: 'a-generated-shareId',
    sharedMentionInput: {
      mentionId: 1234,
      shareMessage: 'share mention message',
      shareOptions: {
        opt1: 'option 1',
        opt2: 'option 2'
      }
    },
    sharedMentionResult: {
      shareId: 'a-generated-shareId',
      organizationId: 7682,
      shareInfo: {
        shareId: 'a-generated-shareId',
        objectType: 'mention',
        objectId: 1234,
        userId: 'user987',
        organizationId: '7682',
        mediaShare: {
          token: 'media-share-token',
          isSegmented: false
        }
      }
    }
  };

  beforeAll(() => {
    dalShare = require('./share')(serviceContext);
  });
  beforeEach(() => {
    sentEmailCount = 0;
    emailData = {};
    mediaDbWrite._clearResultQueue();
    mediaDbRead._clearResultQueue();
    serviceContext._clearAll();
  });

  describe('validateSharedUrl', function () {
    function expectInvalidInput(args) {
      try {
        dalShare.validateSharedUrl(args);
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    }

    it('should throw error if sourceId or tdoId is missing', function () {
      const args = {
        mediaType: 'mediastream',
        scheduledJobId: 7890,
        startDateTime: '2018-12-01T00:00:00.000Z',
        stopDateTime: '2018-12-02T00:00:00.000Z',
        startOffsetMs: 3000
      };
      return expectInvalidInput(args);
    });
    it('should throw error for invalid media type', function () {
      const args = {
        mediaType: 'foo',
        sourceId: 12354,
        scheduledJobId: 7890,
        startDateTime: '2018-12-01T00:00:00.000Z',
        stopDateTime: '2018-12-02T00:00:00.000Z',
        startOffsetMs: 3000
      };
      return expectInvalidInput(args);
    });
    it('should require sourceId for a media stream', function () {
      const args = {
        mediaType: 'mediastream',
        scheduledJobId: 7890,
        startDateTime: '2018-12-01T00:00:00.000Z',
        stopDateTime: '2018-12-02T00:00:00.000Z',
        startOffsetMs: 3000
      };
      return expectInvalidInput(args);
    });
    it('should require scheduledJobId for a media stream', function () {
      const args = {
        mediaType: 'mediastream',
        sourceId: 12354,
        startDateTime: '2018-12-01T00:00:00.000Z',
        stopDateTime: '2018-12-02T00:00:00.000Z',
        startOffsetMs: 3000
      };
      return expectInvalidInput(args);
    });
    it('should require startDateTime for a media stream', function () {
      const args = {
        mediaType: 'mediastream',
        sourceId: 12354,
        scheduledJobId: 7890,
        stopDateTime: '2018-12-02T00:00:00.000Z',
        startOffsetMs: 3000
      };
      return expectInvalidInput(args);
    });
    it('should require a stopDateTime for a media stream', function () {
      const args = {
        mediaType: 'mediastream',
        sourceId: 12354,
        scheduledJobId: 7890,
        startDateTime: '2018-12-01T00:00:00.000Z',
        startOffsetMs: 3000
      };
      return expectInvalidInput(args);
    });
    it('should require a tdoId for an image', function () {
      const args = {
        mediaType: 'image',
        sourceId: 12354,
        scheduledJobId: 7890,
        startDateTime: '2018-12-01T00:00:00.000Z',
        stopDateTime: '2018-12-02T00:00:00.000Z'
      };
      return expectInvalidInput(args);
    });
    it('should throw error when both startDateTime and startOffsetMs are provided for an image', function () {
      const args = {
        mediaType: 'image',
        sourceId: 12354,
        tdoId: 43212,
        scheduledJobId: 7890,
        startDateTime: '2018-12-01T00:00:00.000Z',
        startOffsetMs: 3000
      };
      return expectInvalidInput(args);
    });
  });

  describe('createMediaShare', function () {
    beforeEach(() => {
      serviceContext._clearAll();
    });

    it('should return error when no id is returned from the db', async function () {
      // get tdo and source to check access
      serviceContext.dbConnections['core'].write._push([{ id: 43212 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 12354 }
      ]);
      mediaDbWrite._push([{ noId: true }]);
      try {
        const res = await dalShare.createMediaShare(
          {},
          { input: testMediaShare.mediaShareInput }
        );
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('internal_error');
      }
    });

    it('should write to cache and database', async function () {
      // get tdo and source to check access
      serviceContext.dbConnections['core'].write._push([{ id: 43212 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 12354 }
      ]);
      mediaDbWrite._push([{ id: testMediaShare.mediaShareId }]);
      const res = await dalShare.createMediaShare(
        {},
        { input: testMediaShare.mediaShareInput }
      );
      expect(res.id).toEqual(testMediaShare.mediaShareId);
      // cache include 1 for TDO, 1 for source and 1 for MediaShare
      expect(serviceContext.redisClient._counter()).toEqual(4);

      const cacheItem = await serviceContext.redisCache.get(
        'SharedUrl',
        testMediaShare.mediaShareId
      );

      expect(cacheItem.id).toEqual(testMediaShare.mediaShareResult.id);
      expect(cacheItem.id).toEqual(testMediaShare.mediaShareId);
      expect(serviceContext.redisClient._counter()).toEqual(5);
    });

    it('returns existing share Id for a duplicate', async function () {
      // get tdo and source to check access
      serviceContext.dbConnections['core'].write._push([{ id: 43212 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 12354 }
      ]);
      mediaDbWrite._push([{ id: testMediaShare.mediaShareId }]); // db will return the same existing share obj
      const res = await dalShare.createMediaShare(
        {},
        { input: testMediaShare.mediaShareInput }
      );
      // only 1 for the write and 2 remaining for TDO and Source
      expect(serviceContext.redisClient._counter()).toEqual(4);
      expect(res.id).toEqual(testMediaShare.mediaShareId);
    });
  });

  describe('getMediaShare', function () {
    it('should look in cache for existing', async function () {
      mediaDbRead._push([{ id: testMediaShare.mediaShareId }]);
      const res = await dalShare.getMediaShare(
        {},
        { id: testMediaShare.mediaShareId }
      );
      expect(res).toBeDefined();
      expect(res.id).toEqual(testMediaShare.mediaShareId);
      expect(serviceContext.redisClient._counter()).toEqual(2);
    });

    it('should look in db if not in cache', async function () {
      mediaDbRead._push([]);
      serviceContext.redisClient._clearCounter();
      try {
        const res = await dalShare.getMediaShare({}, { id: 'ABCD' });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(serviceContext.redisClient._counter()).toEqual(1);
      }
    });

    it('should return not found for expired share', async function () {
      // first create media share
      const input = {
        mediaType: 'mediastream',
        sourceId: 123456,
        tdoId: '43212',
        scheduledJobId: 7890,
        startDateTime: '2018-12-01T00:00:00.000Z',
        stopDateTime: '2018-12-02T00:00:00.000Z',
        expireDateTime: moment.utc().subtract(2, 'd').toISOString()
      };
      const newShareId = 'expired-media-token';

      // get tdo and source to check access
      serviceContext.dbConnections['core'].write._push([{ id: '43212' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 123456 }
      ]);
      mediaDbWrite._push([{ id: newShareId }]);

      await dalShare.createMediaShare({}, { input });
      try {
        const getResult = await dalShare.getMediaShare({}, { id: newShareId });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
  });

  describe('createShareObject', function () {
    const apiContext = util.makeContext({ authType: 'api_internal' });
    const userContext = util.makeContext();

    it('should require orgId when using an internal api token', function () {
      try {
        dalShare.createShareObject(apiContext, { userId: 'userid' });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should require a userId when using an internal api token', function () {
      try {
        dalShare.createShareObject(apiContext, { organizationId: 'orgId' });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should use org and user info from the input args or auth token', function () {
      const discoveryShareLinkUrl =
        serviceContext.config.pageUris.discoveryShareLinkUrl;
      const share = dalShare.createShareObject(userContext, {
        objectId: 1234,
        objectType: 'mention'
      });
      const testOrgId =
        userContext.requestContext.userInfo.organization.organizationId;
      expect(share.organizationId).toEqual(testOrgId);
      expect(share.shareInfo.organizationId).toEqual(testOrgId.toString());
      expect(share.shareInfo.userId).toEqual(
        userContext.requestContext.userInfo.userId
      );
      expect(share.shareInfo.objectId).toEqual(1234);
      expect(share.shareInfo.objectType).toEqual('mention');
      expect(share.shareInfo.linkUrl).toEqual(discoveryShareLinkUrl);
      expect(share.shareId).toBeDefined();
    });
    it('should provide the correct sharelink url', function () {
      const collectionShareLinkUrl =
        serviceContext.config.pageUris.collectionsShareLinkUrl;
      const share = dalShare.createShareObject(userContext, {
        app: 'collection-app',
        shareId: 'share-id',
        objectId: 1234,
        objectType: 'mention'
      });
      expect(share.shareInfo.linkUrl).toEqual(collectionShareLinkUrl);
    });
  });

  describe('shareMention', function () {
    it('should throw not found error for an invalid mention', async function () {
      serviceContext._clearAll();
      setupMockDals({});
      try {
        await dalShare.shareMention(util.makeContext(), {
          input: testSharedMention.sharedMentionInput
        });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });

    it('should create a media share and return a share object - not segmented', async function () {
      serviceContext._clearAll();
      setupMockDals({ mention: true, source: true });
      // get tdo and source to check access
      serviceContext.dbConnections['core'].write._push([{ id: '54321' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 5678 }
      ]);
      mediaDbWrite._push([{ id: testMediaShare.mediaShareId }]);
      // getStreamData
      serviceContext.dbConnections['core'].read._push([]);
      mediaDbWrite._push([testSharedMention.sharedMentionResult]);

      const result = await dalShare.shareMention(util.makeContext(), {
        input: testSharedMention.sharedMentionInput
      });
      expect(result).toBeDefined();
      expect(result.objectId).toEqual(
        testSharedMention.sharedMentionInput.mentionId
      );
      expect(result.objectType).toEqual('mention');
      expect(result.folderId).toBeUndefined();
      expect(result.mediaShare.token).toBeDefined();
      expect(result.mediaShare.isSegmented).toEqual(false);
    });

    it('should create a media share and return a share object - is segmented', async function () {
      serviceContext._clearAll();
      setupMockDals({
        mention: true,
        source: true,
        mediaStreams: true
      });
      // get tdo and source to check access
      serviceContext.dbConnections['core'].write._push([{ id: '54321' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 5678 }
      ]);
      mediaDbWrite._push([{ id: testMediaShare.mediaShareId }]);
      // getStreamData
      serviceContext.dbConnections['core'].read._push([
        { asset_id: 'assetId' }
      ]);
      mediaDbWrite._push([testSharedMention.sharedMentionResult]);

      const result = await dalShare.shareMention(util.makeContext(), {
        input: testSharedMention.sharedMentionInput
      });
      expect(result).toBeDefined();
      expect(result.mediaShare.token).toBeDefined();
      expect(result.mediaShare.isSegmented).toEqual(true);
    });

    it('should send email when recipients are included', async function () {
      setupMockDals({
        mention: true,
        source: true,
        mediaStreams: true
      });
      // get tdo and source to check access
      serviceContext.dbConnections['core'].write._push([{ id: '54321' }]);
      serviceContext.dbConnections['core'].read._push([
        { asset_id: 'assetId' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 5678 }
      ]);
      mediaDbWrite._push([{ id: testMediaShare.mediaShareId }]);
      mediaDbWrite._push([testSharedMention.sharedMentionResult]);

      const newInput = _.assign(
        {
          recipients: ['some@email.address.com', 'another@email.address.com']
        },
        testSharedMention.sharedMentionInput
      );
      const result = await dalShare.shareMention(util.makeContext(), {
        input: newInput
      });
      expect(result).toBeDefined();
      expect(sentEmailCount).toEqual(2);

      // validate emails for shared mentions
      expect(emailData.templateName).toEqual(
        discoveryMentionEmailTemplateWithMessage
      );

      const shareLink = `${serviceContext.config.pageUris.discoveryShareLinkUrl}${result.shareId}`;
      expect(emailData.mergeKvp.share_link).toEqual(shareLink);
      expect(emailData.mergeKvp.program_name).toBeDefined();
      expect(emailData.mergeKvp.program_image).toBeDefined();
    });

    it('should send correct email when sharing a mention from collections app', async function () {
      setupMockDals({
        mention: true,
        source: true,
        mediaStreams: true
      });
      // get tdo and source to check access
      serviceContext.dbConnections['core'].write._push([{ id: '54321' }]);
      serviceContext.dbConnections['core'].read._push([
        { asset_id: 'assetId' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 5678 }
      ]);
      mediaDbWrite._push([{ id: testMediaShare.mediaShareId }]);
      mediaDbWrite._push([testSharedMention.sharedMentionResult]);

      const newInput = _.assign(
        {
          recipients: ['some@email.address.com', 'another@email.address.com'],
          app: 'collection-app'
        },
        testSharedMention.sharedMentionInput
      );
      const result = await dalShare.shareMention(util.makeContext(), {
        input: newInput
      });
      // validate emails for shared mentions
      expect(emailData.templateName).toEqual(collectionMentionEmailTemplate);
    });
  });

  describe('shareMentionInBulk', function () {
    beforeEach(() => {
      serviceContext._clearAll();
      mediaDbWrite._clearResultQueue();
      mediaDbRead._clearResultQueue();
    });
    it('should require a list of input mentionIds', async function () {
      try {
        await dalShare.shareMentionInBulk(util.makeContext(), { input: {} });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should return error when mentionId list is too large', async function () {
      try {
        await dalShare.shareMentionInBulk(util.makeContext(), {
          input: {
            mentionIds: [1, 2, 3, 4, 5, 6]
          }
        });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should return list of shared mentions', async function () {
      setupMockDals({ mention: true, collection: true, source: true });
      // get tdo and source to check access
      const json = {
        veritonePermissions: {
          acls: [{ groupId: '1' }]
        }
      };
      serviceContext.dbConnections['core'].write._push([{ id: '54321', json }]);
      serviceContext.dbConnections['core'].read._push([
        { asset_id: 'assetId' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 5678 }
      ]);
      mediaDbWrite._push([{ id: 'media-share-id-1' }]); // save media share
      mediaDbWrite._push([getGenericMention({}, { id: 1 })]); // save shared mention

      serviceContext.dbConnections['sso'].read._push([{ application_id: '1' }]);
      serviceContext.dbConnections['sso'].read._push([{ group_id: '1' }]);
      serviceContext.dbConnections['sso'].read._push([{ group_id: '1' }]);

      const shareOptions = {
        opt1: 'option 1',
        opt2: 'option 2'
      };
      const shares = await dalShare.shareMentionInBulk(util.makeContext(), {
        input: {
          mentionIds: [1],
          shareOptions: shareOptions
        }
      });

      expect(shares.length).toEqual(1);
      shares.forEach((s) => {
        expect(s.shareId).toBeDefined();
        expect(s.mentionId).toBeDefined();
        expect(s.folderId).toBeUndefined();
        expect(s.shareOptions).toEqual(shareOptions);
      });
    });
  });

  describe('getSharedMention', function () {
    it('should fail when no shareId is given', async function () {
      try {
        await dalShare.getSharedMention({}, {});
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should fail when not allowed', async function () {
      serviceContext.config.featureFlags = { allowSharedMentions: false };
      try {
        await dalShare.getSharedMention({}, { shareId: 'ABCDEFG' });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });

    it('should fail when sharing by mentionId is not allowed', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true,
        allowSharedMentionById: false
      };
      try {
        await dalShare.getSharedMention({}, { shareId: 1234 });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });

    it('should fail when mentionId is greater than the max allowed mentionId', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true,
        allowSharedMentionById: true,
        maxSharedMentionId: 100
      };
      try {
        await dalShare.getSharedMention({}, { shareId: 101 });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });

    it('should fail for mentions by mentionId if source does not exist', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true,
        allowSharedMentionById: true
      };
      setupMockDals({ mention: true });
      // get source
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dalShare.getSharedMention({}, { shareId: 1234 });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });

    it('should fail for a share token that does not exist', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true
      };
      setupMockDals({ mention: true, source: true });
      mediaDbRead._push([], false);

      try {
        await dalShare.getSharedMention({}, { shareId: 'NotExists' });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.data.objectType).toEqual('SharedMention');
      }
    });

    it('should fail for existing share token but corresponding mention no longer exists', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true
      };
      setupMockDals({ source: true });
      mediaDbRead._push([testSharedMention.sharedMentionResult], false);

      try {
        await dalShare.getSharedMention({}, { shareId: 'ABCDEFG' });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });

    it('should return a shared mention when mentionId is less than the max allowed mentionId', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true,
        allowSharedMentionById: true,
        maxSharedMentionId: 100
      };
      setupMockDals({ mention: true, source: true });
      // get source
      serviceContext.dbConnections['media_platform'].read._push([
        { id: '5678' }
      ]);
      const res = await dalShare.getSharedMention({}, { shareId: 99 });
      expect(res.id).toEqual(99);
    });

    it('should return a shared mention when mentionId is equal to the max allowed mentionId', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true,
        allowSharedMentionById: true,
        maxSharedMentionId: 100
      };
      setupMockDals({ mention: true, source: true });
      serviceContext.dbConnections['media_platform'].read._push([
        { id: '5678' }
      ]);
      const res = await dalShare.getSharedMention({}, { shareId: 100 });
      expect(res.id).toEqual(100);
    });

    it('should return a shared mention by mentionId when maxMentionId is 0', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true,
        allowSharedMentionById: true,
        maxSharedMentionId: 0
      };
      setupMockDals({ mention: true, source: true });
      serviceContext.dbConnections['media_platform'].read._push([
        { id: '5678' }
      ]);
      const res = await dalShare.getSharedMention({}, { shareId: 99999 });
      expect(res.id).toEqual(99999);
    });

    it('should return a shared mention for a valid share token', async function () {
      serviceContext.config.featureFlags = {
        allowSharedMentions: true
      };
      setupMockDals({ mention: true, source: true });
      mediaDbRead._push([testSharedMention.sharedMentionResult], false);

      const res = await dalShare.getSharedMention({}, { shareId: 'ABCDEFG' });
      expect(res.id).toEqual(1234);
      expect(res.share).toEqual(
        testSharedMention.sharedMentionResult.shareInfo
      );
    });
  });

  describe('getSharedMentions', function () {
    it('should return empty list for missing ids', async function () {
      const sharedMentions = await dalShare.getSharedMentions(
        serviceContext,
        {}
      );
      expect(sharedMentions.count).toEqual(0);
    });
    it('should return list of shared mentions', async function () {
      // set up mock data
      setupMockDals({ mention: true });
      const shares = [1, 2, 3].map((id) =>
        getGenericShare({ shareId: id, objectId: id })
      );
      const shareIds = shares.map((share) => share.sharedId);
      mediaDbRead._push(shares, false);

      const sharedMentions = await dalShare.getSharedMentions(serviceContext, {
        shareId: shareIds
      });

      expect(sharedMentions).toBeDefined();
      expect(sharedMentions.count).toEqual(3);
      [1, 2, 3].forEach((mentionId) => {
        const sharedMention = _.find(
          sharedMentions.records,
          (sm) => sm.id === mentionId
        );
        const share = _.find(
          shares,
          (share) => share.shareInfo.objectId === mentionId
        );
        expect(sharedMention).toBeDefined();
        expect(sharedMention.share).toEqual(share.shareInfo);
      });
      expect(
        new Date(sharedMentions.records[0].mentionDate).getTime()
      ).toBeGreaterThanOrEqual(
        new Date(sharedMentions.records[1].mentionDate).getTime()
      );
    });
  });

  describe('getSharedCollection', function () {
    it('should return error for missing shareId', async function () {
      try {
        await dalShare.getSharedCollection({}, {});
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should return error for an invalid shared collection', async function () {
      mediaDbRead._push([], false);
      try {
        await dalShare.getSharedCollection(
          {},
          { shareId: 'collection-shareId' }
        );
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.data.objectType).toEqual('SharedCollection');
      }
    });
    it('should return not found for shareId corresponding to a mention', async function () {
      mediaDbRead._push(
        [
          {
            shareInfo: {
              objectId: '7890',
              objcectType: 'mention'
            }
          }
        ],
        false
      );
      try {
        await dalShare.getSharedCollection({}, { shareId: 'collection' });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should return error for a collection that no longer exists', async function () {
      mediaDbRead._push(
        [
          {
            shareInfo: {
              objectId: '7890',
              objcectType: 'collection'
            }
          }
        ],
        false
      );
      setupMockDals({});
      try {
        await dalShare.getSharedCollection({}, { shareId: 'collection' });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should successfully return a shared collection', async function () {
      mediaDbRead._push(
        [
          getGenericShare({
            shareId: 'share1',
            collection: true,
            objectId: 1
          })
        ],
        false
      );
      setupMockDals({ collection: true });
      dalShare = require('./share')(serviceContext);
      const result = await dalShare.getSharedCollection(
        {},
        { shareId: 'share1' }
      );
      expect(result).toBeDefined();
      expect(result.shareInfo.shareId).toEqual('share-id-1');
      expect(result.shareInfo.sharedMentions.length).toEqual(2);
      expect(result.image).toBeDefined();
      expect(result.programCount).toBeDefined();
      expect(result.folderId).toBeDefined();
      expect(result.organizationId).toBeDefined();
    });
  });

  describe('shareCollection', function () {
    it('should return error for an invalid collection', async function () {
      setupMockDals({});
      try {
        await dalShare.shareCollection(util.makeContext(), {
          input: {
            folderId: 1234567
          }
        });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should successfully create a shared collection', async function () {
      setupMockDals({ mention: true, collection: true, source: true });
      const context = util.makeContext();

      // set up mocks
      mediaDbWrite._push([{ id: 'media-share-id-1' }]); // save media share
      mediaDbWrite._push([getGenericMention({}, { id: 1 })]); // save shared mention
      mediaDbWrite._push([{ id: 'media-share-id-2' }]);
      mediaDbWrite._push([getGenericMention({}, { id: 2 })]);
      mediaDbWrite._push([
        getGenericShare({
          shareId: 'share1',
          collection: true,
          objectId: 1
        })
      ]); // save shared collection

      const newInput = _.assign(
        {
          recipients: ['some@email.address.com', 'another@email.address.com']
        },
        {
          folderId: 5678,
          shareMessage: 'share mention message',
          shareOptions: {
            opt1: 'option 1',
            opt2: 'option 2'
          }
        }
      );

      const share = await dalShare.shareCollection(context, {
        input: newInput
      });
      expect(share.objectType).toEqual('collection');
      expect(share.organizationId).toBeDefined();

      // validate emails
      expect(sentEmailCount).toEqual(2);
      expect(emailData.templateName).toEqual(collectionEmailTemplate);

      const shareLink = `${serviceContext.config.pageUris.collectionsShareLinkUrl}${share.shareId}`;
      expect(emailData.mergeKvp.share_link).toEqual(shareLink);
      expect(emailData.mergeKvp.collection_name).toBeDefined();
      expect(serviceContext.messageUtil._counter()).toEqual(1);
    });
  });

  describe('getShareButtonText', function () {
    it('returns correct text depending on the source type', function () {
      expect(dalShare.getShareButtonText({ sourceTypeId: '1' })).toEqual(
        'Listen to'
      );
      expect(dalShare.getShareButtonText({ sourceTypeId: '17' })).toEqual(
        'Watch'
      );
      expect(dalShare.getShareButtonText({ sourceTypeId: '100' })).toEqual('');
    });
  });

  describe('getMentionSnippetText', function () {
    const snippets = [{ text: 'foo-' }, { note: 'no text' }, { text: 'bar@' }];
    it('should return correct text from user snippets', function () {
      expect(
        dalShare.getMentionSnippetText({ userSnippets: snippets })
      ).toEqual('foo...bar');
    });
    it('should return correct text from mention snippets if there are no user snippets', function () {
      expect(
        dalShare.getMentionSnippetText({ mentionSnippets: snippets })
      ).toEqual('foo...bar');
    });
    it('should return blank with empty snippets', function () {
      expect(dalShare.getMentionSnippetText({ id: 'mentionId' })).toEqual('');
    });
  });

  describe('email data testing', function () {
    const context = util.makeContext();
    const share = getGenericShare({
      shareId: 'share-id-1234',
      objectId: 1234
    });

    beforeEach(() => {
      setupMockDals({});
    });

    describe('sendMentionEmail', function () {
      const mention = getGenericMention(context, 1234);
      it('should not send when there are no recipients', function () {
        dalShare.sendMentionEmail(
          context,
          share.shareInfo,
          mention,
          'some-app'
        );
        expect(emailData).toEqual({});
      });
      it('should send correct template for collection app', function () {
        share.shareInfo.recipients = ['email@me.com'];
        dalShare.sendMentionEmail(
          context,
          share.shareInfo,
          mention,
          'collection-app'
        );
        expect(emailData.templateName).toEqual(collectionMentionEmailTemplate);
      });
      it('should send correct template for discovery app, with message', function () {
        share.shareInfo.recipients = ['email@me.com'];
        share.shareInfo.shareMessage = 'hello';
        dalShare.sendMentionEmail(
          context,
          share.shareInfo,
          mention,
          'discovery-app'
        );
        expect(emailData.templateName).toEqual(
          discoveryMentionEmailTemplateWithMessage
        );
        expect(emailData.mergeKvp.custom_message.length).toBeGreaterThan(0);
      });
      it('should set program info correctly from mention metatdata', function () {
        // metadata.veritone-program is default
        share.shareInfo.recipients = ['email@me.com'];
        dalShare.sendMentionEmail(
          context,
          share.shareInfo,
          mention,
          'discovery-app'
        );
        expect(emailData.mergeKvp.program_name).toBeDefined();
        expect(emailData.mergeKvp.program_image).toBeDefined();

        // metadata.veritoneProgram
        mention.metadata = {
          veritoneProgram: {
            programName: 'Program Name',
            programImage: 'Program Image'
          }
        };
        dalShare.sendMentionEmail(
          context,
          share.shareInfo,
          mention,
          'discovery-app'
        );
        expect(emailData.mergeKvp.program_name).toBeDefined();
        expect(emailData.mergeKvp.program_image).toBeDefined();
      });
    });
    describe('sendCollectionEmail', function () {
      const collection = getGenericCollectionList(context, { id: 567 })
        .records[0];
      share.shareInfo.objectType = 'collection';

      it('should not send when there are no recipients', function () {
        share.shareInfo.recipients = [];
        dalShare.sendCollectionEmail(
          context,
          share.shareInfo,
          collection,
          'collection-app'
        );
        expect(emailData).toEqual({});
      });
      it('should send correct template for a collection', function () {
        share.shareInfo.recipients = ['email@me.com'];
        dalShare.sendCollectionEmail(context, share.shareInfo, collection);
        expect(emailData.templateName).toEqual(collectionEmailTemplate);
      });
    });
  });

  describe('updateSharedCollectionMentions', function () {
    it('should check for missing inputs', async function () {
      try {
        await dalShare.updateSharedCollectionMentions(util.makeContext(), {});
        throw new Error('Expected error not caught');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should check for invalid update type', async function () {
      try {
        await dalShare.updateSharedCollectionMentions(util.makeContext(), {
          shareId: 'share',
          mentionIds: [1, 2],
          type: 'foo'
        });
        throw new Error('Expected error not caught');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    xit('should update the share', async function () {
      setupMockDals({ mention: true, collection: true, source: true });
      const share = getGenericShare({
        collection: true,
        objectId: 567
      });

      // we will check that the update sql was called appropriately
      function checkFunc(isAdd) {
        const length = isAdd ? 4 : 2;
        return function (sql, values) {
          const shareInfo = values[1];
          return shareInfo.sharedMentions.length === length;
        };
      }

      mediaDbRead._push([share], false); // get share
      // get source to check access
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 5678 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { media_source_id: 5678 }
      ]);
      mediaDbWrite._push([{ id: 'media-share-id-1' }]); // save media share
      mediaDbWrite._push([getGenericMention({}, { id: 1 })]); // save shared mention
      // get streams
      serviceContext.dbConnections['core'].read._push([]);
      mediaDbWrite._push([{ id: 'media-share-id-2' }]);
      mediaDbWrite._push([getGenericMention({}, { id: 2 })]);
      // get streams
      serviceContext.dbConnections['core'].read._push([]);
      mediaDbWrite._push([share], false, [], checkFunc(true)); // update share
      mediaDbRead._push([share], false); // get share
      mediaDbWrite._push([share], false, [], checkFunc(false)); // update share

      let updatedShare = await dalShare.updateSharedCollectionMentions(
        util.makeContext(),
        {
          type: 'AddMentions',
          shareId: 'shared-id-567',
          mentionIds: [111, 222]
        }
      );
      expect(updatedShare).toBeDefined();
      updatedShare = await dalShare.updateSharedCollectionMentions(
        util.makeContext(),
        {
          type: 'RemoveMentions',
          shareId: 'shared-id-567',
          mentionIds: [111, 222]
        }
      );
      expect(updatedShare).toBeDefined();
    });
  });

  describe('getSharedCollectionHistory', function () {
    it('should throw error for missing filters', async function () {
      try {
        await dalShare.getSharedCollectionHistory(util.makeContext(), {});
        throw new Error('Expected error not caught');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should return shared collection history', async function () {
      const now = moment.utc().toISOString();
      const secondAgo = moment.utc().subtract(1, 'second').toISOString();
      mediaDbRead._push([
        {
          id: 2,
          type: 'update',
          folderId: 1234,
          shareId: 'shared-collection-1234',
          status: 'New',
          updateType: 'AddMention',
          mentionId: 4321,
          retryCount: 0,
          createdDateTime: secondAgo,
          modifiedDateTime: secondAgo
        },
        {
          id: 1,
          type: 'new',
          folderId: 1234,
          shareId: 'shared-collection-1234',
          status: 'InProgress',
          retryCount: 0,
          createdDateTime: now,
          modifiedDateTime: now
        }
      ]);

      const historyList = await dalShare.getSharedCollectionHistory(
        util.makeContext(),
        {
          shareId: 'shared-collection-1234',
          folderId: 1234
        }
      );

      expect(historyList).toBeDefined();
      expect(historyList.count).toEqual(2);
    });
  });

  describe('calculateIsoWeek', function () {
    /* postgres code:
    SELECT
      'shared_url_' ||
      to_char(generate_series, 'YYYY_MM_IW')
    AS name
    FROM generate_series(
      startDt::DATE,
      endDt::DATE,
      '7 days'
    )*/
    it('should return correct week', function () {
      expect(
        dalShare.calculateIsoWeek(moment('2019-04-06T16:37:05.914Z'))
      ).toEqual(14);
      expect(
        dalShare.calculateIsoWeek(moment('2019-04-07T16:37:05.914Z'))
      ).toEqual(14);
      expect(
        dalShare.calculateIsoWeek(moment('2019-04-14T16:37:05.914Z'))
      ).toEqual(15);
      expect(
        dalShare.calculateIsoWeek(moment('2019-02-24T16:37:05.914Z'))
      ).toEqual(8);
      expect(dalShare.calculateIsoWeek(moment('2019-02-18T03:00:46Z'))).toEqual(
        8
      );
      expect(
        dalShare.calculateIsoWeek(moment('2019-02-17T16:00:46.914-07:00'))
      ).toEqual(7);
      expect(
        dalShare.calculateIsoWeek(moment('2019-04-29T16:37:05.914Z'))
      ).toEqual(18);
      expect(
        dalShare.calculateIsoWeek(moment('2018-12-31T16:37:05.914Z'))
      ).toEqual(53);
      expect(
        dalShare.calculateIsoWeek(moment('2016-01-01T16:37:05.914Z'))
      ).toEqual(53);
    });
  });
  describe('createSharedCollectionHistory', function () {
    it('should throw error for missing inputs', async function () {
      try {
        await dalShare.createSharedCollectionHistory({});
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should throw internal server error for a db write problem', async function () {
      mediaDbWrite._push([]);
      try {
        await dalShare.createSharedCollectionHistory({
          type: 'AddMention',
          folderId: '12345',
          shareId: 'shareId'
        });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('internal_error');
      }
    });
  });

  describe('updateSharedCollectionHistory', function () {
    it('should throw error for missing inputs', async function () {
      try {
        await dalShare.updateSharedCollectionHistory({}, { input: {} });
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should throw internal server error for a db write problem', async function () {
      try {
        mediaDbWrite._push([]);
        await dalShare.updateSharedCollectionHistory(
          {},
          {
            input: {
              id: 1234
            }
          }
        );
        throw new Error('Expected error not thrown');
      } catch (err) {
        expect(err.name).toEqual('internal_error');
      }
    });
  });
});

function setupMockDals(opts) {
  serviceContext.dal.mention = {
    getMention: opts.mention
      ? getGenericMention
      : (any) => {
          throw new errors.NotFound({});
        },
    getMentions: (any) => {
      return [
        getGenericMention({}, { id: 1 }),
        getGenericMention({}, { id: 2 }),
        getGenericMention({}, { id: 3 })
      ];
    }
  };

  serviceContext.dal.notification = {
    sendEmailTemplate: (context, data) => {
      sentEmailCount++;
      emailData = _.cloneDeep(data);
      return;
    }
  };
  serviceContext.dal.collection = {
    getCollections: opts.collection
      ? getGenericCollectionList
      : (any) => {
          return { count: 0, records: [] };
        }
  };
}

function getGenericMention(context, args) {
  return {
    id: args.id || args.mentionId,
    sourceId: 5678,
    scheduleId: 9876,
    mentionDate: '2019-01-01T00:00:00.000Z',
    endDateTime: '2019-01-01T00:05:00.000Z',
    mediaId: '54321',
    metadata: {
      'veritone-program': {
        programName: 'Program Name',
        programImage: 'Program Image'
      }
    }
  };
}

function getGenericCollectionList(context, args) {
  return {
    count: 1,
    records: [
      {
        name: 'Generic Collection',
        image: 'an image uri',
        id: args.id,
        folderTypeId: 'folderTypeId',
        organizationId: args.organizationId,
        programCount: 1,
        mentionIds: args.includeMentionIds ? '1,2' : null
      }
    ]
  };
}

function getGenericShare(opts) {
  const shareId = `share-id-${opts.objectId}`;
  return {
    shareId: shareId,
    organizationId: 7682,
    shareInfo: {
      shareId: shareId,
      objectType: opts.collection ? 'collection' : 'mention',
      objectId: opts.objectId,
      userId: 'user987',
      organizationId: '7682',
      mediaShare: opts.collection
        ? null
        : {
            token: 'media-share-token',
            isSegment: false
          },
      sharedMentions: !opts.collection
        ? null
        : [
            { shareId: 'mentionShare1', mentionId: 1 },
            { shareId: 'mentionShare2', mentionId: 2 }
          ]
    }
  };
}

function getExistingSource(context, args) {
  return {
    records: [
      {
        id: args.id,
        isPublic: true
      }
    ]
  };
}

function getMediaStreams(context, any) {
  return [
    {
      uri: 'some uri',
      protocol: 'p1'
    },
    {
      uri: 'some uri',
      protocol: 'p2'
    }
  ];
}
