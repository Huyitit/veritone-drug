const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const {
    getFolder,
    getChildTDOs,
    getChildWatchlists,
    getChildCollections,
    getChildApplications,
    getFolderContentTemplates
  } = serviceContext.dal.folder;
  const cache = require('./cache.js')(serviceContext);
  const mapper = require('../dal/mapper.js');
  const mainUtil = require('../util.js')(serviceContext);
  const util = require('./util.js')(serviceContext);

  const _folderArgs = (args, obj, context) => {
    const organizationId =
      args.organizationId ||
      obj.organizationId ||
      _.get(context, '_authInfo.organization.organizationId');
    return _.merge({}, args, {
      organizationId,
      folderId: obj.folderId || obj.id,
      treeObjectId: obj.treeObjectId || obj.id
    });
  };

  return {
    id: (obj) => obj.objectId || obj.rootFolderId || obj.id,
    treeObjectId: (obj) => obj.treeObjectId,

    parent: async function getParent(obj, args, context) {
      const treeItem = await serviceContext.dal.folder.getParentTreeItem(
        context,
        obj
      );
      if (!treeItem || !treeItem.objectId) return null;
      const _args = {
        id: treeItem.objectId,
        userId: _.get(context, '_authInfo.userId'),
        organizationId:
          obj.organizationId ||
          args.organizationId ||
          _.get(context, '_authInfo.organization.organizationId')
      };

      return cache.get(context, _args, 'Folder', () =>
        getFolder(context, _args)
      );
    },

    subfolders: (obj, args, context, info) => {
      const _args = JSON.parse(JSON.stringify(args));

      _args.id = obj.treeObjectId;
      _args.folderId = obj.id;
      // TODO sometimes on subfolders of subfolders org ID is not set?
      // default to auth user's org here.
      _args.organizationId =
        args.organizationId ||
        obj.organizationId ||
        _.get(context, '_authInfo.organization.organizationId');
      return cache.get(context, _args, 'Folder', () =>
        serviceContext.dal.folder.getSubfolders(context, _args)
      );
    },
    childFolders: (obj, args, context) => {
      const _args = JSON.parse(JSON.stringify(args));

      _args.id = obj.treeObjectId;
      _args.folderId = obj.id;
      // TODO sometimes on subfolders of subfolders org ID is not set?
      // default to auth user's org here.
      _args.organizationId =
        obj.organizationId ||
        _.get(context, '_authInfo.organization.organizationId');
      return cache
        .get(context, _args, 'Folder', () =>
          serviceContext.dal.folder.getSubfolders(context, _args)
        )
        .then((childFolders) => mainUtil.toPage(_args, childFolders));
    },
    childTDOs: (obj, args, context, info) => {
      return getChildTDOs(context, _folderArgs(args, obj, context));
    },

    childWatchlists: (obj, args, context, info) => {
      return getChildWatchlists(context, _folderArgs(args, obj, context));
    },

    childCollections: (obj, args, context, info) => {
      return getChildCollections(context, _folderArgs(args, obj, context));
    },

    childApplications: (obj, args, context, info) => {
      return getChildApplications(context, _folderArgs(args, obj, context));
    },
    name: async function getName(obj, args, context) {
      const isRootFolder = !!obj.rootFolderTypeId;

      if (!isRootFolder) {
        return (
          obj.name ||
          obj.treeFolderName ||
          obj.trackingUnitName ||
          (obj.folderObject && obj.folderObject.name)
        );
      }
      return util.buildRootFolderName(obj, context);
    },
    description: (obj) =>
      obj.description ||
      obj.treeFolderDescription ||
      (obj.folderObject && obj.folderObject.description),

    maxDepth: (obj) =>
      obj.maxDepth || (obj.folderObject && obj.folderObject.maxDepth),

    typeId: (obj) => obj.typeId || obj.treeObjectTypeId || obj.folderTypeId,

    contentTemplates: (obj, args, context) => {
      const _args = {
        folderId: obj.treeObjectId
      };
      return getFolderContentTemplates(context, _args);
    },
    //TODO: Since v2 migration renames getFolerPath to getFolderParents to get ancestor folders
    // use this new function after the migration is completed.
    folderPath: (obj, args, context) =>
      serviceContext.dal.folder.getParentFolders(context, obj),
    organization: (obj, args, context) => {
      let id = obj.organizationId;
      if (!id) return null; // TODO look up root folder org ID if possible
      return serviceContext.dal.organization.getOrganization(context, { id });
    },
    createdDateTime: (obj) => obj.createdDateTime || obj.creationDate,
    modifiedDateTime: (obj) => obj.modifiedDateTime || obj.lastUpdatedDate,
    sharedAccess: (obj, args, context) => {
      const organizationId = _.get(
        context,
        '_authInfo.organization.organizationId'
      );
      const sharedAccess = [];
      if (obj.sharedWith) {
        if (
          _.isArray(obj.sharedWith.read) &&
          _.indexOf(obj.sharedWith.read, organizationId) > -1
        ) {
          sharedAccess.push('read');
        }

        if (
          _.isArray(obj.sharedWith.write) &&
          _.indexOf(obj.sharedWith.write, organizationId) > -1
        ) {
          sharedAccess.push('write');
        }
      }
      return _.isEmpty(sharedAccess) ? null : sharedAccess;
    },
    entityTags: async (obj, args, context) => {
      if (!_.isNil(obj.rootFolderId)) {
        return null;
      } else if (!_.isEmpty(obj.entityTags)) {
        return obj.entityTags.map(mapper.mapEntityTags);
      }

      return await serviceContext.dal.entityTags.getEntityTags(
        obj.id,
        'folder',
        obj.organizationId ||
          _.get(context, '_authInfo.organization.organizationId')
      );
    }
  };
};
