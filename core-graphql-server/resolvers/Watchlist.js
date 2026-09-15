const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const structuredDataDal = serviceContext.dal.structuredData;
  const util = require('./util.js')(serviceContext);
  const mainUtil = require('../util.js')(serviceContext);

  return {
    folders: async (obj, args, context) => {
      const orgId =
        args.organizationId ||
        _.get(context, '_authInfo.organization.organizationId');
      const folder = await serviceContext.dal.folder.getParentFolder(
        context,
        obj.id,
        orgId,
        false,
        'watchlist'
      );
      return folder ? [folder] : [];
    },
    details: (obj) => serviceContext.dal.watchlist.populateDetails(obj),
    scheduleIds: (obj) => {
      return serviceContext.dal.watchlist
        .populateDetails(obj)
        .then((det) => det.programIds);
    },
    subscriptions: (obj, args) =>
      serviceContext.dal.watchlist.getWatchlistSubscriptions(args, obj),

    organization: (object, args, context) =>
      serviceContext.dal.organization.getOrganization(context, {
        id: object.organizationId
      }),

    cognitiveSearches: (object) =>
      serviceContext.dal.watchlist.getCognitiveSearches(object),

    // searchIndex is an enum but, for now, lives in a boolean column.
    // map values here.
    searchIndex: (object) => (object.searchIndex === true ? 'mine' : 'global'),

    query: (object) => serviceContext.dal.watchlist.getSearchQuery(object),

    sourceTypeIds: (object) => {
      // handle the fact that we have a media_source_type_id column
      // AND a media_source_type_ids column and we don't know what the
      // might be in them.
      const ids = object.sourceTypeIds || [];
      if (object.sourceTypeId && !ids.includes(object.sourceTypeId)) {
        ids.push(object.sourceTypeId);
      }
      return ids;
    },
    sourceIds: (object) => serviceContext.dal.watchlist.getSourceIds(object.id),
    mentions: (obj, args, context) => {
      return serviceContext.dal.mention.getMentions(
        context,
        Object.assign({ watchlistId: obj.id }, args)
      );
    },
    advertiser: async (obj, args, context) => {
      if (obj.advertiserId) {
        const registry = await structuredDataDal.getDataRegistries(context, {
          name: 'Veritone Advertiser Information',
          nameMatch: 'exact'
        });
        const advertiserRegistryId = _.get(registry, 'records[0].id', '');
        const schema = await structuredDataDal.getSchemas(context, {
          status: ['published'],
          dataRegistryMetadataId: advertiserRegistryId,
          organizationId: obj.organizationId
        });
        const advertiserSchemaId = _.get(schema, 'records[0].id');

        if (advertiserRegistryId && advertiserSchemaId) {
          const sdo = await structuredDataDal.getStructuredDataObjects(
            context,
            {
              schemaId: advertiserSchemaId,
              filter: {
                advertiserId: {
                  eq: `${obj.advertiserId}`
                }
              }
            }
          );
          return JSON.stringify(_.get(sdo, 'records[0].data') || {});
        } else {
          return null;
        }
      } else {
        return null;
      }
    },
    brand: async (obj, args, context) => {
      if (obj.brandId) {
        const registry = await structuredDataDal.getDataRegistries(context, {
          name: 'Veritone Brand Information',
          nameMatch: 'exact'
        });
        const brandRegistryId = _.get(registry, 'records[0].id', '');
        const schema = await structuredDataDal.getSchemas(context, {
          status: ['published'],
          dataRegistryMetadataId: brandRegistryId,
          organizationId: obj.organizationId
        });
        const brandSchemaId = _.get(schema, 'records[0].id');

        if (brandRegistryId && brandSchemaId) {
          const sdo = await structuredDataDal.getStructuredDataObjects(
            context,
            {
              schemaId: brandSchemaId,
              filter: {
                brandId: {
                  eq: `${obj.brandId}`
                }
              }
            }
          );
          return JSON.stringify(_.get(sdo, 'records[0].data') || {});
        } else {
          return null;
        }
      } else {
        return null;
      }
    },
    treeObjectId: async (obj, args, context) => {
      const useV2FolderFeature = await mainUtil.isEnableFeatureInOrganization(
        context,
        undefined,
        obj.organizationId,
        'v2FoldersEnabled',
        false
      );

      if (useV2FolderFeature) {
        return util.generateVirtualTreeObjectId(obj.organizationId, obj.id);
      } else {
        if (obj.treeObjectId) return obj.treeObjectId;
        try {
          // treeObjectId is not required field return null if not exist
          const folder = await serviceContext.dal.folder.getTreeObjectInfoForObject(
            _.toString(obj.id)
          );
          return _.get(folder, 'id');
        } catch (err) {
          if (err.name == 'not_found') {
            return null;
          } else throw err;
        }
      }
    }
  };
};
