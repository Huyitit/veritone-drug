const _ = require('lodash');

module.exports = function (serviceContext) {
  const structuredDataDal = serviceContext.dal.structuredData;
  const mentionDal = serviceContext.dal.mention;

  return {
    id: (obj) => obj.id || obj.mentionId,
    organization: (obj, args, context) =>
      obj.organizationId
        ? serviceContext.dal.organization.getOrganization(context, {
            id: obj.organizationId
          })
        : null,
    // postgres returns a time stamp without TZ so we coerce to UTC here while
    // the value is still in string form ("2018-02-21 22:59"); we append "Z".
    // the DateTime custom scalar code will then treat the value as UTC and
    // format accordingly.
    mentionDate: (obj) =>
      _.isString(obj.mentionDate) ? obj.mentionDate + 'Z' : obj.mentionDate,
    scheduledJob: (obj, args, context) =>
      obj.scheduleId
        ? serviceContext.dal.scheduledJob.getScheduledJob(context, {
            id: obj.scheduleId
          })
        : null,
    temporalDataObject: (obj, args, context) =>
      obj.mediaId
        ? serviceContext.dal.tdo.getTDO(context, {
            id: obj.mediaId.toString()
          })
        : null,
    watchlist: (obj, args, context) =>
      obj.watchlistId
        ? serviceContext.dal.watchlist.getWatchlist(
            { id: obj.watchlistId },
            context
          )
        : null,
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
    ratings: (obj, args, context) =>
      mentionDal.getMentionRating(
        context,
        Object.assign(
          {
            mentionId: obj.id
          },
          args
        )
      ),
    comments: (obj, args, context) =>
      mentionDal.getMentionComment(
        context,
        Object.assign({ mentionId: obj.id }, args)
      ),
    mentionRating: (obj) => obj.rating || null,
    campaign: async (obj) =>
      obj.campaignId ? mentionDal.getCampaign({ id: obj.campaignId }) : null,
    audience: (obj) =>
      _.isNil(obj.audience)
        ? _.isNil(obj.dma_aqh_audience)
          ? 0
          : obj.dma_aqh_audience
        : obj.audience
  };
};
