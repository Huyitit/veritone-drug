const _ = require('lodash');
const moment = require('moment');

module.exports = function createFunction(serviceContext) {
  const dalCluster = serviceContext.dal.cluster;
  const dalClusterNode = serviceContext.dal.clusterNode;

  if (!dalCluster) throw new Error('dalCluster');
  if (!dalClusterNode) throw new Error('dalClusterNode');

  function getDateField(object, fieldName, altFieldName) {
    let res = object[fieldName];
    if (!res) res = object[altFieldName];
    return res ? res * 1000 : null;
  }

  return {
    nodes: (object, args, context) =>
      dalClusterNode.getClusterNodes(context, { clusterId: object.id }),
    jobs: (object, args, context) => {
      const _args = Object.assign(args, { clusterId: object.id });
      // you can only see jobs in your own org/application. note that this
      // constraint won't apply to internal tokens.
      _args.applicationId =
        context._authInfo.applicationId ||
        _.get(context._authInfo, 'groups[0].applicationId');
      // if a date/time filter was not set, use a default of 1 day.
      if (!_.get(args, 'dateTimeFilter.length')) {
        _args.dateTimeFilter = [
          {
            field: 'createdDateTime',
            fromDateTime: moment().subtract(1, 'days').toISOString()
          }
        ];
      }
      return serviceContext.dal.job.getJobs(context, _args);
    },
    tasks: (object, args, context) => {
      const _args = Object.assign(args, { clusterId: object.id });
      // you can only see jobs in your own org/application. note that this
      // constraint won't apply to internal tokens.
      _args.applicationId =
        context._authInfo.applicationId ||
        _.get(context._authInfo, 'groups[0].applicationId');
      // if a date/time filter was not set, use a default of 1 day.
      if (!_.get(args, 'dateTimeFilter.length')) {
        _args.dateTimeFilter = [
          {
            field: 'createdDateTime',
            fromDateTime: moment().subtract(1, 'days').toISOString()
          }
        ];
      }
      return serviceContext.dal.task.getTasks(context, _args);
    },
    state: (object) => object.clusterState,
    createdDateTime: (object) =>
      getDateField(object, 'createdDateTime', 'createdDate'),
    modifiedDateTime: (object) =>
      getDateField(object, 'modifiedDateTime', 'updatedDate'),
    deletedDateTime: (object) =>
      getDateField(object, 'deletedDateTime', 'deletedDate'),
    cachedDateTime: (object) =>
      getDateField(object, 'cachedDateTime', 'cachedDate'),
    type: (object) => object.type || object.clusterType,
    memorySizeBytes: (object) => object.memorySizeBytes || object.memorySize,
    storageSizeBytes: (object) => object.storageSizeBytes || object.storageSize,
    // note that old cluster rows have "null" for is_public.
    // these are effectively false / non-public.
    isPublic: (object) => (_.isNil(object.isPublic) ? false : object.isPublic),
    collaborators: (object, args, context) =>
      dalCluster.getCollaborators(context, { ...object, ...args }),
    subscriptions: (object, args, context) =>
      dalCluster.getClusterSubscriptions(
        context,
        Object.assign(args, { clusterId: object.id })
      ),
    stateLastUpdatedDateTime: (object) =>
      getDateField(object, 'stateLastUpdatedDateTime', 'modifiedDateTime'),
    status: (object) => (object.paused ? 'paused' : object.status) || 'pending',
    mediaStorage: (object) =>
      _.get(object, 'clusterConfig.mediaStorage', 'core'),
    mediaStoragePath: (object) =>
      _.get(object, 'clusterConfig.mediaStoragePath', null),
    managementNodeID: (object) =>
      _.get(object, 'clusterConfig.managementNodeId', null),
    restartTimeUTC: (object) => _.get(object, 'clusterConfig.restartTimeUTC'),
    serviceToken: (object) => _.get(object, 'clusterConfig.serviceToken'),
    clusters: (object, args, context) => {
      const _args = Object.assign(args, {
        clusterGroupId: object.id,
        isGroup: false
      });

      return dalCluster.getClusterList(context, _args);
    }
  };
};
