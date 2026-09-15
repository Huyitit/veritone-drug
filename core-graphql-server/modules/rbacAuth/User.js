const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const rbacAuthDal = _.get(
    serviceContext,
    'dal.rbacAuth',
    require('./dal/authGroup.dal.js')(serviceContext)
  );
  const mainUtil = require('../../util.js')(serviceContext);

  return {
    authGroupIds: async (obj, args, context) => {
      const userId = _.get(context, '_authInfo.userId');
      if (obj.id === userId) {
        return _.get(context, '_authInfo.authGroups', []);
      }

      // Using function getAuthGroupsContainingMember since it does not include the paging, that is fit with the array ids
      const authGroups = await rbacAuthDal.getAuthGroupsContainingMember(
        obj.id,
        {
          orgGuid: obj.organizationGuid
        }
      );

      return _.map(_.get(authGroups, 'records', []), 'id');
    },
    authGroups: async (obj, args, context) => {
      const options = _.merge({}, args, {
        member: {
          id: obj.id
        },
        orgGuid: obj.organizationGuid,
        unsupportedAuthClasses: ['User'] // the User Default Private AG can’t be listed.
      });
      return rbacAuthDal.getAuthGroups(options);
    }
  };
};
