/**
 * Requires authentication and injects authentication and authorization
 * information into the context.
 */
const _ = require('lodash');
const fpl = require('@veritone/functional-permissions-lib');

module.exports = function create(directiveContext) {
  const util = require('../../resolvers/util.js')(directiveContext);
  const mainUtil = require('../../util.js')(directiveContext);
  const errors = require('../../error')(directiveContext.appConfig);
  const logger = directiveContext.logger;
  const rbacAuth = _.get(
    directiveContext,
    'serviceContext.bll.rbacAuth',
    _.get(directiveContext, 'bll.rbacAuth')
  );

  const enableRBACFeature = _.get(
    directiveContext,
    'config.featureFlags.enableRBACFeature',
    false
  );

  function getRbacBll() {
    if (!rbacAuth) throw new Error('config error: no organization dal');
    return rbacAuth;
  }

  async function preRequestAuthResolver(
    directiveArgs,
    fieldArgs,
    context,
    info
  ) {
    if (!enableRBACFeature) {
      return;
    }
    if (!context._authInfo) {
      context._authInfo = util.requireAuthInfo(context);
    }

    const rbacAuth = getRbacBll();
    const authInfo = context._authInfo;
    const userOrg = _.get(authInfo, 'organization');
    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      userOrg,
      undefined,
      'enableRBACFeature'
    );

    if (
      !useRBACFeature &&
      // jwt with non-empty authGroups is considered as OLP enabled
      !(
        _.get(context, 'requestContext.authTokenType') === 'jwt' &&
        !_.isEmpty(_.get(context, 'requestContext.jwtToken.authGroups'))
      )
    ) {
      context._rbacDisabled = true;
      return;
    }

    // skip required auth check if this resource type has RBAC disabled
    const useRBACForResourceType = await _useRBACFeatureForResourceType(
      context,
      directiveArgs
    );
    if (!useRBACForResourceType) {
      return;
    }

    // get the requested resource ids and the required permissions for the type
    const allResources = getResourceIds(directiveArgs, fieldArgs);
    const throwNotAllowedError = (payload = {}) => {
      throw new errors.NotAllowed({
        message: `No authorization access role found for ${info.parentType}.${info.fieldName}`,
        data: {
          field: info.fieldName,
          type: info.type,
          ids: prettyPrintIds(resources),
          ...payload
        }
      });
    };

    const parentResourceMap = new Map();
    const resources = new Map();
    // filter parent resources and child resources
    for (const [resourceType, value] of allResources) {
      if (value.isParent) {
        parentResourceMap.set(resourceType, value);
      } else {
        resources.set(resourceType, value);
      }
    }

    if (resources.size) {
      // check for matching resource roles
      try {
        const granted = await rbacAuth.hasResourceAuthRole(
          context,
          resources,
          true
        );
        context._authGranted = new Map();
        for (const [k, v] of granted) {
          context._authGranted.set(k, { ids: v });
        }
        return;
      } catch (failed) {
        // Fallback to check parent resource and fallthrough to auth via orgRole
        if (
          !parentResourceMap.size &&
          (!directiveArgs.orgRole || !directiveArgs.orgRole.length)
        ) {
          rbacAuth.emitAuthFailure(context, resources, failed);
          throwNotAllowedError({
            denied: failed
          });
        }
      }
    }

    // check if auth is granted via parentResource
    if (parentResourceMap.size) {
      try {
        const granted = await rbacAuth.hasResourceAuthRole(context, parentResourceMap, true);
        if (granted.size) {
          context._authGranted = resources;
        }
        return;
      } catch (failed) {
        if (!directiveArgs.orgRole || !directiveArgs.orgRole.length) {
          rbacAuth.emitAuthFailure(context, resources, failed);
          throwNotAllowedError({
            denied: failed
          });
        }
      }
    }

    // check if auth is granted via orgPermission
    if (directiveArgs.orgRole && directiveArgs.orgRole.length) {
      const verifyOrgRole = await rbacAuth.hasOrganizationAuthRole(
        context,
        directiveArgs.orgRole,
        {
          requireAll: directiveArgs.orgRoleRequireAll
        }
      );

      if (verifyOrgRole) {
        rbacAuth.emitAuthSuccessViaOrgRole(
          context,
          resources,
          directiveArgs.orgRole
        );
        if (resources.size) {
          context._authGranted = resources;
        }
        return;
      }
    }

    // the caller doesn't have the required access
    rbacAuth.emitAuthFailure(context, resources);
    throwNotAllowedError();
  }

  async function postRequestAuthResolver(
    _source,
    directiveArgs,
    fieldArgs,
    context,
    info,
    result,
    err
  ) {
    if (err) {
      throw err; // rethrow the error to let graphql error handling take it
    }
    if (!enableRBACFeature || context._rbacDisabled) {
      return result;
    }
    const authInfo = util.requireAuthInfo(context);
    const userOrg = _.get(authInfo, 'organization');
    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      userOrg,
      undefined,
      'enableRBACFeature'
    );

    if (!useRBACFeature || !result) {
      return result;
    }

    // skip filtering resources if this resource type has RBAC disabled
    const useRBACForResourceType = await _useRBACFeatureForResourceType(
      context,
      directiveArgs
    );
    if (!useRBACForResourceType) {
      return result;
    }

    if (result._authChecked) {
      // TODO: check if source is object vs field?
      // short circuit for the multiple field validation
      return result;
    }
    result._authChecked = true;
    let results = result;
    if (!Array.isArray(result)) {
      if (Array.isArray(result.records)) {
        results = results.records;
      } else {
        results = [result];
      }
    }

    const remainingAuth = checkCachedAuth(directiveArgs, results, context);
    if (!remainingAuth.length) {
      // auth already granted
      return result;
    }

    // Load User Groups in the context if not available
    await rbacAuth.populateAuthContext(context);
    if (Array.isArray(result)) {
      result = await filterResultArray(
        result,
        directiveArgs,
        context,
        fieldArgs,
        info
      );
    } else if (Array.isArray(result.records)) {
      result.records = await filterResultArray(
        result.records,
        directiveArgs,
        context,
        fieldArgs,
        info
      );
      result.count = result.records.length;
    } else {
      const r = await filterResultArray(
        [result],
        directiveArgs,
        context,
        fieldArgs,
        info
      );
      if (!r.length) {
        // post-request denials: emit AuthorizationDenied before throwing
        rbacAuth.emitAuthFailure(
          context,
          getResourceIds(directiveArgs, result)
        );
        throw new errors.NotAllowed({
          message: `No authorization access role found for ${_.get(
            _source,
            'name'
          )}`,
          data: {}
        });
      }
    }
    return result;
  }

  async function filterAuthAugmenter(directiveArgs, fieldArgs, context, info) {
    if (!enableRBACFeature) {
      return;
    }
    if (!context._authInfo) {
      context._authInfo = util.requireAuthInfo(context);
    }
    const authInfo = context._authInfo;
    const userOrg = _.get(authInfo, 'organization');
    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      userOrg,
      undefined,
      'enableRBACFeature'
    );

    if (!useRBACFeature) {
      return;
    }

    // skip building filter if this resource type has RBAC disabled
    const useRBACForResourceType = await _useRBACFeatureForResourceType(
      context,
      directiveArgs
    );
    if (!useRBACForResourceType) {
      return;
    }

    const rbacAuth = getRbacBll();

    // check if the user has org-wide access to the resource type
    // if so - no need to build a filter
    if (directiveArgs.orgRole && directiveArgs.orgRole.length) {
      const verifyOrgRole = await rbacAuth.hasOrganizationAuthRole(
        context,
        directiveArgs.orgRole
      );
      if (verifyOrgRole) {
        return;
      }
    }
    context._rbacAuthFilter = await rbacAuth.buildAuthFilter(
      context,
      directiveArgs
    );
  }

  function validator(directiveArgs, field, schema) {
    if (!directiveArgs.roles || !directiveArgs.roles.length) {
      if (!directiveArgs.orgRole) {
        throw new Error('at least one authRole definition is required');
      }
    }
  }

  function inheritACLValidator(directiveArgs) {
    if (!directiveArgs.source || !Array.isArray(directiveArgs.target)) {
      throw new Error('@authInherit requires a source and target definition');
    }
    const resourceDefinitions = [...directiveArgs.target, directiveArgs.source];
    for (const r of resourceDefinitions) {
      if (!r.resourceType || !r.resourceIdFieldPath) {
        throw new Error(
          '@authInherit requires a valid source and target definition'
        );
      }
    }
  }

  return {
    requireAuthRole: {
      name: 'requireAuthRole',
      before: true,
      typeResolver: postRequestAuthResolver,
      resolver: preRequestAuthResolver,
      validator
    },
    verifyAuthRoleAccess: {
      name: 'verifyAuthRoleAccess',
      before: false,
      resolver: postRequestAuthResolver,
      validator
    },
    authListFilter: {
      name: 'authListFilter',
      before: true,
      resolver: filterAuthAugmenter,
      validator
    },
    authInherit: {
      name: 'authInherit',
      before: false,
      resolver: inheritACEsMutator,
      validator: inheritACLValidator
    }
  };

  // Internal util functions
  function getResourceIds(directiveArgs, fieldArgs) {
    const resourcesMap = new Map();
    for (const r of directiveArgs.roles || []) {
      const fieldName = r.resourceIdFieldPath || fieldArgs.__directiveArgName;
      let ids = _getIdsByFieldName(fieldName, fieldArgs);
      const parentIds = _getIdsByFieldName(r.parentPath, fieldArgs);

      // convert aceIds to resourceIds
      ids = ids.map((id) => {
        if (typeof id === 'string' && id.includes('::')) {
          const parts = id.split('::');
          return parts[1] || id;
        }
        return id;
      });

      let resourceType = r.resourceType;
      if (!resourceType && r.resourceTypePath) {
        resourceType = _.get(fieldArgs, r.resourceTypePath);
      }

      // if r.parentType is not set, it is the same as r.resourceType
      if (_.isNil(r.parentType)) {
        ids.push(...parentIds);
      } else {
        resourcesMap.set(r.parentType, {
          ids: new Set(parentIds),
          isParent: true,
          permissions: r.permissions
        });
      }

      if (!_.isEmpty(ids) && !_.isNil(resourceType)) {
        resourcesMap.set(resourceType, {
          ids: new Set(ids),
          isParent: false,
          parentIds: new Set(parentIds),
          parentType: r.parentType,
          permissions: r.permissions
        });
      }
    }
    return resourcesMap;
  }

  function _getIdsByFieldName(fieldName, fieldArgs) {
    let ids = _.get(fieldArgs, fieldName);
    if (_.isNil(ids)) {
      // a bit of guesswork here, but the input object name is not passed in the context
      ids = _.get(fieldArgs, 'input.' + fieldName);
    }
    if (!_.isNil(ids)) {
      if (!Array.isArray(ids)) {
        ids = [ids];
      }
    }

    return ids ?? [];
  }

  function checkCachedAuth(directiveArgs, results, context) {
    if (!context._authGranted) {
      return results;
    }
    const missing = [];
    for (const role of directiveArgs.roles || []) {
      const typeCache = context._authGranted.get(role.resourceType);
      if (!typeCache || !typeCache.ids) {
        return results;
      }
      if (role.resourceIdFieldPath) {
        for (const r of results) {
          const id = _.get(r, role.resourceIdFieldPath);
          if (!typeCache.ids.has(id)) {
            missing.push(r);
          }
        }
      }
    }
    return missing;
  }

  function appendToIdMap(sourceMap, addMap) {
    for (const [key, value] of addMap) {
      if (!sourceMap.has(key)) {
        sourceMap.set(key, value);
      } else {
        const s = sourceMap.get(key);
        for (const id of value.ids) {
          s.ids.add(id);
        }
      }
    }
  }

  async function filterResultArray(
    resultArray,
    directiveArgs,
    context,
    fieldArgs,
    info
  ) {
    const resourceMap = new Map();
    const resultMap = new Map();
    resultArray.map((r, idx) => {
      const resourceIds = getResourceIds(directiveArgs, r);
      resultMap.set(idx, _.cloneDeep(resourceIds)); // use _.cloneDeep to prevent appending on resultMap
      appendToIdMap(resourceMap, resourceIds);
    });
    const authorizedResources = await getRbacBll().hasResourceAuthRole(
      context,
      resourceMap,
      false
    );

    // if none of the resources was given access, return empty array
    let grantedAuth = [];
    if (authorizedResources && authorizedResources.size) {
      // filter out by ids present in the list of authorized resources
      grantedAuth = resultArray.filter((x, idx) => {
        const idMap = resultMap.get(idx);
        let match = false;
        for (let [resourceType, v] of idMap) {
          const resultSet = v.ids || new Set();
          const authorizedSet = authorizedResources.get(resourceType);
          const resultParentSet = v.parentIds || new Set();
          const authorizedParentSet = v.parentType ? authorizedResources.get(v.parentType) : new Set();
          if (authorizedSet && resultSet.size) {
            match = true;
            for (const r of resultSet) {
              if (!authorizedSet.has(r)) {
                match = false;
              }

              // only check parent access if direct access failed
              if (!match && authorizedParentSet?.size && resultParentSet?.size) {
                for (const r of resultParentSet) {
                  if (authorizedParentSet.has(r)) {
                    match = true;
                    break;
                  }
                }
              }
            }
          }
        }
        return match;
      });
    }

    // if some of the results are filtered out, check if org role allows that.
    if (grantedAuth.length < resultArray.length) {
      if (directiveArgs.orgRole && directiveArgs.orgRole.length) {
        // only applies the org-level permissions check when the @scopes directive is found in the root AST node;
        // otherwise, it uses the old logic for backward compatibility.
        const directives = util.getDirectivesFromInfo(info, {
          findByOperation: false
        });
        const scopesDirectiveInRoot = _.find(directives, { name: 'scopes' });
        const hasScopesDirectiveInRoot = !_.isNil(scopesDirectiveInRoot);

        try {
          const verifyOrgRole = await rbacAuth.hasOrganizationAuthRole(
            context,
            directiveArgs.orgRole,
            {
              throwMismatchOrgRole: hasScopesDirectiveInRoot
            }
          );
          if (verifyOrgRole) {
            grantedAuth = resultArray;
          }
        } catch (error) {
          logger.error(
            'Fallback to the org-level permissions check when RBAC directives check fails:',
            error
          );

          // use the org-level permissions check when errors are encountered during an orgRole lookup
          // (e.g. missing context AGs, mismatch Org ACLs)
          if (error.name === 'not_found' && hasScopesDirectiveInRoot) {
            const rightsInScopes = _.get(
              scopesDirectiveInRoot,
              'args.scopes',
              []
            );
            const rights = fpl.rbacUtil.permissionMaskToKeys(
              fpl.rbacUtil.getPermissionMask(
                fpl.rbacUtil.mapPermissionKeyByEnums(
                  directiveArgs.orgRole || []
                )
              )
            );
            try {
              util.verifyAccessViaScopeDirective(
                {
                  scopes: [...rights, ...rightsInScopes],
                  require: 'Any'
                },
                fieldArgs,
                context,
                info
              );
              grantedAuth = resultArray;
            } catch (err) {
              if (directiveArgs.throwErr) {
                throw err;
              }
            }
          }
        }
      }
    }
    return grantedAuth;
  }

  function prettyPrintIds(idMap) {
    const types = [];
    for (const [type, value] of idMap) {
      types.push(`${type}: ${Array.from(value.ids).join(',')}`);
    }
    return types.join(';');
  }

  function getSourceTargetIdValues(directiveArgs, fieldArgs, result) {
    const sourceId = _.get(fieldArgs, directiveArgs.source.resourceIdFieldPath);
    if (!sourceId) {
      return null;
    }
    const source = {
      type: directiveArgs.source.resourceType,
      id: sourceId
    };
    const targets = [];
    for (const t of directiveArgs.target || []) {
      let targetId;
      if (_.startsWith(t.resourceIdFieldPath, 'result.')) {
        const path = t.resourceIdFieldPath.split('.', 2)[1];
        targetId = _.get(result, path);
      } else {
        targetId = _.get(fieldArgs, t.resourceIdFieldPath);
      }
      if (targetId) {
        targets.push({
          type: t.resourceType,
          id: targetId
        });
      }
    }
    if (targets.length === 0) {
      return null;
    }
    return {
      source,
      targets
    };
  }

  async function inheritACEsMutator(
    _source,
    directiveArgs,
    fieldArgs,
    context,
    _info,
    result,
    err
  ) {
    if (err) {
      throw err; // rethrow the error to let graphql error handling take it
    }
    if (!enableRBACFeature) {
      return result;
    }
    const authInfo = util.requireAuthInfo(context);
    const userOrg = _.get(authInfo, 'organization');
    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      userOrg,
      undefined,
      'enableRBACFeature'
    );

    if (!useRBACFeature || !result) {
      return result;
    }

    // skip if the operation's selection has the addACEs field
    const selections = _.get(
      _info,
      'operation.selectionSet.selections[0].selectionSet.selections',
      []
    );
    const addACEsField = _.find(
      selections,
      (selection) =>
        selection.kind === 'Field' &&
        _.get(selection, 'name.value', '') === 'addACEs'
    );

    if (addACEsField) {
      return result;
    }

    try {
      const resources = getSourceTargetIdValues(
        directiveArgs,
        fieldArgs,
        result
      );
      if (resources) {
        await rbacAuth.inheritResourceACEs(context, resources);
      }
    } catch (err) {
      const serviceContext = directiveContext.serviceContext;
      if (serviceContext && serviceContext.messageUtil) {
        // log it for reporting purposes
        serviceContext.messageUtil.emitEvent({
          event: 'warning',
          errorName: 'api_olp_inherit',
          errorData: {
            error: err
          }
        });
      }
      // otherwise we just emit a warning in the response and continue.
      if (context.requestInfo) {
        if (!context.requestInfo.warnings) {
          context.requestInfo.warnings = [];
        }
        context.requestInfo.warnings.push({
          event: 'warning',
          errorName: 'api_olp_inherit',
          message: 'Failed to propagate parent ACL'
        });
      }
    }
    return result;
  }

  /**
   * Checks if RBAC feature is enabled for all resource types specified in the directive
   * 
   * @param {*} context 
   * @param {*} directiveArgs 
   * @returns {boolean} true if RBAC is enabled for all resource types, false otherwise
   */
  async function _useRBACFeatureForResourceType(context, directiveArgs) {
    const userOrg = _.get(context._authInfo, 'organization');
    const resourceTypes = _extractResourceTypesFromDirective(directiveArgs);

    for (const resourceType of resourceTypes) {
      const isEnabled = await rbacAuth.useRBACFeatureForResourceType(
        context, userOrg, resourceType
      );
      if (!isEnabled) {
        return false;
      }
    }
    return true;
  }
};

function _extractResourceTypesFromDirective(directiveArgs) {
  const resourceTypes = new Set();

  // From roles array
  if (Array.isArray(directiveArgs?.roles)) {
    for (const role of directiveArgs.roles) {
      if (role.resourceType) resourceTypes.add(role.resourceType);
      if (role.parentType) resourceTypes.add(role.parentType);
    }
  }

  // From direct resourceType
  if (directiveArgs?.resourceType) {
    resourceTypes.add(directiveArgs.resourceType);
  }

  // From direct parentType
  if (directiveArgs?.parentType) {
    resourceTypes.add(directiveArgs.parentType);
  }

  return Array.from(resourceTypes);
}
