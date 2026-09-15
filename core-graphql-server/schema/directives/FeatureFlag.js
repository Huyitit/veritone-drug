/**
 * Implements mutation, query, and field-level feature flags within the schema.
 * This directive does not prevent the field from being visible in the documentation
 * and schema. It only throws an error preventing a user from attempting to
 * use the field.
 *
 * First checks org feature config (kvp.features.<feature name>).
 * Some features in the org feature map are nested, with the enabled/disabled
 * flag at the leaf. Use feature.subfeature as the feature name in the directive
 * to reference these.
 *
 * Org flags are checked first. If the feature is not explicitly applied to
 * the org, the config is checked.
 *
 * To completely hide features, use separate schema module that is only enabled
 * on certain environments. This method applies only to server-level feature
 * flags, not org-level feature flags.
 */
const _ = require('lodash');

module.exports = function create(directiveContext) {
  const config = directiveContext.appConfig;
  const errors = require('../../error')(directiveContext.appConfig);
  const util = require('../../resolvers/util.js')(directiveContext);

  function getOrganizationDal() {
    const res = _.get(
      directiveContext,
      'serviceContext.dal.organization',
      _.get(directiveContext, 'dal.organization')
    );

    if (!res) throw new Error('config error: no organization dal');

    return res;
  }

  return {
    name: 'featureFlag',
    before: true,

    async resolver(directiveArgs, fieldArgs, context, info) {
      // extract name of feature flag
      const featureName = directiveArgs.name || info.fieldName;

      // if there is an authentication context, get the org.
      if (context._authInfo) {
        let disableOrgText = 'your organization';
        let userOrg = context._authInfo.organization;

        const isSuperAdmin = util.isSuperAdmin(context._authInfo);
        const isInternalToken = util.getTokenType(context) === 'internal';
        const ownerOrgFieldName = _.get(
          directiveArgs,
          'ownerOrgFieldPath',
          'ownerOrganization'
        );
        const ownerOrgId = _.get(fieldArgs, ownerOrgFieldName);

        // only superAdmin and internalToken can validate featureFlag on an org from input.
        if ((isSuperAdmin || isInternalToken) && ownerOrgId) {
          disableOrgText = 'owner organization';
          userOrg = await getOrganizationDal().getOrganization(context, {
            id: ownerOrgId
          });
        }

        const feature = _.get(userOrg, `kvp.features.${featureName}`);
        // if feature is explicity disabled, throw out.
        // for org-less tokens this will always be non-truthy
        // so we'll fall back on config
        if (feature === 'disabled') {
          throw new errors.NotImplemented({
            message:
              `The field ${info.parentType}.${info.fieldName}` +
              ` implements a feature that is not available in ${disableOrgText}.` +
              `Consult ${disableOrgText} administrator or Veritone support for ` +
              'information on how to enable the feature.',
            data: {
              field: info.fieldName,
              type: info.parentType,
              organizationId: userOrg.organizationId,
              feature: featureName
            }
          });
          // if feature is explicitly enabled in org, return out and
          // skip config check
        } else if (feature === 'enabled') return;
      }

      // otherwise we continue and check config for feature flag.

      // always defined. defaults to false.
      const defaultValue = directiveArgs.defaultValue;
      const configVal = _.get(
        config,
        `featureFlags.${featureName}`,
        defaultValue
      );

      // this will always be true or false. if false, throw out error.
      if (!configVal) {
        throw new errors.NotImplemented({
          message:
            'The field ' +
            info.parentType +
            '.' +
            info.fieldName +
            ' implements a feature that is not available on this server. ' +
            'The feature may become available at a future time. Consult ' +
            'Veritone support for additional information.',
          data: {
            field: info.fieldName,
            type: info.parentType,
            feature: featureName
          }
        });
      }
    }
  };
};
