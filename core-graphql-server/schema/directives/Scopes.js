const fpl = require('@veritone/functional-permissions-lib');
const _ = require('lodash');

/**
 * Verifies that the user has the required permissions,
 * based on functional-permissions-lib.
 * Throws error if the user doesn't have required permissions or
 * if no authentication data is present.
 * args:  perms: [String!]
 */

module.exports = function create(directiveContext) {
  const util = require('../../resolvers/util.js')(directiveContext);
  const config = directiveContext.schemaConfig;
  const mainUtil = require('../../util.js')({
    config: directiveContext.appConfig
  });
  const errors = require('../../error')(directiveContext.appConfig);
  const logger = directiveContext.logger;
  const rbacAuth = _.get(
    directiveContext,
    'serviceContext.bll.rbacAuth',
    _.get(directiveContext, 'bll.rbacAuth')
  );

  return {
    name: 'scopes',
    before: true,

    resolver: async (directiveArgs, fieldArgs, context, info) => {
      if (!context._authInfo) {
        throw new errors.AuthenticationError();
      }
      const configVal = _.get(
        directiveContext.appConfig,
        'featureFlags.enableRBACFeature',
        false
      );
      const rbacFeatureFlag = _.get(
        context._authInfo,
        'organization.kvp.features.enableRBACFeature',
        'disabled'
      );

      const verifyAccessViaRBACFeature = async () => {
        const directivesOfParentType = util.getDirectivesFromInfo(info);
        const hasRBACDirective = _.some(directivesOfParentType, ({ name }) =>
          [
            'requireAuthRole',
            'verifyAuthRoleAccess',
            'authListFilter'
          ].includes(name)
        );
        const isRequireAll = _.toLower(directiveArgs.require) === 'all';

        // ignore @scopes where @requireAuthRole or @verifyAuthRoleAccess exist
        if (hasRBACDirective) {
          return;
        }

        const permissionEnums = fpl.rbacUtil.mapPermissionEnumByKeys(
          directiveArgs.scopes
        );

        if (permissionEnums.length !== directiveArgs.scopes.length) {
          // use legacy verify when cannot correctly mapped rights to permission enums
          return util.verifyAccessViaScopeDirective(
            directiveArgs,
            fieldArgs,
            context,
            info
          );
        }

        // because the default auth permissions only contain the AIWARE_TDO_* permissions, which differ in number of bits from the RECORDING_* permissions.
        const recordingPermissions = {
          RECORDING_CREATE: 'AIWARE_TDO_CREATE',
          RECORDING_DELETE: 'AIWARE_TDO_DELETE',
          RECORDING_READ: 'AIWARE_TDO_READ',
          RECORDING_UPDATE: 'AIWARE_TDO_UPDATE'
        };
        const newPermissionEnums = [];
        for (const perm of permissionEnums) {
          const mappedPerm = _.get(recordingPermissions, perm);

          // does not map if the 'require' directive argument is set to 'all' and only uses legacy verify.
          if (isRequireAll && mappedPerm) {
            return util.verifyAccessViaScopeDirective(
              directiveArgs,
              fieldArgs,
              context,
              info
            );
          }

          newPermissionEnums.push(perm);
          // add the AIWARE_TDO_* permissions to the 'scopes' directive argument if they correspond to the RECORDING_* permissions.
          if (mappedPerm && !newPermissionEnums.includes(mappedPerm)) {
            newPermissionEnums.push(mappedPerm);
          }
        }

        let verifyOrgRole = false;
        try {
          verifyOrgRole = await rbacAuth.hasOrganizationAuthRole(
            context,
            newPermissionEnums,
            {
              requireAll: isRequireAll,
              throwMismatchOrgRole: true
            }
          );
        } catch (error) {
          logger.error(
            '@scope directive with non-OLP queries and mutations:',
            error
          );
          if (error.name === 'not_found') {
            // use legacy verify when errors are encountered during an orgRole lookup (e.g. missing context AGs, mismatch Org ACLs)
            return util.verifyAccessViaScopeDirective(
              directiveArgs,
              fieldArgs,
              context,
              info
            );
          }

          throw error;
        }

        if (!verifyOrgRole) {
          throw new errors.NotAllowed({
            message: `No authorization access role found for ${info.parentType}.${info.fieldName}`,
            data: {
              field: info.fieldName,
              type: info.type
            }
          });
        }

        return;
      };

      if (configVal != true) {
        util.verifyAccessViaScopeDirective(
          directiveArgs,
          fieldArgs,
          context,
          info
        );
      } else if (rbacFeatureFlag !== 'enabled') {
        util.verifyAccessViaScopeDirective(
          directiveArgs,
          fieldArgs,
          context,
          info
        );
      } else {
        await verifyAccessViaRBACFeature();
      }
    },

    validator(directiveArgs, field) {
      const perms = directiveArgs.scopes;
      if (!perms) {
        throw new Error( // server bug
          'The scopes directive requires the scopes parameter. ' +
            'It is missing from the field ' +
            field.name
        );
      }
      if (!perms.length) {
        throw new Error( // server bug
          'The scopes directive requires that the scopes parameter ' +
            'specify at least one value. It is empty on the field ' +
            field.name
        );
      }
      // The server can be configured with a set of rights outside of
      // functional-permissions-lib that are allowed in permissions.
      // These are currently used by some services for API tokens.
      // We'll allow the permissions string if it's in FPL or in this list.
      const extraPerms = _.get(
        config,
        'directiveValidation.scopes.additionalRights',
        []
      ).map((p) => mainUtil.stringReplace(p, ':', '.')); //  normalize to . notation

      perms.forEach((perm) => {
        const p = mainUtil.stringReplace(perm, ':', '.'); // normalize to . notation
        const val = _.get(fpl.permissions, p);

        if (isNaN(val) && !extraPerms.includes(p)) {
          throw new Error( // server bug
            'The scopes directive requires permissions that are ' +
              'defined in functional-permissions-lib. Field ' +
              field.name +
              ' refers to an invalid permission string, ' +
              perm +
              '. Either the schema reference ' +
              'must be fixed, or the version of functional-permissions-lib that core-graphql-server ' +
              'was built with must be updated.'
          );
        }
      });
    }
  };
};
