/**
 * Contains the extended Workflow including flow templates, flow revisions, etc.
 */
const fs = require('fs');
const _ = require('lodash');

module.exports = function createModule(serviceContext) {
  const config = serviceContext.config;
  if (_.get(config, 'featureFlags.enableRBACFeature', false) === false) {
    return {
      resolvers: {},
      typeDefs: [
        fs.readFileSync('./modules/rbacAuth/rbac_permissions.graphql', 'utf8')
      ]
    };
  }

  serviceContext.bll.rbacAuth = require('./bll/rbacAuth.bll.js')(
    serviceContext
  );

  const typeDefs = [
    fs.readFileSync('./modules/rbacAuth/rbac.graphql', 'utf8'),
    fs.readFileSync('./modules/rbacAuth/approles.graphql', 'utf8'),
    fs.readFileSync('./modules/rbacAuth/rbac_permissions.graphql', 'utf8')
  ];
  const resolvers = {
    Query: require('./Query.js')(serviceContext, config),
    Mutation: require('./Mutation.js')(serviceContext, config),
    AuthGroup: require('./RBACAuthGroup.js')(serviceContext, config),
    AuthPermissionSet: require('./RBACAuthPermissionSet.js')(
      serviceContext,
      config
    ),
    AuthACE: require('./RBACAuthACE.js')(serviceContext, config),
    AuthGroupMember: {
      __resolveType(obj) {
        if (_.has(obj, 'systemUser')) return 'User';
        return 'AuthGroup';
      }
    },
    AuthResourceOwner: {
      __resolveType(obj) {
        if (_.has(obj, 'email')) return 'BasicUserInfo';
        return 'AuthGroup';
      }
    },
    User: require('./User.js')(serviceContext, config),
    Folder: require('./Folder.js')(serviceContext),
    TemporalDataObject: require('./TemporalDataObject.js')(serviceContext),
    PermissionAudit: require('./PermissionAudit.js')(serviceContext),
    PermissionGrantAudit: require('./PermissionGrantAudit.js')(serviceContext),
    PermissionGrant: require('./PermissionGrant.js')(serviceContext),
    ResourceIdentifier: require('./ResourceIdentifier.js')(serviceContext),
    StructuredData: require('./StructuredData.js')(serviceContext)
  };

  return {
    resolvers,
    typeDefs
  };
};
