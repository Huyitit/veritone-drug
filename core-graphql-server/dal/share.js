const _ = require('lodash'),
  slugid = require('slugid'),
  mapper = require('./mapper.js'),
  humps = require('humps'),
  moment = require('moment'),
  jwt = require('jsonwebtoken'),
  { v4: uuidv4 } = require('uuid'),
  { events } = require('@veritone/core-messages/generated/pbjs/compiled');

module.exports = function createFunction(serviceContext) {
  const { logger, config, dbConnections, messageUtil } = serviceContext;
  const errors = require('../error')(config);
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
  const mainUtil = require('../util.js')(serviceContext);
  const dalUtil = require('./util')(config, serviceContext);
  const CACHE_KEY = 'SharedUrl';
  const dalPartitionGenerator = _.get(
    serviceContext,
    'app.dalPartitionGenerator'
  );

  const sharedCollectionUpdateType = {
    AddMentions: 'AddMentions',
    RemoveMentions: 'RemoveMentions',
    UpdateMentions: 'UpdateMentions'
  };

  function generateAccessToken(
    organizationId,
    applicationId,
    tdoId,
    sourceId,
    scheduledJobId
  ) {
    return jwt.sign(
      {
        contentApplicationId: applicationId,
        contentOrganizationId: organizationId,
        organizationId: organizationId,
        scope: [
          {
            actions: [
              'recording.read',
              'discovery.mentions.read',
              'cms.sources.read'
            ],
            resources: {
              recordingIds: [tdoId],
              sourceIds: [sourceId],
              scheduledJobIds: [scheduledJobId]
            }
          }
        ]
      },
      serviceContext.config.jwt.secret,
      {
        // TODO: when grapqhl signed uris are available reduce the expiration to 1hr.
        expiresIn: 2592000, // 30 days
        jwtid: uuidv4(),
        subject: 'engine-run' // hard-coded list in middlewareAuth
      }
    );
  }
  function addAccessTokenFromMention(shareObject, mention, applicationId) {
    if (
      !_.get(shareObject, 'shareInfo.mediaShare.accessToken') &&
      mention.organizationId
    ) {
      const token = generateAccessToken(
        mention.organizationId,
        applicationId,
        mention.mediaId,
        mention.sourceId,
        mention.scheduleId
      );
      _.set(shareObject, 'shareInfo.mediaShare.accessToken', token);
    }
  }

  async function createMediaShare(context, args) {
    const input = args.input;

    // validate that user has access to TDO or Source
    if (input.tdoId) {
      await serviceContext.dal.tdo.getTDO(context, {
        id: input.tdoId.toString(),
        organizationId: args.organizationId,
        applicationId: args.applicationId
      });
    }

    if (input.sourceId) {
      await serviceContext.dal.source.getSource(context, {
        id: input.sourceId,
        organizationId: args.organizationId,
        applicationId: args.applicationId
      });
    }

    // Not supporting edge
    const edgePayload = _.get(args, 'settings.edgePayload');
    if (edgePayload) {
      throw new errors.InvalidInput({ message: `Edge is not supported` });
    }

    const shareObject = validateSharedUrl(args.input);
    await insertSharedUrl(shareObject);

    // add to redis cache. async; no need to wait for it.
    serviceContext.redisCache.set(CACHE_KEY, shareObject.id, shareObject);

    let jwtToken = '';
    if (args.generateJWT) {
      let applicationId = args.applicationId;
      if (!applicationId) {
        applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
          args.organizationId
        );
      }
      jwtToken = generateAccessToken(
        args.organizationId,
        applicationId,
        input.tdoId.toString(),
        input.sourceId,
        input.scheduledJobId
      );
    }

    return {
      id: shareObject.id,
      url: `${config.services[shareObject.serviceName].uri}share/${
        shareObject.id
      }`,
      token: jwtToken
    };
  }

  async function getMediaShare(context, args) {
    // TODO validate that only specific services can lookup shared url data
    const id = args.id;

    // first check redis cache
    let shareObject = await serviceContext.redisCache.get(CACHE_KEY, id);

    if (shareObject) {
      if (
        shareObject.expireDateTime &&
        moment(shareObject.expireDateTime).isBefore(moment.utc(), 'day')
      ) {
        shareObject = null;
      }
    } else {
      const { tableName } = getSharedUrlTableNameAndPartition(args.id);
      // not in cache, so get from DB
      const sql = `SELECT * FROM ${tableName} WHERE id = $1 AND (expire_date_time IS NULL OR expire_date_time::date >= now()::date);`;
      const rows = await dbConnections['media_platform'].read.map(
        sql,
        [id],
        mapper.camelizeRootKeys
      );
      if (rows && rows.length > 0) {
        shareObject = _.get(rows, '[0]');

        // add to redis cache. async; no need to wait for it.
        serviceContext.redisCache.set(CACHE_KEY, shareObject.id, shareObject);
      }
    }
    if (!shareObject) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'MediaShare'
        }
      });
    }

    return shareObject;
  }

  function validateSharedUrl({
    mediaType,
    sourceId,
    tdoId,
    scheduledJobId,
    startDateTime,
    stopDateTime,
    startOffsetMs,
    expireDateTime
  }) {
    if (!sourceId && !tdoId) {
      throw new errors.InvalidInput({
        message: `Either a sourceId or tdoId is required`
      });
    }

    let missing = [];
    let shareObject = {};
    // Validates for different mediaType of share objects
    switch (mediaType) {
      case 'mediastream':
        if (!sourceId) missing.push('sourceId');
        if (!scheduledJobId) missing.push('scheduledJobId');
        if (!startDateTime) {
          missing.push('startDateTime');
        } else {
          startDateTime = new Date(startDateTime).toISOString();
        }
        if (!stopDateTime) {
          missing.push('stopDateTime');
        } else {
          stopDateTime = new Date(stopDateTime).toISOString();
        }

        shareObject = {
          tdoId,
          sourceId,
          scheduledJobId,
          startDateTime,
          stopDateTime,
          serviceName: 'media-streamer',
          mediaType
        };
        break;
      case 'image':
        if (!tdoId) missing.push('tdoId');
        if (startDateTime && startOffsetMs) {
          throw new errors.InvalidInput({
            message: `Can't use startOffsetMs and startDateTime together on '${mediaType}' mediaType. startOffsetMs is preferred.`
          });
        }
        if (startDateTime) {
          startDateTime = new Date(startDateTime).toISOString();
        }

        shareObject = {
          tdoId,
          startDateTime,
          startOffsetMs: startOffsetMs || 0,
          serviceName: 'media-streamer',
          mediaType
        };
        break;
      default:
        throw new errors.InvalidInput({
          message: `Type: ${mediaType} is not valid`
        });
    }

    if (missing.length > 0) {
      throw new errors.InvalidInput({
        message: `${missing.join(', ')} ${
          missing.length > 1 ? 'are' : 'is'
        } required for ${mediaType} mediaType`
      });
    }

    if (expireDateTime) shareObject.expireDateTime = expireDateTime;

    return shareObject;
  }

  function calculateIsoWeek(timestamp) {
    // normalize to UTC to match database
    const m = moment(timestamp).utc();

    const week = m.isoWeek();
    const month = m.month();

    if (month === 11 && week === 1) {
      // postgres IW matches this
      const lastWeek = m.subtract(7, 'day').isoWeek();
      return lastWeek + 1;
    } /*else if (month === 0 && week > 50) {
      return 0;
    } does not match ISO standard or postgres IW format */
    return week;
  }

  function getSharedUrlTableNameAndPartition(id) {
    const sharedUrlActiveDate = _.get(config, 'sharedUrlPartitionActiveDate');
    const sharedUrlPartitionActive = dateIdUtil.isTablePartitionActive(
      sharedUrlActiveDate,
      id
    );
    let partition = 'shared_url';
    let tableName = partition;

    if (sharedUrlPartitionActive) {
      partition = dateIdUtil.getSharedUrlTablePartition(id);
      tableName = `share.${partition}`;
    }

    return {
      tableName,
      partition
    };
  }

  async function insertSharedUrl(args) {
    const expireDateTime = args.expireDateTime || null;
    const expireDateTimeStr = expireDateTime
      ? `'${moment(expireDateTime).toISOString()}'`
      : 'NULL';

    args.id = dateIdUtil.generateSharedUrlId(moment().unix());

    const { tableName, partition } = getSharedUrlTableNameAndPartition(args.id);

    args.expireDateTime = expireDateTime
      ? moment(expireDateTime).toISOString()
      : null;

    let columnNames = [];
    let valueTemplates = [];
    let values = [];

    [
      'id',
      'sourceId',
      'tdoId',
      'scheduledJobId',
      'startDateTime',
      'stopDateTime',
      'startOffsetMs',
      'stopOffsetMs',
      'settings',
      'serviceName',
      'mediaType',
      'expireDateTime'
    ].forEach((columnName) => {
      if (args[columnName]) {
        values.push(args[columnName]);
        columnNames.push(humps.decamelize(columnName));
        valueTemplates.push(`$${values.length}`);
      }
    });

    const columnStr = columnNames.join(',');
    const valuesStr = valueTemplates.join(',');

    const sql = `INSERT INTO ${tableName} (${columnStr})
      VALUES (${valuesStr})
      ON CONFLICT ON CONSTRAINT ${partition}_no_duplicates
      DO UPDATE SET expire_date_time = ${expireDateTimeStr}
      RETURNING id;`;

    let result;

    try {
      result = await dbConnections['media_platform'].write.query(sql, values);
    } catch (error) {
      logger.error('Error when creating share', error);
      const errorCode = _.get(error, 'data.internalData.code');
      const pgErrorCodes = dalPartitionGenerator.pgErrorCodes;

      // catch the share_url partition table does not exists
      if (pgErrorCodes[errorCode] === pgErrorCodes['42P01']) {
        // try to create the share_url partition table if not exists
        await validateShareUrlTablePartition(moment.utc());
        // retry create share
        result = await dbConnections['media_platform'].write.query(sql, values);
      } else {
        throw new errors.InternalServerError({
          message: 'Failed to create share: ' + (error.message || error)
        });
      }
    }

    if (!result) {
      logger.error(`Could not save media share to db ${args.id}`);
      throw new errors.InternalServerError();
    }

    args.id = _.get(result, '[0].id');
    if (!args.id) {
      logger.error('No id given when saving media share to the db');
      throw new errors.InternalServerError();
    }
  }

  async function getSharedMention(context, args) {
    if (!args.shareId) {
      throw new errors.InvalidInput({
        message: 'Missing shareId'
      });
    }
    const allowSharedMentions = _.get(
      config,
      'featureFlags.allowSharedMentions',
      true
    );
    const allowSharedMentionById = _.get(
      config,
      'featureFlags.allowSharedMentionById',
      false
    );
    const maxSharedMentionId = _.get(
      config,
      'featureFlags.maxSharedMentionId',
      0
    ); // if 0, then all mentionIds are allowed

    if (!allowSharedMentions) {
      throw new errors.NotAllowed();
    }

    let shareObject = {};
    let mentionId;
    let mention;

    if (isNaN(args.shareId)) {
      // args.shareId is UUID shareId
      shareObject = await getShare(args.shareId, 'mention');
      if (shareObject) {
        mentionId = _.get(shareObject, 'shareInfo.objectId');
        mention = await serviceContext.dal.mention.getMention(context, {
          id: mentionId
        });
        if (mention.organizationId) {
          const applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
            mention.organizationId
          );
          if (mention) {
            addAccessTokenFromMention(shareObject, mention, applicationId);
          }
        }
      }
    } else {
      // args.shareId is actually an mentionId.
      // We can support this for now, but apps should create share tokens instead
      mentionId = parseInt(args.shareId);
      if (
        allowSharedMentionById &&
        (maxSharedMentionId === 0 || mentionId <= maxSharedMentionId)
      ) {
        mention = await serviceContext.dal.mention.getMention(context, {
          id: mentionId
        });
        if (mention) {
          const orgId = _.get(context, '_authInfo.organization.organizationId');
          const sources = await serviceContext.dal.source.getSources(context, {
            id: mention.sourceId || mention.mediaSourceId,
            includePublic: true,
            organizationId: orgId,
            limit: 1
          });
          // enforce source permission
          if (sources.records.length > 0 && sources.records[0]) {
            // logging this so we can keep track of what kind of mentions are still being shared by mentionId
            const msg = sources.records[0].isPublic ? '' : 'private';
            logger.debug(
              `Allowing request for ${msg} shared mention by mentionId: ${args.shareId}`
            );
          } else {
            mention = null;
          }
        }
      } else {
        logger.debug(
          `Request denied for shared mention by mentionId: ${args.shareId}`
        );
      }
    }

    if (!mention) {
      throw new errors.NotFound({
        data: {
          objectId: args.shareId,
          objectType: 'SharedMention'
        }
      });
    }

    mention.share = shareObject.shareInfo || {};
    mention.scheduledJobId = mention.scheduleId;
    return mention;
  }

  async function getSharedMentions(context, args) {
    let sharedMentions = [];

    if (args.shareId && args.shareId.length > 0) {
      const mentionArgs = _.clone(args);
      mentionArgs.objectType = 'mention';
      const shares = await getShares(mentionArgs);
      const appIdMap = new Map();
      sharedMentions = await Promise.all(
        shares.map(async (share) => {
          const mention = await serviceContext.dal.mention.getMention(context, {
            id: share.shareInfo.objectId,
            organizationId: share.shareInfo.organizationId
          });
          let applicationId = appIdMap.get(mention.organizationId);
          if (!applicationId && mention.organizationId) {
            applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
              mention.organizationId
            );
            appIdMap.set(mention.organizationId, applicationId);
          }
          addAccessTokenFromMention(share, mention, applicationId);
          mention.share = share.shareInfo;
          // for mentions in shared collections
          mention.folderId = args.folderId;

          return mention;
        })
      );
    }
    return mainUtil.toPage(args, sharedMentions);
  }

  async function getShares(args) {
    const where = [];
    const values = [];

    mainUtil.addSqlWhere(
      'share_id',
      args.shareId || args.shareIds,
      where,
      values
    );

    mainUtil.addSqlWhere(
      `share_info->>'objectId'`,
      args.objectId,
      where,
      values
    );

    mainUtil.addSqlWhere(
      `share_info->>'objectType'`,
      args.objectType,
      where,
      values
    );
    const whereClause = where.join(' AND\n ');

    let joinClause = '';
    let orderByClause = '';
    if (args.objectType === 'mention') {
      joinClause = `LEFT OUTER JOIN mention
      ON (share.share_info->>'mentionId')::BIGINT = mention.mention_id`;
      orderByClause = `ORDER BY mention.mention_date DESC`;
    }

    const sql = `
      SELECT
        share.share_id,
        share.organization_id,
        share.share_info
      FROM
        share
      ${joinClause}
      WHERE
        ${whereClause}
      ${orderByClause}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30}
    `;

    const rows = await dbConnections['media_platform'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    return rows;
  }
  async function getShare(shareId, shareType) {
    const rows = await getShares({
      shareId: shareId,
      objectType: shareType,
      limit: 1
    });
    if (rows && rows.length > 0) {
      return rows[0];
    }

    throw new errors.NotFound({
      data: {
        objectId: shareId,
        objectType: `Shared${_.upperFirst(shareType)}`
      }
    });
  }

  async function getCollection(context, share, includeMentions = false) {
    const collections = await serviceContext.dal.collection.getCollections(
      context,
      {
        id: share.shareInfo.objectId,
        organizationId: share.organizationId,
        includeMentionIds: includeMentions,
        limit: 1
      }
    );
    if (collections.count > 0) {
      return collections.records[0];
    }
    return null;
  }

  async function getSharedCollection(context, args) {
    if (!args.shareId) {
      throw new errors.InvalidInput({
        message: 'Missing shareId'
      });
    }

    const shareObject = await getShare(args.shareId, 'collection');
    const collection = await getCollection(context, shareObject);
    if (!collection) {
      throw new errors.NotFound({
        data: {
          objectId: args.shareId,
          objectType: 'SharedCollection'
        }
      });
    }

    if (!shareObject.shareInfo.sharedMentions) {
      shareObject.shareInfo.sharedMentions = [];
    }

    return Object.assign(
      {
        folderId: collection.id,
        folderTypeId: collection.typeId,
        shareInfo: shareObject.shareInfo
      },
      collection
    );
  }

  async function shareMention(context, args) {
    const { input } = args;
    input.objectId = input.mentionId;
    input.objectType = 'mention';
    const share = createShareObject(context, input);

    const mention = await serviceContext.dal.mention.getMention(context, {
      id: input.mentionId,
      organizationIds: input.organizationIds,
      organizationId: input.organizationId
    });

    const mediaShare = await createMediaShare(context, {
      input: {
        mediaType: 'mediastream',
        sourceId: mention.sourceId,
        tdoId: mention.mediaId,
        scheduledJobId: mention.scheduleId,
        startDateTime: mention.mentionDate,
        stopDateTime: mention.endDateTime
      },
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      generateJWT: _.get(input, 'shareOptions.generateAccessToken', false)
    });

    const streams = await serviceContext.dal.tdo.getStreamData(context, {
      id: `${mention.mediaId}`
    });

    share.shareInfo.mediaShare = {
      token: mediaShare.id,
      accessToken: mediaShare.token,
      isSegmented: streams.length > 0
    };

    if (input.folderId) {
      share.shareInfo.objectMetadata = { collectionId: input.folderId };
    }

    share.shareInfo.mentionId = mention.id;
    await insertShare(share);
    sendMentionEmail(context, share.shareInfo, mention, input.app);

    return share.shareInfo;
  }

  async function shareMentionInBulk(context, args) {
    const { input } = args;
    const { mentionIds, shareOptions, userId } = input;
    const defaultLimit = _.get(config, 'limitShareMentionInBulk', 100);

    if (!mentionIds) {
      throw new errors.InvalidInput({
        message: 'mentionIds is required and must be an array',
        data: {
          objectType: 'mentionId',
          objectId: mentionIds
        }
      });
    }

    if (mentionIds.length > defaultLimit) {
      throw new errors.InvalidInput({
        message: `The number of mentions exceeds ${defaultLimit}.`,
        data: {
          objectType: 'length of mentionIds array',
          objectId: mentionIds.length
        }
      });
    }

    let organizationId =
      input.organizationId ||
      _.get(context, '_authInfo.organization.organizationId');
    let applicationId =
      input.applicationId || _.get(context, '_authInfo.applicationId');
    if (!applicationId && organizationId) {
      applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
        organizationId
      );
    }

    const shares = await Promise.all(
      mentionIds.map(async (mentionId) => {
        let mentionShare = null;
        try {
          mentionShare = await shareMention(context, {
            input: {
              mentionId,
              shareOptions,
              organizationId,
              applicationId,
              userId
            }
          });
        } catch (err) {
          logger.error(
            `Errors creating a shared mention for ${mentionId}`,
            err
          );
          // We wont rethrow because we don't want callers to fail
        }
        return mentionShare;
      })
    );
    // return only successful ones
    return shares.filter((share) => Boolean(share));
  }

  async function shareCollection(context, args) {
    args.input.objectType = 'collection';
    args.input.objectId = args.input.folderId;
    args.input.shareLinkUrl =
      serviceContext.config.pageUris.collectionsShareLinkUrl;

    const folderId = args.input.folderId;
    const share = createShareObject(context, args.input);
    share.shareInfo.objectMetadata = {
      collectionId: folderId
    };

    const collection = await getCollection(context, share, true);
    if (!collection) {
      throw new errors.NotFound({
        data: {
          objectId: folderId,
          objectType: 'Collection'
        }
      });
    }

    share.shareInfo.folderId = folderId;
    await insertShare(share);
    sendCollectionEmail(context, share.shareInfo, collection);
    await emitNewCollectionShareEvent(folderId, share.shareId);
    return share.shareInfo;
  }

  async function emitNewCollectionShareEvent(folderId, shareId) {
    const history = await createSharedCollectionHistory({
      type: 'New',
      folderId,
      shareId
    });

    // Need to get core-messages version consolidated before we can use:
    // const newCollectionShareEvent = events.NewSharedCollection();

    const newCollectionShareEvent = {
      event: 'new_shared_collection',
      type: 'shared_collection',
      folderId,
      shareId,
      historyId: history.historyId
    };

    messageUtil.emitEvent(newCollectionShareEvent, 'events');
  }

  async function emitUpdateSharedCollectionEvent(
    folderId,
    shareId,
    mentionId,
    updateType
  ) {
    const history = await createSharedCollectionHistory({
      type: updateType,
      folderId: folderId,
      shareId: shareId,
      mentionId
    });
    // const updateSharedCollectionEvent = events.UpdateSharedCollection();
    const updateSharedCollectionEvent = {
      event: 'update_shared_collection',
      type: 'shared_collection',
      folderId,
      shareId,
      historyId: history.historyId,
      mentionId,
      updateType
    };
    messageUtil.emitEvent(updateSharedCollectionEvent, 'events');
  }

  function createShareObject(context, input) {
    // check the organizationId is passed in if internalAPI key is used
    if (mainUtil.isInternalAPIKey(context._authInfo)) {
      if (!input.organizationId || !input.userId) {
        throw new errors.InvalidInput({
          message:
            'organizationId and userID need to be specified when using API token'
        });
      }
    }

    let userInfo = context.requestContext.userInfo;
    if (!userInfo) {
      userInfo = {
        userId: input.userId,
        email: '',
        organization: {
          organizationId: input.organizationId
        }
      };
    }
    const shareId = slugid.nice();

    let shareLinkUrl = serviceContext.config.pageUris.discoveryShareLinkUrl;
    if (input.objectType === 'collection' || input.app === 'collection-app') {
      shareLinkUrl = serviceContext.config.pageUris.collectionsShareLinkUrl;
    }

    const share = {
      shareId: shareId,
      organizationId: userInfo.organization.organizationId,
      shareInfo: {
        shareId: shareId,
        objectType: input.objectType,
        objectId: input.objectId,
        userId: userInfo.userId,
        fromName: dalUtil.getUserFullName(userInfo),
        fromEmail: userInfo.email,
        organizationId: userInfo.organization.organizationId.toString(),
        linkUrl: shareLinkUrl,
        recipients: input.recipients,
        shareOptions: input.shareOptions || {}
      }
    };

    if (input.shareMessage) {
      share.shareInfo.shareMessage = input.shareMessage;
    }

    return share;
  }

  async function insertShare(share) {
    const sql = `
      INSERT INTO share (
        share_id,
        organization_id,
        share_info,
        date_created
      )
      VALUES (
        $1,
        $2,
        $3,
        now()
      )
      RETURNING *;
    `;

    var values = [share.shareId, share.organizationId, share.shareInfo];
    return dbConnections['media_platform'].write
      .map(sql, values, mapper.camelizeRootKeys)
      .then((result) => {
        if (!result || result.length < 1) {
          logger.error(`Could not save share ${share.shareId}`);
          throw new errors.InternalServerError();
        }
      });
  }

  async function updateShare(share) {
    const sql = `
      UPDATE share
      SET share_info = $2
      WHERE share_id = $1
      RETURNING *;
    `;
    const values = [share.shareId, share.shareInfo];

    return dbConnections['media_platform'].write
      .map(sql, values, mapper.camelizeRootKeys)
      .then((result) => {
        if (!result || result.length < 1) {
          throw new errors.InternalServerError(
            `Could not update share ${share.shareId}`
          );
        } else {
          return result[0];
        }
      });
  }

  function sendMentionEmail(context, shareInfo, mention, sourceApp) {
    let templateId = 'share-mention-star';
    if (sourceApp === 'collection-app') {
      templateId = 'share-mention-one-app';
    } else if (shareInfo.shareMessage) {
      templateId = 'share-mention-star-with-message';
    }

    const mediaDate = new Date(mention.mentionDate).toLocaleString('en-us', {
      timeZoneName: 'short'
    });

    const emailVars = {
      invite_link: `${shareInfo.linkUrl}${shareInfo.shareId}`,
      media_date: mediaDate === 'Invalid Date' ? '' : mediaDate,
      snippets: getMentionSnippetText(mention),
      link_prefix: getShareButtonText(mention),
      custom_message: shareInfo.shareMessage || ''
    };
    (emailVars.program_name =
      _.get(mention, 'metadata.veritone-program.programName') ||
      _.get(mention, 'metadata.veritoneProgram.programName')),
      (emailVars.program_image =
        _.get(mention, 'metadata.veritone-program.programImage') ||
        _.get(mention, 'metadata.veritoneProgram.programImage')),
      sendShareEmail(context, shareInfo, templateId, emailVars);
  }

  function sendCollectionEmail(context, shareInfo, collection) {
    const templateId = 'share-collection-one-app';
    const emailVars = {
      collection_name: collection.name,
      message: shareInfo.shareMessage
    };
    sendShareEmail(context, shareInfo, templateId, emailVars);
  }

  function sendShareEmail(context, shareInfo, template, emailVars) {
    if (!shareInfo.recipients || shareInfo.recipients.length < 1) {
      return;
    }
    for (const r of shareInfo.recipients) {
      serviceContext.dal.notification.sendEmailTemplate(context, {
        fromEmail: shareInfo.fromEmail,
        fromName: shareInfo.fromName,
        templateName: template,
        toEmailAddress: r,
        mergeKvp: {
          ...emailVars,
          sender: shareInfo.fromName,
          share_link: `${shareInfo.linkUrl}${shareInfo.shareId}`,
          message: shareInfo.shareMessage
        }
      });
    }
  }

  function getMentionSnippetText(mention) {
    let text = '';
    const snippets = mention.userSnippets || mention.mentionSnippets;
    if (snippets) {
      text = snippets
        .map((snippet) => {
          return snippet.text ? snippet.text.replace(/[@,-]/g, '') : '';
        })
        .filter((snip) => snip.length > 0)
        .join('...');
    }
    return text;
  }

  // Share email link text
  function getShareButtonText(mention) {
    const MEDIA_SOURCE_TYPE_RADIO = '1',
      MEDIA_SOURCE_TYPE_TV = '2',
      MEDIA_SOURCE_TYPE_YOUTUBE_CHANNEL = '3',
      MEDIA_SOURCE_TYPE_PODCAST = '4',
      MEDIA_SOURCE_TYPE_YOUTUBE_VIDEO = '17',
      MEDIA_SOURCE_TYPE_YOUTUBE_LIVE_STREAM = '18';

    let text = '';
    switch (mention.sourceTypeId) {
      case MEDIA_SOURCE_TYPE_RADIO:
      case MEDIA_SOURCE_TYPE_PODCAST:
        text = 'Listen to';
        break;

      case MEDIA_SOURCE_TYPE_TV:
      case MEDIA_SOURCE_TYPE_YOUTUBE_CHANNEL:
      case MEDIA_SOURCE_TYPE_YOUTUBE_VIDEO:
      case MEDIA_SOURCE_TYPE_YOUTUBE_LIVE_STREAM:
        text = 'Watch';
        break;
    }
    return text;
  }

  // Adds/removes a list of mentionIds from the shared collection
  async function updateSharedCollectionMentions(context, args) {
    if (!args.shareId || _.isEmpty(args.mentionIds) || !args.type) {
      throw new errors.InvalidInput({ message: 'Missing required inputs' });
    }

    const updateTypes = ['AddMentions', 'RemoveMentions', 'UpdateMentions'];
    if (!updateTypes.includes(args.type)) {
      throw new errors.InvalidInput({
        message: 'Invalid update type provided'
      });
    }

    const share = await getShare(args.shareId, 'collection');
    const sharedMentions = _.get(share, 'shareInfo.sharedMentions', []);

    if (args.type === 'AddMentions') {
      // only update the ones that haven't already been created
      const toAdd = _.difference(
        args.mentionIds,
        sharedMentions.map((sm) => sm.mentionId)
      );

      const added = await shareMentionInBulk(context, {
        input: {
          mentionIds: toAdd,
          userId: _.get(share, 'shareInfo.userId'),
          organizationId: _.get(share, 'shareInfo.organizationId'),
          folderId: share.shareInfo.objectId,
          app: 'collection-app'
        }
      });
      if (args.mentionIds.length !== added.length) {
        logger.warn(
          `Not all shared mentions were created. Requested number of mentions to create: ${args.mentionIds.length}.  Actual ${added.length}`
        );
      }
      share.shareInfo.sharedMentions = _.concat(
        sharedMentions,
        added.map((sm) => {
          return {
            shareId: sm.shareId,
            mentionId: sm.mentionId
          };
        })
      );
    } else if (args.type === 'UpdateMentions') {
      const added = await shareMentionInBulk(context, {
        input: {
          mentionIds: args.mentionIds,
          userId: _.get(share, 'shareInfo.userId'),
          organizationId: _.get(share, 'shareInfo.organizationId'),
          folderId: share.shareInfo.objectId,
          app: 'collection-app'
        }
      });
      const mentionSharesMap = {};
      added.forEach((ms) => (mentionSharesMap[ms.mentionId] = ms.shareId));

      // Update shared mentions in place
      sharedMentions.forEach((sm) => {
        if (mentionSharesMap[sm.mentionId]) {
          sm.shareId = mentionSharesMap[sm.mentionId];
        }
      });
    } else {
      _.remove(sharedMentions, (sm) =>
        _.includes(args.mentionIds, sm.mentionId)
      );
    }

    return updateShare(share);
  }

  async function getSharedCollectionHistory(context, args) {
    const where = [];
    const values = [];

    if (_.isEmpty(args.ids) && !args.folderId && !args.shareId) {
      throw new errors.InvalidInput({
        message: 'Provide an ID, folder ID, or share ID to filter by'
      });
    }

    if (args.ids) {
      mainUtil.addSqlWhere('history_id', args.ids, where, values);
    }
    if (args.folderId) {
      mainUtil.addSqlWhere(
        'folder_id',
        args.folderId.toString(),
        where,
        values
      );
    }
    if (args.shareId) {
      mainUtil.addSqlWhere('share_id', args.shareId, where, values);
    }

    args.limit = args.limit || 30;
    args.offset = args.offset || 0;

    const query = `
      SELECT
        history_id as id,
        history_type as type,
        folder_id,
        share_id,
        status,
        mention_id,
        retry_count,
        created_date_time,
        modified_date_time
      FROM
        shared_collection_history
      WHERE
        ${where.join(' AND ')}
      ORDER BY modified_date_time DESC
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `;

    const results = await dbConnections['media_platform'].read.map(
      query,
      values,
      mapper.camelizeRootKeys
    );
    return mainUtil.toPage(args, results);
  }

  async function createSharedCollectionHistory(args) {
    if (!args.type || !args.folderId || !args.shareId) {
      throw new errors.InvalidInput({ message: 'Missing required inputs' });
    }

    const mentionId = args.mentionId || null;
    const sql = `
      INSERT INTO shared_collection_history (
        history_type,
        folder_id,
        share_id,
        mention_id,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING history_id;
    `;

    const values = [args.type, args.folderId, args.shareId, mentionId, 'New'];
    const result = await dbConnections['media_platform'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    if (_.isEmpty(result)) {
      throw new errors.InternalServerError(
        `Could not create shared collection history for share ${args.shareId}`
      );
    }
    return result[0];
  }

  async function updateSharedCollectionHistory(context, args) {
    const input = args.input;
    if (!input.id) {
      throw new errors.InvalidInput({
        message: 'id is required'
      });
    }

    const sql = `
      UPDATE shared_collection_history
      SET
        status = $2,
        status_note = $3,
        retry_count = $4,
        modified_date_time = $5
      WHERE history_id = $1
      RETURNING *;
    `;

    const values = [
      input.id,
      input.status,
      input.statusNote,
      input.retryCount,
      moment.utc().toISOString()
    ];
    return dbConnections['media_platform'].write
      .map(sql, values, mapper.camelizeRootKeys)
      .then((result) => {
        if (!result || result.length < 1) {
          throw new errors.InternalServerError(
            `Could not update shared collection history ${input.id}`
          );
        } else {
          return _.assign(
            {
              id: result[0].historyId,
              type: result[0].historyType
            },
            result[0]
          );
        }
      });
  }

  function validateShareUrlTablePartition(dateMoment) {
    dateMoment = dateMoment || moment.utc();
    const startDate = moment.utc(dateMoment).startOf('isoWeek');
    const endDate = moment.utc(dateMoment).endOf('isoWeek');

    return dalPartitionGenerator.createShareUrlPartitions(startDate, endDate);
  }

  return {
    createMediaShare,
    getMediaShare,
    getSharedMention,
    getSharedMentions,
    shareMention,
    shareMentionInBulk,
    getSharedCollection,
    shareCollection,
    updateSharedCollectionMentions,
    getSharedCollectionHistory,
    updateSharedCollectionHistory,
    getShares,
    emitUpdateSharedCollectionEvent,
    sharedCollectionUpdateType,

    // export for testing
    validateSharedUrl,
    createShareObject,
    sendMentionEmail,
    sendCollectionEmail,
    sendShareEmail,
    getShareButtonText,
    getMentionSnippetText,
    calculateIsoWeek,
    createSharedCollectionHistory
  };
};
