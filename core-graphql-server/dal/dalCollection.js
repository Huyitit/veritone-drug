const _ = require('lodash');
const mapper = require('./mapper.js');
const moment = require('moment');
const slugid = require('slugid');
const validator = require('validator');

const connectionStringKeys = {
  mention: 'media_platform',
  collection: 'media_platform',
  folder: 'media_platform',
  share: 'media_platform',
  user: 'sso',
  watchlist: 'media_platform',
  widget: 'media_platform',
  subscription: 'subscription'
};

module.exports = function createFunction(serviceContext, dalMention) {
  const { logger, config, dbConnections } = serviceContext;
  const errors = require('../error')(config);
  const dalUtil = require('./util')(config, serviceContext);
  const InvalidInput = errors.InvalidInput;
  const NotFound = errors.NotFound;

  const model = require('../modules/core-collection-server/model')(config);
  const resolverUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util.js')();
  const dalFolder =
    serviceContext.dal.folder || require('./dalFolder')(serviceContext);

  const dbRead = dbConnections['media_platform'].read;
  const dbWrite = dbConnections['media_platform'].write;

  const widgetColumns = {
    widget_id: 'id',
    name: null,
    organization_id: null,
    folder_id: 'collection_id',
    display_collection_name: null,
    display_logo: null,
    display_mention_intro: null,
    display_transcription: null,
    width: null,
    number_of_mentions_to_show: null,
    seo_tags: null,
    ad_script: null,
    background_color: null,
    border_color: null,
    text_color: null,
    date_created: 'created_date_time',
    display_collection_description: null,
    display_mention_description: null,
    next_button_color: null
  };

  const folderMentionColumns = {
    folder_id: null,
    mention_id: null,
    organization_id: null,
    date_created: 'created_date_time',
    date_modified: 'modified_date_time',
    description: null
  };

  /**
   * Retrieve Widget
   * @method getWidget
   * @param  {Object} context  object
   * @param  {String} args    string
   * @return {Json}   jsondata json
   */
  async function getWidget(context, args) {
    const widgets = await getWidgets(context, {
      id: args.id,
      folderId: args.collectionId ? parseInt(args.collectionId) : null,
      organizationId: args.organizationId
    });

    if (widgets.count === 0) {
      throw new NotFound({
        data: { objectId: args.id, objectType: 'Widget' }
      });
    }

    return widgets.records[0];
  }

  async function getWidgets(context, args) {
    const where = [];
    const values = [];

    mainUtil.addSqlWhere('organization_id', args.organizationId, where, values);
    mainUtil.addSqlWhere('folder_id', args.folderId, where, values);
    mainUtil.addSqlWhere('widget_id', args.id, where, values);
    args.limit = args.limit || 30;
    args.offset = args.offset || 0;

    const selectClause = mainUtil.makeSelectClause(widgetColumns);
    const query = `
      SELECT
        ${selectClause}
      FROM
        widget
      WHERE
        ${where.join(' AND ')}
      LIMIT ${args.limit}
      OFFSET ${args.offset}
      `;

    const results = await dbRead.map(query, values, mapper.camelizeRootKeys);
    return mainUtil.toPage(args, results);
  }

  /**
   * Create Widget
   * @method createWidget
   * @param  {Object} context  object
   * @param  {Object} args     object
   * @return {Json}   jsondata json
   */
  async function createWidget(args, context) {
    const input = args.input;
    input.widgetId = slugid.nice();
    input.organizationId = args.organizationId.toString();
    const widget = new model.Widget(input);

    // validate fields
    if (!input.nextButtonColor) {
      throw new errors.InvalidInput({
        message: 'nextButtonColor is required on createWidget'
      });
    }
    let validationErrs = widget.validate();
    if (validationErrs) {
      throw new InvalidInput({ data: validationErrs });
    }

    const shares = await serviceContext.dal.share.getShares({
      objectId: input.collectionId,
      objectType: 'collection',
      limit: 1
    });

    if (_.isEmpty(shares)) {
      // Just create a shared collection so we can reuse the
      // sharedMentions/mediaShares for the widget
      await serviceContext.dal.share.shareCollection(context, {
        input: {
          folderId: input.collectionId
        }
      });
    }

    let data;
    try {
      data = await _createWidget(widget);
    } catch (err) {
      // duplicate key value violates unique constraint "_ix_widget@name,folder_id,organization_id"
      if (_.toString(err).includes('violates unique constraint')) {
        throw new errors.ResourceConflict({
          message:
            'A widget with the supplied name already exists in the target folder.',
          data: {
            objectType: 'Widget',
            objectId: input.widgetId,
            folderId: input.folderId,
            widgetName: input.name
          }
        });
      } else throw err;
    }
    return mapper.camelizeRootKeys(data);
  }

  /**
   * Update Widget
   * @method updateWidget
   * @param  {Object} context  object
   * @param  {Object} args     object
   * @return {Json}   jsondata json
   */
  async function updateWidget(args, context) {
    // Validate access
    await getWidget(context, args.input);
    const { input } = args;
    // we should allow the caller to set seoTags to an empty array
    // so that they can clear existing values.
    // postgres will choke unless we use string literal to represent
    // the empty array.
    //error: cannot determine type of empty array\n    at Connection.parseE (/app/node_modules/pg-promise/node_modules/pg/lib/connection.js:539:11)\n    at Connection.parseMessage (/app/node_modules/pg-promise/node_modules/pg/lib/connection.js:366:17)\n    at Socket.<anonymous> (/app/node_modules/pg-promise/node_modules/pg/lib/connection.js:105:22)\n    at emitOne (events.js:116:13)\n    at Socket.emit (events.js:211:7)\n    at Shim.applySegment (/app/node_modules/newrelic/lib/shim/
    if (_.isArray(input.seoTags) && input.seoTags.length === 0) {
      input.seoTags = '{}';
    }
    const updatedWidget = _.omit(input, [
      'id',
      'applicationId',
      'applicationIds',
      'organizationId',
      'organizationIds'
    ]);
    const columnData = snakeCaseRootKeys(updatedWidget);

    const { sql, values } = mainUtil.makeUpdateSql(
      'widget',
      columnData,
      widgetColumns,
      'widget_id = $1',
      1
    );
    values.unshift(args.input.id);
    const result = await dbWrite.map(sql, values, mapper.camelizeRootKeys);
    return _.get(result, 0);
  }

  function snakeCaseRootKeys(obj) {
    const res = {};
    for (const key of Object.keys(obj)) {
      res[_.snakeCase(key)] = obj[key];
    }
    return res;
  }

  /**
   * Create Mention Comment
   * @method createMentionComment
   * @param  {Object} context  object
   * @param  {String} input    object
   * @return {Json}   jsondata json
   */
  async function createMentionComment(context, args) {
    const input = args.input;
    input.userId = resolverUtil.getClientInfo(context).id;
    const comment = new model.Comment(input);
    const user = await serviceContext.dal.admin.getUser(
      { id: input.userId },
      context
    );

    // validate fields
    const validationErrs = comment.validate();

    if (validationErrs) {
      throw new errors.InvalidInput({ data: validationErrs });
    }
    const result = Object.assign(
      {
        userImage: await resolverUtil.getSignedUrl(_.get(user, 'kvp.image')),
        firstName: dalUtil.sanitizeField(_.get(user, 'kvp.firstName')),
        lastName: dalUtil.sanitizeField(_.get(user, 'kvp.lastName'))
      },
      await _createMentionComment(comment)
    );

    return result;
  }

  /**
   * Update Mention Comment
   * @method updateMentionComment
   * @param  {Object} context  object
   * @param  {String} input    object
   * @return {Json}   jsondata json
   */
  async function updateMentionComment(context, args) {
    const input = args.input;
    input.userId = context.requestContext.userInfo.userId;
    const comment = new model.Comment(input);

    // validate fields
    const validationErrs = comment.validate();

    if (validationErrs) {
      throw new errors.InvalidInput({ data: validationErrs });
    }

    return _updateMentionComment(comment);
  }

  /**
   * Delete Mention Comment
   * @method deleteMentionComment
   * @param  {Object} context  object
   * @param  {String} input    object
   * @return {Json}   jsondata json
   */
  async function deleteMentionComment(context, args) {
    const input = args.input;
    input.userId = context.requestContext.userInfo.userId;
    const comment = new model.Comment(input);

    // validate fields
    const validationErrs = comment.validate();

    if (validationErrs) {
      throw new errors.InvalidInput({ data: validationErrs });
    }

    try {
      await _deleteMentionComment(comment);
      return {
        id: input.commentId,
        message: 'Deleted Successfully'
      };
    } catch (error) {
      throw new errors.InternalServerError({ 
        message: 'Failed to delete mention comment',
        data: { 
          commentId: input.commentId
        } 
      });
    }
  }

  /**
   * Create Mention Rating
   * @method createMentionRating
   * @param  {Object} context  object
   * @param  {String} input    object
   * @return {Json}   jsondata json
   */
  async function createMentionRating(context, args) {
    const input = args.input;
    input.userId = context.requestContext.userInfo.userId;
    const comment = new model.Rating(input);

    // validate fields
    const validationErrs = comment.validate();

    if (validationErrs) {
      throw InvalidInput({ data: validationErrs });
    }
    /* need to catch and handle this to avoid internal error:
    Error: Rating for the given user already exists
    at verifyRatingNonExistentCallback (/app/node_modules/core-collection-server/dal/mention.js:1297:29)
    */
    try {
      return await _createMentionRating(comment);
    } catch (err) {
      if (_.toString(err).includes('already exists')) {
        throw new errors.ResourceConflict({
          message:
            'The current user has already created a rating for this mention.',
          data: {
            objectType: 'Mention',
            objectId: input.mentionId,
            userId: input.userId
          }
        });
      } else throw err;
    }
  }

  /**
   * Update Mention Rating
   * @method updateMentionRating
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function updateMentionRating(context, args) {
    const input = args.input;
    input.userId = context.requestContext.userInfo.userId;

    const rating = new model.Rating(input);

    // validate fields
    const validationErrs = rating.validate();

    if (validationErrs) {
      throw new errors.InvalidInput({ data: validationErrs });
    }

    return _updateMentionRating(rating);
  }

  /**
   * Delete Mention Rating
   * @method deleteMentionRating
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function deleteMentionRating(context, args) {
    const input = args.input;
    input.userId = context.requestContext.userInfo.userId;
    const comment = new model.Rating(input);

    // validate fields
    const validationErrs = comment.validate();

    if (validationErrs) {
      throw new InvalidInput({ data: validationErrs });
    }

    try {
      await _deleteMentionRating(comment);
      return {
        id: input.ratingId,
        message: 'Deleted Successfully'
      };
    } catch (error) {
      throw new errors.InternalServerError({ 
        message: 'Failed to delete mention rating',
        data: { 
          ratingId: input.ratingId
        } 
      });
    }
  }

  /**
   * Create Collection
   * @method createCollection
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function createCollection(context, args) {
    const input = args.input;
    if (!input.organizationId) {
      throw new errors.InvalidInput({ message: 'organizationId is required' });
    }
    input.userId = context.requestContext.userInfo.userId;

    const collection = new model.Collection(_.omit(input, ['parentFolderId']));
    // validate fields
    const validationErrs = collection.validate();

    if (validationErrs) {
      throw new errors.InvalidInput({
        message: 'Validation Error: ' + validationErrs,
        data: { detail: validationErrs }
      });
    }

    try {
      const newCollection = await _createCollection(collection);
      newCollection.id = newCollection.folderId;
      newCollection.imageUrl = newCollection.image;
      if (input.parentFolderId) {
        checkId(input.parentFolderId, 'parentFolderId');
        const filed = await serviceContext.dal.folder.fileCollection(
          context,
          input.organizationId,
          input.parentFolderId,
          newCollection.folderId,
          serviceContext.dal.folder.TREE_OBJECT_TYPE.COLLECTION,
          input.orderIndex
        );
      }
      return newCollection;
    } catch (error) {
      throw new errors.InternalServerError({ 
        message: 'Failed to create collection',
        data: { 
          error
        } 
      });
    }
  }

  /**
   * Update Collection
   * @method updateCollection
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function updateCollection(context, args) {
    const input = args.input;
    if (!input.organizationId) {
      throw new errors.InvalidInput({ message: 'organizationId is required' });
    }
    checkId(input.folderId, 'folderId');
    const collection = new model.Collection(input);
    // validate fields
    const validationErrs = collection.validate();

    const updateParentFolder = !_.isNil(input.parentFolderId);

    if (validationErrs) {
      throw new InvalidInput({ data: validationErrs });
    }

    try {
      if (input.parentFolderId) {
        // first find current parent folder
        const folder = await serviceContext.dal.folder.getParentFolder(
          context,
          input.folderId,
          input.organizationId,
          false,
          'collection'
        );
        // if parent folder isn't really changing, don't bother moving watchlist.
        // this avoids an unnecessary heavyweight write query.
        if (
          !folder ||
          (folder.objectId !== input.parentFolderId &&
            folder.treeObjectId !== input.parentFolderId)
        ) {
          const moveArgs = {
            parentFolderId: input.parentFolderId,
            organizationId: input.organizationId
          };
          const moved = await serviceContext.dal.folder.moveCollection(
            context,
            moveArgs,
            collection
          );
        }
      }
      const updatedCollection = await _updateCollection(
        collection,
        updateParentFolder
      );

      if (!updatedCollection) {
        throw new NotFound({
          data: { objectId: args.id, objectType: 'Collection' }
        });
      }

      updatedCollection.id = updatedCollection.folderId;

      return updatedCollection;
    } catch (error) {
      throw new errors.InternalServerError({ 
        message: 'Failed to update collection',
        data: { 
          error
        } 
      });
    }
  }

  /**
   * Delete Collection
   * @method deleteCollection
   * @param  {Object} context  object
   * @param  {Object} args    object {organizationId, id}
   * @return {Json}   jsondata json
   */
  async function deleteCollection(context, args) {
    if (!args.organizationId) {
      throw new errors.InvalidInput({ message: 'organizationId is required' });
    }

    args.id = args.id || args.folderId;
    const collectionBulkQuery = new model.CollectionBulkQuery({
      collectionId: args.id,
      organizationId: `${args.organizationId}`
    });

    const validationErrs = collectionBulkQuery.validate();

    if (validationErrs) {
      throw new errors.InvalidInput({ data: validationErrs });
    }

    // get collection name for audit log
    const collection = await getCollection(context, {
      id: args.id,
      organizationId: args.organizationId
    });

    // delete the collection
    try {
      await _deleteCollection(collectionBulkQuery, context);
    } catch (err) {
      if (_.toString(err).includes('violates foreign key constraint')) {
        // update or delete on table "folder" violates foreign key constraint "_fk_widget__folder" on table "widget"
        throw new errors.ResourceConflict({
          message:
            'The collection cannot be deleted because it contains widgets or other content.',
          data: {
            objectId: args.id,
            objectType: 'Collection'
          }
        });
      } else throw err;
    }
    return {
      id: collection.id,
      message: 'Deleted Successfully'
    };
  }

  async function getCollectionMention(context, args) {
    const results = await getCollectionMentions(context, args);
    if (results.count === 0) {
      throw new errors.NotFound({
        message: 'Collection Mention not found',
        data: {
          folderId: args.folderId,
          mentionId: args.mentionId,
          objectType: 'CollectionMention'
        }
      });
    }

    return _.get(results, 'records[0]');
  }

  async function getCollectionMentions(context, args) {
    const { folderId, mentionId, organizationId, limit, offset } = args;

    if (_.isNil(folderId) && _.isNil(mentionId)) {
      throw new errors.InvalidInput({
        message:
          'At least one of folderId or mentionId must ' +
          'be specified on a collection mention query.',
        data: {
          folderId,
          mentionId
        }
      });
    }

    const where = [];
    const values = [];
    const orderClause = [];
    const orderByMap = {
      mentionDate: 'm.mention_date'
    };

    mainUtil.addSqlWhere('fm.folder_id', folderId, where, values);
    mainUtil.addSqlWhere('fm.mention_id', mentionId, where, values);
    mainUtil.addSqlWhere('fm.organization_id', organizationId, where, values);

    let sql = `SELECT fm.folder_id,
        fm.mention_id,
        fm.organization_id,
        fm.date_created as created_date_time,
        fm.date_modified as modified_date_time,
        fm.description
     FROM folder__mention fm`;

    if (args.orderBy) {
      const col = orderByMap[args.orderBy.field];

      if (!col) {
        throw new errors.InternalServerError({
          message:
            'An internal server configuration error in collection mentions order by processing has occurred.',
          data: {
            internalData: {
              orderByField: args.orderBy.field,
              knownFields: Object.keys(orderByMap)
            }
          }
        });
      }

      // Join table mention for sorting by mention date
      sql += '\n JOIN mention m on m.mention_id = fm.mention_id \n';
      orderClause.push(`${col} ${_.get(args, 'orderBy.direction', '')}`);
    }

    sql += ` WHERE ${where.join(' AND \n')} `;
    sql += orderClause.length ? ` ORDER BY ${orderClause.join(', ')}` : '';
    sql += `
     LIMIT ${limit || 30}
     OFFSET ${offset || 0}`;

    const results = await dbRead.map(sql, values, mapper.camelizeRootKeys);
    return mainUtil.toPage(args, results);
  }

  async function createCollectionMention(context, args) {
    const input = args.input;
    const { folderId, mentionId, organizationId } = input;

    if (!_.isString(folderId) || !_.trim(folderId)) {
      throw new errors.InvalidInput({
        message: 'Missing folderId',
        data: {
          folderId
        }
      });
    }

    if (!_.isString(mentionId) || !_.trim(mentionId)) {
      throw new errors.InvalidInput({
        message: 'Missing mentionId',
        data: {
          mentionId
        }
      });
    }

    if (!_.isNumber(organizationId)) {
      throw new errors.InvalidInput({
        message: 'Missing organizationId',
        data: {
          organizationId
        }
      });
    }

    // validate access
    await Promise.all([
      getCollection(context, {
        id: folderId,
        organizationId
      }),
      serviceContext.dal.mention.getMention(context, {
        id: mentionId,
        organizationId
      })
    ]);

    const options = {
      folderId,
      mentionId,
      organizationId: `${organizationId}`
    };

    const collectionMention = new model.Mention(options);

    const validationErrs = collectionMention.validate();
    if (validationErrs) {
      throw Error(validationErrs);
    }
    try {
      await _createCollectionMention(collectionMention);
    } catch (err) {
      if (_.toString(err).includes('violates foreign key constraint')) {
        throw new errors.InvalidInput({
          message:
            'The mention ' +
            mentionId +
            ' cannot be added to the collection ' +
            folderId +
            ' because one of the objects does not exist. It may have been ' +
            'deleted.',
          data: {
            mentionId,
            collectionId: folderId
          }
        });
      } else throw err;
    }

    const collectionShares = await getAllCollectionShares(folderId);
    for (const cs of collectionShares) {
      await serviceContext.dal.share.emitUpdateSharedCollectionEvent(
        folderId,
        cs.shareId,
        mentionId,
        serviceContext.dal.share.sharedCollectionUpdateType.AddMentions
      );
    }

    return {
      folderId,
      mentionId,
      organizationId
    };
  }

  async function createCollectionMentions(context, args) {
    const input = args.input;
    const { folderIds, mentionIds } = input;
    const organizationId = _.get(
      context,
      'requestContext.userInfo.organization.organizationId'
    );

    const defaultLimit = _.get(config, 'limitAddMentionsToCollection', 200);
    if (mentionIds.length * folderIds.length > defaultLimit) {
      throw new InvalidInput({
        message: `The number of bulk insertions exceeds ${defaultLimit}.`,
        data: {
          objectType: 'length of mentionIds * folderIds array',
          objectId: mentionIds.length * folderIds.length
        }
      });
    }

    //validate folder access
    const collections = await getCollections(context, {
      ids: folderIds,
      organizationId
    });

    if (collections.count === 0) {
      throw new InvalidInput({
        message: 'Invalid folderIds',
        data: { objectId: folderIds }
      });
    }

    const mentions = await serviceContext.dal.mention.getMentions(context, {
      ids: mentionIds,
      organizationId,
      limit: mentionIds.length
    });

    if (mentions.count === 0) {
      throw new InvalidInput({
        message: 'Invalid mentionIds',
        data: { objectId: mentionIds }
      });
    }

    const values = [organizationId];
    const mentionsToInsert = [];
    values.push(...mentions.records.map((mention) => mention.id));
    collections.records.forEach((collection) => {
      const colArg = values.push(collection.id);
      for (let i = 0; i < mentions.count; i++) {
        mentionsToInsert.push(`($1, $${colArg}, $${i + 2})`);
      }
    });
    const sql = `INSERT INTO folder__mention (organization_id, folder_id, mention_id)
      VALUES ${mentionsToInsert.join(',')}
      ON CONFLICT ON CONSTRAINT "_pk_folder__mention@folder_id"
        DO UPDATE SET date_modified = now()
      RETURNING ${mainUtil.makeSelectClause(folderMentionColumns)}`;
    const res = dbWrite.map(sql, values, mapper.camelizeRootKeys);
    await Promise.all(
      folderIds.map(async (folderId) => {
        const collectionShares = await getAllCollectionShares(folderId);
        for (const cs of collectionShares) {
          for (const mentionId of mentionIds) {
            await serviceContext.dal.share.emitUpdateSharedCollectionEvent(
              folderId,
              cs.shareId,
              mentionId,
              serviceContext.dal.share.sharedCollectionUpdateType.AddMentions
            );
          }
        }
      })
    );

    return res;
  }

  async function getAllCollectionShares(folderId) {
    let offset = 0;
    let count = 0;
    const limit = 50;
    const collectionShares = [];

    do {
      const shares = await serviceContext.dal.share.getShares({
        objectType: 'collection',
        objectId: folderId,
        offset,
        limit
      });
      collectionShares.push(...shares);
      count = shares.length;
      offset += count;
    } while (count === limit);
    return collectionShares;
  }

  async function deleteCollectionMention(context, args) {
    const input = args.input;
    const folderId = input.folderId;
    const mentionId = input.mentionId;
    const organizationId = _.get(
      context,
      'requestContext.userInfo.organization.organizationId'
    );

    if (!_.isString(folderId) || !_.trim(folderId)) {
      throw new errors.InvalidInput({
        message: 'Missing folderId',
        data: {
          folderId
        }
      });
    }

    if (!_.isString(mentionId) || !_.trim(mentionId)) {
      throw new errors.InvalidInput({
        message: 'Missing mentionId',
        data: {
          mentionId
        }
      });
    }

    if (!_.isNumber(organizationId)) {
      throw new errors.InvalidInput({
        message: 'Missing organizationId',
        data: {
          organizationId
        }
      });
    }

    const options = {
      folderId: folderId,
      mentionId: mentionId,
      organizationId: organizationId.toString()
    };

    const collectionMention = new model.Mention(options);

    const validationErrs = collectionMention.validate();
    if (validationErrs) {
      throw Error(validationErrs);
    }

    await _deleteCollectionMention(collectionMention, context);
    const collectionShares = await getAllCollectionShares(folderId);
    for (const cs of collectionShares) {
      await serviceContext.dal.share.emitUpdateSharedCollectionEvent(
        folderId,
        cs.shareId,
        mentionId,
        serviceContext.dal.share.sharedCollectionUpdateType.RemoveMentions
      );
    }
    return {
      folderId,
      mentionId,
      organizationId
    };
  }

  async function updateCollectionMention(context, args) {
    const { input, organizationId } = args;
    const { folderId, mentionId, description } = input;

    // validate access
    await getCollectionMention(context, {
      folderId,
      mentionId,
      organizationId
    });

    const sql = `UPDATE folder__mention SET description = $1, date_modified = $2
    WHERE folder_id = $3 AND mention_id = $4 AND organization_id = $5
    RETURNING ${mainUtil.makeSelectClause(folderMentionColumns)}`;
    const values = [
      description,
      moment().toISOString(),
      folderId,
      mentionId,
      organizationId
    ];

    const results = await dbWrite.map(sql, values, mapper.camelizeRootKeys);
    return _.get(results, 0);
  }

  async function getCollections(context, options) {
    const sqlParams = [];
    const where = [];
    mainUtil.checkId(options.id, true, true);
    mainUtil.checkId(options.mentionId, true, true);
    mainUtil.addSqlWhere(
      'f.organization_id',
      options.organizationId,
      where,
      sqlParams
    );
    mainUtil.addSqlWhere('f.folder_id', options.id, where, sqlParams);
    mainUtil.addSqlWhere('f.folder_id', options.ids, where, sqlParams);
    mainUtil.addSqlWhere('f.is_active', true, where, sqlParams);
    if (options.name) {
      sqlParams.push(options.name);
      where.push(`f.folder_name ILIKE '%' || \$${sqlParams.length} || '%'`);
    }

    if (options.mentionId && options.mentionId > 0) {
      mainUtil.addSqlWhere(
        'fm.mention_id',
        options.mentionId,
        where,
        sqlParams
      );
    }

    const whereClause = where.join(' AND\n ');
    const mentionIds = options.includeMentionIds
      ? `STRING_AGG(CAST(fm.mention_id as VARCHAR), ',') AS mention_ids,`
      : '';
    const sql = `
      SELECT
        f.folder_id AS id,
        folder_name AS name,
        folder_description AS description,
        folder_image AS image,
        folder_type_id AS type_id,
        owner_user_id AS owner_id,
        org_sharing,
        f.organization_id,
        f.date_created AS created_date_time,
        f.date_modified AS modified_date_time,
        f.is_active,
        COUNT(fm.*) item_count,
        ${mentionIds}
        COUNT(DISTINCT p.program_id) program_count,
        COUNT(1) OVER() total_count
      FROM folder f
        LEFT JOIN folder__mention fm ON fm.folder_id = f.folder_id
        LEFT JOIN mention m ON m.mention_id = fm.mention_id
        LEFT JOIN program p ON p.program_id = m.program_id
      WHERE
        ${whereClause}
      GROUP BY f.folder_id
      ORDER BY f.folder_name
      OFFSET ${options.offset || 0}
      LIMIT ${options.limit || 30}
    `;

    const rows = await dbRead.map(sql, sqlParams, mapper.mapCollection);
    return mainUtil.toPage(options, rows);
  }

  async function getCollection(context, options) {
    if (!options.id) throw new Error('id is required');
    const res = await getCollections(context, options);
    if (!res.count) {
      throw new errors.NotFound({
        data: {
          objectType: 'Collection',
          objectId: options.id
        }
      });
    }
    return res.records[0];
  }

  return {
    getCollections,
    getCollection,
    getWidget,
    getWidgets,
    createWidget,
    updateWidget,
    createMentionComment,
    updateMentionComment,
    deleteMentionComment,
    createMentionRating,
    updateMentionRating,
    deleteMentionRating,
    getCollectionMention,
    getCollectionMentions,
    createCollection,
    updateCollection,
    deleteCollection,
    createCollectionMention,
    createCollectionMentions,
    updateCollectionMention,
    deleteCollectionMention,
    _createMentionComment,
    _updateMentionComment,
    _deleteMentionComment,
    _createMentionRating,
    _updateMentionRating,
    _createWidget,
    _createCollectionMention
  };

  async function _createMentionComment(options) {
    if (!_.isObject(options) || options.constructor !== model.Comment) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Comment instance)'
      });
    }
    var comment = options;
    var mentionId = comment.mentionId;
    // Verify mention.mentionId is set/non-empty, as it is not explicitly required by the model during validation:
    if (!_.isString(mentionId) || mentionId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.mentionId'
      });
    }

    const dbWrite = dbConnections[connectionStringKeys.mention].write;
    var createCommentSql =
      'INSERT INTO comment (user_id, comment_text, date_created, date_modified) VALUES ($1, $2, $3, $4) RETURNING *;';
    var createCommentArgs = [
      comment.userId,
      comment.commentText,
      'now()',
      'now()'
    ];
    const commentFromDB = await dbWrite.query(
      createCommentSql,
      createCommentArgs
    );
    if (!_.isObject(commentFromDB) || !_.isArray(commentFromDB)) {
      throw new errors.InternalServerError({
        message: 'Missing commentFromDB array'
      });
    }
    if (commentFromDB.length === 0) {
      throw new errors.InternalServerError({
        message: 'Failed to create comment'
      });
    }
    if (commentFromDB.length > 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 comment to be created but ' +
          commentFromDB.length +
          ' were created'
      });
    }
    // Cast db result to an instance of model.Comment, then validate:
    var returnedComment = model.Comment.fromDB(commentFromDB[0]);
    returnedComment.mentionId = mentionId;
    var validationErr = returnedComment.validate();

    if (validationErr) {
      throw new errors.InternalServerError({
        message: 'Failed to validate returned comment',
        data: {
          dbValidationErrors: [validationErr]
        }
      });
    }
    var createMentionCommentSql =
      'INSERT INTO mention__comment (mention_id, comment_id) VALUES ($1, $2) RETURNING *;';
    var createMentionCommentArgs = [
      returnedComment.mentionId,
      returnedComment.commentId
    ];
    const mentionCommentFromDB = await dbWrite.query(
      createMentionCommentSql,
      createMentionCommentArgs
    );
    if (!_.isObject(mentionCommentFromDB) || !_.isArray(mentionCommentFromDB)) {
      throw new errors.InternalServerError({
        message: 'Missing mentionCommentFromDB array'
      });
    }
    if (mentionCommentFromDB.length === 0) {
      throw new errors.InternalServerError({
        message: 'Failed to create mention-comment'
      });
    }
    if (mentionCommentFromDB.length > 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 mention-comment to be created but ' +
          mentionCommentFromDB.length +
          ' were created'
      });
    }
    return returnedComment;
  }

  /* istanbul ignore next */
  async function _updateMentionComment(options) {
    if (!_.isObject(options) || options.constructor !== model.Comment) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Comment instance)'
      });
    }

    var comment = options;
    var mentionId = comment.mentionId;
    // Verify comment.mentionId is set/non-empty, as it is not explicitly required by the model during validation:

    if (!_.isString(mentionId) || mentionId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.mentionId'
      });
    }
    var commentId = comment.commentId;
    // Verify comment.commentId is set/non-empty, as it is not explicitly required by the model during validation:

    if (!_.isString(commentId) || commentId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.commentId'
      });
    }
    const dbWrite = dbConnections[connectionStringKeys.mention].write;
    var updateCommentSql =
      'UPDATE comment SET comment_text = $1, date_modified = now() WHERE comment_id = $2 AND user_id = $3 ';
    updateCommentSql +=
      'AND EXISTS (SELECT 1 FROM mention__comment WHERE mention_id = $4 LIMIT 1) RETURNING *;';
    var updateCommentArgs = [
      comment.commentText,
      commentId,
      comment.userId,
      mentionId
    ];
    const commentFromDB = await dbWrite.query(
      updateCommentSql,
      updateCommentArgs
    );
    if (!_.isObject(commentFromDB) || !_.isArray(commentFromDB)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (commentFromDB.length === 0) {
      throw new errors.InternalServerError({
        message: 'Failed to create comment'
      });
    }

    if (commentFromDB.length > 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 comment to be updated but ' +
          commentFromDB.length +
          ' were updated'
      });
    }

    // Cast db result to an instance of model.Comment, then validate:
    var returnedComment = model.Comment.fromDB(commentFromDB[0]);
    returnedComment.mentionId = mentionId;
    var validationErr = returnedComment.validate();

    if (validationErr) {
      throw new errors.InternalServerError({
        message: 'Failed to validate returned comment',
        data: {
          dbValidationErrors: [validationErr]
        }
      });
    }
    return returnedComment;
  }

  /* istanbul ignore next */
  async function _deleteMentionComment(options) {
    if (!_.isObject(options) || options.constructor !== model.Comment) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Comment instance)'
      });
    }
    var comment = options;
    var mentionId = comment.mentionId;
    // Verify comment.mentionId is set/non-empty, as it is not explicitly required by the model during validation:

    if (!_.isString(mentionId) || mentionId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.mentionId'
      });
    }
    var commentId = comment.commentId;
    // Verify comment.commentId is set/non-empty, as it is not explicitly required by the model during validation:

    if (!_.isString(commentId) || commentId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.commentId'
      });
    }
    const dbWrite = dbConnections[connectionStringKeys.mention].write;
    try {
      var deleteMentionCommentSql =
        'DELETE FROM mention__comment WHERE mention_id = $1 AND comment_id = $2 RETURNING comment_id;';
      var deleteMentionCommentArgs = [mentionId, commentId];
      const deleteMentionCommentFromDB = await dbWrite.query(
        deleteMentionCommentSql,
        deleteMentionCommentArgs
      );
      var resultErr;

      if (
        !_.isObject(deleteMentionCommentFromDB) ||
        !_.isArray(deleteMentionCommentFromDB)
      ) {
        throw new errors.InternalServerError({
          message: 'Missing deleteMentionCommentFromDB array',
          data: {
            numRowsAffected: 0
          }
        });
      }

      if (deleteMentionCommentFromDB.length === 0) {
        throw new errors.NotFound({
          message: 'Mention-Comment not found',
          data: {
            numRowsAffected: 0
          }
        });
      }

      if (deleteMentionCommentFromDB.length > 1) {
        throw new errors.InternalServerError({
          message:
            'Expected 1 mention-comment to be deleted but ' +
            deleteMentionCommentFromDB.length +
            ' were deleted',
          data: {
            numRowsAffected: 0
          }
        });
      }
      deleteMentionCommentSql =
        'DELETE FROM comment WHERE user_id = $1 AND comment_id = $2 RETURNING comment_id;';
      deleteMentionCommentArgs = [comment.userId, commentId];
      const deleteCommentFromDB = await dbWrite.query(
        deleteMentionCommentSql,
        deleteMentionCommentArgs
      );

      if (!_.isObject(deleteCommentFromDB) || !_.isArray(deleteCommentFromDB)) {
        throw new errors.InternalServerError({
          message: 'Missing dbResult array',
          data: {
            numRowsAffected: 0
          }
        });
      }

      if (deleteCommentFromDB.length === 0) {
        throw new errors.NotFound({
          message: 'Comment not found',
          data: {
            numRowsAffected: 0
          }
        });
      }

      if (deleteCommentFromDB.length > 1) {
        throw new errors.InternalServerError({
          message:
            'Expected 1 comment to be deleted but ' +
            deleteCommentFromDB.length +
            ' were deleted',
          data: {
            numRowsAffected: deleteCommentFromDB.length
          }
        });
      }
      return 1;
    } catch (error) {
      error.numRowsAffected = 0;
      throw error;
    }
  }

  /* istanbul ignore next */
  async function _createMentionRating(options) {
    if (!_.isObject(options) || options.constructor !== model.Rating) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Rating instance)'
      });
    }
    var rating = options;
    var mentionId = rating.mentionId;
    // Verify rating.mentionId is set/non-empty, as it is not explicitly required by the model during validation:
    if (!_.isString(mentionId) || mentionId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.mentionId'
      });
    }
    const dbWrite = dbConnections[connectionStringKeys.mention].write;
    var selectExistingRatingSql = 'SELECT r.rating_id FROM mention__rating mr';
    selectExistingRatingSql += ' JOIN rating r ON r.rating_id = mr.rating_id';
    selectExistingRatingSql +=
      ' WHERE mr.mention_id = $1 AND r.user_id = $2 LIMIT 1';
    var selectExistingRatingArgs = [mentionId, rating.userId];
    var dbResult = await dbWrite.query(
      selectExistingRatingSql,
      selectExistingRatingArgs
    );
    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (dbResult.length !== 0) {
      throw new errors.InvalidInput({
        message: 'Rating for the given user already exists'
      });
    }
    var createRatingSql =
      'INSERT INTO rating (user_id, rating_value, date_created, date_modified) VALUES ($1, $2, $3, $4) RETURNING *;';
    var createRatingArgs = [
      rating.userId,
      rating.ratingValue,
      'now()',
      'now()'
    ];
    dbResult = await dbWrite.query(createRatingSql, createRatingArgs);
    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (dbResult.length === 0) {
      throw new errors.InternalServerError({
        message: 'Failed to create rating'
      });
    }

    if (dbResult.length > 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 rating to be created but ' +
          dbResult.length +
          ' were created'
      });
    }
    // Cast db result to an instance of model.Rating, then validate:
    var returnedRating = model.Rating.fromDB(dbResult[0]);
    returnedRating.mentionId = mentionId;
    var validationErr = returnedRating.validate();

    if (validationErr) {
      throw new errors.InternalServerError({
        message: 'Failed to validate returned rating',
        data: {
          dbValidationErrors: [validationErr]
        }
      });
    }
    var createMentionRatingSql =
      'INSERT INTO mention__rating (mention_id, rating_id) VALUES ($1, $2) RETURNING *;';
    var createMentionRatingArgs = [mentionId, returnedRating.ratingId];
    dbResult = await dbWrite.query(
      createMentionRatingSql,
      createMentionRatingArgs
    );
    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (dbResult.length === 0) {
      throw new errors.InternalServerError({
        message: 'Failed to create mention-rating'
      });
    }

    if (dbResult.length > 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 mention-rating to be created but ' +
          dbResult.length +
          ' were created'
      });
    }
    var updateOverallRatingSql = 'UPDATE mention SET rating = (';
    updateOverallRatingSql +=
      'SELECT AVG(r.rating_value) FROM mention__rating mr JOIN rating r ON r.rating_id = mr.rating_id WHERE mr.mention_id = $1';
    updateOverallRatingSql += ') WHERE mention_id = $1 RETURNING mention_id';
    var updateOverallRatingArgs = [mentionId];
    dbResult = await dbWrite.query(
      updateOverallRatingSql,
      updateOverallRatingArgs
    );
    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (dbResult.length === 0) {
      throw new errors.NotFound({
        message: 'Mention not found'
      });
    }

    if (dbResult.length > 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 mention to be updated but ' +
          dbResult.length +
          ' were updated'
      });
    }
    return returnedRating;
  }

  /* istanbul ignore next */
  async function _updateMentionRating(options) {
    if (!_.isObject(options) || options.constructor !== model.Rating) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Rating instance)'
      });
    }
    var rating = options;
    // Verify rating.mentionId is set/non-empty, as it is not explicitly required by the model during validation:
    var mentionId = rating.mentionId;
    if (!_.isString(mentionId) || mentionId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.mentionId'
      });
    }
    // Verify rating.ratingId is set/non-empty, as it is not explicitly required by the model during validation:
    var ratingId = rating.ratingId;
    if (!_.isString(ratingId) || ratingId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.ratingId'
      });
    }
    const dbWrite = dbConnections[connectionStringKeys.mention].write;
    var updateRatingSql =
      'UPDATE rating SET rating_value = $1, date_modified = now() WHERE rating_id = $2 AND user_id = $3 RETURNING *;';
    var updateRatingArgs = [rating.ratingValue, ratingId, rating.userId];
    var dbResult = await dbWrite.query(updateRatingSql, updateRatingArgs);
    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }
    if (dbResult.length === 0) {
      throw new errors.NotFound({
        message: 'Rating not found'
      });
    }
    if (dbResult.length > 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 rating to be updated but ' +
          dbResult.length +
          ' were updated'
      });
    }

    // Cast db result to an instance of model.Rating, then validate:
    var returnedRating = model.Rating.fromDB(dbResult[0]);
    returnedRating.mentionId = mentionId;
    var validationErr = returnedRating.validate();

    if (validationErr) {
      throw new errors.InternalServerError({
        message: 'Failed to validate returned rating',
        data: {
          dbValidationErrors: [validationErr]
        }
      });
    }
    var updateOverallRatingSql = 'UPDATE mention SET rating = (';
    updateOverallRatingSql +=
      'SELECT AVG(r.rating_value) FROM mention__rating mr JOIN rating r ON r.rating_id = mr.rating_id WHERE mr.mention_id = $1';
    updateOverallRatingSql += ') WHERE mention_id = $1 RETURNING mention_id';
    var updateOverallRatingArgs = [mentionId];
    dbResult = await dbWrite.query(
      updateOverallRatingSql,
      updateOverallRatingArgs
    );
    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }
    if (dbResult.length === 0) {
      throw new errors.NotFound({
        message: 'Mention not found'
      });
    }
    if (dbResult.length > 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 mention to be updated but ' +
          dbResult.length +
          ' were updated'
      });
    }
    return returnedRating;
  }

  async function _deleteMentionRating(options) {
    if (!_.isObject(options) || options.constructor !== model.Rating) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Rating instance)'
      });
    }
    var rating = options;
    var mentionId = rating.mentionId;
    // Verify mention.mentionId is set/non-empty, as it is not explicitly required by the model during validation:
    if (!_.isString(mentionId) || mentionId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.mentionId'
      });
    }
    var ratingId = rating.ratingId;
    // Verify rating.ratingId is set/non-empty, as it is not explicitly required by the model during validation:
    if (!_.isString(ratingId) || ratingId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.ratingId'
      });
    }
    const dbWrite = dbConnections[connectionStringKeys.mention].write;
    try {
      var deleteMentionRatingSql =
        'DELETE FROM mention__rating WHERE mention_id = $1 AND rating_id = $2 RETURNING rating_id;';
      var deleteMentionRatingArgs = [mentionId, ratingId];
      var dbResult = await dbWrite.query(
        deleteMentionRatingSql,
        deleteMentionRatingArgs
      );
      if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
        throw new errors.InternalServerError({
          message: 'Missing dbResult array',
          data: {
            numRowsAffected: 0
          }
        });
      }
      if (dbResult.length === 0) {
        throw new errors.InvalidInput({
          message: 'Mention-Rating not found',
          data: {
            numRowsAffected: 0
          }
        });
      }
      if (dbResult.length > 1) {
        throw new errors.InternalServerError({
          message:
            'Expected 1 mention__rating to be deleted but ' +
            dbResult.length +
            ' were deleted',
          data: {
            numRowsAffected: 0
          }
        });
      }
      deleteMentionRatingSql =
        'DELETE FROM rating WHERE user_id = $1 AND rating_id = $2 RETURNING rating_id;';
      deleteMentionRatingArgs = [rating.userId, ratingId];
      dbResult = await dbWrite.query(
        deleteMentionRatingSql,
        deleteMentionRatingArgs
      );
      if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
        throw new errors.InternalServerError({
          message: 'Missing dbResult array',
          data: {
            numRowsAffected: 0
          }
        });
      }
      if (dbResult.length === 0) {
        throw new errors.InvalidInput({
          message: 'Rating not found',
          data: {
            numRowsAffected: 0
          }
        });
      }
      if (dbResult.length > 1) {
        throw new errors.InternalServerError({
          message:
            'Expected 1 rating to be deleted but ' +
            dbResult.length +
            ' were deleted',
          data: {
            numRowsAffected: 0
          }
        });
      }
      var updateOverallRatingSql = 'UPDATE mention SET rating = (';
      updateOverallRatingSql +=
        'SELECT AVG(r.rating_value) FROM mention__rating mr JOIN rating r ON r.rating_id = mr.rating_id WHERE mr.mention_id = $1';
      updateOverallRatingSql += ') WHERE mention_id = $1 RETURNING mention_id';
      var updateOverallRatingArgs = [mentionId];
      dbResult = await dbWrite.query(
        updateOverallRatingSql,
        updateOverallRatingArgs
      );
      if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
        throw new errors.InternalServerError({
          message: 'Missing dbResult array',
          data: {
            numRowsAffected: 0
          }
        });
      }
      if (dbResult.length === 0) {
        throw new errors.InvalidInput({
          message: 'Mention not found',
          data: {
            numRowsAffected: 0
          }
        });
      }
      if (dbResult.length > 1) {
        throw new errors.InternalServerError({
          message:
            'Expected 1 mention to be updated but ' +
            dbResult.length +
            ' were updated',
          data: {
            numRowsAffected: 0
          }
        });
      }
      return 1;
    } catch (error) {
      error.numRowsAffected = 0;
      throw error;
    }
  }

  async function _createCollection(options) {
    if (!_.isObject(options) || options.constructor !== model.Collection) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Collection instance)'
      });
    }
    // validation of model is done in handler so it could return 400
    var collection = options;
    var sql =
      '\
    INSERT INTO folder \
    ( \
      folder_name, \
      folder_image, \
      folder_description, \
      organization_id, \
      folder_type_id, \
      org_sharing, \
      is_active, \
      date_created, \
      date_modified \
    ) \
    VALUES ( $1, $2, $3, $4, 1, true, true, now(), now() ) \
    RETURNING * \
    ;';

    var args = [
      collection.name,
      collection.image,
      collection.folderDescription,
      collection.organizationId
    ];
    const dbResult = await dbConnections[
      connectionStringKeys.collection
    ].write.query(sql, args);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (dbResult.length !== 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 collection to be created but ' +
          dbResult.length +
          ' were created'
      });
    }

    const newCollection = model.Collection.fromDB(dbResult[0]);
    return newCollection;
  }

  async function _updateCollection(options, isUpdateParentFolder) {
    if (!_.isObject(options) || options.constructor !== model.Collection) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Collection instance)'
      });
    }
    var collection = options;
    var args = [];
    var sql = 'UPDATE folder SET ';

    _.each(model.Collection.allFields, function updateField(fieldConfig) {
      var fieldKey = fieldConfig.key;
      if (_.isUndefined(collection[fieldKey]) || !fieldConfig.userEditable) {
        return;
      }
      var dbKey = fieldConfig.dbKey;
      if (!dbKey) {
        dbKey = _.snakeCase(fieldKey);
      }
      if (args.length) {
        sql += ', ';
      }
      args.push(collection[fieldKey]);
      sql += dbKey + ' = $' + args.length;
    });

    if (!args.length && !isUpdateParentFolder) {
      throw new errors.InvalidInput({
        message: 'No updatable fields received'
      });
    }
    if (args.length) {
      sql += ', ';
    }
    // date_modified
    sql += ' date_modified = now() ';

    args.push(collection.folderId);
    sql += ' WHERE folder_id = $' + args.length;
    args.push(collection.organizationId);
    sql += ' AND organization_id = $' + args.length;

    sql += ' RETURNING *;';
    const dbResult = await dbConnections[
      connectionStringKeys.collection
    ].write.query(sql, args);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }
    // 404

    if (dbResult.length === 0) {
      return null;
    }

    if (dbResult.length !== 1) {
      throw new errors.InternalServerError({
        message: 'Expected 1 collection result but received ' + dbResult.length
      });
    }

    var collectionInstance = model.Collection.fromDB(dbResult[0]);
    var validationError = collectionInstance.validate();

    if (validationError) {
      throw new errors.InternalServerError({
        message: 'Failed to validate returned collection',
        data: {
          dbValidationErrors: [validationError]
        }
      });
    }
    return collectionInstance;
  }

  async function _deleteCollection(options, context) {
    if (
      !_.isObject(options) ||
      options.constructor !== model.CollectionBulkQuery
    ) {
      throw new errors.InvalidInput({
        message:
          'Missing options (should be a model.CollectionBulkQuery instance)'
      });
    }
    var collectionBulkQuery = options;
    const dbWrite = dbConnections[connectionStringKeys.collection].write;
    var deleteMentionMapping =
      'DELETE FROM folder__mention WHERE folder_id = ANY($1);';
    var deleteWidget =
      'DELETE FROM widget WHERE organization_id = $1 AND folder_id = ANY($2);';
    var updateSharing =
      "DELETE FROM share WHERE organization_id = $1 AND share_info->>'objectType' = 'collection' AND share_info->>'objectId' = ANY($2);";
    var deleteFolder =
      'DELETE FROM folder WHERE organization_id = $1 AND folder_id = ANY($2) RETURNING folder_id;';
    await dbWrite.query(deleteMentionMapping, [
      collectionBulkQuery.collectionId
    ]);
    await dbWrite.query(deleteWidget, [
      collectionBulkQuery.organizationId,
      collectionBulkQuery.collectionId
    ]);
    await dbWrite.query(updateSharing, [
      collectionBulkQuery.organizationId,
      collectionBulkQuery.collectionId.map(String)
    ]);
    const sqlArgs = [
      serviceContext.dal.folder.TREE_OBJECT_TYPE.COLLECTION,
      collectionBulkQuery.organizationId,
      collectionBulkQuery.collectionId
    ];

    // call dalFolder.unfileObject function
    try {
      await dalFolder.unfileObject(
        context || serviceContext,
        {
          input: {
            objectId: collectionBulkQuery.collectionId,
            organizationId: collectionBulkQuery.organizationId
          }
        },
        'Collection'
      );
    } catch (ex) {
      // unfileObject throws when the object is not filed anywhere
      if (ex.name !== 'not_found') {
        logger.error(
          `(unfileObject) failed to infile collection ${collectionBulkQuery.collectionId}. Error: ${ex}`
        );
        throw ex;
      }
    }

    const deleteFolderResult = await dbWrite.query(deleteFolder, [
      collectionBulkQuery.organizationId,
      collectionBulkQuery.collectionId
    ]);
    if (!_.isObject(deleteFolderResult) || !_.isArray(deleteFolderResult)) {
      throw new errors.InternalServerError({
        message: 'Missing deleteFolderResult array'
      });
    }

    return deleteFolderResult.length;
  }

  async function _createWidget(options) {
    if (!_.isObject(options) || options.constructor !== model.Widget) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Widget instance)'
      });
    }
    var sql =
      "\
    INSERT INTO widget \n\
    ( \n\
      widget_id, \n\
      name, \n\
      organization_id, \n\
      folder_id, \n\
      display_collection_name, \n\
      display_collection_description, \n\
      display_logo, \n\
      display_mention_intro, \n\
      display_transcription, \n\
      display_mention_description, \n\
      width, \n\
      number_of_mentions_to_show, \n\
      seo_tags, \n\
      ad_script, \n\
      background_color, \n\
      border_color, \n\
      text_color, \n\
      next_button_color, \n\
      date_created \n\
    ) \n\
    VALUES ( \n\
      $1, \n\
      '', \n\
      $2, \n\
      $3, \n\
      $4, \n\
      $5, \n\
      $6, \n\
      $7, \n\
      $8, \n\
      $9, \n\
      $10, \n\
      $11, \n\
      $12::text[], \n\
      $13, \n\
      $14, \n\
      $15, \n\
      $16, \n\
      $17, \n\
      now() \n\
    ) \n\
    RETURNING * \n\
    ;";

    var args = [
      options.widgetId,
      options.organizationId,
      options.collectionId,
      options.displayCollectionName,
      options.displayCollectionDescription,
      options.displayLogo,
      options.displayMentionIntro,
      options.displayTranscription,
      options.displayMentionDescription,
      options.width,
      options.numberOfMentionsToShow,
      options.seoTags,
      options.adScript,
      options.backgroundColor,
      options.borderColor,
      options.textColor,
      options.nextButtonColor
    ];
    const dbResult = await dbConnections[
      connectionStringKeys.widget
    ].write.query(sql, args);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (dbResult.length !== 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 widget to be created but ' +
          dbResult.length +
          ' were created'
      });
    }
    const newWidget = model.Widget.fromDB(dbResult[0]);
    return newWidget;
  }

  async function _createCollectionMention(options) {
    if (!_.isObject(options) || options.constructor !== model.Mention) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Mention instance)'
      });
    }
    var mention = options;

    var folderId = mention.folderId;

    if (!_.isString(folderId) || folderId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.folderId'
      });
    }

    var mentionId = mention.mentionId;

    if (!_.isString(mentionId) || mentionId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.mentionId'
      });
    }

    var organizationId = mention.organizationId;

    if (!_.isString(organizationId) || organizationId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.organizationId'
      });
    }

    var sql =
      '\
			INSERT INTO folder__mention \
			( \
				folder_id, \
				mention_id, \
				organization_id, \
				date_created, \
				date_modified \
			) \
      VALUES ( $1, $2, $3, now(), now() ) \
      ON CONFLICT DO NOTHING \
			RETURNING * \
			;';
    const dbWrite = dbConnections[connectionStringKeys.collection].write;
    const sqlParams = [folderId, mentionId, organizationId];
    const dbResult = await dbWrite.query(sql, sqlParams);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (dbResult.length !== 1) {
      throw new errors.InternalServerError({
        message: 'Expected 1 result but received ' + dbResult.length
      });
    }
    return dbResult.length;
  }

  async function _deleteCollectionMention(options) {
    if (!_.isObject(options) || options.constructor !== model.Mention) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Mention instance)'
      });
    }
    var mention = options;

    var folderId = mention.folderId;

    if (!_.isString(folderId) || folderId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.folderId'
      });
    }

    var mentionId = mention.mentionId;

    if (!_.isString(mentionId) || mentionId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.mentionId'
      });
    }

    var organizationId = mention.organizationId;

    if (!_.isString(organizationId) || organizationId.trim() === '') {
      throw new errors.InvalidInput({
        message: 'Missing options.organizationId'
      });
    }

    var deleteMentionFromCollection =
      'DELETE FROM folder__mention WHERE folder_id = $1 AND mention_id = $2 AND organization_id = $3 RETURNING *;';
    var removeShare =
      "DELETE FROM share WHERE organization_id = $1 AND share_info->>'objectType' = 'mention' AND share_info->>'objectId' = $2 AND jsonb_extract_path_text(share_info, 'objectMetadata', 'collectionId') = $3;";
    const dbWrite = dbConnections[connectionStringKeys.mention].write;
    const deleteFolderMentionResult = await dbWrite.query(
      deleteMentionFromCollection,
      [folderId, mentionId, organizationId]
    );
    await dbWrite.query(removeShare, [organizationId, mentionId, folderId]);
    if (
      !_.isObject(deleteFolderMentionResult) ||
      !_.isArray(deleteFolderMentionResult)
    ) {
      throw new errors.InternalServerError({
        message: 'Missing deleteFolderMentionResult array'
      });
    }

    return deleteFolderMentionResult.length;
  }

  function checkId(id, field) {
    if (_.isNumber(id)) return;
    if (!id) {
      throw new InvalidInput({
        data: {
          [field]: {
            message: `Invalid ${field} format. An id cannot be null.`
          }
        }
      });
    }
    if (!(validator.isUUID(id) || validator.isInt(id))) {
      throw new InvalidInput({
        data: {
          [field]: {
            message: `Invalid ID format. An ${field} must be a UUID or numerical string.`
          }
        }
      });
    }
  }
};
