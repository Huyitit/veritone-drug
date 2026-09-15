const _ = require('lodash');
const getConfigValue = async (object, args, context, serviceContext, field) => {
  if (_.has(object, field) && typeof object[field] !== 'undefined') {
    return object[field];
  }

  const result = await serviceContext.dal.application.getApplicationConfigDefinition(
    {
      ...args,
      appId: _.get(object, 'applicationId'),
      configKey: _.get(object, 'configKey')
    },
    context
  );
  if (!result.records || result.records.length < 1) {
    serviceContext.logger.warn(
      'the application config value does not has a configDefinition'
    );
    return null;
  }

  return result.records[0][field];
};

module.exports = function createFunction(serviceContext) {
  return {
    createdBy: async (object, args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.createdBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    modifiedBy: async (object, args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.modifiedBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    defaultCreatedBy: async (object, args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.defaultCreatedBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    defaultModifiedBy: async (object, args, context) => {
      const user = await serviceContext.dal.admin.getUserBasicInfo(
        { userId: object.defaultModifiedBy },
        context
      );
      return {
        ...user,
        id: user.userId,
        name: `${user.firstName} ${user.lastName}`
      };
    },
    configType: async (object, args, context) =>
      getConfigValue(object, args, context, serviceContext, 'configType'),
    configLevel: async (object, args, context) =>
      getConfigValue(object, args, context, serviceContext, 'configLevel')
  };
};
