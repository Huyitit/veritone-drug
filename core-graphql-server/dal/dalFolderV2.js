const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');

const validator = require('validator');
const mapper = require('./mapper');

const connectionStringKeys = {
  folder: 'media_platform'
};

const FOLDER_OBJECT_TYPE = {
  2: 'watchlist',
  3: 'collection',
  5: 'tdo',
  6: 'application'
};

const FOLDER_OBJECT_TYPE_ID = {
  folder: 1,
  watchlist: 2,
  collection: 3,
  tdo: 5,
  application: 6
};
const OBJECT_TYPE_MAPPING_BY_FOLDER_TYPE = {
  watchlist: 'watchlist',
  collection: 'collection',
  cms: 'tdo',
  application: 'application',
  automateNode: 'tdo',
  automatePalette: 'tdo'
};

const FOLDER_TABLES = {
  folder: 'v2_folder',
  folderObject: 'v2_folder_object',
  folderRoot: 'v2_folder_root',
  folderSdo: 'v2_folder_sdo',
  folderType: 'v2_folder_type',
  folderTreeObject: 'v2_folder_treeobject'
};

const ROOT_FOLDER_APPLICATION_MAPPING = {
  watchlist: '32babe30-fb42-11e4-89bc-27b69865858a',
  collection: 'cc4e0e89-3420-49c2-b06d-8d9a929c941c',
  cms: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5'
};

module.exports = function createFunction(serviceContext) {
  const { config, logger } = serviceContext;
  const mainUtil = require('../util.js')(serviceContext);
  const dalUtil = require('./util')(config, serviceContext);
  const dbUtil = require('../util/db.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const errors = require('../error')(config);
  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../modules/rbacAuth/bll/rbacAuth.bll.js')(serviceContext)
  );
  const localCache =
    serviceContext.localCache || require('../localCache')(serviceContext);

  const {
    InvalidInput,
    NotFound,
    NotAllowed,
    ServiceFailure,
    ResourceConflict
  } = require('../error')(config);

  const dbRead = serviceContext.dbConnections[connectionStringKeys.folder].read;
  const dbWrite =
    serviceContext.dbConnections[connectionStringKeys.folder].write;

  const folderColumns = {
    folder_id: 'id',
    folder_type_id: null,
    organization_id: null,
    folder_name: 'name',
    folder_description: 'description',
    parent_folder_id: null,
    shared_org_read: null,
    shared_org_write: null,
    folder_path: null,
    date_created: 'created_date_time',
    date_modified: 'modified_date_time'
  };

  const folderTypeColumns = {
    folder_type_id: 'id',
    folder_type_name: 'name',
    folder_type_image: 'image',
    folder_type_description: 'description',
    content_template_schema_id: null,
    organization_id: null,
    application_id: null,
    date_created: 'created_date_time',
    date_modified: 'modified_date_time'
  };

  const folderObjectColumns = {
    organization_id: null,
    object_type: null,
    object_id: null,
    folder_id: null,
    created_by: null,
    modified_by: null,
    date_created: 'created_date_time',
    date_modified: 'modified_date_time'
  };

  const folderSdoColumns = {
    folder_id: null,
    content_template_schema_id: null,
    sdo_id: null,
    content_template_id: null,
    created_by: null,
    modified_by: null,
    date_created: 'created_date_time',
    date_modified: 'modified_date_time',
    date_deleted: 'deleted_date_time'
  };

  const folderTreeObjectColumns = {
    folder_id: null,
    tree_object_id: null
  };

  /**
   * This function gets and check of an object exists in any folder
   * @param {Object} context The request context
   * @param {Number} orgId The organization id
   * @param {string} objectId The object id
   * @param {string | Number}} objectType The object type of given object
   * @returns {Object} This returns a v2 folder object
   */
  /**
   * Normalize a folder-object type to the enum label stored in
   * v2_folder_object.object_type.
   *
   * Callers pass either the label ('tdo') or a legacy numeric TREE_OBJECT_TYPE
   * id (5). Not every TREE_OBJECT_TYPE has a folder-object counterpart:
   * type_folder_object_type is only ('watchlist','collection','tdo',
   * 'application'), so UNDEFINED (0), FOLDER (1) and ROOT_FOLDER (4) do not
   * map. Those used to normalize to undefined and then vanish -- addSqlWhere
   * skips nil, so a caller asking for a folder silently got an unpruned
   * 20-partition scan rather than an error. Fail loudly instead.
   *
   * Nil passes through unchanged: object_type is genuinely optional on the read
   * paths, which then keep the old (unpruned) behaviour.
   *
   * @param {string|number} [objectType]
   * @returns {string|undefined} enum label, or nil if nil was passed in
   */
  function _toObjectTypeName(objectType) {
    if (_.isNil(objectType)) {
      return objectType;
    }

    const name = _.isNumber(objectType)
      ? FOLDER_OBJECT_TYPE[objectType]
      : objectType;

    if (!_.includes(FOLDER_OBJECT_TYPE, name)) {
      throw new InvalidInput({
        message: `Unsupported folder object type: ${objectType}. Folders themselves are not folder objects; use getFolderParent or getParentFolders instead.`,
        data: { objectType }
      });
    }

    return name;
  }

  async function getFolderObject(context, orgId, objectId, objectType, folderId) {
    const filedArgs = [];
    const whereClause = [];

    if (!orgId || !objectId) {
      throw new InvalidInput({
        data: {
          orgId: orgId,
          objectId: objectId
        }
      });
    }

    filedArgs.push(orgId);
    whereClause.push(`organization_id = $${filedArgs.length}`);

    filedArgs.push(_.toString(objectId));
    whereClause.push(`object_id = $${filedArgs.length}`);

    if (folderId) {
      filedArgs.push(_.toString(folderId));
      whereClause.push(`folder_id = $${filedArgs.length}`);
    }

    if (objectType) {
      filedArgs.push(_toObjectTypeName(objectType));
      whereClause.push(`object_type = $${filedArgs.length}`);
    }
    // Check if object was already filed
    const filedSql = `
      SELECT
        organization_id,
        object_type,
        object_id,
        folder_id,
        created_by,
        modified_by
      FROM v2_folder_object
      WHERE ${whereClause.join(' AND ')}
      LIMIT 1;
    `;
    const res = await dbRead.oneOrNone(
      filedSql,
      filedArgs,
      mapper.camelizeRootKeys
    );
    return res;
  }

  /**
   * This function gets all folder objects in a folder
   * @param {Object} context The request context
   * @param {Number} organizationId The organization id
   * @param {String} folderId The folder id (uuid)
   * @param {Object} filter The filter object: { objectId, objectType, limit, offset }
   * @returns {Array} This returns a list folder objects
   */
  async function getFolderObjects(context, organizationId, folderId, filter) {
    filter = filter || {};
    if (!organizationId) {
      throw new InvalidInput({
        message: 'Missing organization id.'
      });
    }
    if (!folderId || !validator.isUUID(folderId)) {
      throw new InvalidInput({
        message: `Invalid ID format ${folderId}. The folder ID must be a UUID.`
      });
    }

    let sqlWhere = [];
    let sqlParams = [];

    mainUtil.addSqlWhere(
      'organization_id',
      organizationId,
      sqlWhere,
      sqlParams
    );
    mainUtil.addSqlWhere('folder_id', folderId, sqlWhere, sqlParams);
    mainUtil.addSqlWhere('object_type', filter.objectType, sqlWhere, sqlParams);
    mainUtil.addSqlWhere('object_id', filter.objectId, sqlWhere, sqlParams);

    const sql = `
      SELECT ${mainUtil.makeSelectClause(folderObjectColumns)}
      FROM ${FOLDER_TABLES.folderObject} 
      WHERE ${sqlWhere.join(' AND ')}
      LIMIT ${filter.limit || 30}
      OFFSET ${filter.offset || 0}
      ;
    `;

    return await dbRead.map(sql, sqlParams, mapper.camelizeRootKeys);
  }

  /**
   * Get folder with given an input
   * @param {Object} context The request context
   * @param {Object} args { id: UUID, organizationId: number (optional) }
   * organizationId: Will get it from context if it is not passed in
   * @returns {Object} returns v2 folder object
   */
  async function getFolder(context, args) {
    try {
      if (!args) {
        throw new InvalidInput({
          message: 'Missing data in the input'
        });
      }
      const id = args.id || _.get(args, 'input.id');
      if (!id || !validator.isUUID(id)) {
        throw new InvalidInput({
          message: 'Invalid ID format ' + id + '. A folder ID must be a UUID.'
        });
      }
      // get organization id
      const organizationId = _getOrganizationId(context, args);
      const isInternalToken = checkIsInternalToken(context);
      const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
      return await getFolderById(id, organizationId, isInternalToken, isSuperAdmin);
    } catch (err) {
      logger.error('getFolder-v2', err);
      throw err;
    }
  }

  /**
   * File object into given folder
   * @param {Object} context The request context
   * @param {Number} orgId The organization id
   * @param {UUID} folderId The folder id to put the object
   * @param {string} objectId The object id to file
   * @param {string | Number} objectType The object type of the object
   * @returns {Object} returns v2 folder object
   */
  async function fileFolderItem(
    context,
    orgId,
    folderId,
    objectId,
    objectType,
    allowMultipleParents = false
  ) {
    // file Objects to v2 folder structure
    const objectTypeStr = _toObjectTypeName(objectType);

    // Check if already filed in the target folder — safe for oneOrNone (at most one row per folder)
    const filedInTarget = await getFolderObject(context, orgId, objectId, objectType, folderId);
    if (!_.isEmpty(filedInTarget)) {
      return filedInTarget;
    }

    // For single-parent objects, check if filed in any other folder. Safe to use oneOrNone here
    // because single-parent enforcement guarantees the object is in at most one folder.
    if (!allowMultipleParents) {
      const filedElsewhere = await getFolderObject(context, orgId, objectId, objectType);
      if (!_.isEmpty(filedElsewhere)) {
        logger.error('V2Folder: The object has already been filed elsewhere.');
        throw new InvalidInput({
          message: 'The object has already been filed elsewhere.',
          data: {
            objectId: filedElsewhere.objectId,
            objectType: filedElsewhere.objectType,
            parentFolderId: filedElsewhere.folderId
          }
        });
      }
    }

    // Resolve V2 folder ID — also handles V1 treeObjectId transparently
    const resolvedFolderId = await _validateFolderId(context, folderId, { organizationId: orgId });

    // Insert object to v2_folder_object
    let whereNotSql = `
      SELECT * FROM v2_folder_object WHERE organization_id = $1 AND object_id = $3 AND object_type = $2
    `;
    if (allowMultipleParents) {
      whereNotSql += ' AND folder_id = $4';
    }

    const objSql = `
      INSERT INTO v2_folder_object (organization_id, object_type, object_id, folder_id, created_by, modified_by)
      SELECT $1, $2, $3, $4, $5, $5
      WHERE NOT EXISTS (${whereNotSql})
      RETURNING organization_id, object_type, object_id, folder_id, created_by, modified_by;
    `;

    const object = await dbWrite.oneOrNone(
      objSql,
      [
        orgId,
        objectTypeStr,
        _.toString(objectId),
        resolvedFolderId,
        _.get(context, '_authInfo.userId')
      ],
      mapper.camelizeRootKeys
    );
    return object;
  }

  /**
   * Remove object from the folder
   * @param {Object} context The request context
   * @param {Number} orgId The organization id
   * @param {UUID} [folderId] The folder id where the object reside
   * @param {string} objectId The object id to remove from folder
   * @param {string | Number} objectType The object type of the object
   * @returns {Object} returns v2 folder object
   */
  async function unfileFolderItem(
    context,
    orgId,
    folderId,
    objectId,
    objectType
  ) {
    const objectTypeStr = _toObjectTypeName(objectType);
    let inputFolderId = folderId;
    // Check object
    let filed = await getFolderObject(context, orgId, objectId, objectType, folderId);
    if (_.isEmpty(filed)) {
      // only log error before completed v2 migration
      logger.error(
        `V2Folder: Object not found. objectType = "${objectTypeStr}", objectId = "${objectId}", folderId = "${folderId}"`
      );
      return;
    }

    if (_.isNil(inputFolderId)) {
      inputFolderId = filed.folderId;
    }
    inputFolderId = await _validateFolderId(context, inputFolderId, {
      organizationId: orgId
    });

    if (filed.folderId !== inputFolderId) {
      // only log error before completed v2 migration
      logger.error(`Object was filed, but in different folder`);
      return;
    }
    // unfile object, remove object from v2_folder_object.
    // object_type comes from the row we just read rather than the caller's
    // argument (which is optional) so the predicate always covers the full PK
    // (organization_id, object_type, object_id, folder_id). Without it this
    // DELETE plans and locks all 20 hash partitions instead of one.
    const sql = `
      DELETE FROM v2_folder_object WHERE organization_id = $1 AND object_type = $2 AND object_id = $3 AND folder_id = $4
      RETURNING organization_id, object_type, object_id, folder_id;
    `;
    const object = await dbWrite.one(
      sql,
      [orgId, filed.objectType, _.toString(objectId), inputFolderId],
      mapper.camelizeRootKeys
    );
    return object;
  }

  async function fileTDO(context, args) {
    const tdo = await serviceContext.dal.tdo.getTDO(context, {
      id: args.input.tdoId,
      applicationId: args.input.applicationId,
      _writeAccessRequest: true
    });
    await fileFolderItem(
      context,
      _.get(context, '_authInfo.organization.organizationId'),
      args.input.folderId,
      tdo.id,
      'tdo',
      false
    );
    if (args.input.skipIndexing !== true) {
      await serviceContext.dal.tdo.updateFolderInSearchIndex(context, tdo);
    }
    return tdo;
  }

  async function moveFolderItem(context, args) {
    const input = _.get(args, 'input');
    const { objectId, objectType, newFolderId } = input;
    const organizationId = args.organizationId;

    if (_.isNil(organizationId)) {
      throw new InvalidInput({
        message: 'organizationId is required.'
      });
    }

    if (_.isNil(objectId) || _.isNil(objectType) || _.isNil(newFolderId)) {
      throw new InvalidInput({
        message: 'objectId, objectType, or newFolderId are required.'
      });
    }

    const filedObj = await getFolderObject(
      context,
      organizationId,
      objectId,
      objectType
    );

    if (_.isEmpty(filedObj)) {
      // if it was not filed at all, we just file it now
      return await fileFolderItem(
        context,
        organizationId,
        newFolderId,
        objectId,
        objectType
      );
    }

    // Update folder object to new folder
    const objSql = `
      UPDATE public.v2_folder_object
      SET folder_id = $4
      WHERE organization_id = $1 AND object_type = $2::type_folder_object_type AND object_id = $3
      RETURNING ${mainUtil.makeSelectClause(folderObjectColumns)};
    `;

    return await dbWrite.oneOrNone(
      objSql,
      [organizationId, objectType, _.toString(objectId), newFolderId],
      mapper.camelizeRootKeys
    );
  }

  /**
   * Move V2 Folder
   * @method moveFolder
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function moveFolder(context, args) {
    const input = _.get(args, 'input', {});
    const { userInfo } = context.requestContext;
    const { organizationId, newParentFolderId, rootFolderType } = input;
    const _folderId = input.folderId;

    if (_.isNil(organizationId)) {
      throw new InvalidInput({
        message: 'organizationId is required'
      });
    }

    if (_.isNil(_folderId) || _.isNil(newParentFolderId)) {
      throw new InvalidInput({
        message: 'folderId and newParentFolderId are required'
      });
    }

    // validate and get folderId v2
    const folderId = await _validateFolderId(context, _folderId, args);

    const accessOptions = {
      organizationId: args.organizationId,
      userId: userInfo.userId,
      folderIds: [folderId, newParentFolderId],
      rootFolderType
    };
    await _validateAccess(accessOptions);

    const parentFolders = await getParentFolders(context, {
      folderId: newParentFolderId
    });
    if (_.some(parentFolders, { id: folderId })) {
      throw new ResourceConflict({
        message: 'Cannot move parent folder into its own subfolder',
        data: { folderId }
      });
    }

    await _bulkMoveFolders([folderId], newParentFolderId);

    return await getFolderById(folderId, args.organizationId);
  }

  /**
   * Move V2 Folders
   * @method moveFolder
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function moveFolders(context, args) {
    const input = _.get(args, 'input', {});
    const { userInfo } = context.requestContext;
    const {
      organizationId,
      folderIds,
      newParentFolderId,
      rootFolderType
    } = input;

    if (_.isNil(organizationId)) {
      throw new InvalidInput({
        message: 'organizationId is required'
      });
    }

    if (_.isEmpty(folderIds) || _.isNil(newParentFolderId)) {
      throw new InvalidInput({
        message: 'folderIds and newParentFolderId are required'
      });
    }

    const accessOptions = {
      organizationId: args.organizationId,
      userId: userInfo.userId,
      folderIds: [...folderIds, newParentFolderId],
      rootFolderType
    };
    await _validateAccess(accessOptions);

    const parentFolders = await getParentFolders(context, {
      folderId: newParentFolderId
    });

    const invalidFolderIds = _.intersection(
      folderIds,
      _.map(parentFolders, 'id')
    );
    const moveableFolderIds = _.difference(folderIds, invalidFolderIds);

    const results = await _bulkMoveFolders(
      moveableFolderIds,
      newParentFolderId
    );
    const ids = _.map(results, 'id');
    // only input moveableFolderIds need to be validated; their children do not.
    const validFolderIds = _.intersection(moveableFolderIds, ids);

    return {
      organizationId,
      newParentFolderId,
      validFolderIds,
      invalidFolderIds: _.difference(folderIds, validFolderIds),
      message:
        validFolderIds.length === folderIds.length
          ? 'Successfully move all input folders to the parent folder.'
          : 'Some folders cannot be moved to the parent folder.'
    };
  }

  /**
   * Bulk move v2 folders
   * @param {uuid[]} folderIds
   * @param {uuid} newParentFolderId
   * @returns {Array} of v2 folder results
   */
  async function _bulkMoveFolders(folderIds, newParentFolderId) {
    if (_.isNil(folderIds) || _.isNil(newParentFolderId)) {
      throw new InvalidInput({
        message: 'folderIds and newParentFolderId are required'
      });
    }

    const sql = `
      UPDATE public.v2_folder
      SET parent_folder_id = $2
      WHERE folder_id = ANY($1::uuid[])
      RETURNING ${mainUtil.makeSelectClause(folderColumns)};
    `;

    return await dbWrite.map(
      sql,
      [folderIds, newParentFolderId],
      mapper.mapFolderV2
    );
  }

  function _buildV2FolderSharedAccess(options) {
    const sqlParts = {
      sharedSearchSubQuery: '',
      sharedSearchConditions: []
    };
    if (options.includeSharedReadAcess) {
      sqlParts.sharedSearchSubQuery = `, shared_f AS (
        SELECT vf.folder_id, vf.folder_path
        FROM public.v2_folder vf
        WHERE 
          (vf.shared_org_read IS NOT NULL AND vf.shared_org_read @> '{${options.organizationId}}'::int[]) 
          OR
          (vf.shared_org_write IS NOT NULL AND vf.shared_org_write @> '{${options.organizationId}}'::int[])
      )`;
      sqlParts.sharedSearchConditions.push(
        'folder_path <@ (SELECT array_agg(folder_path)::ltree[] FROM shared_f)'
      );
    }
    return sqlParts;
  }

  async function _validateAccess(options) {
    if (!_.isObject(options)) {
      throw new InvalidInput({
        message: 'Missing options object'
      });
    }
    if (!options.organizationId) {
      throw new InvalidInput({
        message: 'Missing organizationId'
      });
    }
    if (!options.userId) {
      throw new InvalidInput({
        message: 'Missing userId'
      });
    }
    if (!options.folderIds) {
      throw new InvalidInput({
        message: 'Missing folderIds'
      });
    }

    // Just validate the input rootFolderType is valid in v2 folder db model
    const folderType = await getFolderTypeByName(
      options.rootFolderType || 'cms'
    );
    const folderTypeId = _.get(folderType, 'id');

    if (_.isNil(folderType)) {
      throw new InvalidInput({
        message: 'Invalid root folder type',
        data: {
          objecType: 'rootFolderType',
          objectValue: options.rootFolderType
        }
      });
    }

    // begin at 4 as organizationId is 1, userId is 2 and folder_type_id is 3
    const folderIdPlaceHolders = dalUtil.buildQueryPlaceholders(
      4,
      options.folderIds.length
    );
    const sqlParts = _buildV2FolderSharedAccess(options, folderIdPlaceHolders);
    const sqlOR = [
      'folder_path <@ (SELECT array_agg(folder_path)::ltree[] FROM r_f)',
      ...sqlParts.sharedSearchConditions
    ];

    // all folderIds must be associated or shared with the organization
    const sql = `
      WITH r_f AS (
        SELECT vf.folder_id, vf.folder_path 
        FROM public.v2_folder vf
        JOIN v2_folder_root vfr 
        ON vf.folder_id = vfr.folder_id 
        WHERE (vfr.organization_id = $1 OR vfr.root_folder_user_id = $2)
        AND vf.folder_type_id = $3
      )${sqlParts.sharedSearchSubQuery},
      f AS (
        SELECT vf.folder_id, subltree(vf.folder_path, 0, 1) AS root_folder_path
        FROM public.v2_folder vf
        WHERE vf.folder_id IN (${folderIdPlaceHolders})
        AND (${sqlOR.join(' OR ')})
      )
      SELECT folder_id AS id, root_folder_path FROM f;
    `;

    const results = await dbRead.map(
      sql,
      [
        options.organizationId,
        options.userId,
        folderTypeId,
        ...options.folderIds
      ],
      mapper.camelizeRootKeys
    );
    const ids = _.map(results, 'id');

    if (ids.length < options.folderIds.length) {
      throw new NotAllowed({
        message: 'Unable to authorize access to folder',
        data: {
          ...options,
          invalidFolders: _.difference(options.folderIds, ids)
        }
      });
    }
  }

  async function getFolderTypes() {
    const data = localCache.get('FolderTypes', 'all');
    if (data) {
      return data;
    }

    const sql = `
      SELECT ${mainUtil.makeSelectClause(folderTypeColumns)}
      FROM ${FOLDER_TABLES.folderType}
      ORDER BY folder_type_id;
    `;

    const res = await dbRead.map(sql, [], mapper.camelizeRootKeys);
    if (!_.isArray(res) || !res.length) {
      throw new NotFound({
        message: `No folderTypes found`,
        data: {
          objectType: 'FolderType'
        }
      });
    }

    // set cache
    localCache.set('FolderTypes', 'all', res);

    return res;
  }

  async function getFolderTypeByName(name) {
    const folderTypes = await getFolderTypes();
    if (_.isEmpty(folderTypes)) {
      return null;
    }

    return _.find(
      folderTypes,
      (item) => _.lowerCase(item.name) == _.lowerCase(name)
    );
  }

  async function createFolder(context, args) {
    try {
      const entityTagsInput = _.get(args, 'input.entityTags');
      const v2Folder = await validateCreateFolderInput(context, args);

      const newFolder = await createNewFolder(context, v2Folder);
      const folderId = _.get(newFolder, 'id');
      const organizationId = v2Folder.organizationId;
      const rbacArgs = {
        organizationId,
        objectId: folderId,
        resourceType: 'Folder'
      };
      await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs);

      // if entityTags field is in input, synchronize entity_tags table with corresponding rows
      if (!_.isNil(entityTagsInput)) {
        const tagData = {
          entityId: folderId,
          organizationId,
          entityType: 'folder',
          entityTags: entityTagsInput
        };
        await serviceContext.dal.entityTags.updateEntityTags(
          tagData,
          newFolder,
          context
        );
      }

      return newFolder;
    } catch (err) {
      logger.error('createFolder-v2', err);
      throw new errors.InternalServerError({
        message: 'Failed to create folder',
        err
      });
    }
  }

  async function validateCreateFolderInput(context, args) {
    const { input } = args;
    const { userInfo, tokenInfo } = context.requestContext;
    const v1Output = args.v1Output || {};
    const isInternalToken = checkIsInternalToken(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (!input) {
      throw new InvalidInput({
        message: 'Missing data in the input',
        data: {
          objectType: 'input',
          objectId: 'args.input'
        }
      });
    }
    // check folder name
    const folderName = v1Output.folderName || input.name;
    if (!_.isString(folderName) || _.isEmpty(folderName.trim())) {
      throw new InvalidInput({
        message: 'the name field is required.'
      });
    }

    // Org id: check and update organization Id if needed
    let organizationId = _getOrganizationId(context, args);
    let parentId = input.parentId;
    let typeId = input.typeId;
    const folderTypes = await getFolderTypes();
    if (!_.isArray(folderTypes) || !folderTypes.length) {
      throw new NotFound({
        message: 'No folderTypes found',
        data: {
          objectType: 'FolderType'
        }
      });
    }

    // validate parent
    let parent = null;
    if (parentId) {
      if (!validator.isUUID(parentId)) {
        throw new InvalidInput({
          message: 'The specified parent ID is invalid',
          data: {
            objectType: 'Folder',
            objectId: parentId
          }
        });
      }
      // Check parent folder id
      parent = await getFolderById(
        parentId,
        organizationId,
        isInternalToken,
        isSuperAdmin
      );
      if (_.isNil(parent)) {
        throw new NotFound({
          message: `Parent folder not found`,
          data: {
            objectType: 'Folder',
            objectId: parentId
          }
        });
      }
      // Super Admin: use root folder's organization instead of current org
      if (isSuperAdmin && parent.organizationId) {
        organizationId = parent.organizationId;
      }

      parentId = parent.id;
      if (!typeId && !_.isNil(parent.parentFolderId)) {
        typeId = parent.folderTypeId;
      }
    }

    if (!typeId) {
      typeId = folderTypes[0].id;
    } else {
      // Validate typeId
      const folderType = await getFolderTypeById(typeId);
      if (_.isNull(folderType)) {
        throw new InvalidInput({
          message: 'Folder type not found'
        });
      }
    }

    // Get userId in case create subFolder into rootFolder of an user using JWTToken
    let userId = _.get(userInfo, 'userId') || _.get(tokenInfo, 'userId');

    // Case using APIToken/JWTToken, get the user from input
    // to make sure the input user in the org context,
    // and the Token have rights to get this user
    if (_.isNil(userId)) {
      if (_.isNil(input.userId)) {
        throw new InvalidInput({
          message: 'userId is required when using Token'
        });
      }

      resUtil.checkRights(_.get(context, '_authInfo'), ['admin.user.read']);
      const user = await serviceContext.dal.admin.getUser(
        {
          id: input.userId,
          organizationIds: [args.organizationId]
        },
        context
      );

      if (user && user.id) {
        userId = user.id;
      }
    }

    const v2Folder = {
      folderId:
        v1Output.folderId || v1Output.treeFolderId || input.id || uuidv4(),
      folderTypeId: typeId,
      organizationId: organizationId,
      folderName: folderName.trim(),
      folderDescription: v1Output.folderDescription || input.description || '',
      parentFolderId: parentId,
      folder_path: null,
      createdBy: userId
    };
    v2Folder.treeObjectId = v1Output.treeObjectId || v2Folder.folderId;

    return v2Folder;
  }

  async function createNewFolder(context, args) {
    const columnData = mapper.decamelizeRootKeys(
      _.omit(args, ['treeObjectId'])
    );

    let { sql, values } = mainUtil.makeInsertSql(
      FOLDER_TABLES.folder,
      columnData,
      folderColumns
    );

    const createdFolder = await dbWrite.one(sql, values, mapper.mapFolderV2);

    // TODO: remove after treeObjectId migration
    const tid = args.treeObjectId || createdFolder.id;
    ({ sql, values } = mainUtil.makeInsertSql(
      FOLDER_TABLES.folderTreeObject,
      {
        folder_id: createdFolder.id,
        tree_object_id: tid
      },
      { tree_object_id: null }
    ));
    await dbWrite.one(sql, values);

    createdFolder.treeObjectId = tid;

    return createdFolder;
  }

  async function getFolderById(folderId, orgId, isInternalToken, isSuperAdmin) {
    let whereOrgCondition = '';
    let params = [folderId];

    // NOTE: Added isSuperAdmin check — need to verify impact on OLP cases.
    if (!isInternalToken && !isSuperAdmin) {
      params.push(orgId);
      whereOrgCondition = ` AND (
        f.organization_id = $${params.length} 
        OR $${params.length} = ANY(f.shared_org_read) 
        OR $${params.length} = ANY(f.shared_org_write)
      )`;
    }
    const sql = `
      SELECT ${mainUtil.makeSelectClause(folderColumns, 'f')}, 
      t.tree_object_id AS tree_object_id
      FROM ${FOLDER_TABLES.folder} f
      LEFT OUTER JOIN 
        ${FOLDER_TABLES.folderTreeObject} t ON t.folder_id = f.folder_id
      WHERE f.folder_id = $1 ${whereOrgCondition};
    `;

    try {
      const folder = await dbRead.one(sql, params, mapper.mapFolderV2);
      return folder;
    } catch (err) {
      try {
        // check if passed in folder is not a tree_object_id
        // TODO: remove after tree_object_id is deprecated
        const folder = await getFolderByTreeObjectId(
          folderId,
          orgId,
          isInternalToken,
          isSuperAdmin
        );
        logger.info('getFolderById-v2: treeObjectId used as folderId');
        return folder;
      } catch (err) {
        logger.error(`getFolderById-v2-treeObjectId (${folderId})`, err);
      }
      logger.error('getFolderById-v2', err);
      throw new errors.NotFound({
        message: 'The folderId does not exist',
        data: {
          objectId: folderId,
          objectType: 'Folder'
        }
      });
    }
  }

  // TODO: legacy - remove after treeObjectIds are migrated
  async function getFolderByTreeObjectId(
    treeObjectId,
    orgId,
    isInternalToken,
    isSuperAdmin
  ) {
    let whereOrgCondition = '';
    let params = [treeObjectId];
    // NOTE: Added isSuperAdmin check — need to verify impact on OLP cases.
    if (!isInternalToken && !isSuperAdmin) {
      params.push(orgId);
      whereOrgCondition = `
      AND (
        f.organization_id = $${params.length}
        OR f.organization_id = -1
        OR $2 = ANY(f.shared_org_read)
        OR $2 = ANY(f.shared_org_write)
      )
    `;
    }
    const sql = `
      SELECT ${mainUtil.makeSelectClause(folderColumns, 'f')}
      FROM ${FOLDER_TABLES.folderTreeObject} t
      JOIN ${FOLDER_TABLES.folder} f ON f.folder_id = t.folder_id
      WHERE t.tree_object_id = $1 ${whereOrgCondition};
    `;

    try {
      const result = await dbRead.one(
        sql,
        [treeObjectId, orgId, isInternalToken],
        mapper.mapFolderV2
      );
      if (result) {
        result.treeObjectId = treeObjectId;
      }
      return result;
    } catch (err) {
      logger.error('getFolderById-v2', err);
      throw new errors.NotFound({
        message: 'The treeObjectId does not exist',
        data: {
          objectId: treeObjectId,
          objectType: 'Folder'
        }
      });
    }
  }

  async function getFolderTypeById(id) {
    const folderTypes = await getFolderTypes();
    let result = null;
    if (!_.isArray(folderTypes) || !folderTypes.length) {
      return result;
    }

    const filterData = folderTypes.filter((o) => o.id === id);
    if (filterData.length > 0) {
      return filterData[0];
    }

    return result;
  }

  async function updateFolder(context, args) {
    try {
      const entityTagsInput = _.get(args, 'input.entityTags');
      const updateV2Folder = await validateUpdateFolderInput(context, args);

      const folder = await _updateFolder(context, updateV2Folder);

      // if entityTags field is in input, synchronize entity_tags table with corresponding rows
      if (!_.isNil(entityTagsInput)) {
        const tagData = {
          entityId: folder.id,
          organizationId: folder.organizationId,
          entityType: 'folder',
          entityTags: entityTagsInput
        };
        await serviceContext.dal.entityTags.updateEntityTags(
          tagData,
          folder,
          context
        );
      }

      return folder;
    } catch (err) {
      logger.error('updateFolder-v2', err);
      throw new errors.NotFound({
        message: 'The folderId does not exist',
        data: {
          objectId: args.folderId,
          objectType: 'Folder'
        }
      });
    }
  }

  async function _updateFolder(context, args) {
    const currentFolder = await getFolderById(
      args.folderId,
      args.organizationId
    );

    const { sql, values } = mainUtil.makeUpdateSql(
      FOLDER_TABLES.folder,
      {
        folder_name: args.folderName
      },
      folderColumns,
      `folder_id = $2 AND organization_id = $3`
    );

    values.push(args.folderId);
    values.push(args.organizationId);

    const updatedFolder = await dbWrite.one(sql, values, mapper.mapFolderV2);

    return { ...updatedFolder, originalFolderName: currentFolder.name };
  }

  async function validateUpdateFolderInput(context, args) {
    const input = args.input;
    const { userInfo, tokenInfo } = context.requestContext;
    if (!validator.isUUID(input.id)) {
      throw new InvalidInput({
        message:
          'Invalid ID format ' + input.id + '. A folder ID must be a UUID.'
      });
    }

    // check folder name
    if (!_.isString(input.name) || _.isEmpty(input.name.trim())) {
      throw new InvalidInput({
        message: 'the name field is required.'
      });
    }
    input.name = input.name.trim();

    // This will throw an error if cannot find the valid organization id
    const organizationId = _getOrganizationId(context, args);

    let userId = _.get(userInfo, 'userId') || _.get(tokenInfo, 'userId');
    if (_.isNil(userId)) {
      throw new NotFound({
        message: 'the requestor user not found'
      });
    }

    // get folder by id
    const folder = await getFolderById(input.id, organizationId);
    if (_.isNil(folder)) {
      throw new NotFound({
        message: 'The folder was not found',
        data: {
          objectType: 'Folder',
          objectId: input.id
        }
      });
    }

    const updateV2Folder = {
      organizationId: organizationId,
      folderId: folder.id,
      folderName: input.name,
      modifiedBy: userId
    };

    return updateV2Folder;
  }

  function _getOrganizationId(context, args) {
    // Org id
    const organizationIdInput =
      _.get(args, 'input.organizationId') || _.get(args, 'organizationId');

    const organizationIdRequestor = _.get(
      context,
      '_authInfo.organization.organizationId'
    );
    const isInternalToken = checkIsInternalToken(context);

    if (isInternalToken) {
      return organizationIdInput || organizationIdRequestor;
    }
    if (!organizationIdRequestor && !organizationIdInput) {
      throw new InvalidInput({
        message: 'Missing organization id',
        data: {
          objectType: 'Organization'
        }
      });
    }
    return organizationIdInput || organizationIdRequestor;
  }

  function checkIsInternalToken(context) {
    return resUtil.getTokenType(context) === 'internal';
  }

  async function _getFolderOrgById(folderId) {
    try {
      const sql = `SELECT organization_id FROM ${FOLDER_TABLES.folder} WHERE folder_id = $1`;
      const result = await dbRead.oneOrNone(sql, [folderId]);
      return result ? result.organization_id : null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Check whether a user has V2 access to a folder via its root folder tree.
   *
   * When orgId is provided (same-org path), checks both org-owned root trees
   * (organization_id = orgId) and user-owned root trees (root_folder_user_id = userId).
   * This mirrors V1 behaviour: any org member can manage folders under the org root,
   * and users can manage their personal root trees.
   *
   * When orgId is omitted (cross-org fallback), only personal root ownership is
   * checked. The org condition is excluded because the user may not be a member of
   * the folder's org — including it would allow any caller who knows a folder ID to
   * delete folders under the org root tree without actual org membership.
   */
  async function _userHasV2FolderAccess(userId, folderId, orgId) {
    if (!userId || !folderId) return false;
    try {
      const whereClause = orgId
        ? 'vfr.organization_id = $1 OR vfr.root_folder_user_id = $2'
        : 'vfr.root_folder_user_id = $1';
      const params = orgId ? [orgId, userId, folderId] : [userId, folderId];
      const folderParam = orgId ? '$3' : '$2';
      const sql = `
        WITH accessible_roots AS (
          SELECT vf.folder_path
          FROM ${FOLDER_TABLES.folder} vf
          JOIN ${FOLDER_TABLES.folderRoot} vfr ON vfr.folder_id = vf.folder_id
          WHERE ${whereClause}
        )
        SELECT 1
        FROM ${FOLDER_TABLES.folder} vf
        WHERE vf.folder_id = ${folderParam}
          AND vf.folder_path <@ (
            SELECT COALESCE(array_agg(folder_path), ARRAY[]::ltree[])
            FROM accessible_roots
          )
        LIMIT 1
      `;
      const result = await dbRead.oneOrNone(sql, params);
      return result !== null;
    } catch (err) {
      logger.error('_userHasV2FolderAccess', err);
      return false;
    }
  }

  async function deleteFolder(context, args) {
    try {
      const input = args.input || {};
      if (!input.id || !validator.isUUID(input.id)) {
        throw new InvalidInput({
          message:
            'Invalid ID format ' + input.id + '. A folder ID must be a UUID.'
        });
      }
      // get organization id: This will throw an error if cannot find the valid organization id
      let organizationId = _getOrganizationId(context, args);

      // 0. Get folder — fall back to the folder's own org when auth-org lookup misses
      // (cross-org delete: user is authed to a different org than the folder owner).
      // Also handles treeObjectId: treeObjectIds are UUIDs that pass the format check above
      // but are not folder_ids — fall back to the treeObjectId lookup table when the
      // direct folder_id lookup fails and the cross-org lookup yields nothing.
      let folder;
      let crossOrg = false;
      try {
        folder = await getFolderById(input.id, organizationId);
      } catch (err) {
        if (err.name !== 'not_found') throw err;
        const folderOrg = await _getFolderOrgById(input.id);
        if (folderOrg) {
          organizationId = folderOrg;
          crossOrg = true;
          folder = await getFolderById(input.id, organizationId);
        } else {
          // input.id may be a treeObjectId — resolve it via the lookup table
          const isInternalToken = checkIsInternalToken(context);
          const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
          try {
            folder = await getFolderByTreeObjectId(input.id, organizationId, isInternalToken, isSuperAdmin);
          } catch (treeErr) {
            throw err; // re-throw original not_found
          }
        }
      }
      if (!folder) {
        throw new NotFound({
          message: 'The folder was not found',
          data: {
            objectType: 'Folder',
            objectId: input.id
          }
        });
      }

      // Access check: the user must own the root folder tree containing this folder,
      // or (same-org) be in the org that owns the root.
      // Cross-org: personal root only — user may not be a member of the folder's org.
      // Same-org: org root + personal root — mirrors V1 _canAccessFolder behaviour.
      // NOTE: use folder.id (the resolved folder UUID) — input.id may be a treeObjectId.
      const userId = _.get(context, '_authInfo.userId');
      const orgForAccess = crossOrg ? null : organizationId;
      const hasAccess = await _userHasV2FolderAccess(userId, folder.id, orgForAccess);
      if (!hasAccess) {
        throw new NotFound({
          message: 'The folder was not found. It either does not exist or you or your organization do not have access to it.',
          data: {
            objectType: 'Folder',
            objectId: input.id,
            organizationId,
            userId
          }
        });
      }

      const folderId = folder.id;

      if (!folder.parentFolderId) {
        throw new NotAllowed({
          message: 'Can not delete root folder',
          data: {
            objectType: 'Folder',
            objectId: folderId
          }
        });
      }

      // 1. check folder if it has any childen inside
      const childenFolders = await _getFolders({
        organizationId,
        parentId: folderId
      });

      if (_.isArray(childenFolders) && childenFolders.length > 0) {
        throw new NotAllowed({
          message: 'Folder is not empty',
          data: {
            objectType: 'Folder',
            objectId: folderId
          }
        });
      }

      // 2. Check folder object
      const folderObjects = await getFolderObjects(
        context,
        organizationId,
        folderId,
        {
          limit: 1
        }
      );
      if (_.isArray(folderObjects) && folderObjects.length > 0) {
        throw new NotAllowed({
          message: 'Must delete all objects in the folder before deleting it',
          data: {
            objectType: 'Folder',
            objectId: folderId
          }
        });
      }

      // 3. Check Folder Sdo
      const folderSdo = await getFolderContentTemplates(context, {
        folderId: folderId,
        limit: 1,
        organizationId
      });
      if (_.isArray(folderSdo) && folderSdo.length > 0) {
        throw new NotAllowed({
          message: 'Folder has linked content templates',
          data: {
            objectType: 'Folder',
            objectId: folderId
          }
        });
      }

      // 4. Check folder root: TODO

      const deletedFolder = await _deleteFolder(folderId, organizationId);
      const rbacArgs = {
        organizationId,
        resourceType: 'Folder',
        resourceIds: [folderId]
      };
      try {
        await rbacAuthBll.removeACEsFromResources(context, rbacArgs);
      } catch (err) {
        logger.error('DeleteFolder: failed to delete ACEs:' + err);
      }

      try {
        // remove all entity tags of this folder
        const tagData = {
          entityId: folderId,
          organizationId,
          entityType: 'folder',
          entityTags: []
        };
        await serviceContext.dal.entityTags.updateEntityTags(
          tagData,
          deletedFolder,
          context
        );
      } catch (err) {
        logger.error(
          `DeleteFolder: failed to delete tags for [folder:${folderId}] :` + err
        );
      }

      return deletedFolder;
    } catch (err) {
      logger.error('deleteFolder-v2', err);
      throw err;
    }
  }

  async function _getFolders(filter) {
    filter = filter || {};
    const args = [];
    const conditions = [];
    if (filter.organizationId) {
      args.push(filter.organizationId);
      conditions.push(`organization_id=$${args.length}`);
    }
    if (filter.id) {
      args.push(filter.id);
      conditions.push(`folder_id=$${args.length}`);
    }
    if (filter.name) {
      args.push(filter.name);
      conditions.push(`folder_name=$${args.length}`);
    }
    if (filter.parentId) {
      args.push(filter.parentId);
      conditions.push(`parent_folder_id=$${args.length}`);
    }
    if (filter.typeId) {
      args.push(filter.typeId);
      conditions.push(`folder_type_id=$${args.length}`);
    }

    if (conditions.length === 0) {
      throw new InvalidInput({
        message: 'At least a condition to filter folders'
      });
    }
    const sql = `
      SELECT ${mainUtil.makeSelectClause(folderColumns)}
      FROM ${FOLDER_TABLES.folder} 
      WHERE ${conditions.join(' AND ')};
    `;

    return await dbRead.map(sql, args, mapper.mapFolderV2);
  }

  async function _deleteFolder(folderId, orgId) {
    // TODO: delete all dependencies
    const sql = `
      DELETE FROM ${FOLDER_TABLES.folder}
      WHERE folder_id = $1 AND organization_id = $2
      RETURNING ${mainUtil.makeSelectClause(folderColumns)};
    `;

    return await dbWrite.one(sql, [folderId, orgId], mapper.mapFolderV2);
  }

  /**
   * get root folder using the id or
   * get the organization and user's root folders from context
   * @param {Object} context The request context
   * @param {Object} args id, skipAuth and rootFolderType (or type)
   * @param {UUID} [args.id] ID of the root folder
   * @param {boolean} [args.skipAuth] Skip verifying user or organization root folders.
   * @param {string} [args.rootFolderType] The type of root folder
   * @param {string} [args.type] The type of root folder
   * @param {number} [args.organizationId] ID of the organization that owns these root folders
   * @returns {Array} Array of root folders
   */
  async function getRootFolders(context, args) {
    const folderType = await getFolderTypeByName(
      args.rootFolderType || args.type
    );
    const folderTypeId = _.get(folderType, 'id');
    const where = [];
    const sqlArgs = [];

    mainUtil.addSqlWhere('vf.folder_type_id', folderTypeId, where, sqlArgs);
    mainUtil.addSqlWhere('vf.folder_id', args.id, where, sqlArgs);

    // used in getFolder when a shared org/user folder is requested
    if (!args.id || args.skipAuth !== true) {
      const userId = _.get(context, '_authInfo.userId');
      const orgId = _.get(context, '_authInfo.organization.organizationId');
      const currentOrgId = args.organizationId || orgId;
      // Fallback: Check and fix V1 user root folders with org=-1
      if (userId && currentOrgId) {
        await _handleV1UserRootFolderFallback(
          context,
          userId,
          currentOrgId
        );
      }
      mainUtil.addSqlWhere('vfr.organization_id', currentOrgId, where, sqlArgs);
      mainUtil.addSqlWhere('vf.organization_id', currentOrgId, where, sqlArgs);
      const userOr = [];
      userOr.push(`vfr.root_folder_user_id IS NULL`);
      mainUtil.addSqlWhere(
        'vfr.root_folder_user_id',
        args.userId || userId,
        userOr,
        sqlArgs
      );
      where.push(`(${userOr.join(' OR ')})`);
    }

    // order the user root folders after the organization root folders
    const sql = `
        SELECT 
          ${mainUtil.makeSelectClause(folderColumns, 'vf')},
          vfr.root_folder_user_id,
          vfr.root_folder_application_id,
          t.tree_object_id AS tree_object_id,
          vf.folder_type_id AS root_folder_type_id
        FROM v2_folder vf
        JOIN v2_folder_root vfr ON vfr.folder_id = vf.folder_id
        LEFT OUTER JOIN v2_folder_treeobject t ON t.folder_id = vf.folder_id
        WHERE
          ${where.join(' AND ')}
        ORDER BY CASE WHEN vfr.root_folder_user_id IS NULL THEN 0 ELSE 1 END, vfr.root_folder_user_id;
      `;

    try {
      const rootFolders = await dbRead.map(
        sql,
        sqlArgs,
        mapper.mapRootFolderV2
      );

      return _.uniqBy(rootFolders, 'id');
    } catch (err) {
      logger.error('getRootFolders-v2', err);
      return [];
    }
  }

  /**
   * Get or create a root folder
   * @param {Object} context The request context
   * @param {Object} args
   * @returns {Object} a folder
   */
  async function createRootFolder(context, args) {
    const v1Output = args.v1Output || {};
    const createdBy = _.get(context, '_authInfo.userId');
    if (!_.isNumber(args.organizationId)) {
      throw new InvalidInput({
        message: 'organizationId is required'
      });
    }

    if (_.isString(args.folderType)) {
      if (_.isNil(args.folderTypeId)) {
        const folderType = await getFolderTypeByName(args.folderType);
        args.folderTypeId = _.get(folderType, 'id');
      }

      if (_.isNil(args.rootFolderApplicationId)) {
        args.rootFolderApplicationId =
          ROOT_FOLDER_APPLICATION_MAPPING[args.folderType];
      }
    }

    if (!_.isNumber(args.folderTypeId)) {
      throw new InvalidInput({
        message: 'folderTypeId is required'
      });
    }

    let mediaPlatformTx = null;
    let ssoTx = null;
    let dbWriteClient = dbWrite;
    let isCMSFolder = false;

    if (args.rootFolderUserId) {
      mediaPlatformTx = await dbUtil.dbWriteTx('media_platform');
      ssoTx = await dbUtil.dbWriteTx('sso');
      await mediaPlatformTx.begin();
      await ssoTx.begin();
      dbWriteClient = mediaPlatformTx.client;
      const folderType = await getFolderTypeByName('cms');
      isCMSFolder = _.get(folderType, 'id') === args.folderTypeId;
    }

    try {
      const sql = `
        WITH ins_f AS (
          INSERT INTO public.v2_folder (
            folder_id,
            folder_type_id,
            organization_id,
            folder_name,
            folder_description,
            parent_folder_id,
            shared_org_read,
            shared_org_write,
            folder_path,
            created_by,
            modified_by,
            date_created,
            date_modified
          )
          VALUES 
            ($3, $2, $1, $4, $5, NULL, '{}', '{}', NULL, $6, $6, NOW(), NOW())
          ON CONFLICT DO NOTHING 
          RETURNING folder_id
        ),
        v2_folder_treeobject AS (
          INSERT INTO public.v2_folder_treeobject (
            folder_id,
            tree_object_id
          )
          VALUES 
            ($3, $9)
          ON CONFLICT DO NOTHING 
          RETURNING tree_object_id
        )
        INSERT INTO v2_folder_root
          (folder_id, organization_id, root_folder_user_id, root_folder_application_id)
        SELECT ins_f.folder_id, $1, $7, $8
        FROM ins_f
        ON CONFLICT DO NOTHING 
        RETURNING folder_id;
      `;

      // if args.id was not passed in, create new one
      let folderId;
      let treeObjectId;
      if (args.rootFolderUserId) {
        folderId = args.id || uuidv4();
        treeObjectId = (v1Output.treeObjectId || folderId);
      } else {
        folderId =
          v1Output.rootFolderId || v1Output.objectId || args.id || uuidv4();
        treeObjectId = v1Output.treeObjectId || folderId;
      }
      const folderName = await buildRootFolderName({
        context,
        args,
        v1Output
      });
      const params = [
        args.organizationId,
        args.folderTypeId,
        folderId,
        folderName,
        v1Output.description || args.description || folderName,
        createdBy,
        args.rootFolderUserId,
        args.rootFolderApplicationId,
        treeObjectId
      ];

      await dbWriteClient.oneOrNone(sql, params, mapper.camelizeRootKeys);
      // add default ACEs for user CMS root folder
      if (args.rootFolderUserId && isCMSFolder) {
        const rbacArgs = {
          organizationId: args.organizationId,
          objectId: folderId,
          resourceType: 'Folder',
          ownerId: args.rootFolderUserId
        };
        const dbClients = {
          sso: ssoTx.client,
          media_platform: mediaPlatformTx.client
        };

        await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs, {
          dbClients
        });
      }

      if (mediaPlatformTx && ssoTx) {
        await mediaPlatformTx.commit();
        await ssoTx.commit();
      }
      const rootFolders = await getRootFolders(context, {
        id: folderId,
        organizationId: args.organizationId,
        userId: args.rootFolderUserId // ensure get the user root folder if applicable
      });

      return _.head(rootFolders);
    } catch (err) {
      if (mediaPlatformTx && ssoTx) {
        await mediaPlatformTx.rollback();
        await ssoTx.rollback();
      }
      serviceContext.logger.error(
        'Failed to create root folder with ACEs: ',
        err
      );
      throw err;
    } finally {
      if (mediaPlatformTx) mediaPlatformTx.done();
      if (ssoTx) ssoTx.done();
    }
  }

  async function _fixupV1UserRootFolder(organizationId, folderId, userId) {
    // v1 user root folders do not have organizationId (or -1) and v2folders eventing fixup may have not been run yet
    const sql = /*sql*/ `
      UPDATE v2_folder_root 
      SET organization_id = $1 
      WHERE
        (organization_id is NULL OR organization_id = -1)
      AND
        folder_id = $2 AND root_folder_user_id = $3
      AND NOT EXISTS (SELECT 1 FROM v2_folder_root WHERE organization_id = $1 AND folder_id = $2 AND root_folder_user_id = $3)
      RETURNING folder_id;`;

    const result = await dbWrite.oneOrNone(sql, [
      organizationId,
      folderId,
      userId
    ]);
    if (result) {
      // Root's org was resolved -> propagate to THIS root's subtree only
      // (folders + filed objects), touching only still-unresolved (-1 / NULL) rows.
      //
      // VE-26538: the previous WHERE was
      //   organization_id = -1 OR organization_id IS NULL AND folder_path <@ (...)
      // which parses as (organization_id = -1) OR (organization_id IS NULL AND folder_path <@ ...)
      // because AND binds tighter than OR. Migrated rows are -1 (not NULL), so only the
      // unscoped `organization_id = -1` branch ever matched -> it re-tenanted EVERY -1
      // folder across ALL orgs to $1. The org predicate must be parenthesized so the
      // folder_path subtree scope applies to it. (folder_path is maintained by the
      // tr_v2_folder trigger.) Objects are re-stamped too, else the files stay hidden.
      const subtreeFixupSql = /*sql*/ `
        WITH subtree AS (
          SELECT folder_id
          FROM v2_folder
          WHERE folder_path <@ (SELECT folder_path FROM v2_folder WHERE folder_id = $2)
        ),
        fixed_folders AS (
          UPDATE v2_folder vf
          SET organization_id = $1
          FROM subtree s
          WHERE vf.folder_id = s.folder_id
            AND (vf.organization_id = -1 OR vf.organization_id IS NULL)
          RETURNING 1
        ),
        fixed_objects AS (
          UPDATE v2_folder_object o
          SET organization_id = $1
          FROM subtree s
          WHERE o.folder_id = s.folder_id
            AND (o.organization_id = -1 OR o.organization_id IS NULL)
          RETURNING 1
        )
        SELECT (SELECT count(*) FROM fixed_folders) AS folders_fixed,
               (SELECT count(*) FROM fixed_objects) AS objects_fixed;
      `;
      await dbWrite.query(subtreeFixupSql, [organizationId, folderId]);
    }
    return result;
  }

  async function buildRootFolderName({ context, args }) {
    const folderTypeName = _.get(args, 'folderType', 'cms');

    // User root folder
    if (args.rootFolderUserId) {
      const user = await serviceContext.dal.admin.getUser(
        { id: args.rootFolderUserId },
        context
      );
      const userName = _.get(user, 'name', 'User');
      return `${userName} ${folderTypeName} Root Folder`;
    }
    // Org root folder
    const org = await serviceContext.dal.organization.getOrganization(context, {
      id: args.organizationId
    });
    const orgName = _.get(org, 'name', 'Organization');
    return `${orgName} ${folderTypeName} Root Folder`;
  }

  /**
   * Get or create the organization and user root folders
   * @param {Object} context The request context
   * @param {Object} args
   * @returns {Array} Array of folders
   */
  async function getOrCreateRootFolders(context, args) {
    if (_.isNil(args.rootFolderType)) {
      throw new InvalidInput({ message: 'rootFolderType is required' });
    }
    // Get existing root folders first
    const rootFolders = await getRootFolders(context, args);
    const userId = _.get(context, '_authInfo.userId');
    const organizationId = args.organizationId;
    const newArgs = {
      folderType: args.rootFolderType,
      organizationId: args.organizationId,
      v1Output: null
    };
    // Get output from v1
    let v1OrgRootFolder;
    let v1UserRootFolder;
    if (args.v1Output && _.isArray(args.v1Output)) {
      v1OrgRootFolder = args.v1Output.find((item) => item.organizationId);
      v1UserRootFolder = args.v1Output.find(
        (item) => item.userId && !item.organizationId
      );
    }
    const existingUserRootFolder = _.find(
      rootFolders,
      (item) =>
        item.rootFolderUserId === userId &&
        item.organizationId == args.organizationId
    );
    const existingOrgRootFolder = _.find(
      rootFolders,
      (item) =>
        _.isNil(item.rootFolderUserId) &&
        item.organizationId == args.organizationId
    );

    if (_.isNil(existingOrgRootFolder)) {
      // create the org root folder if not exist
      newArgs.v1Output = v1OrgRootFolder;
      const orgFolder = await createRootFolder(context, newArgs);
      if (orgFolder) {
        rootFolders.push(orgFolder);
      }
    }

    if (_.isNil(existingUserRootFolder) && userId) {
      const userRootFolderArgs = await _buildUserRootFolderArgs(
        context,
        userId,
        organizationId,
        args.rootFolderType,
        v1UserRootFolder
      );
      // create the user's root folder
      const userFolder = await createRootFolder(context, userRootFolderArgs);
      if (userFolder) {
        rootFolders.push(userFolder);
      }
    }
    return rootFolders;
  }

  /**
   * Get or create an organization root folder
   * @param {Object} context The request context
   * @param {number} args.organizationId ID of the owner of this root folder
   * @param {string} args.rootFolderType The type of root folder
   * @returns {Object} a folder
   */
  async function getOrCreateRootFolder(context, args) {
    const rootFolderType = _.get(args, 'rootFolderType');
    const requesterOrgId =
      args.organizationId ||
      _.get(context, '_authInfo.organization.organizationId');
    const userId = _.get(args, 'userId');
    const v1Output = args.v1Output || {};

    if (!rootFolderType) {
      throw new InvalidInput({ message: 'rootFolderType is required' });
    }
    if (!requesterOrgId) {
      throw new InvalidInput({ message: 'requesterOrgId is required' });
    }

    // Get existing user and org root folder first
    const rootFolders = await getRootFolders(context, {
      rootFolderType,
      organizationId: requesterOrgId,
      userId
    });

    // Get or create user root folder if userId is passed in.
    if (userId) {
      const existingUserRootFolder = _.find(
        rootFolders,
        (item) =>
          item.rootFolderUserId == userId &&
          item.organizationId == requesterOrgId
      );
      if (existingUserRootFolder) {
        return existingUserRootFolder;
      }
      const v1UserRootFolder =
        v1Output.userId && !v1Output.organizationId ? v1Output : null;

      const userRootFolderArgs = await _buildUserRootFolderArgs(
        context,
        userId,
        requesterOrgId,
        rootFolderType,
        v1UserRootFolder
      );

      return await createRootFolder(context, userRootFolderArgs);
    }

    const existingOrgRootFolder = _.find(
      rootFolders,
      (item) =>
        _.isNil(item.rootFolderUserId) && item.organizationId == requesterOrgId
    );
    if (existingOrgRootFolder) {
      return existingOrgRootFolder;
    }

    return await createRootFolder(context, {
      id: v1Output.rootFolderId || v1Output.objectId,
      folderType: rootFolderType,
      organizationId: requesterOrgId,
      v1Output: v1Output.organizationId ? v1Output : null
    });
  }

  // Validate and get folderId v2
  async function _validateFolderId(context, inputFolderId, args) {
    // get organization id: This will throw an error if cannot find the valid organization id
    const organizationId = _getOrganizationId(context, args);

    // Get folder by Id or treeObjectId
    const folder = await getFolderById(inputFolderId, organizationId);
    if (!folder) {
      throw new NotFound({
        message: 'The folder was not found',
        data: {
          objectType: 'Folder',
          objectId: inputFolderId
        }
      });
    }

    return folder.id;
  }

  /**
   * Create Folder Content Template.
   * @param {Object} context The request context
   * @param {Object} args contain input values with contentTemplateId, folderId, sdoId, schemaId
   * @returns {Object} return folder content template
   */
  async function createFolderContentTemplate(context, args) {
    if (!args.input) {
      throw new InvalidInput({
        message: 'input parameter is required.'
      });
    }
    mainUtil.checkId(args.input.folderId, false, false, true);
    mainUtil.checkId(args.input.sdoId, false, false, true);
    mainUtil.checkId(args.input.schemaId, false, false, true);

    // validate and get folderId v2
    const folderId = await _validateFolderId(
      context,
      args.input.folderId,
      args
    );

    const userId = _.get(context, '_authInfo.userId');
    const createdBy = userId;
    const modifiedBy = userId;
    const contentTemplate = [
      folderId,
      args.input.sdoId,
      args.input.schemaId,
      createdBy,
      modifiedBy
    ];

    const sql = `
      INSERT INTO v2_folder_sdo (
        folder_id,
        sdo_id,
        content_template_schema_id,
        created_by,
        modified_by
      )
      SELECT $1, $2, $3, $4, $5
      ON CONFLICT DO NOTHING;
      SELECT
        folder_id,
        sdo_id,
        content_template_schema_id,
        date_created,
        date_modified,
        created_by,
        modified_by
      FROM v2_folder_sdo 
      WHERE folder_id=$1 AND sdo_id=$2 AND content_template_schema_id=$3;
    `;
    const newFolderContentTemplate = await dbWrite.query(sql, contentTemplate);
    if (!newFolderContentTemplate.length) {
      throw new NotAllowed({
        message: 'V2Folder: The content template was not created.',
        data: {
          objectId: `folderId:${folderId}.sdoId:${args.input.sdoId}`,
          objectType: 'Folder Content Template'
        }
      });
    }
    return mapper.mapV2FolderSdo(newFolderContentTemplate[0]);
  }

  function contentTemplateIdToFolderSdo(id) {
    let folderId, sdoId;
    if (_.isString(id)) {
      const parts = id.split('::');
      if (parts.length === 2) {
        folderId = parts[0];
        sdoId = parts[1];
      }
    }
    return {
      folderId,
      sdoId
    };
  }

  /**
   * Update Folder Content Template.
   * @param {Object} context The request context
   * @param {Object} args contain input values with contentTemplateId, folderId, sdoId, schemaId
   * @returns {Object} return folder content template
   */
  async function updateFolderContentTemplate(context, args) {
    const contentTemplateId = _.get(args, 'input.id', '');
    const sdoId = _.get(args, 'input.sdoId');
    const schemaId = _.get(args, 'input.schemaId');
    let folderId = _.get(args, 'input.folderId');

    if (_.isEmpty(contentTemplateId)) {
      throw new InvalidInput({
        message: 'Missing or empty id field. A non-empty value is required.',
        data: { objectId: contentTemplateId }
      });
    }

    mainUtil.checkId(folderId, true, false, true);
    mainUtil.checkId(sdoId, true, false, true);
    mainUtil.checkId(schemaId, true, false, true);

    // validate and get folderId v2
    if (folderId) {
      folderId = await _validateFolderId(context, folderId, args);
    }

    const arrSplitId = contentTemplateIdToFolderSdo(contentTemplateId);

    if (_.isNil(arrSplitId.folderId) || _.isNil(arrSplitId.sdoId)) {
      throw new InvalidInput({
        message: 'invalid input format for content template id',
        data: {
          objecType: 'contentTemplateId',
          objectId: contentTemplateId
        }
      });
    }

    const oldFolderId = arrSplitId.folderId;
    const oldSdoId = arrSplitId.sdoId;

    if (folderId && folderId != oldFolderId) {
      throw new InvalidInput({
        message: 'The content template was not found or deleted.',
        data: {
          objecType: 'contentTemplateId',
          objectId: contentTemplateId
        }
      });
    }

    const contentTemplate = await getFolderContentTemplates(context, {
      folderId: oldFolderId,
      sdoId: oldSdoId
    });
    if (_.isEmpty(contentTemplate)) {
      throw new NotFound({
        message: 'V2Folder: The content template was not found or deleted.',
        data: {
          objectId: `folderId:${folderId}.sdoId:${sdoId}`,
          objectType: 'Folder Content Template'
        }
      });
    }
    const _args = [
      sdoId,
      schemaId ? schemaId : contentTemplate[0].contentTemplateSchemaId,
      oldFolderId,
      oldSdoId
    ];
    const sql = `
      UPDATE v2_folder_sdo 
      SET sdo_id = $1, content_template_schema_id = $2
      WHERE folder_id = $3 AND sdo_id = $4
      RETURNING
        folder_id,
        sdo_id,
        content_template_schema_id,
        date_created,
        date_modified,
        created_by,
        modified_by;
    `;
    const updatedFolderContentTemplate = await dbWrite.query(sql, _args);
    if (!updatedFolderContentTemplate.length) {
      throw new NotFound({
        message: 'V2Folder: The content template was not found or deleted.',
        data: {
          objectId: `folderId:${folderId}.sdoId:${sdoId}`,
          objectType: 'Folder Content Template'
        }
      });
    }
    return mapper.mapV2FolderSdo(updatedFolderContentTemplate[0]);
  }

  /**
   * Delete Folder Content Template.
   * @param {Object} context The request context
   * @param {Object} args contain contentTemplateId
   * @returns {Object} return deleted id
   */
  async function deleteFolderContentTemplate(context, args) {
    let folderId = args.folderId || _.get(args, 'input.folderId');
    let sdoId = args.sdoId || _.get(args, 'input.sdoId');

    if (!folderId || !sdoId) {
      // parse the folderId and sdoId from the input id.
      ({ sdoId, folderId } = contentTemplateIdToFolderSdo(
        _.get(args, 'input.id', args.id)
      ));
    }

    if (!folderId || !sdoId) {
      // parse the folderId and sdoId from the input id.
      throw new InvalidInput({
        message: 'V2 Folder: folderId and sdoId are required'
      });
    }

    if (!validator.isUUID(folderId)) {
      throw new InvalidInput({
        message: `Invalid ID format A ${folderId} must be a UUID.`
      });
    }

    // validate and get folderId v2
    folderId = await _validateFolderId(context, folderId, args);

    const sql = `
      DELETE FROM v2_folder_sdo 
      WHERE folder_id = $1
        AND sdo_id = $2
      RETURNING
        folder_id,
        sdo_id,
        content_template_schema_id,
        date_created,
        date_modified,
        created_by,
        modified_by;
    `;
    const deletedFolderContentTemplate = await dbWrite.query(sql, [
      folderId,
      sdoId
    ]);
    if (!deletedFolderContentTemplate.length) {
      throw new NotFound({
        message:
          'v2 Folder: The folder content template does not exist or has already been deleted.',
        data: {
          objectType: 'FolderContentTemplate',
          objectId: args.id
        }
      });
    }
    const folderSdo = mapper.mapV2FolderSdo(deletedFolderContentTemplate[0]);
    return {
      id: folderSdo.contentTemplateId
    };
  }

  /**
   * Query folder content template from database using folderId + sdoId.
   * @param {Object} context The request context
   * @param {Object} args contain folderId
   * @returns {ContentTemplate[]} return list of folder content template in given folder
   */
  async function getFolderContentTemplates(context, args) {
    mainUtil.checkId(args.folderId, false, false, true);
    mainUtil.checkId(args.sdoId, true, false, true);

    // validate and get folderId v2
    const folderId = await _validateFolderId(context, args.folderId, args);

    const queryArgs = [];
    const whereClause = [];
    queryArgs.push(folderId);
    whereClause.push(`folder_id = $${queryArgs.length}`);

    if (args.sdoId) {
      queryArgs.push(args.sdoId);
      whereClause.push(`sdo_id = $${queryArgs.length}`);
    }

    const sql = `
      SELECT
        folder_id,
        content_template_schema_id,
        sdo_id,
        created_by,
        modified_by,
        date_created,
        date_modified
      FROM v2_folder_sdo 
      WHERE ${whereClause.join(' AND ')}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30};
    `;
    const res = await dbRead.map(sql, queryArgs, mapper.mapV2FolderSdo);

    return res;
  }

  /**
   * This function removes a TDO from folders
   * @param {Object} context The request context
   * @param {Number} tdoId the Tdo Id. It is required
   * @param {Number} organizationId the Tdo Id. It is an optional. We will get the value from context if it is not passed in
   * @returns {String} Id of tdo
   */
  async function removeTDOFromFolders(context, tdoId, organizationId) {
    if (!tdoId) {
      throw new InvalidInput({
        message: 'Missing TDO id in the input.',
        data: {
          objectId: tdoId
        }
      });
    }
    // get org Id: It will throw an error if cannot find the valid organization id
    const orgId = _getOrganizationId(context, { organizationId });

    const sql = `
        DELETE FROM ${FOLDER_TABLES.folderObject}
        WHERE
          object_id = $1 AND
          organization_id = $2 AND
          object_type = $3
          ;
      `;
    await dbWrite.none(sql, [
      _.toString(tdoId),
      orgId,
      FOLDER_OBJECT_TYPE[FOLDER_OBJECT_TYPE_ID.tdo]
    ]);

    return {
      id: tdoId
    };
  }

  /**
   * Get parent folder of an object
   * @param {string} objectId ID of folder object that was filed this folder
   * @param {number} organizationId ID of the owner of this root folder
   * @returns {Object|null} returns a folder or null if no folder is found
   */
  async function getParentFolder(objectId, organizationId, objectType) {
    if (_.isNil(objectId)) {
      throw new InvalidInput({ message: 'objectId is required' });
    }

    if (_.isNil(organizationId)) {
      throw new InvalidInput({ message: 'organizationId is required' });
    }

    const sqlWhere = [];
    const sqlParams = [];

    mainUtil.addSqlWhere(
      'vfo.object_id',
      _.toString(objectId),
      sqlWhere,
      sqlParams
    );
    mainUtil.addSqlWhere(
      'vfo.organization_id',
      organizationId,
      sqlWhere,
      sqlParams
    );
    const orgParamIdx = sqlParams.length;
    // See getParentFoldersForObject for why object_type matters here: without
    // it this cannot prune the v2_folder_object hash partitions.
    mainUtil.addSqlWhere(
      'vfo.object_type',
      _toObjectTypeName(objectType),
      sqlWhere,
      sqlParams
    );

    // This deliberately does NOT reuse getParentFoldersForObject. ltree `@>`
    // matches ancestor-OR-SELF, so the deepest row of that query is always the
    // folder the object is filed in -- exactly what this function returns after
    // _.head. Walking the whole ancestor chain through path_gist_idx only to
    // discard everything but the head is wasted work, and it inherits that
    // query's degradation: with no selectivity estimator for `@>`, a widely
    // filed object tips the planner into a seq scan (measured 46ms vs 2.9ms
    // here). Joining straight to the filed-in folder is three PK index lookups
    // at a constant planner cost of ~16, independent of tree depth, folder
    // count, or how many folders the object is filed in.
    const sql = `
      SELECT ${mainUtil.makeSelectClause(folderColumns, 'pf')},
      ft.tree_object_id
      FROM ${FOLDER_TABLES.folderObject} vfo
      JOIN ${FOLDER_TABLES.folder} pf ON pf.folder_id = vfo.folder_id
      LEFT OUTER JOIN
        ${FOLDER_TABLES.folderTreeObject} ft ON ft.folder_id = pf.folder_id
      WHERE ${sqlWhere.join(' AND ')}
        AND pf.organization_id = $${orgParamIdx}
      ORDER BY nlevel(pf.folder_path) DESC
      LIMIT 1;
    `;

    try {
      return await dbRead.oneOrNone(sql, sqlParams, mapper.mapFolderV2);
    } catch (error) {
      logger.error('getParentFolder-v2', error);
      return null;
    }
  }

  /**
   * Get parent folders of an object.
   * @param {string} args.objectId ID of folder object that was filed this folder
   * @param {number} args.organizationId ID of the owner of this root folder
   * @returns {Array} returns array of folders
   */
  async function getParentFoldersForObject(
    objectId,
    organizationId,
    objectType
  ) {
    if (_.isNil(objectId)) {
      throw new InvalidInput({ message: 'objectId is required' });
    }

    if (_.isNil(organizationId)) {
      throw new InvalidInput({ message: 'organizationId is required' });
    }

    const sqlWhere = [];
    const sqlParams = [];

    mainUtil.addSqlWhere(
      'vfo.object_id',
      _.toString(objectId),
      sqlWhere,
      sqlParams
    );
    mainUtil.addSqlWhere(
      'vfo.organization_id',
      organizationId,
      sqlWhere,
      sqlParams
    );
    // Captured here rather than hardcoded as $2 so the outer scan below stays
    // correct if the conditions above are ever reordered.
    const orgParamIdx = sqlParams.length;
    // v2_folder_object is HASH partitioned by (organization_id, object_type),
    // and its PK is (organization_id, object_type, object_id, folder_id).
    // Without object_type Postgres can neither prune partitions nor use
    // object_id as a boundary condition, so it scans every folder-object index
    // entry belonging to the org across all 20 partitions. Supplying it turns
    // the lookup into a single-partition PK-prefix match. Optional so callers
    // that genuinely don't know the type keep the old (slow) behaviour.
    mainUtil.addSqlWhere(
      'vfo.object_type',
      _toObjectTypeName(objectType),
      sqlWhere,
      sqlParams
    );

    // The leaf folder(s) go in a CTE that is JOINed, rather than an inline
    // scalar subquery, because an object may legitimately be filed in more than
    // one folder: v2_folder_object's PK includes folder_id, and fileFolderItem
    // honours allowMultipleParents (dal/package.js files a TDO into an
    // additional folder; dalApplication.js does the same). A scalar
    // `@> (SELECT ...)` raises SQLSTATE 21000 the moment there are two rows,
    // which the catch below silently turned into an empty result. Joining
    // returns the union of every chain, matching both the plural contract and
    // the V1 implementation.
    //
    // Do NOT rewrite this as `@> ANY (SELECT ...)`. Postgres cannot hash a
    // non-equality operator, so that form makes v2_folder the outer relation of
    // a semi-join and abandons path_gist_idx: measured on a 310k-folder dataset
    // it becomes a full seq scan, ~40x slower than this shape.
    //
    // Caveat: the GiST probe is only chosen while the leaf count is small. ltree
    // `@>` has no selectivity estimator (contsel returns a flat 0.001), so each
    // probe is costed as if it returned ~0.1% of the table; past a few hundred
    // leaves the planner switches to a seq scan on its own. Adding
    // AS MATERIALIZED does not prevent that -- it was measured and makes no
    // difference either way, so it is deliberately omitted.
    //
    // DISTINCT ON (folder_id) dedupes ancestors shared by two leaves (e.g. the
    // common root). The ft join stays outside it so tree_object_id fan-out
    // behaves exactly as before. Note folderColumns aliases folder_id -> id.
    const sql = `
      WITH leaf AS (
        SELECT DISTINCT pf.folder_path
        FROM ${FOLDER_TABLES.folderObject} vfo
        JOIN ${FOLDER_TABLES.folder} pf ON vfo.folder_id = pf.folder_id
        WHERE ${sqlWhere.join(' AND ')}
      )
      SELECT vf.*, ft.tree_object_id
      FROM (
        SELECT DISTINCT ON (vf2.folder_id)
          ${mainUtil.makeSelectClause(folderColumns, 'vf2')}
        FROM leaf
        JOIN ${FOLDER_TABLES.folder} vf2
          ON vf2.folder_path @> leaf.folder_path
        WHERE vf2.organization_id = $${orgParamIdx}
        ORDER BY vf2.folder_id
      ) vf
      LEFT OUTER JOIN
        ${FOLDER_TABLES.folderTreeObject} ft ON ft.folder_id = vf.id
      ORDER BY nlevel(vf.folder_path) DESC;
    `;

    try {
      return await dbRead.map(sql, sqlParams, mapper.mapFolderV2);
    } catch (error) {
      logger.error('getParentFoldersForObject-v2', error);
      return [];
    }
  }

  /**
   * Get child folders of a folder
   * @param {Object} context The request context
   * @param {Object} args
   * @param {uuid} args.folderId ID of folder
   * @param {number} [args.organizationId] ID of the owner of this root folder
   * @param {Array} [args.orderBy] [{field: 'columnName', direction: 'ASC|DESC'}]
   * @param {string[]} [args.names] array of folder names to filter folder
   * @param {{key: string, value: string}[]} [args.entityTags] array of entity tags to filter folder
   * @param {number} [args.offset=0]
   * @param {number} [args.limit=30]
   * @returns {Array} returns array of folders
   */
  async function getSubfolders(context, args) {
    const folderId = _.get(args, 'folderId') || _.get(args, 'id');
    const requesterOrgId = _getOrganizationId(context, args);

    if (_.isNil(folderId)) {
      throw new InvalidInput({ message: 'folderId is required' });
    }

    const orderClause = [];
    const orderByMap = {
      name: 'vf.folder_name',
      createdDateTime: 'vf.date_created'
    };

    if (_.isEmpty(args.orderBy)) {
      // by default get data by created date
      orderClause.push(`${orderByMap.createdDateTime} ASC`);
    } else {
      args.orderBy.forEach((orderBy) => {
        const col = orderByMap[orderBy.field];

        if (!col) {
          throw new InvalidInput({
            message: 'Order by field does not support',
            data: {
              internalData: {
                orderByField: orderBy.field,
                knownFields: Object.keys(orderByMap)
              }
            }
          });
        }

        orderClause.push(`${col} ${orderBy.direction || ''}`);
      });
    }

    const sqlWhere = [];
    // does not change the order of the two arguments.
    let sqlArgs = [];

    let folderIds = [];
    const tagKeys = _.map(args.entityTags, 'key');
    if (!_.isEmpty(tagKeys)) {
      folderIds = await serviceContext.dal.entityTags.getEntityIdsByTagKeys(
        tagKeys,
        requesterOrgId,
        'folder'
      );

      // if there are no folders with input entity tags, return an empty array of folders.
      if (_.isEmpty(folderIds)) {
        return [];
      }
    }

    const noFilter = _.every([args.names, folderIds], _.isEmpty);
    if (noFilter) {
      // get only child folders; ignore its descendants if not filter
      mainUtil.addSqlWhere('vf.parent_folder_id', folderId, sqlWhere, sqlArgs);
      mainUtil.addSqlWhere(
        'vf.organization_id',
        requesterOrgId,
        sqlWhere,
        sqlArgs
      );
    } else {
      // get child folders and its descendants if there is filtering by name or folderIds
      sqlArgs = [folderId, requesterOrgId];
      sqlWhere.push(
        `vf.folder_path <@ (SELECT folder_path FROM ${
          FOLDER_TABLES.folder
        } WHERE organization_id = $${sqlArgs.length} AND folder_id = $${
          sqlArgs.length - 1
        })`
      );
      // ignore itself in a folder subtree
      sqlWhere.push(`vf.folder_id <> $${sqlArgs.length - 1}`);
      sqlWhere.push(`vf.organization_id = $${sqlArgs.length}`);

      if (!_.isEmpty(args.names)) {
        mainUtil.addTextMatchFilters(
          'vf.folder_name',
          args.names,
          args.nameMatch,
          sqlWhere,
          sqlArgs
        );
      }

      if (!_.isEmpty(folderIds)) {
        sqlArgs.push(folderIds);
        sqlWhere.push(`vf.folder_id = ANY($${sqlArgs.length}::uuid[])`);
      }
    }

    // OLP filtering - add RBAC join and filter conditions
    const {
      rbacJoin,
      sqlWhere: olpSqlWhere,
      sqlArgs: olpSqlArgs
    } = _buildRbacFolderFilter(context, 'vf.folder_id', sqlArgs.length);
    sqlWhere.push(...olpSqlWhere);
    sqlArgs.push(...olpSqlArgs);

    let sql = `
      SELECT ${mainUtil.makeSelectClause(folderColumns, 'vf')}, 
      t.tree_object_id AS tree_object_id
      FROM ${FOLDER_TABLES.folder} vf
      LEFT OUTER JOIN 
        ${FOLDER_TABLES.folderTreeObject} t ON t.folder_id = vf.folder_id
      ${rbacJoin}
      WHERE ${sqlWhere.join(' AND ')}
      `;

    if (orderClause.length) {
      sql += ` ORDER BY ${orderClause.join(', ')} `;
    }

    sql += `
        OFFSET ${args.offset || 0}
        LIMIT ${args.limit || 30};
      `;

    try {
      const results = await dbRead.map(sql, sqlArgs, mapper.mapFolderV2);
      return results;
    } catch (error) {
      logger.error('getSubfolders-v2', error);
      return [];
    }
  }

  /**
   * Get ancestor folders of a folder
   * @param {Object} context The request context
   * @param {Object} args
   * @param {uuid} args.folderId ID of folder
   * @param {number} [args.organizationId] ID of the owner of this root folder
   * @returns {Array} returns array of folders
   */
  async function getParentFolders(context, args) {
    const folderId = _.get(args, 'folderId') || _.get(args, 'id');
    const requesterOrgId = _getOrganizationId(context, args);
    const isInternalToken = checkIsInternalToken(context);

    if (_.isNil(folderId)) {
      throw new InvalidInput({ message: 'folderId is required' });
    }

    try {
      const folder = await getFolderById(
        folderId,
        requesterOrgId,
        isInternalToken
      );
      const parentFolderId = _.get(folder, 'parentFolderId');

      if (_.isNil(parentFolderId)) {
        return [];
      }

      let whereOrgCondition = '';
      const params = [parentFolderId];
      if (!isInternalToken) {
        params.push(requesterOrgId);
        whereOrgCondition = `organization_id = $${params.length} AND`;
      }

      const sql = `
        SELECT ${mainUtil.makeSelectClause(folderColumns)}
        FROM public.v2_folder 
        WHERE ${whereOrgCondition}
          folder_path @> (SELECT folder_path FROM public.v2_folder WHERE ${whereOrgCondition} folder_id = $1)
        ORDER BY nlevel(folder_path);
      `;
      return await dbRead.map(sql, params, mapper.mapFolderV2);
    } catch (error) {
      logger.error('getParentFolders-v2', error);
      return [];
    }
  }

  /**
   * Get ancestor folders of a folder
   * @param {Object} context The request context
   * @param {Object} args
   * @param {uuid} args.folderId ID of folder
   * @param {number} [args.organizationId] ID of the owner of this root folder
   * @returns {Array} returns array of folders
   */
  async function getFolderParent(context, args) {
    const folderId = _.get(args, 'folderId') || _.get(args, 'id');
    const requesterOrgId = _getOrganizationId(context, args);
    const isInternalToken = checkIsInternalToken(context);

    if (_.isNil(folderId)) {
      throw new InvalidInput({ message: 'folderId is required' });
    }

    let whereOrgCondition = '';
    let params = [folderId];

    if (!isInternalToken) {
      params.push(requesterOrgId);
      whereOrgCondition = `organization_id = $${params.length} AND`;
    }

    try {
      const sql = `
        SELECT ${mainUtil.makeSelectClause(folderColumns)}
        FROM public.v2_folder 
        WHERE ${whereOrgCondition}
        folder_id IN (SELECT parent_folder_id FROM public.v2_folder WHERE folder_id = $1);
      `;

      const parentFolder = await dbRead.map(sql, params, mapper.mapFolderV2);
      return _.head(parentFolder);
    } catch (error) {
      logger.error('getParentFolders-v2', error);
      return null;
    }
  }

  /**
   * Get the total number of child folders and files under the input folders and its descendants
   * @param {Object} context The request context
   * @param {string} args
   * @param {string} args.ids Array of ID folder
   * @param {string} args.rootFolderType The type of objects under these folders
   * @param {number} [args.organizationId] ID of the owner of these folders
   * @returns {Object} returns { childFoldersCount: number, childNonFolderObjectsCount: number, objectIds: string[] }
   */
  async function getFolderOverview(context, args) {
    let rawInputIds = [];

    const maxFolderForGetting = _.get(
      config,
      'folder.maxFolderForGettingOverview',
      1000
    );
    const accessOptions = {
      organizationId: args.organizationId,
      userId: _.get(context, '_authInfo.userId'),
      rootFolderType: args.rootFolderType,
      includeSharedReadAcess: true
    };

    if (_.isNil(args.rootFolderType)) {
      throw new InvalidInput({ message: 'rootFolderType is required' });
    }

    if (Array.isArray(args.ids)) {
      rawInputIds = args.ids;
      if (args.ids.length > maxFolderForGetting) {
        throw new InvalidInput({
          message: `No more than ${maxFolderForGetting} folders for an overview`
        });
      }
    } else {
      rawInputIds.push(args.ids);
    }

    try {
      const inputV2FolderIds = await _resolveFolderIds(rawInputIds);

      if (_.isEmpty(inputV2FolderIds)) {
        return {
          childFoldersCount: 0,
          childNonFolderObjectsCount: 0,
          objectIds: [],
          treeObjectIds: [],
          folderIds: []
        };
      }

      accessOptions.folderIds = inputV2FolderIds;
      await _validateAccess(accessOptions);

      const objectType =
        OBJECT_TYPE_MAPPING_BY_FOLDER_TYPE[_.toLower(args.rootFolderType)];

      const sql = `
      WITH target_roots AS (
        SELECT folder_path 
        FROM public.v2_folder 
        WHERE folder_id = ANY($1::uuid[])
      ),
      all_unique_folders AS (
        SELECT DISTINCT vf.folder_id
        FROM public.v2_folder vf
        JOIN target_roots tr ON vf.folder_path <@ tr.folder_path
        WHERE (vf.organization_id = $2 OR $2 = ANY(vf.shared_org_read))
      ),
      child_folders_filtered AS (
        SELECT folder_id FROM all_unique_folders
        WHERE folder_id <> ALL($1::uuid[])
      ),
      all_unique_objects AS (
        SELECT DISTINCT vfo.object_id
        FROM public.v2_folder_object vfo
        JOIN all_unique_folders auf ON vfo.folder_id = auf.folder_id
        WHERE vfo.organization_id = $2 
          AND vfo.object_type = $3::type_folder_object_type
      )
      SELECT
        (SELECT count(*) FROM child_folders_filtered)::integer as "childFoldersCount",
        (SELECT count(*) FROM all_unique_objects)::integer as "childNonFolderObjectsCount",
        (SELECT coalesce(array_agg(folder_id), '{}') FROM child_folders_filtered) as "folderIds",
        (SELECT coalesce(array_agg(object_id), '{}') FROM all_unique_objects) as "objectIds"
    `;

      const result = await dbRead.one(sql, [
        inputV2FolderIds,
        args.organizationId,
        objectType
      ]);

      return {
        childFoldersCount: result.childFoldersCount,
        childNonFolderObjectsCount: result.childNonFolderObjectsCount,
        objectIds: result.objectIds,
        treeObjectIds: result.objectIds,
        folderIds: result.folderIds
      };
    } catch (error) {
      logger.error('getFolderOverview-v2', error);
      return {};
    }
  }

  /**
   * Total up each node's total number of objects and child folders.
   * Summaries of the tracking unit (in each object node).
   *
   * @param {Object} context The request context
   * @param {string} args
   * @param {string} args.ids Array of ID folder
   * @param {string} args.rootFolderType The type of objects under these folders
   * @param {number} [args.organizationId] ID of the owner of these folders
   * @returns {Array} returns array of folders and folder objects
   */
  async function getFolderSummaryDetails(context, args) {
    let rawInputIds = [];

    const maxFolderForGetting = _.get(
      config,
      'folder.maxFolderForGettingSummaryDetail',
      1000
    );

    if (_.isNil(args.rootFolderType)) {
      throw new InvalidInput({ message: 'rootFolderType is required' });
    }

    if (Array.isArray(args.ids)) {
      rawInputIds = args.ids;
      if (args.ids.length > maxFolderForGetting) {
        throw new InvalidInput({
          message: `No more than ${maxFolderForGetting} folders for an overview`
        });
      }
    } else {
      rawInputIds.push(args.ids);
    }

    try {
      const resolvedFolderIds = await _resolveFolderIds(rawInputIds);
      if (resolvedFolderIds.length === 0) {
        return [];
      }

      const accessOptions = {
        folderIds: resolvedFolderIds,
        organizationId: args.organizationId,
        userId: _.get(context, '_authInfo.userId'),
        rootFolderType: args.rootFolderType,
        includeSharedReadAcess: true
      };

      await _validateAccess(accessOptions);

      const sql = `
      WITH target_roots AS (
      SELECT folder_path 
      FROM public.v2_folder 
      WHERE folder_id = ANY($1::uuid[])
    )
    ,allChildFolders AS (
      SELECT DISTINCT ON (vf.folder_id) 
        vf.folder_id, vf.folder_path, vf.parent_folder_id, vf.folder_type_id, vf.organization_id, vf.date_created, vf.date_modified, t.tree_object_id AS tree_object_id
      FROM public.v2_folder vf
      JOIN target_roots tr ON vf.folder_path <@ tr.folder_path
      LEFT OUTER JOIN public.v2_folder_treeobject t ON t.folder_id = vf.folder_id
      WHERE (vf.organization_id = $2 OR $2 = ANY(shared_org_read))
    )
    ,allObjectsUnderFolders AS (
      SELECT
        vfo.object_id, vfo.folder_id,
        acf.folder_path, acf.folder_type_id,
        nlevel(acf.folder_path) - 1 AS real_depth,
        vfo.date_created,
        vfo.date_modified,
        vft.folder_type_id as type_id
      FROM v2_folder_object vfo
      JOIN allChildFolders acf ON vfo.folder_id = acf.folder_id 
      JOIN v2_folder_type vft ON LOWER(vft.folder_type_name) = LOWER(vfo.object_type::text)
      WHERE vfo.organization_id = $2 AND vfo.object_type='watchlist'
    )
    ,folderCounts AS (
      SELECT acf.folder_id, COUNT(f.folder_id) AS folder_count 
      FROM allChildFolders acf 
      LEFT JOIN v2_folder f ON f.folder_path <@ acf.folder_path AND f.folder_id <> acf.folder_id
      GROUP BY acf.folder_id
    )
    ,objectCounts AS (
      SELECT 
        acf.folder_id, COUNT(ao.object_id) AS object_count, 
        array_agg(ao.object_id) filter (WHERE ao.object_id IS NOT NULL) AS object_ids
      FROM allChildFolders acf 
      LEFT JOIN allObjectsUnderFolders ao ON ao.folder_id = acf.folder_id
      GROUP BY acf.folder_id
    )
    ,folderSummary AS (
      SELECT 
        acf.*, fc.folder_count, oc.object_count, oc.object_ids,
        nlevel(acf.folder_path) - 2 AS real_depth
      FROM allChildFolders acf
      JOIN folderCounts fc ON fc.folder_id = acf.folder_id 
      JOIN objectCounts oc ON oc.folder_id = acf.folder_id
    )
    ,watchlistSummary AS (
      SELECT 
        aouf.object_id, aouf.folder_type_id, aouf.real_depth,
        aouf.folder_id,
        tracking_unit_name, fingerprints, tracking_unit_start_date, tracking_unit_stop_date,
        aouf.type_id,
        ARRAY(
          SELECT owner_user_id FROM cognitive_profile cp
          LEFT JOIN tracking_unit tu ON tu.tracking_unit_id = cp.tracking_unit_id
          WHERE tu.tracking_unit_id = m_tu.tracking_unit_id
          AND char_length(owner_user_id) > 35
        ) AS created_by,
        media_source_type_ids, track_my_programs,
        (SELECT
          CASE
            WHEN jsonb_typeof(tracking_unit_details->'marketIds') = 'array'
              THEN JSONB_ARRAY_LENGTH(tracking_unit_details->'marketIds')
              ELSE 0
          END
        FROM tracking_unit tu
        WHERE tu.tracking_unit_id = m_tu.tracking_unit_id
        ) AS market_count,
        (SELECT count(*) FROM tracking_unit_program WHERE tracking_unit_id = m_tu.tracking_unit_id) AS number_of_programs,
        aouf.date_created,
        aouf.date_modified
      FROM allObjectsUnderFolders aouf
      LEFT JOIN tracking_unit m_tu ON aouf.object_id = m_tu.tracking_unit_id::text
    )
    SELECT 
      coalesce(tfs.folder_id::text, ws.object_id) AS object_id,
      coalesce(tfs.parent_folder_id::text, ws.folder_id::text) AS parent_folder_id,
      coalesce(tfs.folder_type_id, ws.folder_type_id) AS folder_type_id,
      coalesce(tfs.real_depth, ws.real_depth) AS depth,
      coalesce(tfs.folder_count::integer , 0) AS child_folders_count,
      coalesce(tfs.object_count::integer, 0) AS child_non_folder_objects_count,
      coalesce(tfs.object_ids, '{}') as child_watchlists_ids,
      ws.tracking_unit_name, ws.fingerprints, ws.tracking_unit_start_date, ws.tracking_unit_stop_date,
      ws.media_source_type_ids, ws.track_my_programs, ws.created_by, ws.market_count, ws.number_of_programs,
      coalesce(tfs.date_created, ws.date_created) AS date_created,
      coalesce(tfs.date_modified, ws.date_modified) AS date_modified,
      tfs.tree_object_id AS tree_object_id,
      ws.type_id
    FROM folderSummary tfs
    FULL JOIN watchlistSummary ws on tfs.folder_id::text = ws.object_id
    ORDER BY coalesce(tfs.object_count::integer, 0) ASC, ws.object_id DESC;
    `;

      const results = await dbRead.map(
        sql,
        [resolvedFolderIds, args.organizationId],
        mapper.camelizeRootKeys
      );
      const flattenResults = _.flattenDepth(results, 1);
      return _.uniqBy(flattenResults, 'objectId');
    } catch (error) {
      logger.error('getFolderSummaryDetails-v2', error);
      return [];
    }
  }

  /**
   * This function update share folder field in v2_folder table
   * @param {Object} context The request context
   * @param {Object} args contain input with folderId, organizationId
   * @returns {Object} return updated folder object
   */
  async function shareFolder(context, args) {
    mainUtil.checkId(args.input.folderId, true, false, true);    
    const orgId = _.get(args, 'organizationId');
    const modifiedBy = _.get(context, '_authInfo.userId');

    const sharedOrgRead = _.get(args, 'input.readOrganizationIds', []);
    const sharedOrgWrite = _.get(args, 'input.writeOrganizationIds', []);
    
    if (_.isEmpty([...sharedOrgRead, ...sharedOrgWrite])) {      
      throw new InvalidInput({
        message: 'read or write organizationIds are required'
      });
    }
    const orgsToShareWith = _.union(
      _.get(args , 'input.readOrganizationIds', []),
      _.get(args, 'input.writeOrganizationIds', [])
    );
    const existingOrgs = await serviceContext.dal.organization.getOrganizations(context, {
      id: orgsToShareWith
    });
    
    const diff = _.difference(orgsToShareWith.map(o => o.toString()), _.get(existingOrgs, 'records', []).map(o => o.id.toString()));
    if (diff.length > 0) {      
      throw new errors.InvalidInput({
        message: 'Some organizations to share folder with do not exist.',
        data: {
          objectType: 'shareFolder',
          objectId: diff
        }
      });
    }
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    let folderId = args.input.folderId;

    if (!folderId) {
      const folder = await getFolderByTreeObjectId(
        args.input.treeObjectId,
        orgId,
        false,
        isSuperAdmin
      );
      folderId = _.get(folder, 'id', args.input.treeObjectId);
    }
    const sqlArgs = [];
    const sqlWhere = [];

    sqlArgs.push(folderId);
    sqlWhere.push(`folder_id = $${sqlArgs.length}`);

    if (!isSuperAdmin) {
      sqlArgs.push(orgId);
      sqlWhere.push(`organization_id = $${sqlArgs.length}`);
    }


    sqlArgs.push(sharedOrgRead, sharedOrgWrite, modifiedBy);

    // SQL update with unique orgIds
    const sql = `
      UPDATE v2_folder SET
        shared_org_read = ARRAY(SELECT DISTINCT (UNNEST(shared_org_read || $${
          sqlArgs.length - 2
        }))),
        shared_org_write = ARRAY(SELECT DISTINCT (UNNEST(shared_org_write || $${
          sqlArgs.length - 1
        }))),
        modified_by = $${sqlArgs.length}
      WHERE ${sqlWhere.join(' AND ')}
      RETURNING folder_id;
    `;

    const updatedFolder = await dbWrite.query(sql, sqlArgs);
    if (_.isEmpty(updatedFolder)) {
      throw new errors.NotFound({
        message: 'v2 Folder: Folder not found, unable to share the folder.',
        data: {
          objectType: 'shareFolder',
          objectId: folderId
        }
      });
    }
    // TODO: RBAC OLP to set correct role and permissions for shared folders
    return getFolderById(folderId, orgId, false, isSuperAdmin);
  }

  /**
   * This function gets folders that is accessible to given org
   * @param {Object} context The request context
   * @param {Object} args contain input with organizationId
   * @returns {Object[]} return folder object list
   */
  async function getSharedFolders(context, args) {
    if (!args.organizationId) {
      logger.error({
        message: 'v2 Folder: organizationId is required'
      });
      return;
    }

    // SQL to check organizationId + shared_org_read + shared_org_write
    const sql = `
      SELECT 
        ${mainUtil.makeSelectClause(folderColumns)}
      FROM v2_folder
      WHERE $1 = ANY(shared_org_read) OR
        $1 = ANY(shared_org_write);
    `;

    const dbResults = await dbRead.map(
      sql,
      args.organizationId,
      mapper.mapFolderV2
    );

    return dbResults;
  }

  async function getChildTDOs(context, args) {
    const folderId = await _validateFolderId(context, args.folderId, args);
    const tdoObjects = await getFolderObjects(
      context,
      args.organizationId,
      folderId,
      {
        objectType: OBJECT_TYPE_MAPPING_BY_FOLDER_TYPE.cms,
        offset: args.offset,
        limit: args.limit
      }
    );
    if (_.isEmpty(tdoObjects)) {
      return mainUtil.emptyPage(args);
    }

    const ids = Array.from(new Set(tdoObjects.map((c) => c.objectId)));
    const res = await serviceContext.dal.tdo.getTDOs(context, {
      id: ids,
      limit: args.limit
    });
    res.offset = args.offset;
    res.limit = args.limit;
    for (const r of res.records) {
      r.folderId = folderId;
    }
    return res;
  }

  async function getChildWatchlists(context, args) {
    // validate and get folderId v2
    const folderId = await _validateFolderId(context, args.folderId, args);
    const watchlistObjects = await getFolderObjects(
      context,
      args.organizationId,
      folderId,
      {
        objectType: OBJECT_TYPE_MAPPING_BY_FOLDER_TYPE.watchlist,
        offset: args.offset,
        limit: args.limit
      }
    );
    if (_.isEmpty(watchlistObjects)) {
      return mainUtil.emptyPage(args);
    }

    const ids = Array.from(new Set(watchlistObjects.map((c) => c.objectId)));
    const res = await serviceContext.dal.watchlist.getWatchlists(
      {
        ids: ids,
        offset: args.offset || 0,
        limit: args.limit || 30,
        name: args.name,
        names: args.names,
        nameMatch: args.nameMatch,
        hasOffset: true
      },
      context
    );
    for (const r of res.records) {
      r.folderId = folderId;
    }
    return res;
  }

  async function getChildCollections(context, args) {
    const folderId = await _validateFolderId(context, args.folderId, args);
    const collectionObjects = await getFolderObjects(
      context,
      args.organizationId,
      folderId,
      {
        objectType: OBJECT_TYPE_MAPPING_BY_FOLDER_TYPE.collection,
        offset: args.offset,
        limit: args.limit
      }
    );
    if (_.isEmpty(collectionObjects)) {
      return mainUtil.emptyPage(args);
    }

    const ids = Array.from(new Set(collectionObjects.map((c) => c.objectId)));
    const res = await serviceContext.dal.collection.getCollections(context, {
      ids: ids,
      limit: args.limit || 30,
      name: args.name
    });
    for (const r of res.records) {
      r.folderId = folderId;
    }
    return res;
  }

  async function getChildApplications(context, args) {
    const folderId = await _validateFolderId(context, args.folderId, args);
    const applicationObjects = await getFolderObjects(
      context,
      args.organizationId,
      folderId,
      {
        objectType: OBJECT_TYPE_MAPPING_BY_FOLDER_TYPE.application,
        offset: args.offset,
        limit: args.limit
      }
    );
    if (_.isEmpty(applicationObjects)) {
      return mainUtil.emptyPage(args);
    }

    const ids = Array.from(new Set(applicationObjects.map((c) => c.objectId)));
    // retrieve applications for the appIds
    const res = await serviceContext.dal.application.getApplications(
      { ids: ids },
      context
    );

    for (const r of res.records) {
      r.folderId = folderId;
    }
    return res;
  }

  function _buildRbacFolderFilter(context, fieldId, currentArgNum) {
    const olpFilters = {
      sqlArgs: [],
      sqlWhere: [],
      rbacJoin: ''
    };
    const rbacAuthFilterFn = context._rbacAuthFilter;
    if (
      _.isFunction(rbacAuthFilterFn) &&
      fieldId &&
      typeof currentArgNum === 'number'
    ) {
      const sqlFilter = rbacAuthFilterFn(fieldId, currentArgNum + 1);

      if (_.get(sqlFilter, 'metadata.resourceType') === 'Folder') {
        olpFilters.sqlArgs.push(...sqlFilter.args);
        olpFilters.sqlWhere.push(sqlFilter.where);
        olpFilters.rbacJoin = sqlFilter.join;
      }
    }

    return olpFilters;
  }

  /**
   * Resolves IDs using the local cache.
   * Falls back to DB for misses.
   */
  async function _resolveFolderIds(ids) {
    if (_.isEmpty(ids)) return [];

    const uniqueIds = _.uniq(ids);
    const resolvedIds = [];
    const missingIds = [];
    uniqueIds.forEach((id) => {
      const cachedId = localCache.get('folder_id_map', id);

      if (cachedId) {
        resolvedIds.push(cachedId);
      } else {
        missingIds.push(id);
      }
    });

    if (missingIds.length === 0) {
      return _.uniq(resolvedIds);
    }
    const sql = `
      SELECT folder_id::text, folder_id::text as lookup_key 
      FROM v2_folder 
      WHERE folder_id = ANY($1::uuid[]) 

      UNION ALL

      SELECT folder_id::text, tree_object_id::text as lookup_key
      FROM v2_folder_treeobject 
      WHERE tree_object_id = ANY($1::uuid[])
    `;

    try {
      const dbResults = await dbRead.query(sql, [missingIds]);
      dbResults.forEach((row) => {
        resolvedIds.push(row.folder_id);
        localCache.set('folder_id_map', row.lookup_key, row.folder_id);
      });

      return _.uniq(resolvedIds);
    } catch (err) {
      logger.error('Error resolving folder IDs from DB', err);
      return _.uniq(resolvedIds);
    }
  }

  async function getUserRootFolders(context, options = {}) {
    if (_.isNil(options?.organizationId)) {
      return [];
    }

    const queryParams = [];
    const whereClauses = ['vfr.root_folder_user_id IS NOT NULL'];

    const folderType = await getFolderTypeByName(
      options.rootFolderType || 'cms'
    );
    const folderTypeId = _.get(folderType, 'id');
    queryParams.push(folderTypeId);
    whereClauses.push(`vf.folder_type_id = $${queryParams.length}`);

    queryParams.push(options.organizationId);
    whereClauses.push(`vfr.organization_id = $${queryParams.length}`);

    // build joins
    let joinClause = 'JOIN v2_folder vf ON vf.folder_id = vfr.folder_id';

    if (options.withoutACE) {
      // join with rbac_folders to exclude folders that have ACEs
      joinClause +=
        '\n LEFT JOIN rbac_folders _rbac_f ON _rbac_f.folder_id = vfr.folder_id';
      whereClauses.push('_rbac_f.folder_id IS NULL');
    }

    // Get V2 user root folders with pagination
    let mpSql = `
      SELECT vfr.folder_id, vfr.root_folder_user_id
      FROM v2_folder_root vfr ${joinClause}
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY vfr.folder_id
    `;

    if (_.isNumber(options.limit)) {
      queryParams.push(options.limit);
      mpSql += ` LIMIT $${queryParams.length}`;
    }

    if (_.isNumber(options.offset)) {
      queryParams.push(options.offset);
      mpSql += ` OFFSET $${queryParams.length}`;
    }

    const mpResult = await dbRead.query(mpSql, queryParams);
    if (!mpResult || _.isEmpty(mpResult)) {
      return [];
    }

    // Return folders with user mapping
    return mpResult.map((row) => ({
      folderId: row.folder_id,
      rootFolderUserId: row.root_folder_user_id
    }));
  }

  /**
   * Handle fallback for V1 user root folders with org=-1
   * Only update if current org is the oldest org the user belongs to
   * @param {Object} context Request context
   * @param {string} userId User ID
   * @param {number} currentOrgId Current organization ID
   * @param {number} folderTypeId Folder type ID
   */
  async function _handleV1UserRootFolderFallback(
    context,
    userId,
    currentOrgId
  ) {
    try {
      // Check if there's a V1 user root folder with org=-1 for this user
      const folderRootSql = `
        SELECT vfr.folder_id
        FROM v2_folder_root vfr
        JOIN v2_folder vf ON vf.folder_id = vfr.folder_id
        WHERE vfr.root_folder_user_id = $1
          AND (vfr.organization_id = -1 OR vfr.organization_id IS NULL)
        LIMIT 1;
      `;

      const folderRoot = await dbRead.oneOrNone(folderRootSql, [userId]);

      if (!folderRoot) {
        return;
      }

      // Check if current org is the oldest org for this user
      const isOldestOrg = await _isOldestOrgForUser(
        context,
        userId,
        currentOrgId
      );
      if (isOldestOrg) {
        await _fixupV1UserRootFolder(
          currentOrgId,
          folderRoot.folder_id,
          userId
        );
      }
    } catch (err) {
      logger.error('_handleV1UserRootFolderFallback', err);
    }
  }

  /**
   * Check if the given org is the oldest org the user belongs to
   * @param {Object} context Request context
   * @param {string} userId User ID
   * @param {number} orgId Organization ID to check
   * @returns {boolean} True if this is the oldest org
   */
  async function _isOldestOrgForUser(context, userId, orgId) {
    const oldestOrg = await _getOldestOrgForUser(context, userId);
    return oldestOrg === orgId;
  }

  /**
   * Build arguments for creating user root folder
   * Determines whether to use V1 ID or create new ID
   *
   * @param {Object} context Request context
   * @param {string} userId User ID
   * @param {number} organizationId Current organization ID
   * @param {string} rootFolderType Folder type
   * @param {Object} v1UserRootFolder V1 output data (can be null/undefined)
   * @returns {Object} Arguments for createRootFolder
   */
  async function _buildUserRootFolderArgs(
    context,
    userId,
    organizationId,
    rootFolderType,
    v1UserRootFolder
  ) {
    const baseArgs = {
      folderType: rootFolderType,
      organizationId: organizationId,
      rootFolderUserId: userId
    };

    // Prefer the V1 id handed to us by the caller's v1Output. If the caller
    // didn't thread a usable v1UserRootFolder (e.g. it passed an org-shaped
    // v1Output, or none at all), do NOT assume the user-root doesn't exist in
    // V1 — independently query the V1 root_folder table for it. Trusting the
    // caller's v1Output shape is what let the V1/V2 folder ids diverge: any
    // path that failed to thread the user-root minted a fresh V2 uuid instead
    // of reusing the V1 id, permanently. See T13.
    let v1Id = v1UserRootFolder?.rootFolderId || v1UserRootFolder?.objectId;
    // v1OutputForCreate is what we thread on to createRootFolder so it can
    // reuse both the V1 folder id AND the V1 tree_object id. Prefer the caller's
    // v1Output when it gave us one; otherwise fill it from the independent
    // lookup below.
    let v1OutputForCreate = v1UserRootFolder;
    if (!v1Id) {
      const found = await _findV1UserRootFolder(userId, rootFolderType);
      if (found) {
        v1Id = found.rootFolderId;
        v1OutputForCreate = found;
      }
    }
    if (!v1Id) {
      // No V1 user-root exists for this user/org/type — nothing to reuse.
      return baseArgs;
    }
    // Check if V1 ID is already used in V2
    const v1IdAlreadyUsed = await _isV1IdAlreadyUsedInV2(v1Id, rootFolderType);
    if (v1IdAlreadyUsed) {
      return baseArgs;
    }

    const targetOrgId = await _determineTargetOrgForV1Id(context, userId);

    if (targetOrgId === organizationId) {
      return {
        ...baseArgs,
        id: v1Id,
        // Carry the full V1 shape (folder id + tree_object id). createRootFolder
        // derives treeObjectId = v1Output.treeObjectId || folderId; the
        // independent lookup returns the real V1 tree_object_id (distinct from
        // root_folder_id) so the V2 mirror row addresses the same V1 tree object
        // the threaded path would have used — full parity, not just folder_id.
        v1Output: v1OutputForCreate
      };
    }

    return baseArgs;
  }

  /**
   * Independently look up the V1 (root_folder) user-root for a given
   * user / folder type, without relying on the caller having threaded it
   * through v1Output. Returns { rootFolderId, treeObjectId } if a V1 user-root
   * exists, otherwise null.
   *
   * This is the id-parity safeguard for T13: the reuse-vs-mint decision must
   * not depend on which caller happened to pass the correctly-shaped v1Output.
   * Returns the V1 tree_object_id too (a distinct PK from root_folder_id, see
   * the tree_object join) so the reused V2 row mirrors the V1 tree object as
   * well as the folder id.
   *
   * @param {string} userId User ID
   * @param {string} rootFolderType Folder type name (e.g. 'watchlist')
   * @returns {Promise<{rootFolderId: string, treeObjectId: string}|null>}
   */
  async function _findV1UserRootFolder(userId, rootFolderType) {
    if (!userId || !rootFolderType) return null;
    try {
      // root_folder user-root rows are keyed by user_id with organization_id
      // NULL (see dalFolder.createARootFolder). Join to root_folder_type by
      // name so we don't duplicate the V1 type-id map here. Join to tree_object
      // (root_folder_id::text = object_id, same join getRootFoldersV1 uses) to
      // recover the real tree_object_id, which is NOT equal to root_folder_id.
      const sql = `
        SELECT rf.root_folder_id, t_o.tree_object_id
        FROM root_folder rf
        JOIN root_folder_type rft
          ON rft.root_folder_type_id = rf.root_folder_type_id
        JOIN tree_object t_o
          ON rf.root_folder_id::text = t_o.object_id
        WHERE rf.user_id = $1
          AND rf.organization_id IS NULL
          AND UPPER(rft.root_folder_type_name) = UPPER($2)
        LIMIT 1;
      `;
      const result = await dbRead.oneOrNone(sql, [userId, rootFolderType]);
      if (!result) return null;
      return {
        rootFolderId: result.root_folder_id,
        treeObjectId: result.tree_object_id
      };
    } catch (err) {
      logger.error('_findV1UserRootFolder', err);
      return null;
    }
  }

  /**
   * Determine which org should claim the V1 ID
   *
   * @param {Object} context Request context
   * @param {string} userId User ID
   * @returns {number|null} Target organization ID
   */
  async function _determineTargetOrgForV1Id(context, userId) {
    try {
      const oldestOrg = await _getOldestOrgForUser(context, userId);

      if (oldestOrg) {
        return oldestOrg;
      }
      return null;
    } catch (err) {
      logger.error('_determineTargetOrgForV1Id', err);
      return null;
    }
  }

  /**
   * Get the oldest organization the user belongs to
   * Based on sso_group.date_created
   *
   * @param {Object} context Request context
   * @param {string} userId User ID
   * @returns {number|null} Oldest organization ID
   */
  async function _getOldestOrgForUser(context, userId) {
    if (!userId) return null;

    try {
      const ssoDbRead = serviceContext.dbConnections.sso.read;
      const sql = `
        SELECT 
          (g.kvp->>'organizationId')::integer AS organization_id
        FROM sso_user__sso_group ug
        JOIN sso_group g ON g.group_id = ug.group_id
        WHERE ug.user_id = $1
          AND g.kvp->>'groupType' = 'organization'
          AND g.kvp->>'organizationId' IS NOT NULL
        ORDER BY g.date_created ASC
        LIMIT 1;
      `;

      const result = await ssoDbRead.oneOrNone(sql, [userId]);
      return result ? result.organization_id : null;
    } catch (err) {
      logger.error('_getOldestOrgForUser', err);
      return null;
    }
  }
  /**
   * Check if V1 ID is already used in V2 folder
   * @param {string} v1Id V1 folder ID
   * @param {string} rootFolderType Folder type
   * @returns {boolean} True if V1 ID already exists in V2
   */
  async function _isV1IdAlreadyUsedInV2(v1Id, rootFolderType) {
    try {
      const folderType = await getFolderTypeByName(rootFolderType || 'cms');
      const folderTypeId = _.get(folderType, 'id');

      if (!folderTypeId) return false;

      const sql = `
        SELECT 1
        FROM v2_folder_root vfr
        JOIN v2_folder vf ON vf.folder_id = vfr.folder_id
        WHERE vfr.folder_id = $1
          AND vf.folder_type_id = $2
          AND vfr.root_folder_user_id IS NOT NULL
        LIMIT 1;
      `;

      const result = await dbRead.oneOrNone(sql, [v1Id, folderTypeId]);
      return !!result;
    } catch (err) {
      logger.error('_isV1IdAlreadyUsedInV2', err);
      return false;
    }
  }

  /**
   * Get root_folder_user_id from v2_folder_root by folder_id
   * @param {string} folderId - The folder ID (UUID)
   * @returns {string|null} The root_folder_user_id or null if not found
   */
  async function getRootFolderUserIdByFolderId(folderId) {
    try {
      const sql = `
        SELECT root_folder_user_id
        FROM v2_folder_root
        WHERE folder_id = $1
        LIMIT 1
      `;
      const result = await dbRead.oneOrNone(sql, [folderId]);
      return result ? result.root_folder_user_id : null;
    } catch (err) {
      logger.error('getRootFolderUserIdByFolderId error:', err);
      return null;
    }
  }

  return {
    getFolderObject,
    getFolder,
    fileFolderItem,
    unfileFolderItem,
    fileTDO,
    moveFolder,
    moveFolders,
    moveFolderItem,
    _validateAccess,
    _createNewFolder: createNewFolder,
    validateCreateFolderInput,
    createFolder,
    validateUpdateFolderInput,
    updateFolder,
    deleteFolder,
    getRootFolders,
    createRootFolder,
    getOrCreateRootFolders,
    getOrCreateRootFolder,
    createFolderContentTemplate,
    updateFolderContentTemplate,
    deleteFolderContentTemplate,
    getFolderContentTemplates,
    getFolderObjects,
    removeTDOFromFolders,
    getFolderByTreeObjectId,
    getParentFolder,
    getParentFoldersForObject,
    getParentFolders,
    getSubfolders,
    getFolderOverview,
    getFolderSummaryDetails,
    shareFolder,
    getSharedFolders,
    getFolderParent,
    getChildTDOs,
    getChildWatchlists,
    getChildCollections,
    getChildApplications,
    contentTemplateIdToFolderSdo,
    _getOrganizationId,
    buildRootFolderName,
    getUserRootFolders,
    getRootFolderUserIdByFolderId
  };
};
