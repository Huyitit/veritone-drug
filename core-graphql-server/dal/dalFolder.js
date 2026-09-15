/*eslint no-undef: "error"*/
const pg = require('pg');
const _ = require('lodash');
const uuid = require('uuid');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const validator = require('validator');
const mapper = require('./mapper');
const { supportedEvents } = require('@veritone/core-server-base/events-map');
const { rbacUtil } = require('@veritone/functional-permissions-lib');

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

const TREE_OBJECT_TYPE = {
  UNDEFINED: 0,
  FOLDER: 1,
  WATCHLIST: 2,
  COLLECTION: 3,
  ROOT_FOLDER: 4,
  TDO: 5,
  APPLICATION: 6
};

const TREE_OBJECT_STATUS = {
  ACTIVE: 1,
  INACTIVE: 2
};

const ROOT_FOLDER_TYPE = {
  watchlist: 1,
  collection: 2,
  cms: 3,
  application: 4,
  resource: 7
};

const ACTION_DETAILS = {
  FolderCreate: {
    success: (data) => `Created folder ${data.name}`,
    failure: () => 'Failed to create folder'
  },
  FolderUpdate: {
    success: (data) => `Updated folder ${data.originalFolderName || data.name}`,
    failure: (data, error) => {
      let msg = `Failed to update folder ${data.id}`;

      return msg;
    }
  },
  FolderDelete: {
    success: (data) => `Deleted folder ${data.name}`,
    failure: (data, error) => {
      let msg = `Failed to delete folder ${data.id}`;
      return msg;
    }
  }
};

const ROOT_FOLDER_TYPE_NAME = {};
Object.keys(ROOT_FOLDER_TYPE).forEach((key) => {
  const value = ROOT_FOLDER_TYPE[key];
  ROOT_FOLDER_TYPE_NAME[_.toString(value)] = key;
});

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  // Maximum folder nesting depth enforced on folder create/move operations.
  // Config-driven via `folder.maxDepth`, defaulting to 5.
  const MAX_DEPTH = _.get(config, 'folder.maxDepth', 5);
  const dalUtil = require('./util')(config, serviceContext);
  const model = require('../modules/core-collection-server/model')(config);
  const dbConnections = serviceContext.dbConnections;
  const mainUtil = require('../util.js')(serviceContext);
  const dbUtil = require('../util/db.js')(serviceContext);
  const errors = require('../error')(config);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const messageUtil = serviceContext.messageUtil;
  const dalV2Folder =
    serviceContext.dal.folderV2 || require('./dalFolderV2')(serviceContext);

  // VMN_ORG_ID is Veritone Media Network Organization
  // So it should be 7368 as current.
  const VMN_ORG_ID = _.get(
    config,
    'db.constants.veritoneMediaNetworkOrgId',
    7368
  );

  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../modules/rbacAuth/bll/rbacAuth.bll.js')(serviceContext)
  );

  const {
    InvalidInput,
    NotFound,
    NotAllowed,
    ServiceFailure,
    ResourceConflict
  } = require('../error')(config);

  const dbRead = dbConnections['media_platform'].read;
  const dbWrite = dbConnections['media_platform'].write;

  /**
   * Given the ID of a contained object (a folder, watchlist, etc.),
   * looks up the tree object ID and type.
   */
  async function getTreeObjectInfoForObject(objectId) {
    const sql = `
SELECT
  tree_object_type_id AS type,
  object_id,
  tree_object_id AS id
FROM
  tree_object
WHERE
  object_id = $1
    `;
    const res = await dbConnections['media_platform'].read.query(sql, [
      objectId
    ]);
    if (!res.length) {
      throw new NotFound({
        message:
          'Folder containment information for the target object ' +
          'was not found.',
        data: {
          objectId: objectId,
          objectType: 'Folder'
        }
      });
    }
    return res[0];
  }

  const LRU = require('lru-cache');
  const treeCache = new LRU({
    max: _.get(serviceContext, 'config.treeItemCache.maxItems', 1000),
    ttl: _.get(serviceContext, 'config.treeItemCache.maxAgeSeconds', 300)
  });

  async function getRootFolderV1(context, args) {
    mainUtil.checkId(args.id, false, false, true);
    const res = await getRootFoldersV1(context, args);
    if (res.length) return res[0];

    throw new errors.NotFound({
      message: 'The root folder was not found.',
      data: {
        objectId: args.id,
        objectType: 'RootFolder'
      }
    });
  }

  async function _canAccessFolder(
    context,
    writeOnly,
    folder,
    organizationId,
    userId
  ) {
    const isInternalToken = resUtil.getTokenType(context) === 'internal';
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    // now need to walk up the tree to root and verify user org's access
    const orgAccess =
      isInternalToken || isSuperAdmin
        ? true
        : await orgHasAccess(
            context,
            folder,
            organizationId,
            userId,
            writeOnly || false // pass along the writeOnly value, default to false
          );
    if (orgAccess) {
      const isEnableRBACFeature = await mainUtil.isEnableFeatureInOrganization(
        context,
        undefined,
        organizationId,
        'enableRBACFeature',
        false
      );
      let userAccess = !isEnableRBACFeature; // default to true if RBAC is not enabled
      if (isEnableRBACFeature && !isInternalToken) {
        // if this is not an internal token, we also need to verify that the user has the necessary permissions
        const permissions = ['ADMIN_ACCESS'];
        permissions.push(
          writeOnly ? 'AIWARE_FOLDER_UPDATE' : 'AIWARE_FOLDER_READ'
        );
        const userHasPermissionsResult = await rbacAuthBll.hasPermissions(
          context,
          {
            resourceType: 'Folder',
            ids: [folder.id],
            permissions,
            requireAll: false
          },
          true
        );
        userAccess = _.get(
          userHasPermissionsResult,
          '[0].hasPermission',
          false
        );
      }
      return userAccess || isInternalToken;
    }
    return orgAccess;
  }

  async function getFolderNew(context, args) {
    mainUtil.checkId(args.id, false, false, true);
    // if the context included an app ID but not org ID,
    // try to resolve that here.
    if (!args.organizationId && args.applicationId) {
      args.organizationId =
        await serviceContext.dal.organization.getOrgIdFromAppId(
          args.applicationId
        );
    }

    if (!args.userId)
      args.userId = _.get(
        context,
        '_authInfo.userId',
        _.get(context, 'requestContext.userInfo.userId')
      );
    if (!(args.organizationId || args.userId)) {
      throw new errors.InvalidInput({
        message: 'One of userId or organizationId must be present on getFolder'
      });
    }
    const sql = `
SELECT
  f.tree_folder_name,
  f.tree_folder_description,
  f.tree_folder_id AS id,
  t.tree_object_type_id AS type_id,
  t.object_id,
  t.tree_object_id,
  t.order_index,
  t.creation_date AS created_date_time,
  t.last_updated_date AS modified_date_time,
  t.tree_object_status,
  t.shared_with
FROM
  tree_folder AS f
  INNER JOIN tree_object AS t
    ON f.tree_folder_id::TEXT = t.object_id
WHERE
  (t.object_id = $1 OR t.tree_object_id = $1::UUID)
    AND t.tree_object_type_id = ${TREE_OBJECT_TYPE.FOLDER}
    AND t.tree_object_status = ${TREE_OBJECT_STATUS.ACTIVE}
ORDER BY t.creation_date
    `;

    const vars = [args.id];

    const res = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      vars,
      mapper.mapFolder
    );

    if (res.length) {
      const folder = res[0];
      const canAccessFolder = await _canAccessFolder(
        context,
        args.__writeOnly,
        folder,
        args.organizationId,
        args.userId
      );
      if (canAccessFolder) {
        await emitFixupV2FolderRowsEvent(context, [folder]);
        return folder;
      }
    } else {
      // might be a root folder.
      // if we find it, no need to re-authorize
      try {
        const root = await getRootFolderV1(
          context,
          Object.assign({ skipAuth: true }, args)
        );
        return root;
      } catch (error) {
        // just means it's not a root folder.
        // we'll let the next code block throw out.
      }
    }
    throw new errors.NotFound({
      message:
        'The folder was not found. It either does not exist or you or your organization ' +
        'do not have access to it.',
      data: {
        objectType: 'Folder',
        objectId: args.id,
        organizationId: args.organizationId,
        userId: args.userId
      }
    });
  }

  /**
   * Determines if the current user's org has access to a folder.
   *
   * @param context The request context
   * @param treeItem The tree item object to check
   * @param organizationId The organization ID
   * @param userId The user ID (might be null for an org root folder)
   * @param writeOnly boolean. Defaults to false. If true, the function
   * requires that the user have write access, not just read access.
   */
  async function orgHasAccess(
    context,
    treeItem,
    organizationId,
    userId,
    writeOnly,
    initItem
  ) {
    if (!treeItem) throw new Error('treeItem is required'); // coding error
    if (!initItem) initItem = treeItem; // we want to set permission on initial folder passed in so set it first time around
    // check current row; if it's explicitly shared, return out now.
    if (
      _.get(treeItem, 'sharedWith.read', []).includes(organizationId) &&
      !writeOnly
    ) {
      initItem.permission = 'read';
      initItem.sharedWith = _.get(treeItem, 'sharedWith');
      return true;
    }
    if (_.get(treeItem, 'sharedWith.write', []).includes(organizationId)) {
      initItem.permission = 'write';
      initItem.sharedWith = _.get(treeItem, 'sharedWith');
      return true;
    }
    // if the item is a root folder, retrieve the root folder object and check
    if (treeItem.typeId === TREE_OBJECT_TYPE.ROOT_FOLDER) {
      let rootFolder = await getRootFolderItem(context, treeItem);
      // code or data integrity error. this should never happen.
      if (!rootFolder) throw new Error('root folder item could not be found');
      initItem.sharedWith = _.get(rootFolder, 'sharedWith');

      // org has access if it owns root folder or has a sharesTo entry
      if (
        _.toString(organizationId) === _.toString(rootFolder.organizationId) ||
        userId === rootFolder.userId
      ) {
        initItem.permission = 'write';
        return true;
      }
      if (_.get(rootFolder, 'sharesTo.write', []).includes(organizationId)) {
        initItem.permission = 'write';
        return true;
      } else if (
        _.get(rootFolder, 'sharesTo.read', []).includes(organizationId) &&
        !writeOnly // allow this only if writeOnly is false
      ) {
        initItem.permission = 'read';
        return true;
      } else {
        // otherwise no access
        return false;
      }
    } else {
      // otherwise we need to get its parent.
      const parent = await getParentTreeItemV1(context, treeItem);
      if (!parent.treeObjectId)
        throw new Error('no parent tree item for ' + JSON.stringify(treeItem));
      // now call recursively up tree
      return await orgHasAccess(
        context,
        parent,
        organizationId,
        userId,
        writeOnly,
        initItem
      );
    }
  }

  async function getRootFolderItem(context, treeItem) {
    const sql = `
SELECT
  root_folder_id AS id,
  root_folder_type_id AS type_id,
  organization_id,
  user_id,
  shares_to
FROM
  root_folder
WHERE
  root_folder_id = $1
    `;
    const res = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      [treeItem.objectId],
      mapper.camelizeRootKeys
    );
    return res.length > 0 ? res[0] : null;
  }

  async function getParentTreeItem(context, treeItem) {
    return v2DalSwitch(
      () => getParentTreeItemV1(context, treeItem),
      () => dalV2Folder.getFolderParent(context, treeItem),
      context,
      treeItem.organizationId
    );
  }

  async function getParentTreeItemV1(context, treeItem) {
    // get the parent tree item of this tree item
    const sql = `
SELECT
  t.tree_object_type_id AS type_id,
  t.tree_object_id,
  t.object_id,
  t.tree_object_type_id,
  t.shared_with,
  c.parent_tree_object_id,
  c.child_tree_object_id,
  c.depth
FROM
  tree_object AS t
  INNER JOIN tree_object_closure AS c ON
  t.tree_object_id = c.parent_tree_object_id
WHERE
  c.child_tree_object_id = $1 AND c.depth = 1
    `;
    mainUtil.checkId(treeItem.treeObjectId, false, false, true);

    const res = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      [treeItem.treeObjectId],
      mapper.camelizeRootKeys
    );
    return res.length ? res[0] : {}; // not found will just result in no access.
  }

  const useNewGetFolder = _.get(
    serviceContext,
    'config.featureFlags.newFolderQuery',
    true
  );

  async function v2DalSwitch(
    v1PromiseFunc,
    v2PromiseFunc,
    context,
    organizationId,
    isWriteOperation = false
  ) {
    const useV2FolderFeature = await _useV2FoldersEnabledFeature(
      context,
      organizationId
    );
    if (isWriteOperation) {
      if (!isV2FoldersAvailable && !useV2FolderFeature) {
        return v1PromiseFunc();
      }

      const returnV2 = isV2FoldersAvailable && useV2FolderFeature;
      const v1Promise = v1PromiseFunc();
      const v2Promise = v2PromiseFunc();

      if (returnV2) {
        v1Promise.catch((err) => {
          logger.error('V1FOLDER (silent write)', err);
        });
        return v2Promise;
      } else {
        const v1Result = await v1Promise;
        // Await V2 even when returning V1 — same reasoning as v1Tov2DalSwitch's write
        // branch (commit 2b545da2): a detached V2 write here can race a same-or-later V2
        // read (e.g. a superAdmin shareFolder racing the recipient org's sharedFolders
        // query) and lose, silently, with the failure only ever reaching logger.error.
        await v2Promise.catch((err) => {
          logger.error('V2FOLDER (silent write)', err);
        });
        return v1Result;
      }
    }
    // read
    if (!isV2FoldersAvailable) {
      return v1PromiseFunc();
    }

    const v1Promise = v1PromiseFunc();
    const v2Promise = v2PromiseFunc();

    if (useV2FolderFeature) {
      v1Promise.catch((err) => {
        logger.error(`V1FOLDER`, err);
      });
      return v2Promise;
    } else {
      v2Promise.catch((err) => {
        logger.error(`V2FOLDER`, err);
      });
      return v1Promise;
    }
  }

  async function v1Tov2DalSwitch(
    v1PromiseFunc,
    v2PromiseFunc,
    context,
    organizationId,
    isWriteOperation = false
  ) {
    const useV2FolderFeature = await _useV2FoldersEnabledFeature(
      context,
      organizationId
    );
    if (isWriteOperation) {
      if (!isV2FoldersAvailable && !useV2FolderFeature) {
        return v1PromiseFunc();
      }
      const v1Result = await v1PromiseFunc();
      const v2Promise = v2PromiseFunc(v1Result);

      if (useV2FolderFeature && isV2FoldersAvailable) {
        return v2Promise;
      }

      // Await V2 even when returning V1 — V2 write must complete before caller proceeds so
      // downstream mutations (e.g. shareFolder) that query v2_folder find the row in place.
      await v2Promise.catch((err) => {
        logger.error(`V2FOLDER`, err);
      });

      return v1Result;
    }

    // read
    if (!isV2FoldersAvailable) {
      return v1PromiseFunc();
    }

    const v1Result = await v1PromiseFunc();
    let v2Promise = v2PromiseFunc(v1Result);

    if (useV2FolderFeature) {
      return v2Promise;
    }

    // do v2
    v2Promise.catch((err) => {
      logger.error(`V2FOLDER`, err);
    });

    return v1Result;
  }

  function _customInputForV2(args, v1Output) {
    if (!v1Output) {
      return args;
    }

    return _.set(args, 'v1Output', v1Output);
  }

  async function getFolder(context, args) {
    return v2DalSwitch(
      () => getFolderV1(context, args),
      () => dalV2Folder.getFolder(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getFolderV1(context, args) {
    return useNewGetFolder
      ? await getFolderNew(context, args)
      : await getFolderOld(context, args);
  }

  /**
   * Get Folder
   * @method getFolder
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function getFolderOld(context, args) {
    if (!args.organizationId) {
      // set from context
      args.organizationId = _.get(
        context,
        '_authInfo.data.organization.organizationId'
      );
    }

    mainUtil.checkId(args.id, false, false, true);

    let treeObjectType = await _getTreeObjectType(args.id);
    let getTreeObjectId = args.id;
    // if treeObjectType is undefined, the _getTreeObjectType failed.
    // ths could be because the input ID is an object ID (folder, watchlist)
    // not a tree object ID. to support getting an object by
    // ID we'll back on trying to get tree object info for the target ID.
    if (!treeObjectType) {
      const info = await getTreeObjectInfoForObject(args.id);
      treeObjectType = info.type;
      getTreeObjectId = info.id;
      // now we have real info we just retrieved and can continue to validate
      // and build the folder structure.
    }
    const validationErr = validateTreeObject(getTreeObjectId, treeObjectType, [
      TREE_OBJECT_TYPE['FOLDER'],
      TREE_OBJECT_TYPE['ROOT_FOLDER'],
      TREE_OBJECT_TYPE['WATCHLIST']
    ]);
    if (validationErr) {
      throw new InvalidInput({
        data: validationErr
      });
    }
    const options = {
      getTreeObjectId: getTreeObjectId,
      organizationId: args.organizationId
    };

    const result = await _getFolder(options);
    if (!result.length) {
      throw new NotFound({
        data: {
          objectId: args.id,
          objectType: 'Folder'
        }
      });
    }

    await emitFixupV2FolderRowsEvent(
      context,
      [_.head(result)],
      'tree_folder_id'
    );

    return buildFolderStructure(result, args.organizationId);
  }

  function validateTreeObject(folderId, treeObjectType, requiredTypeArray) {
    if (!treeObjectType || !requiredTypeArray) {
      throw new NotFound({
        data: {
          objectId: folderId,
          objectType: 'Folder'
        }
      });
    }
    if (!requiredTypeArray.includes(treeObjectType)) {
      throw new InvalidInput({
        data: {
          errorType: 'invalid_tree_object_type',
          message: `Parent Tree Object must be tree object type ${requiredTypeArray}`
        }
      });
    }
  }

  function validateMaxDepth(allowedMax, depth) {
    let parentMax = depth[0];
    // getParentDepth only accounts for depth of tree folders, therefore if
    // parent is depth 5, therefore 5 folders, we cannot add an additional folder
    if (parentMax.maxparenttreeobject + 2 > allowedMax) {
      // invalid tree object restrictions: highest depth would be greater than 5
      return {
        errorType: 'exceed_max_depth',
        message:
          'Invalid tree object restrictions: parent tree object already at max depth, ' +
          allowedMax
      };
    }
  }

  function buildFolderStructure(result, organizationId) {
    const folders = result.map(mapper.mapFolder);
    folders.forEach((folder) => {
      folder.organizationId = organizationId;
    });

    const folder = folders[0];
    if (folders.length > 1) {
      // Filter out only folders
      folder.subfolders = folders
        .slice(1)
        .filter(
          (folder) => folder.treeObjectTypeId === TREE_OBJECT_TYPE.FOLDER
        );
    }
    return folder;
  }

  /**
   * Create Folder
   * @method createFolder
   * @param  {Object} context  object
   * @param  {String} args    object
   * @return {Json}   jsondata json
   */
  async function createFolder(context, args) {
    const orgId = _.get(args, 'input.organizationId', args.organizationId);
    const useV2FolderFeature = await _useV2FoldersEnabledFeature(
      context,
      orgId
    );
    const parentId = _.get(args, 'input.parentId');
    const rootFolderType = _.get(args, 'input.rootFolderType', 'cms');

    let v1Args = args;
    let v2Args = args;

    // V2 enabled: map V2 org-scoped user root -> V1 global user root
    if (useV2FolderFeature && isV2FoldersAvailable && parentId) {
      const v1ParentId = await _getV1ParentIdFromV2(
        context,
        parentId,
        rootFolderType
      );

      if (v1ParentId) {
        v1Args = _.cloneDeep(args);
        _.set(v1Args, 'input.parentId', v1ParentId);
      }
    }

    // V1 enabled: map V1 global user root -> V2 org-scoped user root
    if ((!useV2FolderFeature || !isV2FoldersAvailable) && parentId) {
      const v2ParentId = await _getV2ParentIdFromV1(
        context,
        parentId,
        orgId,
        rootFolderType
      );
      if (v2ParentId) {
        v2Args = _.cloneDeep(args);
        _.set(v2Args, 'input.parentId', v2ParentId);
      }
    }

    const result = await v1Tov2DalSwitch(
      () =>
        createFolderV1(context, v1Args).catch((err) => {
          _emitPublicEvent(
            context,
            supportedEvents.FolderCreate,
            {
              status: 'failure'
            },
            err
          );
          throw err;
        }),
      (v1Output) =>
        dalV2Folder
          .createFolder(context, _customInputForV2(v2Args, v1Output))
          .catch((err) => {
            _emitPublicEvent(
              context,
              supportedEvents.FolderCreate,
              {
                status: 'failure'
              },
              err
            );
            throw err;
          }),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );

    // emit event
    _emitPublicEvent(context, supportedEvents.FolderCreate, result);

    return result;
  }

  async function createFolderV1(context, args) {
    // TODO rewrite no collection dal
    const input = args.input;
    const { userInfo } = context.requestContext;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    let parentTreeObjectId = input.parentId;

    // preemptively throw clean error on non-UUID that we
    // know will not be found
    if (!validator.isUUID(parentTreeObjectId)) {
      throw new NotFound({
        message: 'The specified parent ID was not found',
        data: {
          objectType: 'Folder',
          objectId: parentTreeObjectId
        }
      });
    }

    // check folder name
    if (!_.isString(input.name) || _.isEmpty(input.name.trim())) {
      throw new InvalidInput({
        message: 'the name field is required.'
      });
    }

    // to accept a folder ID OR tree object ID, we'll try a lookup here.
    try {
      parentTreeObjectId = await getTreeObjectId(parentTreeObjectId);
    } catch (err) {
      // ignore; might means it's already a tree object id
    }

    const folder = new model.Folder({
      treeFolderName: input.name.trim(),
      treeFolderDescription: input.description,
      parentTreeObjectId: parentTreeObjectId,
      orderIndex: input.orderIndex || 0
    });

    const validationErrs = folder.validate();

    if (validationErrs) {
      throw new InvalidInput({
        data: validationErrs
      });
    }

    folder.newTreeObjectId = uuid.v4();
    folder.newTreeFolderId = uuid.v4();

    // Get userId in case create subFolder into rootFolder of an user using JWTToken
    let userId =
      _.get(userInfo, 'userId') ||
      _.get(context.requestContext, 'tokenInfo.userId');

    // Case using APIToken/JWTToken, get the user from input
    // to make sure the input user in the org context,
    // and the Token have rights to get this user
    if (_.isNil(userId)) {
      if (_.isNil(input.userId)) {
        throw new errors.InvalidInput({
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

    const accessOptions = {
      organizationId: args.organizationId,
      userId: userId || '00000000-0000-0000-0000-000000000000',
      treeObjectIds: [folder.parentTreeObjectId],
      rootFolderType: input.rootFolderType,
      isSuperAdmin: isSuperAdmin
    };
    const results = await _validateAccess(accessOptions);
    if (!results.length) {
      throw new NotFound({
        message:
          'A folder with the specified type and ID could not be found. ' +
          'Verify that the folder exists. The ID can be for the tree object ' +
          'element (treeObjectId field on the Folder), or the primary folder ID. ' +
          'It must also match the specified root folder type.',
        data: {
          rootFolderType: input.rootFolderType,
          objectId: folder.parentTreeObjectId,
          objectType: 'Folder'
        }
      });
    }
    const treeObjectType = await _getTreeObjectType(folder.parentTreeObjectId);

    const validationErr = validateTreeObject(
      folder.parentTreeObjectId,
      treeObjectType,
      [TREE_OBJECT_TYPE['FOLDER'], TREE_OBJECT_TYPE['ROOT_FOLDER']]
    );
    if (validationErr) {
      throw new InvalidInput({
        message: 'The folder request failed validation checks.',
        data: {
          validationErrors: validationErr
        }
      });
    }
    const dbParentDepth = await _getParentDepth(folder);
    if (!dbParentDepth || validateMaxDepth(MAX_DEPTH, dbParentDepth)) {
      throw new InvalidInput({
        message:
          'Adding the new folder would exceed maximum folder depth limitations.',
        data: {
          maxAllowedDepth: MAX_DEPTH,
          parentDepth: dbParentDepth
        }
      });
    }

    const dbCreatedFolders = await _createFolder(folder);

    folder.getTreeObjectId = dbCreatedFolders[0].tree_object_id;
    let result = await _getFolder(folder);

    // Super Admin: use root folder's organization instead of current org
    let folderOrganizationId = args.organizationId || _.get(args, 'input.organizationId');
    if (isSuperAdmin) {
      const rootOrgId = await _getRootOrganizationIdForTreeObject(
        folder.parentTreeObjectId
      );
      if (rootOrgId) {
        folderOrganizationId = rootOrgId;
      }
    }

    const newFolder = await buildFolderStructure(result, folderOrganizationId);
    const folderId = _.get(newFolder, 'id');
    newFolder.name = newFolder.treeFolderName;

    // incr/set redis cache for org media usage
    const orgId = folderOrganizationId;
    const rbacArgs = {
      organizationId: orgId,
      objectId: folderId,
      resourceType: 'Folder'
    };
    await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs);

    // if entityTags field is in input, synchronize entity_tags table with corresponding rows
    if (!_.isNil(input.entityTags)) {
      const tagData = {
        entityId: folderId,
        organizationId: orgId,
        entityType: 'folder',
        entityTags: input.entityTags
      };
      await serviceContext.dal.entityTags.updateEntityTags(
        tagData,
        newFolder,
        context
      );
    }

    return newFolder;
  }

  /**
   * Update Folder
   * @method updateFolder
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function updateFolder(context, args) {
    const result = await v2DalSwitch(
      () =>
        updateFolderV1(context, args).catch((err) => {
          _emitPublicEvent(
            context,
            supportedEvents.FolderUpdate,
            {
              id: _.get(args, 'input.id'),
              status: 'failure'
            },
            err
          );
          throw err;
        }),
      () =>
        dalV2Folder.updateFolder(context, args).catch((err) => {
          _emitPublicEvent(
            context,
            supportedEvents.FolderUpdate,
            {
              id: _.get(args, 'input.id'),
              status: 'failure'
            },
            err
          );
          throw err;
        }),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );

    // emit event
    _emitPublicEvent(context, supportedEvents.FolderUpdate, result);

    return result;
  }

  /**
   * Update Folder
   * @method updateFolder
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function updateFolderV1(context, args) {
    const input = args.input;
    if (!input.organizationId) {
      throw new InvalidInput({
        message: 'organizationId is required'
      });
    }

    if (!_.isString(input.name) || _.isEmpty(input.name.trim())) {
      throw new InvalidInput({
        message: 'the name field is required.'
      });
    }
    if (!validator.isUUID(input.id)) {
      throw new InvalidInput({
        message:
          'Invalid ID format ' + input.id + '. A folder ID must be a UUID.'
      });
    }
    input.name = input.name.trim();

    // get folder to find tree object item id and validate write access
    const folder = await getFolderNew(context, {
      __writeOnly: true, // require write permission
      organizationId: input.organizationId,
      id: input.id
    });
    const now = moment().toISOString();
    const sql = `
UPDATE tree_folder
SET tree_folder_name = $1
WHERE tree_folder_id = $2;
UPDATE tree_object
SET last_updated_date = $3
WHERE tree_object_id = $4;
    `;
    const vars = [input.name, folder.id, now, folder.treeObjectId];
    const res = await serviceContext.dbConnections[
      'media_platform'
    ].write.query(sql, vars);
    folder.originalFolderName = folder.treeFolderName;
    folder.name = input.name;
    folder.modifiedDateTime = now;

    // if entityTags field is in input, synchronize entity_tags table with corresponding rows
    if (!_.isNil(input.entityTags)) {
      const tagData = {
        entityId: folder.id,
        organizationId: folder.organizationId || input.organizationId,
        entityType: 'folder',
        entityTags: input.entityTags
      };
      await serviceContext.dal.entityTags.updateEntityTags(
        tagData,
        folder,
        context
      );
    }

    return folder;
  }

  async function getSubfolders(context, args) {
    return v2DalSwitch(
      () => getSubfoldersV1(context, args),
      () => dalV2Folder.getSubfolders(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getSubfoldersV1(context, args) {
    const tagKeys = _.map(args.entityTags, 'key');
    if (!_.isEmpty(tagKeys)) {
      const organizationId =
        _.get(args, 'input.organizationId') ||
        _.get(args, 'organizationId') ||
        _.get(context, '_authInfo.organization.organizationId');
      args.folderIds =
        await serviceContext.dal.entityTags.getEntityIdsByTagKeys(
          tagKeys,
          organizationId,
          'folder'
        );

      // if there are no folders with input entity tags, return an empty array of folders.
      if (_.isEmpty(args.folderIds)) {
        return [];
      }
    }

    // Pass RBAC auth filter from context to args for OLP filtering
    if (context._rbacAuthFilter) {
      args._rbacAuthFilter = context._rbacAuthFilter;
    }

    // Get SQL query and Args
    const { sql, sqlArgs } = _getSubfolderQuery(args);

    const res = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      sqlArgs,
      mapper.mapFolder
    );

    return res;
  }

  function _getSubfolderQuery(args) {
    const orderClause = [];
    const orderByMap = {
      name: 'f.tree_folder_name',
      createdDateTime: 't.creation_date'
    };

    if (_.get(args, 'orderBy.length', 0) > 0) {
      args.orderBy.forEach((orderBy) => {
        const col = orderByMap[orderBy.field];

        if (!col) {
          throw new errors.InvalidInput({
            message: 'Order by field does not support',
            data: {
              internalData: {
                orderByField: orderBy.field,
                knownFields: Object.keys(orderByMap)
              }
            }
          });
        }

        orderClause.push(`${col} ${orderBy.direction}`);
      });
    } else {
      // by default get data by created date
      orderClause.push('t.creation_date ASC');
    }
    const orderBySql = ` ORDER BY ${orderClause.join(', ')} `;

    const whereConditions = [
      `t.tree_object_type_id = ${TREE_OBJECT_TYPE.FOLDER}`,
      `t.tree_object_status = ${TREE_OBJECT_STATUS.ACTIVE}`
    ];

    const sqlArgs = [];

    mainUtil.addSqlWhere(
      'c.parent_tree_object_id',
      args.id,
      whereConditions,
      sqlArgs
    );

    const noFilter = _.every([args.names, args.folderIds], _.isEmpty);
    if (noFilter) {
      // get only child folders; ignore its descendants if not filtering by name or folderIds.
      whereConditions.push('c.depth = 1');
    } else {
      // get child folders and its descendants if there is filtering by name or folderIds.
      if (!_.isEmpty(args.names)) {
        mainUtil.addTextMatchFilters(
          'f.tree_folder_name',
          args.names,
          args.nameMatch,
          whereConditions,
          sqlArgs
        );
      }

      if (!_.isEmpty(args.folderIds)) {
        sqlArgs.push(args.folderIds);
        whereConditions.push(`t.object_id = ANY($${sqlArgs.length}::text[])`);
      }
    }

    // OLP filtering - add RBAC join and filter conditions
    const {
      rbacJoin,
      sqlWhere: olpSqlWhere,
      sqlArgs: olpSqlArgs
    } = _buildRbacFolderFilter(args, 'f.tree_folder_id', sqlArgs.length);
    whereConditions.push(...olpSqlWhere);
    sqlArgs.push(...olpSqlArgs);

    const sql = `
      SELECT
        f.tree_folder_name,
        f.tree_folder_description,
        f.tree_folder_id AS id,
        t.tree_object_type_id AS type_id,
        t.object_id,
        t.tree_object_id,
        t.creation_date AS created_date_time,
        t.last_updated_date AS modified_date_time,
        t.tree_object_status,
        t.shared_with,
        t.order_index,
        c.child_tree_object_id,
        c.parent_tree_object_id,
        c.depth
      FROM
        tree_folder AS f
        INNER JOIN tree_object AS t
          ON f.tree_folder_id::TEXT = t.object_id
        INNER JOIN tree_object_closure AS c
          ON c.child_tree_object_id = t.tree_object_id
        ${rbacJoin}
      WHERE
        ${whereConditions.join(' AND ')}
        ${orderBySql}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30};`;

    return { sql, sqlArgs };
  }

  async function getRootFolders(context, args) {
    return v2DalSwitch(
      () => getRootFoldersV1(context, args),
      () => dalV2Folder.getRootFolders(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getRootFoldersV1(context, args) {
    const rootFolderTypeId = ROOT_FOLDER_TYPE[args.rootFolderType || args.type];

    const where = [];
    const sqlArgs = [];

    mainUtil.addSqlWhere(
      'r_f.root_folder_type_id',
      rootFolderTypeId,
      where,
      sqlArgs
    );
    const idOr = [];
    mainUtil.addSqlWhere('t_o.object_id', args.id, idOr, sqlArgs);
    mainUtil.addSqlWhere('t_o.tree_object_id', args.id, idOr, sqlArgs);
    if (idOr.length) where.push(`(${idOr.join(' OR ')})`);

    // skip authorization when we already validated tree object access;
    // used in getFolder when a shared org/user folder is requested
    if (!args.id || args.skipAuth !== true) {
      const userId = _.get(context, '_authInfo.userId');
      const orgId = _.get(context, '_authInfo.organization.organizationId');
      const userOr = [];
      mainUtil.addSqlWhere('r_f.user_id', userId, userOr, sqlArgs);
      mainUtil.addSqlWhere(
        'r_f.organization_id',
        args.organizationId || orgId,
        userOr,
        sqlArgs
      );
      where.push(`(${userOr.join(' OR ')})`);
    }

    const sql = `
      SELECT
        r_f.root_folder_id,
        r_f.root_folder_type_id,
        r_f.organization_id,
        r_f.user_id,
        t_o.object_id,
        t_o.tree_object_type_id,
        t_o.creation_date,
        t_o.last_updated_date,
        t_o.order_index,
        t_o.tree_object_id,
        t_o.shared_with,
        r_f.shares_to
      FROM
        root_folder as r_f
        INNER JOIN tree_object as t_o
        ON r_f.root_folder_id::TEXT = t_o.object_id
      WHERE
        ${where.join(' AND ')}
      ORDER BY r_f.organization_id, r_f.user_id
    `;
    const res = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      sqlArgs,
      mapper.mapFolder
    );

    await emitFixupV2FolderRowsEvent(context, res, 'rootFolderId');
    return res;
  }

  async function createARootFolder(context, args, forUser) {
    const rootFolderTypeId = ROOT_FOLDER_TYPE[args.rootFolderType];
    const userId = _.get(context, '_authInfo.userId');
    const organizationId = args.organizationId;

    const idCol = forUser === true ? 'user_id' : 'organization_id';
    const idVal = forUser === true ? userId : organizationId;

    const mediaPlatformTx = await dbUtil.dbWriteTx('media_platform');
    const ssoTx = await dbUtil.dbWriteTx('sso');

    try {
      await mediaPlatformTx.begin();
      await ssoTx.begin();

      const db = mediaPlatformTx.client;

      // create the root folder row
      const rootFolderSql = `
INSERT INTO root_folder
  (root_folder_id, ${idCol}, root_folder_type_id)
VALUES
  ($1, $2, $3)
RETURNING *`;
      const rootFolderId = uuidv4();
      const rootFolderRow = await db.query(rootFolderSql, [
        rootFolderId,
        idVal,
        rootFolderTypeId
      ]);

      let res = rootFolderRow[0];

      // create the tree object row
      const treeObjectSql = `
INSERT INTO tree_object (
  object_id,
  tree_object_type_id,
  tree_object_id,
  order_index,
  creation_date,
  last_updated_date,
  tree_object_status
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *`;
      const treeObjectId = uuidv4();
      const now = moment().toISOString();
      const treeObjectArgs = [
        rootFolderId,
        TREE_OBJECT_TYPE.ROOT_FOLDER,
        treeObjectId,
        0,
        now,
        now,
        1
      ];
      const treeObjectRow = await db.query(treeObjectSql, treeObjectArgs);
      res = Object.assign(res, treeObjectRow[0]);

      // create tree object closure
      const closureSql = `
INSERT INTO tree_object_closure (
  parent_tree_object_id,
  child_tree_object_id,
  depth
) VALUES ($1, $2, $3)
RETURNING *
      `;
      const closureRow = await db.query(closureSql, [
        treeObjectId,
        treeObjectId,
        0
      ]);
      res = Object.assign(res, closureRow[0]);

      // add default ACEs to user CMS root folder
      if (forUser && rootFolderTypeId === ROOT_FOLDER_TYPE.cms) {
        const rbacArgs = {
          organizationId,
          objectId: rootFolderId,
          resourceType: 'Folder',
          ownerId: userId
        };

        const dbClients = {
          sso: ssoTx.client,
          media_platform: mediaPlatformTx.client
        };
        await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs, {
          dbClients
        });
      }

      await mediaPlatformTx.commit();
      await ssoTx.commit();

      return mapper.mapFolder(res);
    } catch (err) {
      await mediaPlatformTx.rollback();
      await ssoTx.rollback();
      serviceContext.logger.error(
        'Failed to create root folder with ACEs: ',
        err
      );
      throw err;
    } finally {
      mediaPlatformTx.done();
      ssoTx.done();
    }
  }

  async function createUserRootFolder(context, args) {
    return await createARootFolder(context, args, true);
  }

  async function createOrgRootFolder(context, args) {
    return await createARootFolder(context, args, false);
  }

  async function getOrCreateRootFoldersNew(context, args) {
    const rootFolders = await getRootFoldersV1(context, args);
    // if we got back 2 folders, then the root folders for
    // both user and org already exist.
    // just return out now.
    if (rootFolders.length > 1) {
      return rootFolders;
    }

    // otherwise we need to create at least one.
    const userId = _.get(context, '_authInfo.userId');
    if (rootFolders.length > 0) {
      // we have one root folder.
      const existingFolder = rootFolders[0];

      if (!existingFolder.organizationId) {
        // if there's no org ID on it, then it's the user's root.
        // create the org root folder.
        const orgFolder = await createOrgRootFolder(context, args);
        rootFolders.push(orgFolder);
      } else if (userId) {
        // otherwise the org root exists, and we need to create
        // the user's root folder.
        // we only attempt this for a user context, not API key.
        const userFolder = await createUserRootFolder(context, args);
        rootFolders.push(userFolder);
      }
    } else {
      // otherwise we need to create both
      const orgFolder = await createOrgRootFolder(context, args);
      rootFolders.push(orgFolder);
      if (userId) {
        const userFolder = await createUserRootFolder(context, args);
        rootFolders.push(userFolder);
      }
    }
    return rootFolders;
  }

  async function getOrCreateRootFolders(context, args) {
    const useNew =
      _.get(
        serviceContext,
        'config.featureFlags.newGetOrCreateRootFolders',
        true
      ) === true;

    return v1Tov2DalSwitch(
      () => {
        return useNew
          ? getOrCreateRootFoldersNew(context, args)
          : getOrCreateRootFoldersOld(context, args);
      },
      (v1Output) =>
        dalV2Folder.getOrCreateRootFolders(
          context,
          _customInputForV2(args, v1Output)
        ),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function getOrCreateRootFoldersOld(context, args) {
    const options = {
      userId: _.get(context, '_authInfo.userId'),
      organizationId: args.organizationId,
      rootFolderTypeId: ROOT_FOLDER_TYPE[args.rootFolderType]
    };

    const queryOptions = new model.RootFolder(options);
    const validationErrs = queryOptions.validate();

    queryOptions.newOrgRootFolderId = uuid.v4();
    queryOptions.newOrgTreeObjectId = uuid.v4();
    queryOptions.newUserRootFolderId = uuid.v4();
    queryOptions.newUserTreeObjectId = uuid.v4();

    if (validationErrs) {
      throw new InvalidInput({
        data: validationErrs
      });
    }

    const mediaPlatformTx = await dbUtil.dbWriteTx('media_platform');
    const ssoTx = await dbUtil.dbWriteTx('sso');

    try {
      await mediaPlatformTx.begin();
      await ssoTx.begin();

      let rootFolders = await _getOrCreateRootFolder(
        queryOptions,
        mediaPlatformTx.client
      );
      if (_.isEmpty(rootFolders)) {
        throw new ServiceFailure({
          message: 'Failed to create new folders.'
        });
      }

      queryOptions.getTreeObjectIds = _.map(rootFolders, 'tree_object_id');
      const params = dalUtil.buildQueryPlaceholders(
        1,
        queryOptions.getTreeObjectIds.length
      );
      rootFolders = await _getFolders(
        queryOptions,
        params,
        mediaPlatformTx.client
      );
      if (_.isEmpty(rootFolders)) {
        throw new ServiceFailure({
          message: 'Failed to create root folders'
        });
      }

      for (const folder of rootFolders) {
        // Only log event if new folder was created
        if (
          queryOptions.newOrgRootFolderId === folder.root_folder_id ||
          queryOptions.newUserRootFolderId === folder.root_folder_id
        ) {
          // emit event
          _emitPublicEvent(context, supportedEvents.FolderCreate, {
            id: folder.root_folder_id,
            name: folder.root_folder_name || folder.treeFolderName,
            typeId: folder.root_folder_type_id,
            organizationId: folder.organization_id
          });
        }

        if (
          queryOptions.newUserRootFolderId === folder.root_folder_id &&
          folder.user_id &&
          options.rootFolderTypeId === ROOT_FOLDER_TYPE.cms
        ) {
          // add default ACEs to user CMS root folder
          const rbacArgs = {
            organizationId: folder.organization_id || args.organizationId,
            objectId: folder.root_folder_id,
            resourceType: 'Folder',
            ownerId: folder.user_id
          };
          const dbClients = {
            sso: ssoTx.client,
            media_platform: mediaPlatformTx.client
          };
          await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs, {
            dbClients
          });
        }
      }

      await mediaPlatformTx.commit();
      await ssoTx.commit();

      return rootFolders
        .map(mapper.mapFolder)
        .filter((folder) => folder.treeObjectTypeId === 4);
    } catch (err) {
      await mediaPlatformTx.rollback();
      await ssoTx.rollback();
      serviceContext.logger.error(
        'Failed to create root folders with ACEs: ',
        err
      );
      throw err;
    } finally {
      mediaPlatformTx.done();
      ssoTx.done();
    }
  }

  /**
   * Move Folder
   * @method moveFolder
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */

  async function moveFolder(context, args) {
    return v2DalSwitch(
      () => moveFolderV1(context, args),
      () => moveFolderV2(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function moveFolderV1(context, args) {
    const { input } = args;
    const { userInfo } = context.requestContext;
    if (!input.organizationId) {
      throw new InvalidInput({
        message: 'organizationId is required'
      });
    }

    // temporary map the new folderId inputs to the legacy tree object
    if (!_.isNil(input.folderId)) {
      input.treeObjectId = await getTreeObjectId(input.folderId);
    }
    if (!_.isNil(input.fromFolderId)) {
      input.prevParentTreeObjectId = await getTreeObjectId(input.fromFolderId);
    }
    if (!_.isNil(input.toFolderId)) {
      input.newParentTreeObjectId = await getTreeObjectId(input.toFolderId);
    }

    const options = new model.TreeObjectUpdate({
      ...input
    });

    // validate fields
    const validationErrs = options.validate();
    if (validationErrs) {
      throw new InvalidInput({
        data: validationErrs
      });
    }

    const accessOptions = {
      organizationId: args.organizationId,
      userId: userInfo.userId,
      treeObjectIds: [input.newParentTreeObjectId],
      rootFolderType: input.rootFolderType
    };
    const results = await _validateAccess(accessOptions);
    if (!results.length) {
      throw new NotAllowed({
        message: 'Unable to authorize access to tree object'
      });
    }

    const parentFolders = await getParentFolders(context, {
      folderId: input.newParentTreeObjectId,
      treeObjectId: input.newParentTreeObjectId
    });

    if (_.some(parentFolders, { treeObjectId: input.treeObjectId })) {
      throw new ResourceConflict({
        message: 'Cannot move parent folder into its own subfolder',
        data: { folderId: input.treeObjectId }
      });
    }

    try {
      await _isObjectInKnownState(options);
    } catch (error) {
      throw new ServiceFailure({
        message: 'Failed to validate folder state.'
      });
    }
    const treeObjectType = await _getTreeObjectType(options.treeObjectId);

    const dbDepths = await _getDepthsForMove(options);
    if (dbDepths == null) {
      throw new ServiceFailure({
        message: 'Failed to retrieve depths to move folder.'
      });
    }
    const depth = dbDepths[0];
    const maxDepth =
      treeObjectType === TREE_OBJECT_TYPE['FOLDER'] ? MAX_DEPTH : MAX_DEPTH + 1;
    if (depth.maxtreeobject + depth.maxparenttreeobject + 2 > maxDepth) {
      // invalid tree object restrictions: highest depth would be greater than 5
      throw new InvalidInput({
        message:
          'Invalid Depth Restriction: Highest depth would be greater than ' +
          maxDepth,
        data: {
          maxAllowedDepth: maxDepth
        }
      });
    }

    const sql = `--Update current order_index to new order_index
      UPDATE tree_object
        SET order_index = $2,
        last_updated_date = now()::timestamp with time zone
        WHERE tree_object_id = $1;

      --Delete ties to old parent
      DELETE FROM tree_object_closure link
        USING tree_object_closure p, tree_object_closure c
        WHERE p.parent_tree_object_id = link.parent_tree_object_id AND c.child_tree_object_id = link.child_tree_object_id
        AND p.child_tree_object_id = $3 AND c.parent_tree_object_id = $1;

       --Update old siblings order_index
      UPDATE tree_object
        SET order_index = order_index - 1, last_updated_date = now()::timestamp with time zone
        WHERE tree_object_id IN (
         SELECT toc.child_tree_object_id
         FROM tree_object_closure toc
         JOIN tree_object t_o ON t_o.tree_object_id = toc.child_tree_object_id
         WHERE toc.parent_tree_object_id = $3
         AND toc.depth = 1 AND t_o.order_index > $4
        )
        AND tree_object_status = $5;

      --Update new siblings order_index
      UPDATE tree_object
        SET order_index = order_index + 1, last_updated_date = now()::timestamp with time zone
        WHERE tree_object_id IN (
          SELECT toc.child_tree_object_id
          FROM tree_object_closure toc
          JOIN tree_object t_o ON t_o.tree_object_id = toc.child_tree_object_id
          WHERE toc.parent_tree_object_id = $6
          AND toc.depth = 1 AND t_o.order_index >= $2
        )
        AND tree_object_status = $5;

      --Add ties to new parent
      INSERT INTO tree_object_closure(parent_tree_object_id, child_tree_object_id, depth)
        SELECT p.parent_tree_object_id, c.child_tree_object_id, p.depth + c.depth + 1
        FROM tree_object_closure p, tree_object_closure c
        WHERE p.child_tree_object_id = $6 AND c.parent_tree_object_id = $1;`;

    const params = [
      input.treeObjectId,
      input.newOrderIndex || 0,
      input.prevParentTreeObjectId,
      input.prevOrderIndex,
      TREE_OBJECT_STATUS['ACTIVE'],
      input.newParentTreeObjectId
    ];

    // wait for the completion of v1
    await dbWrite.query(sql, params);

    const getFolderArgs = {
      id: input.treeObjectId,
      organizationId: args.organizationId
    };
    if (treeObjectType !== TREE_OBJECT_TYPE['FOLDER']) {
      getFolderArgs.id = input.newParentTreeObjectId;
    }
    return getFolderV1(context, getFolderArgs);
  }

  async function moveFolderV2(context, args) {
    const { input } = args;
    let folderId = input.folderId;
    let newParentFolderId = input.toFolderId;
    const { orgId, objectId, objectType } = resUtil.parseVirtualTreeObjectId(
      input.treeObjectId
    );

    // for using moveFolder to move watchlist, redirect to moveWatchlist
    if (objectType === 'watchlist' && objectId && orgId) {
      return _redirectToMoveWatchlist(context, args);
    }

    if (input.treeObjectId && input.newParentTreeObjectId) {
      const options = new model.TreeObjectUpdate({
        ...input
      });

      // validate fields
      const validationErrs = options.validate();
      if (validationErrs) {
        throw new InvalidInput({
          data: validationErrs
        });
      }

      const [folder, newParentFolder] = await Promise.all([
        _getFolder({
          getTreeObjectId: options.treeObjectId,
          organizationId: input.organizationId
        }),
        _getFolder({
          getTreeObjectId: options.newParentTreeObjectId,
          organizationId: input.organizationId
        })
      ]);

      const folderObj = _.head(folder);
      // for using moveFolder to move watchlist,
      // sync data between v1 and v2 when v2FoldersEnabled is disabled.
      const watchlistId = _.get(folderObj, 'tracking_unit_id');
      if (watchlistId) {
        await dalV2Folder.moveFolderItem(context, {
          ...args,
          input: {
            objectId: watchlistId,
            objectType: 'watchlist',
            newFolderId: newParentFolderId
          }
        });
        args.id = newParentFolderId;

        return dalV2Folder.getFolder(context, args);
      }

      folderId = _.get(folderObj, 'object_id') || options.treeObjectId;
      newParentFolderId =
        _.get(_.head(newParentFolder), 'object_id') ||
        options.newParentTreeObjectId;
    }

    const newArgs = {
      ...args,
      input: {
        organizationId: input.organizationId,
        rootFolderType: input.rootFolderType,
        folderId,
        newParentFolderId
      }
    };
    return dalV2Folder.moveFolder(context, newArgs);
  }

  /**
   * Delete Folder
   * @method deleteFolder
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function deleteFolder(context, args) {
    const result = await v2DalSwitch(
      () =>
        deleteFolderV1(context, args).catch((err) => {
          _emitPublicEvent(
            context,
            supportedEvents.FolderDelete,
            {
              id: _.get(args, 'input.id'),
              status: 'failure'
            },
            err
          );
          throw err;
        }),
      () =>
        dalV2Folder.deleteFolder(context, args).catch((err) => {
          _emitPublicEvent(
            context,
            supportedEvents.FolderDelete,
            {
              id: _.get(args, 'input.id'),
              status: 'failure'
            },
            err
          );
          throw err;
        }),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );

    // emit event
    _emitPublicEvent(context, supportedEvents.FolderDelete, result);

    return result;
  }

  /**
   * Delete Folder
   * @method deleteFolder
   * @param  {Object} context  object
   * @param  {Object} args    object
   * @return {Json}   jsondata json
   */
  async function deleteFolderV1(context, args) {
    const { input, organizationId } = args;
    const { id, orderIndex } = input;
    if (!validator.isUUID(input.id)) {
      throw new InvalidInput({
        message:
          'Invalid ID format ' + input.id + '. A folder ID must be a UUID.'
      });
    }

    // Validate access
    const folder = await getFolderV1(context, { id, organizationId });

    let rootFolder;
    try {
      rootFolder = await getRootFolderV1(context, {
        organizationId,
        id: folder.id
      });
    } catch (error) {
      // ignore error when folder is not a root folder
      logger.debug(
        `DeleteFolder: folder [id:${folder.id}] is not a root folder.`,
        { error }
      );
    }

    if (rootFolder) {
      throw new NotAllowed({
        message: 'Can not delete root folder',
        data: {
          objectType: 'Folder',
          objectId: folder.id
        }
      });
    }

    const sql = `
      -- Move up siblings
      UPDATE tree_object
      SET order_index = order_index - 1
      WHERE tree_object_id IN (
        --get the siblings of the parent
        SELECT child_tree_object_id
        FROM tree_object_closure
        WHERE parent_tree_object_id = (
          --get the parent
          SELECT parent_tree_object_id
          FROM tree_object_closure
          WHERE child_tree_object_id = $1
          AND depth = 1
        )
        AND depth = 1
      )
      AND order_index > $2;

      -- Update children to inactive
      UPDATE tree_object
      SET tree_object_status = $3,
      last_updated_date = now()::timestamp with time zone
      WHERE tree_object_id IN (
        SELECT child_tree_object_id
        FROM tree_object_closure
        WHERE parent_tree_object_id = $1
      )
      RETURNING *;`;

    const result = await dbWrite.map(
      sql,
      [folder.treeObjectId, orderIndex, TREE_OBJECT_STATUS['INACTIVE']],
      mapper.mapFolder
    );

    const rbacArgs = {
      resourceType: 'Folder',
      resourceIds: [folder.id]
    };

    try {
      await rbacAuthBll.removeACEsFromResources(context, rbacArgs);
    } catch (err) {
      logger.error('failed to delete ACEs:' + err);
    }

    try {
      // remove all entity tags of this folder
      const tagData = {
        entityId: folder.id,
        organizationId,
        entityType: 'folder',
        entityTags: []
      };
      await serviceContext.dal.entityTags.updateEntityTags(
        tagData,
        folder,
        context
      );
    } catch (err) {
      logger.error(
        `DeleteFolder: failed to delete tags for [folder:${folder.id}] :` + err
      );
    }

    return {
      id, // return ID of folder object
      name: folder.treeFolderName
    };
  }

  /**
   * Get root folder's organizationId for a tree object
   * @param {string} treeObjectId The tree object ID
   * @returns {number|null} The organization ID of the root folder
   */
  async function _getRootOrganizationIdForTreeObject(treeObjectId) {
    const sql = `
      SELECT r.organization_id
      FROM tree_object_closure c
      JOIN tree_object t ON t.tree_object_id = c.parent_tree_object_id
      JOIN root_folder r ON t.object_id = r.root_folder_id::text
      WHERE c.child_tree_object_id = $1
      ORDER BY c.depth DESC
      LIMIT 1
    `;
    const result = await dbRead.oneOrNone(sql, [treeObjectId]);
    return result ? result.organization_id : null;
  }

  async function _validateAccess(options) {
    if (!_.isObject(options)) {
      throw new errors.InvalidInput({
        message: 'Missing options object'
      });
    }
    if (!options.organizationId) {
      throw new errors.InvalidInput({
        message: 'Missing organizationId'
      });
    }
    if (!options.userId) {
      throw new errors.InvalidInput({
        message: 'Missing userId'
      });
    }
    if (!options.treeObjectIds) {
      throw new errors.InvalidInput({
        message: 'Missing treeObjectIds'
      });
    }
    const {
      organizationId,
      userId,
      treeObjectIds,
      rootFolderType,
      isSuperAdmin = false
    } = options;
    //Begin at 3 as organizationId is 1 and userId is 2
    const treeObjectPlaceHolders = dalUtil.buildQueryPlaceholders(
      3,
      options.treeObjectIds.length
    );
    // default root folder type to CMS
    const rootFolderTypeId = ROOT_FOLDER_TYPE[rootFolderType || 'cms'];
    // indicates a code bug - should not happen
    if (!rootFolderTypeId) {
      throw new errors.InternalServerError({
        message: 'unknown root folder type ' + rootFolderType
      });
    }

    const rootFolderConditions = [
      `r.root_folder_type_id = ${rootFolderTypeId}`
    ];

    if (!isSuperAdmin) {
      rootFolderConditions.push(
        `(r.organization_id = $1 OR r.user_id = $2)`
      );
    }
    const rootFolderWhere = rootFolderConditions.join('\nAND ');
    const sqlParts = buildSharedAccessCheck(options, treeObjectPlaceHolders);

    const sql = `
    WITH root_folders AS (
      SELECT t.tree_object_id
      FROM tree_object t
      JOIN root_folder r
        ON t.object_id = r.root_folder_id::text
      WHERE ${rootFolderWhere}
    )
    ${sqlParts.sharedSearchSubQuery}
    SELECT c.*
    FROM tree_object_closure c
    JOIN root_folders r_f
      ON c.parent_tree_object_id = r_f.tree_object_id
     AND c.child_tree_object_id IN (${treeObjectPlaceHolders})
    ${sqlParts.sharedSearchJoin};
  `;

    return dbConnections['media_platform'].read.query(sql, [
      organizationId,
      userId,
      ...treeObjectIds
    ]);
  }

  function buildSharedAccessCheck(options, treeObjectPlaceHolders) {
    //default to maximum pemission level if nothing passed
    const sqlParts = {
      sharedSearchSubQuery: '',
      sharedSearchJoin: ''
    };
    if (options.includeSharedReadAcess) {
      sqlParts.sharedSearchSubQuery = `, shared_objects AS (
          SELECT
            tree_object_id
          FROM
            tree_object
          WHERE
            shared_with IS NOT NULL
            AND (shared_with @> '{ "write": [${options.organizationId}]}'
              OR shared_with @> '{ "read": [${options.organizationId}]}')
        )`;
      sqlParts.sharedSearchJoin = ` UNION ALL
          SELECT c.* FROM tree_object_closure c
          JOIN shared_objects s_o
            ON c.parent_tree_object_id = s_o.tree_object_id
              AND c.child_tree_object_id in (${treeObjectPlaceHolders})
            WHERE  s_o IS NOT NULL`;
    }
    return sqlParts;
  }

  /**
   * _isTDOFiled checks whether a TDO has already been filed with a folder
   * @param object_id recording or tdo ID
   * @returns {Promise<boolean>}
   * @private
   */
  async function _isTDOFiled(object_id) {
    const sql = `
    SELECT COUNT(1) FROM tree_object
    WHERE object_id = $1 AND tree_object_status = $2`;
    const result = await dbConnections['media_platform'].read.query(sql, [
      object_id,
      TREE_OBJECT_STATUS.ACTIVE
    ]);
    return parseInt(result[0].count) > 0;
  }

  async function fileObject(
    context,
    orgId,
    parentId,
    childId,
    childType,
    orderIndex,
    allowMultipleParents = false
  ) {
    return v2DalSwitch(
      () =>
        fileObjectV1(
          context,
          orgId,
          parentId,
          childId,
          childType,
          orderIndex,
          allowMultipleParents
        ),
      () =>
        dalV2Folder.fileFolderItem(
          context,
          orgId,
          parentId,
          childId,
          childType,
          allowMultipleParents
        ),
      context,
      orgId,
      true
    );
  }

  async function fileObjectV1(
    context,
    orgId,
    parentId,
    childId,
    childType,
    orderIndex,
    allowMultipleParents = false
  ) {
    // first see if the child object has been filed already
    const filed = await serviceContext.dal.treeObject.getTreeObject(
      context,
      childId,
      true
    );
    if (filed && !allowMultipleParents) {
      throw new InvalidInput({
        message: 'The object has already been filed elsewhere.',
        data: {
          objectId: childId,
          objectType: childType,
          parentFolderId: filed.parentObjectId
        }
      });
    }

    // validates access to the parent folder.
    const folder = await getFolderV1(context, {
      organizationId: orgId,
      id: parentId
    });

    // now we can insert the tree object.
    const options = {
      treeObjectTypeId: childType,
      objectId: childId,
      parentTreeObjectId: folder.treeObjectId,
      orderIndex: orderIndex || 0
    };

    const result = await serviceContext.dal.treeObject.insertTreeObject(
      context,
      options
    );
    return result;
  }

  async function fileTDO(context, args) {
    return v2DalSwitch(
      () => fileTDOV1(context, args),
      () => dalV2Folder.fileTDO(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function fileTDOV1(context, args) {
    const index = args.input.orderIndex || 0;
    const tdo = await serviceContext.dal.tdo.getTDO(context, {
      id: args.input.tdoId,
      applicationId: args.input.applicationId,
      _writeAccessRequest: true
    });

    // get existing folder parent, if there is one
    const treeObjectIdMap =
      await serviceContext.dal.treeObject.getTreeObjectIds([
        tdo.id,
        args.input.folderId
      ]);

    if (treeObjectIdMap[tdo.id]) {
      throw new InvalidInput({
        message: 'TDO has already been filed elsewhere.',
        data: {
          tdoId: tdo.id,
          existingFolderInfo: treeObjectIdMap[tdo.id]
        }
      });
    }

    const treeFolderId = treeObjectIdMap[args.input.folderId];
    if (!treeFolderId) {
      throw new NotFound({
        data: {
          objectId: args.input.folderId,
          objectType: 'Folder'
        }
      });
    }

    const options = {
      treeObjectTypeId: TREE_OBJECT_TYPE.TDO,
      objectId: tdo.id,
      parentTreeObjectId: treeFolderId,
      orderIndex: index
    };
    const result = await serviceContext.dal.treeObject.insertTreeObject(
      context,
      options
    );
    if (args.input.skipIndexing !== true) {
      await serviceContext.dal.tdo.updateFolderInSearchIndex(context, tdo);
    }
    return tdo;
  }

  async function unfileTDO(context, args) {
    const tdo = await serviceContext.dal.tdo.getTDO(context, {
      id: args.input.tdoId,
      applicationId: args.input.applicationId,
      applicationIds: args.input.applicationIds,
      _writeAccessRequest: true
    });
    const res = await unfileObject(
      context,
      {
        input: {
          objectId: args.input.tdoId,
          folderId: args.input.folderId,
          organizationId: args.input.organizationId
        }
      },
      'TemporalDataObject'
    );
    await serviceContext.dal.tdo.updateFolderInSearchIndex(context, tdo);
    return tdo;
  }

  /**
   * Generic function to file an collection to a folder.
   * context:  the context
   * args.input:
   *   context,
    orgId,
    parentId,
    childId,
    childType,
    orderIndex
   */
  async function fileCollection(
    context,
    orgId,
    parentId,
    childId,
    childType,
    orderIndex
  ) {
    return v2DalSwitch(
      () =>
        fileCollectionV1(
          context,
          orgId,
          parentId,
          childId,
          childType,
          orderIndex
        ),
      () =>
        dalV2Folder.fileFolderItem(
          context,
          orgId,
          parentId,
          childId,
          'collection'
        ),
      context,
      orgId,
      true
    );
  }

  async function fileCollectionV1(
    context,
    orgId,
    parentId,
    childId,
    childType,
    orderIndex
  ) {
    // first see if the child object has been filed already
    const filed = await serviceContext.dal.treeObject.getTreeObject(
      context,
      childId,
      true,
      childType
    );
    if (filed) {
      throw new InvalidInput({
        message: 'The object has already been filed elsewhere.',
        data: {
          objectId: childId,
          objectType: childType,
          parentFolderId: filed.parentObjectId
        }
      });
    }

    // validates access to the parent folder.
    const folder = await getFolderV1(context, {
      organizationId: orgId,
      id: parentId
    });

    // now we can insert the tree object.
    const options = {
      treeObjectTypeId: childType,
      objectId: childId,
      parentTreeObjectId: folder.treeObjectId,
      orderIndex: orderIndex || 0
    };

    const result = await serviceContext.dal.treeObject.insertTreeObject(
      context,
      options
    );

    return result;
  }

  async function unfileCollection(context, args) {
    return v2DalSwitch(
      () => unfileCollectionV1(context, args),
      () =>
        dalV2Folder.unfileFolderItem(
          context,
          args.input.organizationId,
          args.input.folderId,
          args.input.objectId,
          'collection'
        ),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function unfileCollectionV1(context, args) {
    const objectId = args.input.objectId;

    // Calling get folder for validation only
    // TODO should you need write permission on folder to unfile from it?
    await getFolderV1(context, {
      organizationId: args.input.organizationId,
      id: args.input.folderId
    });

    // this will throw if the object is not filed
    const filed = await serviceContext.dal.treeObject.getTreeObject(
      context,
      objectId
    );
    // if it's filed, but in a different folder, throw out.
    if (
      filed.parentObjectId !== args.input.folderId &&
      filed.parentTreeObjectId !== args.input.folderId
    ) {
      throw new errors.InvalidInput({
        message: `The object is filed, but in a different folder (${filed.parentObjectId}).`,
        data: {
          objectId,
          parentFolderId: filed.parentObjectId
        }
      });
    }
    const res = await serviceContext.dal.treeObject.removeTreeObject(
      context,
      filed
    );
    return res;
  }

  async function unfileApplication(context, args) {
    return v2DalSwitch(
      () => unfileApplicationV1(context, args),
      () =>
        dalV2Folder.unfileFolderItem(
          context,
          args.input.organizationId,
          args.input.folderId,
          args.input.appId,
          'application'
        ),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }
  async function unfileApplicationV1(context, args) {
    const appId = args.input.appId;
    const parentFolderId = args.input.folderId;

    // Calling get folder for validation only
    await getFolderV1(context, {
      organizationId: args.input.organizationId,
      id: parentFolderId
    });

    // this will throw if the object is not filed
    const appObject = await serviceContext.dal.treeObject.getTreeObject(
      context,
      appId,
      false,
      'Application',
      parentFolderId
    );

    if (!appObject) {
      throw new errors.InvalidInput({
        message: `The application object with this parent is not found: parent object id : (${parentFolderId}).`,
        data: {
          appId,
          parentFolderId: parentFolderId
        }
      });
    }
    const res = await serviceContext.dal.treeObject.removeTreeObject(
      context,
      appObject
    );
    return res;
  }

  /**
   * Generic function to unfile an object from a folder.
   * context:  the context
   * args.input:
   *   folderId:  the folder ID
   *   objectId:  the object (watchlist, tdo, etc.) ID to unfile
   *   organizationId: (optional)
   *   applicationId: (optional)
   * objectType:  for messages only. Watchlist, Folder, etc.
   */
  async function unfileObject(context, args, objectType) {
    //Map generic objectType names to V2 folder object types
    const v2ObjectTypeMap = {
      'TemporalDataObject': 'tdo',
      'Watchlist': 'watchlist',
      'Collection': 'collection',
      'Application': 'application'
    };
    const v2ObjectType = v2ObjectTypeMap[objectType] || objectType;
    return v2DalSwitch(
      () => unfileObjectV1(context, args, objectType),
      () =>
        dalV2Folder.unfileFolderItem(
          context,
          args.input.organizationId,
          args.input.folderId,
          args.input.objectId,
          v2ObjectType
        ),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function unfileObjectV1(context, args, objectType) {
    const objectId = args.input.objectId;
    let folderId = args.input.folderId;
    if (_.isUndefined(objectId) || objectId === '') {
      throw new errors.InvalidInput({
        message: `The object id is invalid`,
        data: {
          objectId,
          objectType
        }
      });
    }

    // this will throw if the object is not filed
    const filed = await serviceContext.dal.treeObject.getTreeObject(
      context,
      objectId
    );

    if (!folderId) {
      // set folder
      folderId = filed.parentObjectId;
    }

    // Calling get folder for validation only
    // TODO should you need write permission on folder to unfile from it?
    await getFolderV1(context, {
      organizationId: args.input.organizationId,
      id: folderId
    });

    // if it's filed, but in a different folder, throw out.
    if (
      filed.parentObjectId !== folderId &&
      filed.parentTreeObjectId !== folderId
    ) {
      throw new errors.InvalidInput({
        message: `The object is filed, but in a different folder (${filed.parentObjectId}).`,
        data: {
          objectId,
          parentFolderId: filed.parentObjectId,
          objectType
        }
      });
    }
    const res = await serviceContext.dal.treeObject.removeTreeObject(
      context,
      filed
    );

    return res;
  }

  async function moveTDO(context, args) {
    const organization = await serviceContext.dal.organization.getOrganization(
      context,
      {
        id: args.input.organizationId
      }
    );

    if (_.get(organization, 'kvp.features.olpMigration', '') === true) {
      throw new NotAllowed({
        message:
          'OLP is being enabled. During the OLP transition, moving files is disabled because it can lead to resources without ACEs being locked out',
        data: {
          objectId: args.input.tdoId,
          oldParentFolderId: args.input.oldFolderId,
          parentFolderId: args.input.newFolderId
        }
      });
    }

    const tdo = await serviceContext.dal.tdo.getTDO(context, {
      id: args.input.tdoId,
      organizationId: args.input.organizationId,
      applicationId: args.input.applicationId,
      applicationIds: args.input.applicationIds,
      _writeAccessRequest: true
    });

    // this is just an unfile and then file
    const unfileArgs = JSON.parse(JSON.stringify(args));
    unfileArgs.input.folderId = args.input.oldFolderId;
    unfileArgs.input.objectId = args.input.tdoId;

    const fileArgs = JSON.parse(JSON.stringify(args));
    fileArgs.input.folderId = args.input.newFolderId;
    fileArgs.input.objectId = args.input.tdoId;
    const unfileRes = await unfileObject(
      context,
      unfileArgs,
      'TemporalDataObject'
    );
    try {
      const fileRes = await fileObject(
        context,
        args.input.organizationId,
        args.input.newFolderId,
        args.input.tdoId,
        TREE_OBJECT_TYPE.TDO,
        0
      );
    } catch (err) {
      // on error, roll back by re-filing the object in its original folder
      logger.error('file failed in moveTDO:  ' + err);
      await fileObject(
        context,
        args.input.organizationId,
        args.input.oldFolderId,
        args.input.tdoId,
        TREE_OBJECT_TYPE.TDO,
        0
      );

      // then throw out the original error.
      throw err;
    }

    await serviceContext.dal.tdo.updateFolderInSearchIndex(context, tdo);

    return tdo;
  }

  async function moveWatchlist(context, args, watchlist) {
    return v2DalSwitch(
      () => moveWatchlistV1(context, args, watchlist),
      () =>
        dalV2Folder.moveFolderItem(context, {
          ...args,
          input: {
            objectId: watchlist.id,
            objectType: 'watchlist',
            newFolderId: args.parentFolderId
          }
        }),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function moveWatchlistV1(context, args, watchlist) {
    // first get the tree object
    const newParentFolderId = args.parentFolderId;
    let treeObject, oldParentFolderId;
    // note that newParentFolderId can be the folder or tree object ID
    const newParentTreeObjectId = await getTreeObjectId(newParentFolderId);
    try {
      treeObject = await serviceContext.dal.treeObject.getTreeObject(
        context,
        watchlist.id
      );
      oldParentFolderId = await getParentFolderId(
        watchlist.id,
        TREE_OBJECT_TYPE.WATCHLIST
      );
    } catch (err) {
      // if it was not filed at all, we just file it now
      const fileRes = await fileObject(
        context,
        args.organizationId,
        newParentFolderId,
        watchlist.id,
        TREE_OBJECT_TYPE.WATCHLIST,
        0
      );
      return watchlist;
    }
    // now get its parent folder

    const options = {
      newOrderIndex: 0,
      prevOrderIndex: treeObject.orderIndex,
      treeObjectId: treeObject.treeObjectId,
      newParentTreeObjectId: newParentTreeObjectId,
      prevParentTreeObjectId: oldParentFolderId
    };

    const moved = await _moveTreeObject(options);
    if (moved == null) {
      throw new ServiceFailure({
        message: 'The watchlist could not be moved to the new folder.',
        data: {
          objectId: watchlist.id,
          oldParentFolderId: oldParentFolderId,
          parentFolderId: args.parentFolderId
        }
      });
    }
    return watchlist;
  }

  async function moveCollection(context, args, collection) {
    return v2DalSwitch(
      () => moveCollectionV1(context, args, collection),
      () =>
        dalV2Folder.moveFolderItem(context, {
          ...args,
          input: {
            objectId: collection.folderId,
            objectType: 'collection',
            newFolderId: args.parentFolderId
          }
        }),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function moveCollectionV1(context, args, collection) {
    // first get the tree object
    const newParentFolderId = args.parentFolderId;
    let treeObject, oldParentFolderId;
    // note that newParentFolderId can be the folder or tree object ID
    const newParentTreeObjectId = await getTreeObjectId(newParentFolderId);
    try {
      treeObject = await serviceContext.dal.treeObject.getTreeObject(
        context,
        collection.folderId
      );
      oldParentFolderId = await getParentFolderId(
        collection.folderId,
        TREE_OBJECT_TYPE.COLLECTION
      );
    } catch (err) {
      // if it was not filed at all, we just file it now
      const fileRes = await fileCollection(
        context,
        args.organizationId,
        newParentFolderId,
        collection.folderId,
        TREE_OBJECT_TYPE.COLLECTION,
        0
      );
      return collection;
    }

    // now get its parent folder
    const options = {
      newOrderIndex: 0,
      prevOrderIndex: treeObject.orderIndex,
      treeObjectId: treeObject.treeObjectId,
      newParentTreeObjectId: newParentTreeObjectId,
      prevParentTreeObjectId: oldParentFolderId
    };

    const moved = await _moveTreeObject(options);
    if (moved == null) {
      throw new ServiceFailure({
        message: 'The collection could not be moved to the new folder.',
        data: {
          objectId: collection.folderId,
          oldParentFolderId: oldParentFolderId,
          parentFolderId: args.parentFolderId
        }
      });
    }
    return collection;
  }

  async function getTreeObjectId(objectOrTreeObjectId) {
    const sql = `
SELECT tree_object_id AS id FROM tree_object WHERE
tree_object_id = $1 OR object_id = $1;
    `;
    const rows = await dbRead.map(sql, [objectOrTreeObjectId], (row) => row.id);
    if (!rows.length) {
      throw new NotFound({
        message: 'The object id could not be mapped to a folder object',
        data: {
          objectId: objectOrTreeObjectId
        }
      });
    }
    return rows[0];
  }

  // Get object ids from tree_object_ids or object_ids.
  async function getObjectIdsFromOpaqueIds(context, objectOrTreeObjectIds) {
    const idToObjectIdMap = new Map();
    const useV2FolderFeature = await _useV2FoldersEnabledFeature(context);

    if (!isV2FoldersAvailable || !useV2FolderFeature) {
      const sql = `
        SELECT object_id, tree_object_id FROM tree_object WHERE
        tree_object_id = ANY($1::uuid[]) OR object_id = ANY($1::text[]);
      `;
      const rows = await dbRead.map(
        sql,
        [objectOrTreeObjectIds],
        mapper.camelizeRootKeys
      );

      for (const to of rows) {
        idToObjectIdMap.set(to.objectId, to.objectId);
        idToObjectIdMap.set(to.treeObjectId, to.objectId);
      }
    }

    return idToObjectIdMap;
  }

  async function getParentFolderId(objectId, treeObjectTypeId) {
    const _objectId = _.isString(objectId) ? objectId : _.toString(objectId);
    const sql = `
      SELECT *
        FROM tree_object
        WHERE tree_object_id IN
              (SELECT parent_tree_object_id
               FROM tree_object_closure toc
                 JOIN tree_object to2 ON toc.child_tree_object_id = to2.tree_object_id
               WHERE to2.object_id = $1 AND toc.depth = 1 AND to2.tree_object_status = $2 AND to2.tree_object_type_id = $3);
    `;
    const parentFolders = await dbConnections['media_platform'].read.query(
      sql,
      [_objectId, TREE_OBJECT_STATUS.ACTIVE, treeObjectTypeId]
    );
    if (!parentFolders.length) {
      throw new NotFound({
        message: 'The object was not filed in a folder.',
        data: {
          objectId: objectId
        }
      });
    }
    return parentFolders[0].tree_object_id;
  }

  // Request-scoped memo for the v2 parent-folder ancestry lookup. The
  // TemporalDataObject resolvers `folders` and `foldersTreeObjectIds` BOTH resolve to
  // this same dalV2Folder.getParentFoldersForObject(objectId, organizationId, objectType)
  // call, so a single document selecting both fields fires the `folder_path @>` query
  // (the top DB query in prod) twice for the same object. Caching the in-flight promise
  // on `context` collapses them to one per request. Keyed by object + org + type (type
  // matters: it selects the v2_folder_object partition, see #4661).
  //
  // OPT-IN: caching only kicks in when the caller passes useRequestCache. It must stay
  // off for read-then-write callers that re-read this data after mutating it in the same
  // request (e.g. fileTDOResouceInResourceFolder in dal/package.js reads the parent
  // folders, then fileObject()s the TDO into another one) -- a cached read there could
  // serve a pre-write snapshot. Only the two pure-read resolvers opt in. Also no-ops
  // when context is absent, e.g. non-resolver callers.
  function _v2ParentFoldersForObject(
    context,
    objectId,
    organizationId,
    objectType,
    useRequestCache
  ) {
    const call = () =>
      dalV2Folder.getParentFoldersForObject(objectId, organizationId, objectType);
    if (!context || !useRequestCache) {
      return call();
    }
    const key = `${objectId}::${organizationId}::${objectType}`;
    let cache = context._parentFoldersForObjectCache;
    if (!cache) {
      cache = new Map();
      context._parentFoldersForObjectCache = cache;
    }
    if (!cache.has(key)) {
      cache.set(key, call());
    }
    return cache.get(key);
  }

  async function getParentFoldersForObject(context, args) {
    return v2DalSwitch(
      () => {
        return getTDOParentFolderId(args.objectId)
          .then((folderTreeObjectId) => {
            return serviceContext.dal.folder.getFolder(context, {
              organizationId: args.organizationId,
              id: folderTreeObjectId
            });
          })
          .then((result) => {
            if (result) {
              return [result];
            }
            return [];
          })
          .catch((err) => {
            if (err?.name === 'not_found') {
              return [];
            }
            throw err;
          });
      },
      () =>
        _v2ParentFoldersForObject(
          context,
          args.objectId,
          args.organizationId,
          args.objectType,
          args.useRequestCache
        ),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getParentFoldersTreeObjectIds(context, args) {
    return v2DalSwitch(
      () => getParentFoldersTreeObjectIdsV1(args.objectId),
      async () => {
        const parentFolders = await _v2ParentFoldersForObject(
          context,
          args.objectId,
          args.organizationId,
          args.objectType,
          args.useRequestCache
        );
        return parentFolders.map((f) => f.treeObjectId);
      },
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getParentFoldersTreeObjectIdsV1(objectId) {
    const _objectId = _.isString(objectId) ? objectId : _.toString(objectId);
    const sql = `
      SELECT tree_object_id
        FROM tree_object
        WHERE tree_object_id IN
              (SELECT parent_tree_object_id
               FROM tree_object_closure toc
                 JOIN tree_object to2 ON toc.child_tree_object_id = to2.tree_object_id
               WHERE to2.object_id = $1 AND to2.tree_object_status = $2)
       AND  tree_object_type_id = ${TREE_OBJECT_TYPE.FOLDER};
    `;
    const parentFolders = await dbConnections['media_platform'].read.query(
      sql,
      [_objectId, TREE_OBJECT_STATUS.ACTIVE]
    );
    if (!parentFolders.length) {
      return [];
    }
    return parentFolders.map((x) => x.tree_object_id);
  }

  async function getParentFolder(
    context,
    objectId,
    organizationId,
    isCollection,
    objectType
  ) {
    return v2DalSwitch(
      () => getParentFolderV1(objectId, organizationId, isCollection),
      () => dalV2Folder.getParentFolder(objectId, organizationId, objectType),
      context,
      organizationId
    );
  }

  async function getParentFolderV1(
    objectId,
    organizationId,
    isCollection = false
  ) {
    const _objectId = _.isString(objectId) ? objectId : _.toString(objectId);
    const sql = `
      SELECT *
        FROM tree_object
        WHERE tree_object_id IN
              (SELECT parent_tree_object_id
               FROM tree_object_closure toc
                 JOIN tree_object to2 ON toc.child_tree_object_id = to2.tree_object_id
               WHERE to2.object_id = $1 AND toc.depth = 1 AND to2.tree_object_status = $2);
    `;

    const parentFolders = await dbConnections['media_platform'].read.query(
      sql,
      [_objectId, TREE_OBJECT_STATUS.ACTIVE]
    );

    if (!parentFolders || !parentFolders[0]) return null;

    const options = {
      getTreeObjectId: parentFolders[0].tree_object_id,
      organizationId,
      isCollection
    };
    try {
      const folder = await _getFolder(options);
      return buildFolderStructure(folder, organizationId);
    } catch (err) {
      logger.error(err);
      throw new ServiceFailure({
        message: 'The server was unable to retrieve folder information.',
        data: {
          objectId: objectId
        }
      });
    }
  }

  async function getChildTDOs(context, args) {
    const orgId = _.get(args, 'input.organizationId', args.organizationId);
    return v2DalSwitch(
      () => getChildTDOsV1(context, args.treeObjectId, args),
      () => dalV2Folder.getChildTDOs(context, args),
      context,
      orgId
    );
  }

  async function getChildTDOsV1(context, treeObjectId, args) {
    const sql = `
      SELECT t.object_id
      FROM tree_object t
        JOIN tree_object_closure toc
         ON t.tree_object_id = toc.child_tree_object_id
      WHERE toc.parent_tree_object_id = $1 AND toc.depth = 1
        AND t.tree_object_type_id = ${TREE_OBJECT_TYPE.TDO}
        AND t.tree_object_status = ${TREE_OBJECT_STATUS.ACTIVE}
      ORDER BY t.object_id ASC
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30}
    `;

    const treeObjects = await dbConnections['media_platform'].read.query(sql, [
      treeObjectId
    ]);

    const ids = treeObjects.map((treeObject) => treeObject['object_id']);

    const res = await serviceContext.dal.tdo.getTDOs(context, {
      id: ids,
      limit: args.limit
    });
    res.offset = args.offset;
    res.limit = args.limit;
    return res;
  }

  async function getChildWatchlists(context, args) {
    const orgId = _.get(args, 'input.organizationId', args.organizationId);
    return v2DalSwitch(
      () => getChildWatchlistsV1(context, args.treeObjectId, args),
      () => dalV2Folder.getChildWatchlists(context, args),
      context,
      orgId
    );
  }

  async function getChildWatchlistsV1(context, treeObjectId, args) {
    const sql = `
      SELECT t.object_id, t.tree_object_id
      FROM tree_object t
        JOIN tree_object_closure toc
         ON t.tree_object_id = toc.child_tree_object_id
      WHERE toc.parent_tree_object_id = $1 AND toc.depth = 1
        AND t.tree_object_type_id = ${TREE_OBJECT_TYPE.WATCHLIST}
        AND t.tree_object_status = ${TREE_OBJECT_STATUS.ACTIVE}
      ORDER BY t.object_id ASC
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30}
    `;

    const treeObjects = await dbConnections['media_platform'].read.query(sql, [
      treeObjectId
    ]);

    if (_.isEmpty(treeObjects)) {
      return mainUtil.emptyPage(args);
    }

    const watchListTreeObjectIds = {};
    // Cache id we don't have to refetch folders per watchlist to get treeObjectId
    treeObjects.forEach((treeObject) => {
      watchListTreeObjectIds[treeObject['object_id']] =
        treeObject['tree_object_id'];
    });
    const ids = Object.keys(watchListTreeObjectIds);
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
    res.records.forEach(
      (watchlist) =>
        (watchlist.treeObjectId = watchListTreeObjectIds[watchlist.id])
    );

    return res;
  }

  async function getChildCollections(context, args) {
    const orgId = _.get(args, 'input.organizationId', args.organizationId);
    return v2DalSwitch(
      () => getChildCollectionsV1(context, args.treeObjectId, args),
      () => dalV2Folder.getChildCollections(context, args),
      context,
      orgId
    );
  }

  async function getChildCollectionsV1(context, treeObjectId, args) {
    const sql = `
      SELECT t.object_id, t.tree_object_id
      FROM tree_object t
        JOIN tree_object_closure toc
         ON t.tree_object_id = toc.child_tree_object_id
         INNER JOIN folder as f
         ON t.object_id = CAST(f.folder_id as text)
      WHERE toc.parent_tree_object_id = $1 AND toc.depth = 1
        AND t.tree_object_type_id = ${TREE_OBJECT_TYPE.COLLECTION}
        AND t.tree_object_status = ${TREE_OBJECT_STATUS.ACTIVE}
      ORDER BY t.object_id ASC
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30}
    `;

    const treeObjects = await dbConnections['media_platform'].read.query(sql, [
      treeObjectId
    ]);

    if (_.isEmpty(treeObjects)) {
      return mainUtil.emptyPage(args);
    }

    const collectionTreeObjectIds = {};
    // Cache id we don't have to refetch folders per collection to get treeObjectId
    treeObjects.forEach((treeObject) => {
      collectionTreeObjectIds[treeObject['object_id']] =
        treeObject['tree_object_id'];
    });
    const ids = Object.keys(collectionTreeObjectIds);
    const res = await serviceContext.dal.collection.getCollections(context, {
      ids: ids,
      limit: args.limit || 30,
      name: args.name
    });
    res.records.forEach(
      (collection) =>
        (collection.treeObjectId = collectionTreeObjectIds[collection.id])
    );
    return res;
  }

  async function getChildApplications(context, args) {
    const orgId = _.get(args, 'input.organizationId', args.organizationId);
    return v2DalSwitch(
      () => getChildApplicationV1(context, args.treeObjectId, args),
      () => dalV2Folder.getChildApplications(context, args),
      context,
      orgId
    );
  }

  async function getChildApplicationV1(context, treeObjectId, args) {
    const sql = `
      SELECT t.object_id, t.tree_object_id
      FROM tree_object t
        JOIN tree_object_closure toc
         ON t.tree_object_id = toc.child_tree_object_id
      WHERE toc.parent_tree_object_id = $1 AND toc.depth = 1
        AND t.tree_object_type_id = ${TREE_OBJECT_TYPE.APPLICATION}
        AND t.tree_object_status = ${TREE_OBJECT_STATUS.ACTIVE}
      ORDER BY t.object_id ASC
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || 30}
    `;

    const treeObjects = await dbConnections['media_platform'].read.query(sql, [
      treeObjectId
    ]);

    if (_.isEmpty(treeObjects)) {
      return mainUtil.emptyPage(args);
    }

    const applicationTreeObjectIds = {};
    // Cache id we don't have to refetch folders per application to get treeObjectId
    treeObjects.forEach((treeObject) => {
      applicationTreeObjectIds[treeObject['object_id']] =
        treeObject['tree_object_id'];
    });
    const ids = Object.keys(applicationTreeObjectIds);

    // retrieve applications for the appIds
    const res = await serviceContext.dal.application.getApplications(
      {
        ids: ids
      },
      context
    );

    res.records.forEach(
      (application) =>
        (application.treeObjectId = applicationTreeObjectIds[application.id])
    );
    return res;
  }

  async function getOrCreateOrgRootFolder(context, args) {
    return v1Tov2DalSwitch(
      () => getOrCreateOrgRootFolderV1(context, args),
      (v1Output) =>
        dalV2Folder.getOrCreateRootFolder(
          context,
          _customInputForV2(args, v1Output)
        ),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function getOrCreateOrgRootFolderV1(context, args) {
    const organizationId = args.organizationId,
      rootFolderTypeId = ROOT_FOLDER_TYPE[args.rootFolderType],
      newOrgRootFolderId = uuid.v4(),
      newOrgTreeObjectId = uuid.v4();

    if (!_.isNumber(organizationId)) {
      throw new InvalidInput({
        message: 'organizationId is required'
      });
    }

    if (!_.isNumber(rootFolderTypeId)) {
      throw new InvalidInput({
        message: 'rootFolderTypeId is required'
      });
    }

    const sql = `
      WITH org_root as (
      SELECT root_folder_id
        FROM root_folder
        WHERE organization_id = $1
        AND root_folder_type_id = $2
      ),
      ins_org_root as (
        INSERT INTO root_folder
        (root_folder_id, organization_id, root_folder_type_id)
        SELECT
        $3, $1, $2
        WHERE
        NOT EXISTS (
          SELECT root_folder_id FROM org_root
        )
        RETURNING root_folder_id
      ),
      treeObjectOrgSelect as (
        SELECT t_o.object_id, t_o.tree_object_id
          FROM tree_object t_o
        JOIN org_root r_f
        ON CAST(r_f.root_folder_id AS TEXT) = t_o.object_id
      ),
      treeObjectOrg AS (
        -- create tree object pointing to tree folder
        INSERT INTO tree_object (
        object_id,
        tree_object_type_id,
        tree_object_id,
        order_index,
        creation_date,
        last_updated_date,
        tree_object_status
        )
        SELECT
        (SELECT root_folder_id FROM ins_org_root),
        ${TREE_OBJECT_TYPE['ROOT_FOLDER']},
        $4,
        0,
        current_timestamp,
        current_timestamp,
        ${TREE_OBJECT_STATUS['ACTIVE']}
          WHERE
          NOT EXISTS (
            SELECT root_folder_id FROM org_root
          )
        RETURNING object_id, tree_object_id
      ),
        treeObjectClosureOrg AS (
        -- create tree structure
        INSERT INTO tree_object_closure (
          parent_tree_object_id,
          child_tree_object_id,
          depth
        )
        SELECT
          (SELECT tree_object_id FROM treeObjectOrg),
          (SELECT tree_object_id FROM treeObjectOrg),
          0

          WHERE
            NOT EXISTS (
            SELECT root_folder_id FROM org_root
            )
        RETURNING parent_tree_object_id,
          child_tree_object_id,
          depth
        ),
        new_r_f as (
          SELECT object_id, tree_object_id
          FROM treeObjectOrg
          UNION ALL
          SELECT object_id, tree_object_id
          FROM treeObjectOrgSelect
        )
         SELECT object_id, tree_object_id FROM new_r_f;
     `;
    const orgRootFolder = await dbConnections['media_platform'].write.query(
      sql,
      [organizationId, rootFolderTypeId, newOrgRootFolderId, newOrgTreeObjectId]
    );

    if (!_.isArray(orgRootFolder) || _.isEmpty(orgRootFolder)) {
      throw new errors.ServiceFailure({
        message: 'Failed to create root folder'
      });
    }
    orgRootFolder.forEach((folder) => {
      // Only log event if new folder was created
      if (newOrgRootFolderId === folder.object_id) {
        // emit event
        _emitPublicEvent(context, supportedEvents.FolderCreate, {
          id: folder.root_folder_id,
          name: folder.root_folder_name || folder.treeFolderName,
          typeId: folder.root_folder_type_id,
          organizationId: folder.organization_id
        });
      }
    });

    return await getFolderV1(orgRootFolder, {
      id: orgRootFolder[0].tree_object_id,
      organizationId
    });
  }

  async function getOrCreateUserRootFolder(context, args) {
    // T13: this used to run V1 and V2 creation concurrently via v2DalSwitch,
    // with the V2 call given the caller's raw args (no v1Output at all). That
    // let V2's "does a V1 user-root already exist" read race the V1 INSERT —
    // and even outside the race, V2 never learned the V1 id to reuse, so it
    // always minted its own uuid for user-roots created through this path
    // (e.g. User.rootFolder, queried as a side effect of an ordinary `user { }`
    // read, not just the createRootFolders mutation). Switched to
    // v1Tov2DalSwitch — the same pattern getOrCreateOrgRootFolder already uses
    // — so V1 completes first and its result is threaded into V2 as v1Output,
    // letting _buildUserRootFolderArgs reuse the real V1 id/tree_object_id
    // instead of relying on a same-instant independent lookup to win a race.
    return v1Tov2DalSwitch(
      () => getOrCreateUserRootFolderV1(context, args),
      (v1Output) =>
        dalV2Folder.getOrCreateRootFolder(
          context,
          _customInputForV2(args, v1Output)
        ),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function getOrCreateUserRootFolderV1(context, args) {
    const userId = args.userId,
      rootFolderTypeId = ROOT_FOLDER_TYPE[args.rootFolderType],
      newUserRootFolderId = uuid.v4(),
      newUserTreeObjectId = uuid.v4(),
      organizationId = _.get(
        context,
        'requestContext.userInfo.organization.organizationId'
      );

    if (!_.isString(userId)) {
      throw new InvalidInput({
        message: 'userId is required'
      });
    }

    if (!_.isNumber(rootFolderTypeId)) {
      throw new InvalidInput({
        message: 'rootFolderTypeId is required'
      });
    }

    const mediaPlatformTx = await dbUtil.dbWriteTx('media_platform');
    const ssoTx = await dbUtil.dbWriteTx('sso');

    try {
      await mediaPlatformTx.begin();
      await ssoTx.begin();

      const sql = `
      WITH user_root as (
        SELECT root_folder_id
            FROM root_folder
          WHERE user_id = $1
            AND root_folder_type_id = $2
        ),
      ins_user_root as (
        INSERT INTO root_folder
        (root_folder_id, user_id, root_folder_type_id)
        SELECT
        $3, $1, $2
        WHERE
        NOT EXISTS (
          SELECT root_folder_id FROM user_root
        )
        RETURNING root_folder_id
      ),
      treeObjectUserSelect as (
        SELECT t_o.object_id, t_o.tree_object_id
        FROM tree_object t_o
        JOIN user_root r_f
        ON CAST(r_f.root_folder_id AS TEXT) = t_o.object_id
      ),
      treeObjectUser AS (
        -- create tree object pointing to tree folder
        INSERT INTO tree_object (
        object_id,
        tree_object_type_id,
        tree_object_id,
        order_index,
        creation_date,
        last_updated_date,
        tree_object_status
        )
        SELECT
        (SELECT root_folder_id FROM ins_user_root),
        ${TREE_OBJECT_TYPE['ROOT_FOLDER']},
        $4,
        0,
        current_timestamp,
        current_timestamp,
        ${TREE_OBJECT_STATUS['ACTIVE']}
        WHERE
          NOT EXISTS (
          SELECT root_folder_id FROM user_root
          )
      RETURNING object_id, tree_object_id
      ),
      treeObjectClosureUser AS (
      -- create tree structure
      INSERT INTO tree_object_closure (
        parent_tree_object_id,
        child_tree_object_id,
        depth
      )
      SELECT
        (SELECT tree_object_id FROM treeObjectUser),
        (SELECT tree_object_id FROM treeObjectUser),
        0

        WHERE
          NOT EXISTS (
          SELECT root_folder_id FROM user_root
          )
      RETURNING parent_tree_object_id,
        child_tree_object_id,
        depth
      ),
      new_r_f as (
        SELECT object_id, tree_object_id
        FROM treeObjectUser
        UNION ALL
        SELECT object_id, tree_object_id
        FROM treeObjectUserSelect
      )
      SELECT object_id, tree_object_id FROM new_r_f;
    `;
      const userRootFolder = await mediaPlatformTx.client.query(sql, [
        userId,
        rootFolderTypeId,
        newUserRootFolderId,
        newUserTreeObjectId
      ]);

      if (!_.isArray(userRootFolder) || _.isEmpty(userRootFolder)) {
        throw new errors.ServiceFailure({
          message: 'Failed to get or create root folder',
          data: {
            query: sql,
            values: [
              userId,
              rootFolderTypeId,
              newUserRootFolderId,
              newUserTreeObjectId
            ]
          }
        });
      }

      for (const folder of userRootFolder) {
        // Only log event if new folder was created
        if (newUserRootFolderId === folder.object_id) {
          // emit event
          _emitPublicEvent(context, supportedEvents.FolderCreate, {
            id: folder.object_id,
            name: folder.root_folder_name || folder.treeFolderName,
            typeId: folder.root_folder_type_id,
            organizationId: organizationId
          });

          // add default ACEs to user CMS root folder
          if (rootFolderTypeId === ROOT_FOLDER_TYPE.cms) {
            const rbacArgs = {
              organizationId: organizationId,
              objectId: folder.object_id,
              resourceType: 'Folder',
              ownerId: userId
            };
            const dbClients = {
              sso: ssoTx.client,
              media_platform: mediaPlatformTx.client
            };
            await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs, {
              dbClients
            });
          }
        }
      }

      await mediaPlatformTx.commit();
      await ssoTx.commit();

      return await getFolderV1(userRootFolder, {
        id: userRootFolder[0].tree_object_id,
        userId,
        organizationId
      });
    } catch (err) {
      await mediaPlatformTx.rollback();
      await ssoTx.rollback();
      serviceContext.logger.error(
        'Failed to create user root folder with ACEs: ',
        err
      );
      throw err;
    } finally {
      mediaPlatformTx.done();
      ssoTx.done();
    }
  }

  /**
   * Returns all folders shared with the current organization
   *
   * @param context
   * @param args
   * @returns {Promise<void>}
   */
  async function getSharedFolders(context, args) {
    if (!args.organizationId) {
      throw new InvalidInput({
        message: 'organizationId is required'
      });
    }

    return v2DalSwitch(
      () => getSharedFoldersV1(context, args),
      () => serviceContext.dal.folderV2.getSharedFolders(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getSharedFoldersV1(context, args) {
    const options = {
      organizationId: args.organizationId,
      authorizedOrganizationIds: args.authorizedOrganizationIds
    };

    const sharedFolders = await _getSharedWithFolders(options);

    if (_.isEmpty(sharedFolders)) {
      return [];
    }
    options.getTreeObjectIds = _.map(sharedFolders, 'tree_object_id');
    // This query fetches the rootFolder and one depth of subfolders
    // so we need to do the folder -> subfolder mapping in code.
    const folders = await _getFolders(
      options,
      dalUtil.buildQueryPlaceholders(1, options.getTreeObjectIds.length)
    );

    let mappedFolders = folders.map(mapper.mapFolder);
    return mapSubfoldersIntoParentFolders(mappedFolders);
  }

  function mapSubfoldersIntoParentFolders(mappedFolders) {
    const folderMap = {};

    _.forEach(mappedFolders, (folder) => {
      folderMap[folder.treeObjectId] = mapper.mapFolder(folder);
    });

    _.forEach(mappedFolders, (folder) => {
      const parentFolder = folderMap[folder.parentTreeObjectId];
      if (parentFolder && folder.parentTreeObjectId !== folder.treeObjectId) {
        if (!_.isArray(parentFolder.subfolders)) {
          parentFolder.subFolders = [];
        }
        parentFolder.subFolders.push(folder);
        delete folderMap[folder.treeObjectId];
      }
    });

    return _.values(folderMap);
  }

  async function shareFolder(context, args) {
    return v2DalSwitch(
      () => shareFolderV1(context, args),
      () => serviceContext.dal.folderV2.shareFolder(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function shareFolderV1(context, args) {
    const sharedWith = {};

    let treeObjectId = args.input.treeObjectId;
    const folderId = args.input.folderId;
    if (!_.isNil(folderId)) {
      // using the new folderId field
      treeObjectId = await getTreeObjectId(folderId);
    }

    mainUtil.checkId(treeObjectId, false, false, true);

    if (!_.isEmpty(args.input.readOrganizationIds)) {
      sharedWith.read = args.input.readOrganizationIds;
    }
    if (!_.isEmpty(args.input.writeOrganizationIds)) {
      sharedWith.write = args.input.writeOrganizationIds;
    }

    if (_.isEmpty(sharedWith)) {
      throw new InvalidInput({
        message: 'read or write organizationIds are required'
      });
    } else {
      const orgsToShareWith = _.union(
        _.get(args, 'input.readOrganizationIds', []),
        _.get(args, 'input.writeOrganizationIds', [])
      );
      const existingOrgs =
        await serviceContext.dal.organization.getOrganizations(context, {
          id: orgsToShareWith
        });
      const diff = _.difference(
        orgsToShareWith.map((o) => o.toString()),
        _.get(existingOrgs, 'records', []).map((o) => o.id.toString())
      );
      if (diff.length > 0) {
        throw new errors.InvalidInput({
          message: 'Some organizations to share folder with do not exist.',
          data: {
            objectType: 'shareFolder',
            objectId: diff
          }
        });
      }
    }

    const sql = `UPDATE tree_object SET shared_with = $1 WHERE tree_object_id = $2 RETURNING tree_object_id`;
    const updatedFolder = await dbConnections['media_platform'].write.query(
      sql,
      [sharedWith, treeObjectId]
    );

    return getFolderV1(context, {
      organizationId: args.input.organizationId,
      id: treeObjectId
    });
  }

  async function createFolderContentTemplate(context, args) {
    return v2DalSwitch(
      () => createFolderContentTemplateV1(context, args),
      () => dalV2Folder.createFolderContentTemplate(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function createFolderContentTemplateV1(context, args) {
    if (!args.input)
      throw new errors.InvalidInput({
        message: 'input parameter is required.'
      });
    mainUtil.checkId(args.input.folderId, false, false, true);
    mainUtil.checkId(args.input.sdoId, false, false, true);
    mainUtil.checkId(args.input.schemaId, false, false, true);

    // Check get tree object from folder id
    const treeObjectId = await getTreeObjectId(args.input.folderId);
    const folderId = treeObjectId || args.input.folderId;
    const nowDate = new Date();
    const contentTemplate = [
      folderId,
      args.input.sdoId,
      args.input.schemaId,
      nowDate,
      nowDate
    ];

    const folderContentTemplates = await getFolderContentTemplatesV1(context, {
      folderId: folderId
    });
    const dupe = _.filter(
      folderContentTemplates,
      (ct) => ct.sdoId === args.input.sdoId
    );
    if (!_.isEmpty(dupe)) {
      return dupe[0];
    }

    const sql = `
      INSERT INTO tree_object_content_template (
        tree_object_id,
        sdo_id,
        data_registry_id,
        creation_date,
        last_updated_date
      )
      SELECT $1, $2, $3, $4, $5
      RETURNING *;
      `;
    const newFolderContentTemplateDb = await dbConnections[
      'media_platform'
    ].write.query(sql, contentTemplate);

    return mapper.mapFolderContentTemplate(newFolderContentTemplateDb[0]);
  }

  async function validateUpdateDeleteFolderContentTemplateInput(context, args) {
    const schemaId = _.get(args, 'input.schemaId');
    let sdoId = _.get(args, 'input.sdoId');
    let folderId = _.get(args, 'input.folderId');
    let id = _.get(args, 'input.id', args.id);
    let isIdV2 = false;

    mainUtil.checkId(folderId, true, false, true);
    mainUtil.checkId(sdoId, true, false, true);
    mainUtil.checkId(schemaId, true, false, true);

    // contentTemplateId from v2 should build from folderId and sdoId
    if (!id) {
      if (!folderId || !sdoId) {
        throw new InvalidInput({
          message: 'the content template id is required',
          data: {
            objecType: 'contentTemplateId',
            objectId: id
          }
        });
      }

      isIdV2 = true;
      id = mapper.getContentTemplateIdForV2Folder(folderId, sdoId);
    } else {
      isIdV2 = id.indexOf('::') >= 0;
    }

    if (!id) {
      throw new InvalidInput({
        message: 'the content template id is required',
        data: {
          objecType: 'contentTemplateId',
          objectId: id
        }
      });
    }

    let newArgs;
    // v1 folder
    if (!isIdV2) {
      if (!validator.isUUID(id)) {
        throw new InvalidInput({
          message: 'the content template id is invalid',
          data: {
            objecType: 'contentTemplateId',
            objectId: id
          }
        });
      }

      // 1. get content template by v1 id
      const contentTemplate = await getFolderContentTemplateById(id);
      if (!contentTemplate.length) {
        throw new errors.NotFound({
          message: 'The content template was not found or deleted.',
          data: {
            objectId: id,
            objectType: 'Folder Content Template'
          }
        });
      }
      // 2. build new input for v1, v2
      newArgs = {
        input: {
          folderId: folderId ? folderId : contentTemplate[0].folderId,
          sdoId: sdoId ? sdoId : contentTemplate[0].sdoId,
          schemaId: schemaId ? schemaId : contentTemplate[0].schemaId,
          id: id
        }
      };
    } else {
      // v2 folder
      // split to get folderId & sdo Id from contentTemplateId
      const ids = dalV2Folder.contentTemplateIdToFolderSdo(id);
      const v2FolderId = ids.folderId || folderId;
      sdoId = ids.sdoId || sdoId;

      // 1. get content template by folderId, sdoId
      // 1.1 get folder
      const treeObjectId = await getTreeObjectId(v2FolderId);
      // 1.2 get content template by tree object id, sdo id
      const contentTemplate =
        await _getFolderContentTemplateByTreeObjectAndSdoId(
          treeObjectId,
          sdoId
        );
      if (!contentTemplate.length) {
        throw new errors.NotFound({
          message: 'The content template was not found or deleted.',
          data: {
            treeObjectId: treeObjectId,
            sdoId: sdoId,
            objectType: 'Folder Content Template'
          }
        });
      }
      // 2. build new input for v1, v2
      newArgs = {
        input: {
          folderId: treeObjectId,
          sdoId: sdoId ? sdoId : contentTemplate[0].sdoId,
          schemaId: schemaId ? schemaId : contentTemplate[0].schemaId,
          id: contentTemplate[0].id
        },
        v2Input: {
          folderId: v2FolderId,
          sdoId: sdoId ? sdoId : contentTemplate[0].sdoId,
          schemaId: schemaId ? schemaId : contentTemplate[0].schemaId,
          id
        }
      };
    }

    // map content template id to folderId and sdoId
    // in v2 the contentTemplateId is just an amalgamation of the two ids
    return _.merge(args, newArgs);
  }

  async function updateFolderContentTemplate(context, _args) {
    const args = await validateUpdateDeleteFolderContentTemplateInput(
      context,
      _args
    );

    return v2DalSwitch(
      () => updateFolderContentTemplateV1(context, args),
      () => {
        const _v2Input = args.v2Input;
        const v2Args = _.merge(args, { input: _v2Input });
        return dalV2Folder.updateFolderContentTemplate(context, v2Args);
      },
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function updateFolderContentTemplateV1(context, args) {
    const sdoId = _.get(args, 'input.sdoId');
    const schemaId = _.get(args, 'input.schemaId');
    const folderId = _.get(args, 'input.folderId');
    const contentTemplateId = _.get(args, 'input.id');

    mainUtil.checkId(contentTemplateId, false, false, true);
    const _args = [sdoId, schemaId, new Date(), folderId, contentTemplateId];

    const sql = `
      UPDATE 	tree_object_content_template
      SET sdo_id = $1,
          data_registry_id = $2,
          last_updated_date = $3,
          tree_object_id = $4
      WHERE tree_object_content_template_id = $5
        and deleted_date is null
      RETURNING *;
    `;

    const updatedFolderContentTemplate = await dbConnections[
      'media_platform'
    ].write.query(sql, _args);

    if (!updatedFolderContentTemplate.length) {
      throw new NotFound({
        message: 'The content template was not found or deleted.',
        data: {
          objectId: contentTemplateId,
          objectType: 'Folder Content Template'
        }
      });
    }
    return mapper.mapFolderContentTemplate(updatedFolderContentTemplate[0]);
  }

  async function getFolderContentTemplates(context, args) {
    return v2DalSwitch(
      () => getFolderContentTemplatesV1(context, args),
      () => dalV2Folder.getFolderContentTemplates(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getFolderContentTemplatesV1(context, args) {
    mainUtil.checkId(args.folderId, false, false, true);

    const sql = `
      SELECT
        tree_object_content_template_id,
        tree_object_id,
        sdo_id,
        data_registry_id,
        creation_date,
        last_updated_date
      FROM tree_object_content_template
      WHERE tree_object_id = $1
        AND deleted_date is null;
      `;

    const folderContentTemplates = await dbConnections[
      'media_platform'
    ].read.query(sql, [args.folderId]);

    return folderContentTemplates.map(mapper.mapFolderContentTemplate);
  }

  async function getFolderContentTemplateById(id) {
    mainUtil.checkId(id, false, false, true);

    const sql = `
      SELECT
        tree_object_content_template_id,
        tree_object_id,
        sdo_id,
        data_registry_id,
        creation_date,
        last_updated_date
      FROM tree_object_content_template
      WHERE tree_object_content_template_id = $1;
      `;

    const folderContentTemplates = await dbConnections[
      'media_platform'
    ].read.query(sql, [id]);

    return folderContentTemplates.map(mapper.mapFolderContentTemplate);
  }

  async function _getFolderContentTemplateByTreeObjectAndSdoId(
    treeObjectId,
    sdoId
  ) {
    mainUtil.checkId(treeObjectId, false, false, true);
    mainUtil.checkId(sdoId, false, false, true);

    const sql = `
      SELECT
        tree_object_content_template_id,
        tree_object_id,
        sdo_id,
        data_registry_id,
        creation_date,
        last_updated_date
      FROM tree_object_content_template
      WHERE tree_object_id = $1 AND sdo_id = $2
      LIMIT 1;
      `;

    const folderContentTemplates = await dbConnections[
      'media_platform'
    ].read.query(sql, [treeObjectId, sdoId]);

    return folderContentTemplates.map(mapper.mapFolderContentTemplate);
  }

  function evilInsertTreeObject(dbConn, options) {
    // @todo add
    var sql = `
  	-- Step 1: Insert records to represent new folder as a tree object
  	  WITH    updateTreeObject AS (
  		UPDATE tree_object
  		SET order_index = order_index + 1
  		WHERE tree_object_id
  		IN (
  		  SELECT child_tree_object_id
  		  FROM tree_object_closure closure
  		  WHERE closure.parent_tree_object_id = '${options.parentTreeObjectId}'--options.parentTreeObjectId
  		  AND depth = 1
  		)
  		AND tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
  		AND order_index >= ${options.orderIndex}
  	  ),
  	  treeObject AS (
  		-- create tree object
  		INSERT INTO tree_object (
  		  object_id,
  		  tree_object_type_id,
  		  tree_object_id,
  		  order_index,
  		  creation_date,
  		  last_updated_date,
  		  tree_object_status
  		)
  		VALUES (
  		  '${options.objectId}',
  		  ${options.treeObjectTypeId},
  		  '${options.newTreeObjectId}',
  		  ${options.orderIndex},
  		  current_timestamp,
  		  current_timestamp,
  		  ${TREE_OBJECT_STATUS['ACTIVE']}
  		)
  		RETURNING *
  	  ),
  	  treeObjectClosure AS (
  		-- create tree structure
  		INSERT INTO tree_object_closure (
  		  parent_tree_object_id,
  		  child_tree_object_id,
  		  depth
  		)
  		VALUES (
  		  (SELECT tree_object_id FROM treeObject),
  		  (SELECT tree_object_id FROM treeObject),
  		  0
  		)
  		RETURNING *
  	  ),
  	  updateParentDepth as (
  		  INSERT INTO tree_object_closure (depth, child_tree_object_id, parent_tree_object_id)
  		  SELECT depth + 1, (select tree_object_id from treeObject), parent_tree_object_id
  			FROM tree_object_closure
  				WHERE child_tree_object_id = '${options.parentTreeObjectId}'--options.parentTreeObjectId
  				--AND parent_tree_object_id != '${options.parentTreeObjectId}'--options.parentTreeObjectId
  		  RETURNING *
  	  )
  	SELECT *
  	FROM treeObject;
    `;

    return dbConn.query(sql, options);
  }

  async function deleteFolderContentTemplate(context, _args) {
    const args = await validateUpdateDeleteFolderContentTemplateInput(
      context,
      _args
    );

    return v2DalSwitch(
      () => deleteFolderContentTemplateV1(context, args),
      () => {
        const _v2Input = args.v2Input;
        const v2Args = _.merge(args, { input: _v2Input });
        return dalV2Folder.deleteFolderContentTemplate(context, v2Args);
      },
      context,
      _.get(args, 'input.organizationId', args.organizationId),
      true
    );
  }

  async function deleteFolderContentTemplateV1(context, args) {
    const contentTemplateId = _.get(args, 'input.id', 'id');

    if (!contentTemplateId) {
      throw new InvalidInput({
        message: 'Content Template ID is required'
      });
    }

    const contentTemplate = {
      id: contentTemplateId,
      deletedDate: new Date()
    };

    if (!validator.isUUID(contentTemplate.id)) {
      throw new NotFound({
        message:
          'Invalid ID format ' +
          contentTemplate.id +
          '. A contentTemplateId must be a UUID.'
      });
    }

    const sql = `
        UPDATE	tree_object_content_template
        SET 	  deleted_date = $2
        WHERE 	tree_object_content_template_id = $1
          AND   deleted_date is null
        RETURNING *
      `;

    const deletedFolderContentTemplate = await dbConnections[
      'media_platform'
    ].write.query(sql, [contentTemplate.id, contentTemplate.deletedDate]);

    if (!deletedFolderContentTemplate.length) {
      throw new errors.NotFound({
        message:
          'The folder content template does not exist or has already been deleted.',
        data: {
          objectType: 'FolderContentTemplate',
          objectId: args.id
        }
      });
    }

    return {
      id: args.id
    };
  }

  async function getParentFolders(context, args) {
    return v2DalSwitch(
      () => getFolderPath(context, args),
      () => dalV2Folder.getParentFolders(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getFolderPath(context, args) {
    const sql = `
SELECT
  c.parent_tree_object_id AS id,
  t.tree_object_type_id
FROM
  tree_object_closure c
  INNER JOIN tree_object t ON c.parent_tree_object_id = t.tree_object_id
WHERE
  c.child_tree_object_id = $1::UUID
ORDER BY c.depth DESC
    `;
    const sqlArgs = [args.treeObjectId];
    const rows = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      sqlArgs,
      mapper.mapFolder
    );

    const res = [];
    const organizationId = _.get(
      context,
      '_authInfo.organization.organizationId'
    );
    const userId = _.get(context, 'requestContext.userInfo.userId');

    for (let i = 0; i < rows.length; i++) {
      const id = rows[i].id;
      const isRootFolder =
        rows[i].tree_object_type_id === TREE_OBJECT_TYPE.ROOT_FOLDER_TYPE;

      const f = isRootFolder
        ? await getFolderV1(context, {
            id,
            organizationId: organizationId,
            userId: userId
          })
        : await getRootFoldersV1(context, {
            id,
            organizationId: organizationId,
            userId: userId
          });
      res.push(f);
    }
    return res;
  }

  // removes a TDO that's already been retrieved and
  // authorized from all folders. needed for delete.
  // VTN-14549 - the update was happening MOST of the time
  // already (TODO how? no code or db trigger found)
  // but apparently not always. here we make it explicit.
  async function removeTDOFromFolders(context, tdo) {
    return v2DalSwitch(
      () => removeTDOFromFoldersV1(context, tdo),
      () => dalV2Folder.removeTDOFromFolders(context, tdo.id),
      context,
      null,
      true
    );
  }

  async function removeTDOFromFoldersV1(context, tdo) {
    const sql = `
UPDATE tree_object
SET tree_object_status = ${TREE_OBJECT_STATUS.INACTIVE}
WHERE
  object_id = $1 AND
  tree_object_type_id = ${TREE_OBJECT_TYPE.TDO} AND
  tree_object_status = ${TREE_OBJECT_STATUS.ACTIVE}
RETURNING tree_object_id
    `;
    const res = await serviceContext.dbConnections[
      'media_platform'
    ].write.query(sql, [_.toString(tdo.id)]);
    return res;
  }

  async function getFolderOverview(context, args) {
    return v2DalSwitch(
      () => getFolderOverviewV1(context, args),
      () => dalV2Folder.getFolderOverview(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getFolderOverviewV1(context, args) {
    const options = {
      treeObjectIds: args.ids,
      organizationId: args.organizationId,
      userId: _.get(context, 'requestContext.userInfo.userId'),
      rootFolderType: args.rootFolderType,
      includeSharedReadAcess: true
    };

    const access = await _validateAccess(options);
    if (access.length !== args.ids.length) {
      throw new NotFound({
        message: 'Tree object not found',
        data: {
          objectIds: _.difference(
            args.ids,
            access.map((row) => row.child_tree_object_id)
          ),
          objectType: 'Folder'
        }
      });
    }
    const sql = `WITH allChildObjects as (
				SELECT tree_object_type_id, tree_object_id from tree_object_closure
				left join tree_object on tree_object_id = child_tree_object_id
				where parent_tree_object_id = ANY($1::uuid[])
				and depth > 0
				and tree_object_status = $2
				),
				folderChildren as (
				select count(*) as child_folders_count from allChildObjects
				where tree_object_type_id = $3
				),
				watchlistChildren as (
				select count(*) as child_non_folder_objects_count from allChildObjects
				where tree_object_type_id = $4
				),
				watchlistChildrenIds as (
					select array_agg(tree_object_id) as tree_object_ids from allChildObjects
					where tree_object_type_id = $4
				)
				select * from folderChildren, watchlistChildren, watchlistChildrenIds;`;
    const variables = [
      args.ids,
      TREE_OBJECT_STATUS['ACTIVE'],
      TREE_OBJECT_TYPE['FOLDER'],
      TREE_OBJECT_TYPE['WATCHLIST']
    ];
    const res = await dbRead.map(sql, variables, mapper.camelizeRootKeys);
    return _.get(res, '0', {});
  }

  async function getFolderSummaryDetails(context, args) {
    return v2DalSwitch(
      () => getFolderSummaryDetailsV1(context, args),
      () => dalV2Folder.getFolderSummaryDetails(context, args),
      context,
      _.get(args, 'input.organizationId', args.organizationId)
    );
  }

  async function getFolderSummaryDetailsV1(context, args) {
    const { ids } = args;

    const options = {
      treeObjectIds: args.ids,
      organizationId: args.organizationId,
      userId: _.get(context, 'requestContext.userInfo.userId'),
      rootFolderType: args.rootFolderType,
      includeSharedReadAcess: true
    };
    const access = await _validateAccess(options);
    if (access.length !== args.ids.length) {
      throw new NotFound({
        message: 'Tree object not found',
        data: {
          objectIds: _.difference(
            args.ids,
            access.map((row) => row.child_tree_object_id)
          ),
          objectType: 'Folder'
        }
      });
    }
    const sql = /* sql */ `
			with allWatchlistObjects as (
			select tree_object_type_id, last_updated_date, tree_object_id, object_id, depth, order_index, creation_date,
			(select max(depth) from tree_object_closure where child_tree_object_id = tree_object_id) as real_depth,
			(SELECT COUNT(child_tree_object_id) FROM tree_object_closure
				left join tree_object sub_tobj
				on sub_tobj.tree_object_id = child_tree_object_id
				WHERE parent_tree_object_id = t_obj.tree_object_id
				AND depth > 0
				AND sub_tobj.tree_object_status = $1
				AND sub_tobj.tree_object_type_id = $2
				) as child_folders_count,
			(SELECT COUNT(child_tree_object_id) FROM tree_object_closure
				left join tree_object sub_tobj
				on sub_tobj.tree_object_id = child_tree_object_id
				WHERE parent_tree_object_id = t_obj.tree_object_id
				AND depth > 0
				AND sub_tobj.tree_object_status = $1
				AND sub_tobj.tree_object_type_id = $3
				) as child_non_folder_objects_count,
			ARRAY(SELECT object_id FROM tree_object_closure
				left join tree_object sub_tobj
				on sub_tobj.tree_object_id = child_tree_object_id
				WHERE parent_tree_object_id = t_obj.tree_object_id
				AND depth > 0
				AND sub_tobj.tree_object_status = $1
				AND sub_tobj.tree_object_type_id = $3
				) as child_watchlists_ids
			from tree_object_closure
			left join tree_object t_obj on tree_object_id = child_tree_object_id
			where parent_tree_object_id = ANY($4::uuid[])
			and tree_object_status = $1
			--ORDER BY real_depth, order_index
			),
			trackingUnitSummary as (
			select tree_object_id, tracking_unit_name, fingerprints, tracking_unit_start_date, tracking_unit_stop_date,
			ARRAY(select owner_user_id from cognitive_profile cp
				left join tracking_unit tu on tu.tracking_unit_id = cp.tracking_unit_id
				where tu.tracking_unit_id = m_tu.tracking_unit_id
				AND char_length(owner_user_id) > 35) as created_by,

			-- Seems like this always returns null after v3 search
			-- ARRAY(select json from cognitive_profile cp
			--  left join tracking_unit tu on tu.tracking_unit_id = cp.tracking_unit_id
			--	where tu.tracking_unit_id = m_tu.tracking_unit_id) as search_terms,

			media_source_type_ids, track_my_programs,
      (SELECT
        CASE
          WHEN jsonb_typeof(tracking_unit_details->'marketIds') = 'array' THEN JSONB_ARRAY_LENGTH(tracking_unit_details->'marketIds')
          ELSE 0
        END
      FROM tracking_unit tu
      WHERE tu.tracking_unit_id = m_tu.tracking_unit_id) as market_count,
			(select count(*) from tracking_unit_program
			where tracking_unit_id = m_tu.tracking_unit_id) as number_of_programs
			from tracking_unit m_tu
			left join tree_object t_obj on t_obj.object_id = tracking_unit_id::text
			where tracking_unit_id::text in (select object_id from allWatchlistObjects)
			)
			select * from trackingUnitSummary summary right join allWatchlistObjects objects on objects.tree_object_id = summary.tree_object_id ORDER BY tree_object_type_id desc, object_id desc;
	  `;

    const variables = [
      TREE_OBJECT_STATUS['ACTIVE'],
      TREE_OBJECT_TYPE['FOLDER'],
      TREE_OBJECT_TYPE['WATCHLIST'],
      ids
    ];
    const res = await dbRead.map(sql, variables, mapper.camelizeRootKeys);
    return res;
  }

  async function _getFolder(options) {
    if (!_.isObject(options)) {
      throw new errors.InvalidInput({
        message: 'Missing options object'
      });
    }

    if (!options.getTreeObjectId) {
      throw new errors.InvalidInput({
        message: 'Missing get folder tree object id'
      });
    }
    // @todo add depth and object type as params
    var sql = 'SELECT ';
    var join = `
          LEFT JOIN tree_folder t_f
            ON CAST(t_obj.object_id AS TEXT) = CAST(t_f.tree_folder_id AS TEXT)
            AND t_obj.tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
          INNER JOIN tree_object_closure t_c
            ON t_c.child_tree_object_id = t_obj.tree_object_id
            AND t_c.depth <= 1
            AND t_obj.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
          LEFT JOIN root_folder r_f
            ON CAST(r_f.root_folder_id AS TEXT) = CAST(t_obj.object_id AS TEXT) `;
    if (options.isCollection) {
      sql += 'fd.*, ';
      join += ` LEFT JOIN folder fd
            ON CAST(t_obj.object_id AS TEXT) = CAST(fd.folder_id as TEXT)
            AND t_obj.tree_object_type_id = ${TREE_OBJECT_TYPE['COLLECTION']} `;
    } else {
      sql += 't_u.*, ';
      join += ` LEFT JOIN tracking_unit t_u
            ON CAST(t_obj.object_id AS TEXT) = CAST(t_u.tracking_unit_id as TEXT)
            AND t_obj.tree_object_type_id = ${TREE_OBJECT_TYPE['WATCHLIST']} `;
    }
    sql +=
      ` t_f.*, t_c.*, t_c.depth, t_c.child_tree_object_id, r_f.*, t_obj.*,
            (SELECT MAX(depth) FROM tree_object_closure
            INNER JOIN tree_object sub_tobj
              ON sub_tobj.tree_object_id = child_tree_object_id
              AND sub_tobj.tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
              AND sub_tobj.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
            WHERE parent_tree_object_id = t_c.child_tree_object_id
            ) AS max_depth,--want max depth of folders
            (SELECT count(tree_object_id) from tree_object AS t_o
            WHERE t_o.tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
            AND t_o.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
            AND t_o.tree_object_id in
              (SELECT child_tree_object_id FROM tree_object_closure WHERE parent_tree_object_id = t_obj.tree_object_id and depth > 0)
            AND (SELECT MAX(depth) FROM tree_object_closure WHERE parent_tree_object_id = t_obj.tree_object_id) > 0) AS has_sub_folder,
            (SELECT organization_name FROM organization WHERE organization_id = r_f.organization_id) as root_folder_organization_name ` +
      sharedWithQuery(options.organizationId) +
      ` FROM
            tree_object t_obj ` +
      join +
      ` WHERE t_c.parent_tree_object_id = $1
          AND t_obj.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
          ORDER BY parent_tree_object_id, depth, order_index;
          `;
    const dbRead = dbConnections[connectionStringKeys.folder].read;
    // @todo move db connection, query, params to util
    const dbResults = await dbRead.query(sql, [options.getTreeObjectId]);

    if ('object' !== typeof dbResults || !Array.isArray(dbResults)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResults array'
      });
    }
    return dbResults;
  }

  /* istanbul ignore next */
  async function _createFolder(options) {
    if (!_.isObject(options) || options.constructor !== model.Folder) {
      throw new errors.InvalidInput({
        message: 'Missing options (should be a model.Folder instance)'
      });
    }
    // options.newTreeObjectId = uuid.v4();
    // options.newTreeFolderId = uuid.v4();
    const dbWrite = dbConnections[connectionStringKeys.folder].write;
    var sql = `
        -- Step 1: Insert records to represent new folder as a tree object
          WITH    updateTreeObject AS (
          UPDATE tree_object
          SET order_index = order_index + 1
          WHERE tree_object_id
          IN (
            SELECT child_tree_object_id
            FROM tree_object_closure closure
            WHERE closure.parent_tree_object_id = '${options.parentTreeObjectId}'--options.parentTreeObjectId
            AND depth = 1
          )
          and tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
          AND order_index >= ${options.orderIndex}
          ),
          treeFolder AS (
          -- create tree folder
          INSERT INTO tree_folder (
            tree_folder_id,
            tree_folder_name,
            tree_folder_description
          )
          VALUES (
            '${options.newTreeFolderId}',
            $1,--options.treeFolderName
            $2--options.treeFolderDescription

          )
          RETURNING *
          ),
          treeObject AS (
          -- create tree object pointing to tree folder
          INSERT INTO tree_object (
            object_id,
            tree_object_type_id,
            tree_object_id,
            order_index,
            creation_date,
            last_updated_date,
            tree_object_status
          )
          VALUES (
            (SELECT tree_folder_id FROM treeFolder),
            ${TREE_OBJECT_TYPE['FOLDER']},
            '${options.newTreeObjectId}',
            ${options.orderIndex}, --options.order
            current_timestamp,
            current_timestamp,
            ${TREE_OBJECT_STATUS['ACTIVE']}
          )
          RETURNING tree_object_id, order_index, tree_object_type_id
          ),
          treeObjectClosure AS (
          -- create tree structure
          INSERT INTO tree_object_closure (
            parent_tree_object_id,
            child_tree_object_id,
            depth
          )
          VALUES (
            (SELECT tree_object_id FROM treeObject),
            (SELECT tree_object_id FROM treeObject),
            0
          )
          RETURNING *
          ),
          updateParentDepth as (
            INSERT INTO tree_object_closure (depth, child_tree_object_id, parent_tree_object_id)
            SELECT depth + 1, (select tree_object_id from treeObject), parent_tree_object_id
            FROM tree_object_closure
              WHERE child_tree_object_id = '${options.parentTreeObjectId}'--options.parentTreeObjectId
              --AND parent_tree_object_id != '${options.parentTreeObjectId}'--options.parentTreeObjectId
            RETURNING *
          )

        SELECT treeObject.*, treeFolder.*, updateParentDepth.* FROM treeObject, treeFolder
        JOIN updateParentDepth
        ON parent_tree_object_id = '${options.parentTreeObjectId}';
        `;
    const dbResult = await dbWrite.query(sql, [
      options.treeFolderName,
      options.treeFolderDescription
    ]);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (dbResult.length !== 1) {
      throw new errors.InternalServerError({
        message:
          'Expected 1 folder to be created but ' +
          dbResult.length +
          ' were created'
      });
    }
    return dbResult;
  }

  /* istanbul ignore next */
  function sharedWithQuery(organizationId, tableShortName) {
    var sharedWithSql = ``;
    var tableName = tableShortName || `t_obj`;
    if (organizationId) {
      // change response back to write when write access is ready, for now all will return read.
      sharedWithSql = `, (CASE WHEN ${tableName}.shared_with@> '{"read": [${organizationId}]}' THEN 'read'
                    WHEN  ${tableName}.shared_with@> '{"write": [${organizationId}]}' THEN 'read'
                    ELSE null END) as shared_access`;
    }
    return sharedWithSql;
  }

  /* istanbul ignore next */
  async function _getFolders(options, params, dbClient) {
    if (!options || !_.isObject(options)) {
      throw new errors.InvalidInput({
        message: 'Missing get folders requirement: options'
      });
    }

    if (!options.getTreeObjectIds) {
      throw new errors.InvalidInput({
        message: 'Missing get folders requirement: getTreeObjectIds'
      });
    }

    if (!params) {
      throw new errors.InvalidInput({
        message: 'Missing get folders requirement: params'
      });
    }

    if (!Array.isArray(options.getTreeObjectIds)) {
      throw new errors.InvalidInput({
        message:
          'Invalid folders requirement: getTreeObjectIds must be an array'
      });
    }
    var sql =
      `
          SELECT t_u.*, t_f.*, t_c.*, t_obj.*, r_f.*,
              (SELECT MAX(depth) FROM tree_object_closure
              INNER JOIN tree_object sub_tobj
                ON sub_tobj.tree_object_id = child_tree_object_id
                AND sub_tobj.tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
                    AND sub_tobj.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
              WHERE parent_tree_object_id = t_c.child_tree_object_id
              ) AS max_depth,--want max depth of folders
              (SELECT count(tree_object_id) from tree_object AS t_o
              WHERE t_o.tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
              AND t_o.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
              AND t_o.tree_object_id in
                (SELECT child_tree_object_id FROM tree_object_closure WHERE parent_tree_object_id = t_obj.tree_object_id and depth > 0)
              AND (SELECT MAX(depth) FROM tree_object_closure WHERE parent_tree_object_id = t_obj.tree_object_id) > 0) AS has_sub_folder,
            (SELECT organization_name FROM organization WHERE organization_id = r_f.organization_id) as root_folder_organization_name ` +
      sharedWithQuery(options.organizationId) +
      ` FROM
            tree_object t_obj
          LEFT JOIN tracking_unit t_u
            ON CAST(t_obj.object_id AS TEXT) = CAST(t_u.tracking_unit_id as TEXT)
            AND t_obj.tree_object_type_id = ${TREE_OBJECT_TYPE['WATCHLIST']}
          LEFT JOIN tree_folder t_f
            ON CAST(t_obj.object_id AS TEXT) = CAST(t_f.tree_folder_id AS TEXT)
            AND t_obj.tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
          INNER JOIN tree_object_closure t_c
            ON t_c.child_tree_object_id = t_obj.tree_object_id
            AND t_c.depth <= 1
            AND t_obj.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
          LEFT JOIN root_folder r_f
            ON CAST(r_f.root_folder_id AS TEXT) = CAST(t_obj.object_id AS TEXT)
          WHERE t_c.parent_tree_object_id IN (` +
      params +
      `)
          AND t_obj.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']}
          ORDER BY parent_tree_object_id, order_index, depth;
          `;
    const dbRead = dbClient || dbConnections[connectionStringKeys.folder].read;
    const dbResults = await dbRead.query(sql, options.getTreeObjectIds);

    if ('object' !== typeof dbResults || !Array.isArray(dbResults)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResults array'
      });
    }
    if (!dbResults.length) {
      return null;
    }
    return dbResults;
  }

  /* istanbul ignore next */
  async function _getParentDepth(options) {
    if (!options.parentTreeObjectId) {
      throw new errors.InvalidInput({
        message: 'Missing tree object id for getDepths'
      });
    }
    //@TODO make tree_object_type_id dynamic
    var sql = `
          SELECT MAX(depth) AS maxParentTreeObject
          FROM tree_object_closure
          INNER JOIN tree_object
            ON tree_object_id = parent_tree_object_id
            AND tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
          WHERE child_tree_object_id = $1;
    `;
    const dbRead = dbConnections[connectionStringKeys.folder].read;
    const dbResult = await dbRead.query(sql, [options.parentTreeObjectId]);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResults array'
      });
    }

    if (!dbResult.length) {
      return null;
    }
    return dbResult;
  }

  /* istanbul ignore next */
  async function _getDepthsForMove(options) {
    if (!options.treeObjectId || !options.newParentTreeObjectId) {
      throw new errors.InvalidInput({
        message: 'Missing tree object id for getDepths'
      });
    }

    var sql = `
        WITH treeObjectMaxDepth AS (
          SELECT MAX(depth) AS maxTreeObject
          FROM tree_object_closure
          INNER JOIN tree_object
            ON tree_object_id = child_tree_object_id
            AND tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
          WHERE parent_tree_object_id = $1--treeObjectId
        ),
        newParentTreeObjectMaxDepth AS (
          SELECT MAX(depth) AS maxParentTreeObject
          FROM tree_object_closure
          INNER JOIN tree_object
            ON tree_object_id = parent_tree_object_id
            AND tree_object_type_id = ${TREE_OBJECT_TYPE['FOLDER']}
          WHERE child_tree_object_id = $2--newParentTreeObjectId
        )
        SELECT * FROM treeObjectMaxDepth, newParentTreeObjectMaxDepth;
    `;
    const dbRead = dbConnections[connectionStringKeys.folder].read;
    const dbResult = await dbRead.query(sql, [
      options.treeObjectId,
      options.newParentTreeObjectId
    ]);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResult array'
      });
    }

    if (!dbResult.length) {
      return null;
    }
    return dbResult;
  }

  /* istanbul ignore next */
  async function _getOrCreateRootFolder(options, dbClient) {
    if (!_.isObject(options)) {
      throw new errors.InvalidInput({
        message: 'Missing root folder options'
      });
    } else if (options.constructor !== model.RootFolder) {
      throw new errors.InvalidInput({
        message:
          'Invalid Query Options Type: Options should be an instance of model.FolderQuery'
      });
    }

    // @todo add depth as params
    var sql = `
            WITH org_root as (
            SELECT *
              FROM root_folder
              WHERE organization_id = ${options.organizationId}
              AND root_folder_type_id = ${options.rootFolderTypeId}
            ),
            ins_org_root as (
              INSERT INTO root_folder
              (root_folder_id, organization_id, root_folder_type_id)
              SELECT
              '${options.newOrgRootFolderId}', ${options.organizationId}, ${options.rootFolderTypeId}
              WHERE
              NOT EXISTS (
                SELECT * FROM org_root
              )
              RETURNING *
            ),
            treeObjectOrgSelect as (
              SELECT t_o.*
                FROM tree_object t_o
              JOIN org_root r_f
              ON CAST(r_f.root_folder_id AS TEXT) = t_o.object_id
            ),
            treeObjectOrg AS (
              -- create tree object pointing to tree folder
              INSERT INTO tree_object (
              object_id,
              tree_object_type_id,
              tree_object_id,
              order_index,
              creation_date,
              last_updated_date,
              tree_object_status
              )
              SELECT
              (SELECT root_folder_id FROM ins_org_root),
              ${TREE_OBJECT_TYPE['ROOT_FOLDER']},
              '${options.newOrgTreeObjectId}',
              0,
              current_timestamp,
              current_timestamp,
              ${TREE_OBJECT_STATUS['ACTIVE']}
                WHERE
                NOT EXISTS (
                  SELECT * FROM org_root
                )
              RETURNING *
            ),
              treeObjectClosureOrg AS (
              -- create tree structure
              INSERT INTO tree_object_closure (
                parent_tree_object_id,
                child_tree_object_id,
                depth
              )
              SELECT
                (SELECT tree_object_id FROM treeObjectOrg),
                (SELECT tree_object_id FROM treeObjectOrg),
                0
                WHERE
                  NOT EXISTS (
                  SELECT * FROM org_root
                  )
              RETURNING *
              ),
              user_root as (
                SELECT *
                  FROM root_folder
                WHERE user_id = '${options.userId}'
                  AND root_folder_type_id = ${options.rootFolderTypeId}
              ),
              ins_user_root as (
                INSERT INTO root_folder
                (root_folder_id, user_id, root_folder_type_id)
                SELECT
                '${options.newUserRootFolderId}', '${options.userId}', ${options.rootFolderTypeId}
                WHERE
                NOT EXISTS (
                  SELECT * FROM user_root
                )
                RETURNING *
              ),
              treeObjectUserSelect as (
                SELECT t_o.*
                FROM tree_object t_o
                JOIN user_root r_f
                ON CAST(r_f.root_folder_id AS TEXT) = t_o.object_id
              ),
              treeObjectUser AS (
                -- create tree object pointing to tree folder
                INSERT INTO tree_object (
                object_id,
                tree_object_type_id,
                tree_object_id,
                order_index,
                creation_date,
                last_updated_date,
                tree_object_status
                )
                SELECT
                (SELECT root_folder_id FROM ins_user_root),
                ${TREE_OBJECT_TYPE['ROOT_FOLDER']},
                '${options.newUserTreeObjectId}',
                0,
                current_timestamp,
                current_timestamp,
                ${TREE_OBJECT_STATUS['ACTIVE']}
                WHERE
                  NOT EXISTS (
                  SELECT * FROM user_root
                  )
              RETURNING *
              ),
              treeObjectClosureUser AS (
              -- create tree structure
              INSERT INTO tree_object_closure (
                parent_tree_object_id,
                child_tree_object_id,
                depth
              )
              SELECT
                (SELECT tree_object_id FROM treeObjectUser),
                (SELECT tree_object_id FROM treeObjectUser),
                0
                WHERE
                  NOT EXISTS (
                  SELECT * FROM user_root
                  )
              RETURNING *
              ),
              new_r_f as (
                SELECT *
                FROM treeObjectOrg
                UNION ALL
                SELECT *
                FROM treeObjectUser
                UNION ALL
                SELECT *
                FROM treeObjectOrgSelect
                UNION ALL
                SELECT *
                FROM treeObjectUserSelect
              )
              SELECT * FROM new_r_f;
      `;
    // Need to make two calls only for if the user's first time creating a root folder
    // it's also makes for a faster database query aggregated time making two calls
    // although it puts more work on the server. Could run it as a single call, and if no results
    // run the call again when we know we would get a response if it's an error
    const dbWrite =
      dbClient || dbConnections[connectionStringKeys.folder].write;
    const dbResults = await dbWrite.query(sql);

    if ('object' !== typeof dbResults || !Array.isArray(dbResults)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResults array'
      });
    }

    if (!dbResults.length) {
      return null;
    }
    return dbResults;
  }

  /* istanbul ignore next */
  async function _getTreeObjectType(treeObjectId) {
    if (!treeObjectId) {
      throw new errors.InvalidInput({
        message: 'Missing tree object id for getTreeObjectType'
      });
    }

    var sql = `
          SELECT tree_object_type_id
          FROM tree_object
          WHERE tree_object_id = $1
          AND tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']};
      `;
    const dbRead = dbConnections[connectionStringKeys.folder].read;
    const dbResults = await dbRead.query(sql, [treeObjectId]);

    if ('object' !== typeof dbResults || !Array.isArray(dbResults)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResults array'
      });
    }

    if (!dbResults.length) {
      return null;
    }

    var treeObjectTypeResult = dbResults[0].tree_object_type_id;

    return treeObjectTypeResult;
  }

  /* istanbul ignore next */
  async function _isObjectInKnownState(options) {
    if (!_.isObject(options)) {
      throw new errors.InvalidInput({
        message: 'Missing options parameter for isObjectInKnownState'
      });
    }
    // @todo add depth and object type as params
    var sql = `
      --seperate call to check if items are where they are supposed to be
      SELECT * FROM tree_object t_o
        JOIN tree_object_closure toc
        ON toc.child_tree_object_id = t_o.tree_object_id
      WHERE toc.child_tree_object_id = $1--options.treeObjectId
      AND toc.parent_tree_object_id = $2--options.prevParentTreeObjectId
      AND toc.depth = 1
      AND t_o.tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']};
    `;
    const dbRead = dbConnections[connectionStringKeys.folder].read;
    const dbResult = await dbRead.query(sql, [
      options.treeObjectId,
      options.prevParentTreeObjectId
    ]);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Expecting one row',
        data: {
          errorType: 'tree_object_state_altered'
        }
      });
    }

    if (!dbResult.length) {
      throw new errors.NotFound({
        message:
          'Altered State: Tree Object has been altered, refresh fodlers to view changes'
      });
    }
    return null;
  }

  /* istanbul ignore next */
  async function _moveTreeObject(options) {
    /*
     * Verified no changes, can execute move
     */
    const dbRead = dbConnections[connectionStringKeys.folder].read;
    var sql = `
                    --Update current order_index to new order_index
                        UPDATE tree_object
                          SET order_index = ${options.newOrderIndex},--options.newOrderIndexId
                          last_updated_date = now()::timestamp with time zone
                        WHERE tree_object_id = '${options.treeObjectId}';--options.treeObjectId
                      --Delete ties to old parent
                      DELETE FROM tree_object_closure link
                      USING tree_object_closure p, tree_object_closure c
                      WHERE p.parent_tree_object_id = link.parent_tree_object_id AND c.child_tree_object_id = link.child_tree_object_id
                      AND p.child_tree_object_id = '${options.prevParentTreeObjectId}' AND c.parent_tree_object_id = '${options.treeObjectId}';
                      --Update old siblings order_index
                      UPDATE tree_object
                      SET order_index = order_index - 1, last_updated_date = now()::timestamp with time zone
                      WHERE tree_object_id IN (
                        SELECT toc.child_tree_object_id
                        FROM tree_object_closure toc
                        JOIN tree_object t_o ON t_o.tree_object_id = toc.child_tree_object_id
                        WHERE toc.parent_tree_object_id = '${options.prevParentTreeObjectId}'
                        AND toc.depth = 1 AND t_o.order_index > ${options.prevOrderIndex}
                      )
                      AND tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']};
                        --Update new siblings order_index
                          UPDATE tree_object
                          SET order_index = order_index + 1, last_updated_date = now()::timestamp with time zone
                          WHERE tree_object_id IN (
                            SELECT toc.child_tree_object_id
                            FROM tree_object_closure toc
                            JOIN tree_object t_o ON t_o.tree_object_id = toc.child_tree_object_id
                            WHERE toc.parent_tree_object_id = '${options.newParentTreeObjectId}'
                            AND toc.depth = 1 AND t_o.order_index >= ${options.newOrderIndex}
                          )
                          AND tree_object_status = ${TREE_OBJECT_STATUS['ACTIVE']};
                          --Add ties to new parent
                          INSERT INTO tree_object_closure(parent_tree_object_id, child_tree_object_id, depth)
                          SELECT p.parent_tree_object_id, c.child_tree_object_id, p.depth + c.depth + 1
                          FROM tree_object_closure p, tree_object_closure c
                          WHERE p.child_tree_object_id = '${options.newParentTreeObjectId}' AND c.parent_tree_object_id = '${options.treeObjectId}';
                          SELECT * FROM tree_object
                          WHERE tree_object_id = '${options.treeObjectId}';--options.treeObjectId
        `;
    const dbResult = await dbRead.query(sql);

    if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
      throw new errors.InternalServerError({
        message: 'Tree Object has been altered, refresh fodlers to view changes'
      });
    }

    if (!dbResult.length) {
      return null;
    }
    return dbResult;
  }

  /* istanbul ignore next */
  async function _getSharedWithFolders(options) {
    let organizationId = options.organizationId;
    if (!organizationId) {
      throw new errors.InvalidInput({
        message: 'Missing get folders requirement: organizationId'
      });
    }
    let sql = '';
    if (organizationId === VMN_ORG_ID) {
      sql = `SELECT t_o.tree_object_id FROM tree_object t_o
               LEFT JOIN root_folder r_f ON r_f.root_folder_id::text = t_o.object_id
          WHERE (${buildOrgSharedFolderWhereClause(
            options
          )}) AND r_f.organization_id IN (${options.authorizedOrganizationIds.join(
            ','
          )});`;
    } else {
      sql = `SELECT tree_object_id FROM tree_object
          WHERE tree_object_status  = ${TREE_OBJECT_STATUS['ACTIVE']}
          AND ${buildOrgSharedFolderWhereClause(options)};`;
    }

    const dbRead = dbConnections[connectionStringKeys.folder].read;
    const dbResults = await dbRead.query(sql);
    if ('object' !== typeof dbResults || !Array.isArray(dbResults)) {
      throw new errors.InternalServerError({
        message: 'Missing dbResults array'
      });
    }
    return dbResults;
  }
  /* istanbul ignore next */
  function buildOrgSharedFolderWhereClause(options) {
    let organizationId = options.organizationId;
    return `shared_with @> '{"read": [${organizationId}]}'
        OR shared_with @> '{"write": [${organizationId}]}'`;
  }

  async function getTDOParentFolderId(tdoId) {
    return getParentFolderId(tdoId, TREE_OBJECT_TYPE.TDO);
  }

  async function emitFixupV2FolderRowsEvent(context, folders, keyId = 'id') {
    const promises = [];
    const organization = _.get(context, '_authInfo.organization');
    const organizationId = _.get(organization, 'organizationId');
    const useV2FolderFeature = await _useV2FoldersEnabledFeature(
      context,
      organizationId
    );
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (useV2FolderFeature) {
      for (const folder of folders) {
        const folderId = _.get(folder, keyId);
        if (
          folderId &&
          (_.isNil(folder.organizationId) || folder.organizationId === -1)
        ) {
          const payload = {
            type: 'system',
            event: 'fixup_v2_folder_each_row',
            userId: folder.userId,
            folderId
          };

          // this folder shouldn't be fixed up by the organization from context
          // if the requester is a superadmin user.
          if (!isSuperAdmin) {
            payload['organizationId'] = organizationId;
          }

          promises.push(() =>
            messageUtil.emitEvent(payload, messageUtil.topics('EVENTS'))
          );
        }
      }
    }

    if (promises.length) {
      await Promise.all(promises.map((fn) => Promise.resolve().then(fn)));
    }
  }

  // Flag indicating whether the v2 folders feature is turned on/off for the whole environment
  const isV2FoldersAvailable =
    _.get(config, `featureFlags.v2FoldersAvailable`, false) === true;

  async function _useV2FoldersEnabledFeature(context, organizationId) {
    const ctxOrg = _.get(context, '_authInfo.organization');
    const ctxOrgId = _.get(ctxOrg, 'organizationId');
    const orgId = organizationId || ctxOrgId;

    if (!orgId || orgId == '-1') {
      return false;
    }

    // Reuse the context org only when it is the same org AND actually carries the feature
    // KVP. engine-run/structuredData JWTs short-circuit middlewareAuth (:312) with a bare
    // { organizationId }; passing that reads kvp.features as 'disabled' instead of falling
    // back to the DB.
    const org =
      _.toString(ctxOrgId) === _.toString(orgId) && _.has(ctxOrg, 'kvp.features')
        ? ctxOrg
        : undefined;

    // allowNoConfigFeatureFlag must stay true: there is no `featureFlags.v2FoldersEnabled`
    // config key (only `v2FoldersAvailable`, checked separately as isV2FoldersAvailable),
    // so the config gate inside isEnableFeatureInOrganization would always fail closed.
    return mainUtil.isEnableFeatureInOrganization(
      context,
      org,
      orgId,
      'v2FoldersEnabled',
      true,
      false // skipCache
    );
  }

  /**
   * When using moveFolder to move a watchlist,
   * redirect from moveFolder to moveWatchlist
   */
  async function _redirectToMoveWatchlist(context, args) {
    const { input, ...otherArgs } = args;
    const { orgId, objectId } = resUtil.parseVirtualTreeObjectId(
      input.treeObjectId
    );

    let parentFolderId = input.toFolderId;

    // since dalV2Folder.moveFolderItem requires a parentFolderId is not newParentTreeObjectId
    if (input.newParentTreeObjectId) {
      const newParentFolder = await _getFolder({
        getTreeObjectId: input.newParentTreeObjectId,
        organizationId: input.organizationId
      });
      parentFolderId =
        _.get(_.head(newParentFolder), 'object_id') ||
        input.newParentTreeObjectId;
    }

    const newArgs = {
      ...otherArgs,
      parentFolderId,
      organizationId: orgId
    };
    await moveWatchlist(context, newArgs, { id: objectId });
    otherArgs.id = parentFolderId;

    return getFolder(context, otherArgs);
  }

  async function _emitPublicEvent(context, eventName, data, error) {
    const actionMap = {
      [supportedEvents.FolderCreate]: 'create',
      [supportedEvents.FolderUpdate]: 'update',
      [supportedEvents.FolderDelete]: 'delete'
    };
    data = data || {};
    const status = !error ? 'success' : 'failure';
    // emit event
    const event = {
      folderId: data.id,
      folderName: data.name,
      folderTypeId: data.typeId,
      organizationId: data.organizationId,
      status: _.get(data, 'status', ''),
      actionInfo: messageUtil.buildActionInfo(
        data.id,
        error,
        actionMap[eventName],
        status,
        getActionDetail(eventName, status, data, error)
      )
    };

    try {
      await messageUtil.emitPublicEvent(eventName, 'system', context, event);
    } catch (ex) {
      logger.error(`failed to publish event: ${eventName}`, ex);
    }
  }

  function getActionDetail(eventName, status, data, error) {
    const details = ACTION_DETAILS[eventName];
    if (!details) return null;
    const message = details[status];
    return message(data, error);
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

  async function getUserRootFolders(context, options = {}) {
    if (_.isNil(options?.organizationId)) {
      return [];
    }

    const ssoRead =
      serviceContext.dbConnections[connectionStringKeys.user].read;

    const queryParams = [];
    const whereClauses = [
      'rf.organization_id IS NULL',
      'rf.user_id IS NOT NULL',
      `NOT EXISTS (
          SELECT 1
          FROM v2_folder_root v2
          WHERE v2.folder_id = rf.root_folder_id
      )`
    ];

    const rootFolderTypeId = ROOT_FOLDER_TYPE[options.rootFolderType || 'cms'];
    queryParams.push(rootFolderTypeId);
    whereClauses.push(`rf.root_folder_type_id = $${queryParams.length}`);

    // build joins
    let joinClause = '';
    if (options.withoutACE) {
      // join with rbac_folders to exclude folders that have ACEs
      joinClause =
        'LEFT JOIN rbac_folders _rbac_f ON _rbac_f.folder_id = rf.root_folder_id';
      whereClauses.push('_rbac_f.folder_id IS NULL');
    }

    // Get V1 user root folders with pagination
    // Exclude those that exist in V2
    let mpSql = `
      SELECT rf.root_folder_id, rf.user_id
      FROM root_folder rf ${joinClause}
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY rf.root_folder_id
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

    // Get only users who belong to this specific organization
    const userIds = mpResult.map((row) => row.user_id);

    const ssoOrgSql = `
      SELECT DISTINCT u.user_id
      FROM sso_user u
      JOIN sso_user__sso_group ug ON u.user_id = ug.user_id
      JOIN sso_group g ON g.group_id = ug.group_id
      WHERE u.user_id = ANY($1::uuid[])
        AND g.kvp->>'groupType' = 'organization'
        AND g.kvp->>'organizationId' = $2;
    `;

    const ssoOrgResult = await ssoRead.query(ssoOrgSql, [
      userIds,
      _.toString(options.organizationId)
    ]);
    const usersInThisOrg = new Set(_.map(ssoOrgResult, 'user_id'));

    // Filter folders to only include those belonging to users in this org
    const foldersInOrg = mpResult.filter((row) =>
      usersInThisOrg.has(row.user_id)
    );

    if (_.isEmpty(foldersInOrg)) {
      return [];
    }

    // Return folders with user mapping
    return foldersInOrg.map((row) => ({
      folderId: row.root_folder_id,
      rootFolderUserId: row.user_id
    }));
  }
  /**
   * Resolve the global V1 user root folder ID from a V2 organization-scoped user root folder.
   *
   * Context:
   * - V2 supports organization-scoped user root folders.
   * - V1 only has a single global user root folder per user.
   *
   * This is used when:
   * - V2 folders are enabled.
   * - The input parentId refers to a V2 user root folder.
   * - We need to resolve the corresponding global V1 parentId
   *   to maintain Dual Write consistency.
   *
   * @param {Object} context
   * @param {string} v2FolderId
   * @param {string} rootFolderType
   * @returns {Promise<string|null>} V1 global treeObjectId if found, otherwise null
   */
  async function _getV1ParentIdFromV2(context, v2FolderId, rootFolderType) {
    if (!v2FolderId) return null;
    try {
      const v2FolderInfo = await dalV2Folder.getRootFolders(context, {
        id: v2FolderId,
        rootFolderType: rootFolderType || 'cms',
        skipAuth: true
      });

      const v2Folder = _.head(v2FolderInfo);
      if (!v2Folder || !v2Folder.rootFolderUserId) {
        return null;
      }

      const userId = v2Folder.rootFolderUserId;
      const v1RootFolders = await getRootFoldersV1(context, {
        rootFolderType: rootFolderType || 'cms',
        skipAuth: true
      });
      const v1UserRootFolder = _.find(
        v1RootFolders,
        (folder) => folder.userId === userId && !folder.organizationId
      );
      if (v1UserRootFolder) {
        return (
          v1UserRootFolder.id ||
          v1UserRootFolder.rootFolderId ||
          v1UserRootFolder.treeObjectId
        );
      }

      return null;
    } catch (err) {
      logger.error('_getV1ParentIdFromV2 error:', err);
      return null;
    }
  }

  /**
   * Resolve the V2 organization-scoped user root folder ID
   * from a V1 global (private) user root folder.
   *
   * Context:
   * When a user creates a folder under their V1 global root,
   * V2 must redirect the operation to the user root folder
   * scoped to the current organization.
   *
   * This is used when:
   * - V1 is the source of the input parentId
   * - The input parentId is a V1 global user root folder.
   * - V2 requires an organization-scoped parentId.
   *
   * @param {Object} context
   * @param {string} v1FolderId
   * @param {number} organizationId - Target org used to resolve the V2 root
   * @param {string} rootFolderType
   * @returns {Promise<string|null>} V2 org-scoped folderId if found, otherwise null
   */
  async function _getV2ParentIdFromV1(
    context,
    v1FolderId,
    organizationId,
    rootFolderType
  ) {
    if (!v1FolderId || !organizationId) return null;

    try {
      const v1RootFolders = await getRootFoldersV1(context, {
        id: v1FolderId,
        rootFolderType: rootFolderType || 'cms',
        skipAuth: true
      });
      const v1RootFolder = _.head(v1RootFolders);

      if (
        !v1RootFolder ||
        !v1RootFolder.userId ||
        v1RootFolder.organizationId
      ) {
        return null;
      }

      const userId = v1RootFolder.userId;
      const v2RootFolders = await dalV2Folder.getRootFolders(context, {
        organizationId: organizationId,
        userId: userId,
        skipAuth: true,
        rootFolderType: rootFolderType || 'cms'
      });
      const v2UserRootFolder = _.find(
        v2RootFolders,
        (folder) =>
          folder.rootFolderUserId === userId &&
          folder.organizationId == organizationId
      );

      if (v2UserRootFolder) {
        return v2UserRootFolder.id;
      }

      return null;
    } catch (err) {
      logger.error('_getV2ParentIdFromV1 error:', err);
      return null;
    }
  }

  return {
    TREE_OBJECT_TYPE,
    ROOT_FOLDER_TYPE_NAME,
    createFolder,
    createFolderContentTemplate,
    deleteFolder,
    fileObject,
    fileTDO,
    fileCollection,
    getChildTDOs,
    getChildWatchlists,
    getChildApplications,
    getChildCollections,
    removeTDOFromFolders,
    getFolder,
    getFolderNew,
    getFolderContentTemplates,
    getOrCreateOrgRootFolder, // TODO Organization resolver
    getOrCreateRootFolders,
    getOrCreateUserRootFolder, // TODO User resolver
    getParentFolder,
    getParentTreeItem, // new, use going forward
    getParentFoldersTreeObjectIds,
    getSubfolders, // new, use going forward
    _getSubfolderQuery, // Export for testing
    getFolderPath, // new, use going forward
    getSharedFolders,
    getTDOParentFolderId,
    moveFolder,
    moveTDO,
    moveCollection,
    moveWatchlist,
    getRootFolders,
    shareFolder,
    unfileTDO,
    unfileCollection,
    unfileApplication,
    updateFolder,
    updateFolderContentTemplate,
    deleteFolderContentTemplate,
    getFolderOverview,
    getFolderSummaryDetails,
    getTreeObjectInfoForObject,
    mapSubfoldersIntoParentFolders,
    _validateAccess,
    unfileObject,
    buildFolderStructure,
    validateTreeObject,
    getObjectIdsFromOpaqueIds,
    getParentFolders,
    getParentFoldersForObject,
    getUserRootFolders,

    emitFixupV2FolderRowsEvent,
    _useV2FoldersEnabledFeature,
    v2DalSwitch,
    v1Tov2DalSwitch,
    _getV1ParentIdFromV2,
    _getV2ParentIdFromV1
  };
};
