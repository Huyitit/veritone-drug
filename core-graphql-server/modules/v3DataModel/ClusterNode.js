module.exports = function createFunction(serviceContext) {
  const dalCluster = serviceContext.dal.cluster;

  if (!dalCluster) throw new Error('dalCluster');

  const getDateField = (object, fieldName, altFieldName) => {
    let res = object[fieldName];
    if (!res) res = object[altFieldName];
    return res ? res * 1000 : null;
  };

  return {
    cluster: (object, args, context) =>
      dalCluster.getCluster(context, { id: object.clusterId }),
    createdDateTime: (object) =>
      getDateField(object, 'createdDateTime', 'createdDate'),
    modifiedDateTime: (object) =>
      getDateField(object, 'updatedDateTime', 'updatedDate'),
    status: (object) =>
      serviceContext.dal.clusterNode.computeClusterNodeStatus(object)
  };
};
