const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  return {
    imageUrl: (obj) => util.getSignedUrlOrVirtual(_.get(obj, 'kvp.image')),
    guid: (obj) => obj.organizationGuid,
    isUserPendingMember: (obj, args, context) => {
      if (!args.email || args.email === '') {
        return false;
      }
      const organizationId = obj.id;
      const statuses = ['submitted', 'approved', 'completed'];
      return serviceContext.dal.organizationInvite
        .getOrganizationInvites(
          { organizationId },
          { email: args.email, statuses },
          context
        )
        .then(function (result) {
          return !_.isEmpty(result);
        });
    }
  };
};
