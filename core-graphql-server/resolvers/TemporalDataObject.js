const mapper = require('../dal/mapper.js'),
  fs = require('fs'),
  errors = require('../error'),
  mainUtil = require('../util.js')(),
  _ = require('lodash'),
  moment = require('moment');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  const dalTDO = serviceContext.dal.tdo;
  const mapper = require('../dal/mapper.js');
  const cache = require('./cache.js')(serviceContext);

  async function getOrganizationId(obj, context) {
    if (obj.orgId) {
      return obj.orgId;
    }
    const org = await serviceContext.dal.organization.getOrganization(context, {
      id: obj.applicationId
    });
    obj.orgId = org.id;
    return org.id;
  }

  return {
    assets(obj, args, context, info) {
      const hasAllAssets = true;
      /*mainUtil.requirePerm(
        'assets:all',
        context,
        'assets',
        'Asset',
        false
      );
      */
      const _args = Object.assign(
        { includeHiddenAssets: hasAllAssets, containerId: obj.id },
        args
      );
      const enable = _.get(
        serviceContext,
        'config.maxAssetsLimitEnabled',
        true
      );
      const max = _.get(serviceContext, 'config.maxAssetsLimit', 200);
      if (enable && args.limit && args.limit > max) {
        // log a warning so we can identify offending queries
        _args.limit = max;
        serviceContext.messageUtil.emitEvent({
          event: 'warning',
          serviceName: 'core-graphql-server',
          message:
            'Maximum limit of ' +
            max +
            ' on TDO.assets exceeded (' +
            args.limit +
            ')',
          errorName: 'max_tdo_assets',
          requestId: context.requestInfo.requestId
        });
      }
      return cache.get(context, _args, 'Assets', () =>
        dalTDO.getAssets(context, _args, obj)
      );
    },
    metadata(obj, args, context, info) {
      // metadata is the original, typed field for random metadata in the
      // graphql schema. it's an array of typed objects (ProgramData, etc.).
      // so we need to translate the "details" JSON blob into an array
      // of typed objects.
      const det = cache.get(
        context,
        { id: obj.id },
        'TemporalDataObject.details',
        () => dalTDO.getTDODetails(obj.id)
      );
      return det.then((details) => {
        const res = [];
        Object.keys(details || {}).forEach((key) => {
          res.push(mapper.mapRecordingMetadata(details[key], key));
        });
        return res;
      });
    },
    details: async function getDetails(obj, args, context) {
      const details = await cache.get(
        context,
        { id: obj.id },
        'TemporalDataObject.details',
        () => dalTDO.getTDODetails(obj.id)
      );

      return args.path ? _.get(details, args.path) : details;
    },
    name: async function getName(obj, args, context, info) {
      const det = cache.get(
        context,
        { id: obj.id },
        'TemporalDataObject.details',
        () => dalTDO.getTDODetails(obj.id)
      );
      return det.then((details) => {
        let res = details.name || _.get(obj, 'jsondata.name');

        if (!res) res = _.get(details, 'veritoneFile.fileName');
        if (!res) res = _.get(obj, 'jsondata.file.fileName');
        if (!res) res = _.get(obj, 'jsondata.veritoneFile.fileName');
        if (!res) res = obj.id;
        return res;
      });
    },
    tasks(obj, args, context, info) {
      const createdDateTime = obj.createdDateTime;
      const _args = Object.assign({ targetId: obj.id }, args);
      // we have the TDO created date/time so add a date filter
      // from the TDO created date time until now.
      if (_.get(_args, 'dateTimeFilter.length', 0) < 1) {
        _args.dateTimeFilter = [
          {
            field: 'createdDateTime',
            // add a buffer to our date/time filter below to eliminate chance
            // of race conditions if TDO and job were created at about the same time.
            fromDateTime: moment(obj.createdDateTime)
              .subtract(1, 'day')
              .toISOString()
          },
          {
            field: 'createdDateTime',
            toDateTime: moment().toISOString()
          }
        ];
      }

      return serviceContext.dal.task.getTasks(context, _args);
    },
    jobs(obj, args, context, info) {
      const _args = Object.assign({ targetId: obj.id, targetTdo: obj }, args);
      return serviceContext.dal.job.getJobs(context, _args);
    },
    primaryAsset(obj, args, context, info) {
      return dalTDO.getPrimaryAsset(context, obj, args);
    },
    async folders(obj, args, context) {
      const organizationId = await getOrganizationId(obj, context);
      const folders = await serviceContext.dal.folder
        .getParentFoldersForObject(context, {
          objectId: obj.id,
          organizationId,
          objectType: 'tdo',
          // pure read; safe to fold with the foldersTreeObjectIds resolver below
          useRequestCache: true
        })
        .catch((err) => {
          // The tdo is not filed in any folder
          if (err.name === 'not_found') {
            return [];
          }
          throw err;
        });
      return folders;
    },
    async foldersTreeObjectIds(obj, args, context) {
      return serviceContext.dal.folder.getParentFoldersTreeObjectIds(context, {
        objectId: obj.id,
        organizationId: await getOrganizationId(obj, context),
        objectType: 'tdo',
        // pure read; folds with the folders resolver above onto one lookup
        useRequestCache: true
      });
    },
    sourceData: async (obj, args, context) => {
      const source = await cache.get(
        context,
        { id: obj.id },
        'TDOSourceData',
        () => dalTDO.getTDOSourceData(obj)
      );

      // tdo.orgId should be assigned in order to have access to this source in TDOSourceData type.
      if (source && _.isNil(source.orgId)) {
        source.orgId = await getOrganizationId(obj, context);
      }

      return source;
    },
    thumbnailUrl: async function getUrl(obj, args, context) {
      const det = cache.get(
        context,
        { id: obj.id },
        'TemporalDataObject.details',
        () => dalTDO.getTDODetails(obj.id)
      );
      return det.then((details) => {
        const url = _.get(details, 'veritoneProgram.programLiveImage');
        return util.getSignedUrlOrVirtual(url);
      });
    },
    previewUrl: async function getUrl(obj, args, context) {
      const det = cache.get(
        context,
        { id: obj.id },
        'TemporalDataObject.details',
        () => dalTDO.getTDODetails(obj.id)
      );
      return det.then((details) => {
        const url = _.get(details, 'veritoneProgram.previewAssetUrl');
        return util.getSignedUrlOrVirtual(url);
      });
    },
    sourceImageUrl: async function getUrl(obj, args, context) {
      const det = cache.get(
        context,
        { id: obj.id },
        'TemporalDataObject.details',
        () => dalTDO.getTDODetails(obj.id)
      );
      return det.then((details) => {
        const url = _.get(details, 'veritoneProgram.programImage');
        return util.getSignedUrlOrVirtual(url);
      });
    },

    streams: (obj, args, context) => dalTDO.getStreamData(context, obj),

    streamManifest: (obj, args, context) =>
      dalTDO.getStreamManifest(context, obj),

    id: (obj) => (obj.magicId ? obj.magicId : obj.id),

    engineRuns: (obj, args, context) =>
      dalTDO.getEngineRuns(obj, args, context),

    startDateTime: (obj) => util.checkDateTime(obj.startDateTime, obj.id),
    stopDateTime: (obj) => util.checkDateTime(obj.stopDateTime, obj.id),
    createdDateTime: (obj) => util.checkDateTime(obj.createdDateTime, obj.id),
    modifiedDateTime: (obj) => util.checkDateTime(obj.modifiedDateTime, obj.id),

    assetCount: (obj, args, context) => dalTDO.getTDOAssetCount(obj.id),

    organizationId: async function (obj, args, context) {
      return getOrganizationId(obj, context);
    },

    organization: (obj, args, context) =>
      serviceContext.dal.organization.getOrganization(context, {
        id: obj.applicationId
      })
  };
};
