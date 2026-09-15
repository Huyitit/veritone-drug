const _ = require('lodash');

module.exports = function (serviceContext) {
  const util = require('./util.js')(serviceContext);
  const dalUtil = require('./../dal/util')(
    serviceContext.config,
    serviceContext
  );

  return {
    createdDateTime: (obj) => obj.dateCreated,
    modifiedDateTime: (obj) => obj.dateModified,
    userImage: (obj, args, context) =>
      obj.userId
        ? serviceContext.dal.admin
            .getUsers({ id: obj.userId }, context)
            .then((result) =>
              util.getSignedUrlOrVirtual(
                _.get(result, 'records[0].kvp.image', null)
              )
            )
        : null,
    firstName: (obj, args, context) =>
      obj.userId
        ? serviceContext.dal.admin
            .getUsers({ id: obj.userId }, context)
            .then((result) =>
              dalUtil.sanitizeField(
                _.get(result, 'records[0].kvp.firstName', null)
              )
            )
        : null,
    lastName: (obj, args, context) =>
      obj.userId
        ? serviceContext.dal.admin
            .getUsers({ id: obj.userId }, context)
            .then((result) =>
              dalUtil.sanitizeField(
                _.get(result, 'records[0].kvp.lastName', null)
              )
            )
        : null
  };
};
