const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);

  async function updateOrganizationCluster(context, args) {
    const input = args.input;
    enforcePermissions(context, input.organizationId);

    const actionType = input.action;
    if (!actionType) {
      return deprecatedUpdateOrganizationCluster(context, input);
    }

    let preferenceType = 'organization';
    if (actionType === 'setOverride' || actionType === 'removeOverride') {
      preferenceType = 'org_always_run';
    }
    let isOperationSet = true;
    if (actionType === 'removeDefault' || actionType === 'removeOverride') {
      isOperationSet = false;
    }

    if (isOperationSet) {
      const clusterPreference = await serviceContext.dal.cluster.setClusterByPreference(
        context,
        {
          clusterId: input.clusterId,
          preferenceKey: input.organizationId,
          preferenceType
        }
      );
      return {
        clusterId: clusterPreference.clusterId,
        organizationId: clusterPreference.preferenceKey
      };
    } else {
      await serviceContext.dal.cluster.deleteClusterPreference(context, {
        clusterId: input.clusterId,
        preferenceKey: input.organizationId,
        preferenceType
      });
      return {
        clusterId: input.clusterId,
        organizationId: input.organizationId.toString()
      };
    }
  }

  function enforcePermissions(context, organizationId) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (!isSuperAdmin) {
      const requestorOrgId = _.get(
        context,
        '_authInfo.organization.organizationId'
      );

      if (organizationId != requestorOrgId) {
        throw new errors.NotAllowed({
          message:
            'Only superadmin user can update default Cluster for other organizations',
          data: {
            organizationId: organizationId,
            requestorOrgId
          }
        });
      }
    }
  }

  async function deprecatedUpdateOrganizationCluster(context, input) {
    const isAlwaysUse = _.get(input, 'isAlwaysUse');
    // in case add a default cluster
    if (_.isNil(isAlwaysUse) || isAlwaysUse === false) {
      const clusterPreference = await serviceContext.dal.cluster.setClusterByPreference(
        context,
        {
          clusterId: input.clusterId,
          preferenceType: 'organization',
          preferenceKey: input.organizationId
        }
      );

      return {
        clusterId: clusterPreference.clusterId,
        organizationId: clusterPreference.preferenceKey
      };
    } else {
      if (isAlwaysUse) {
        await serviceContext.dal.cluster.setClusterByPreference(context, {
          clusterId: input.clusterId,
          preferenceType: 'org_always_run',
          preferenceKey: input.organizationId
        });
      } else {
        await serviceContext.dal.cluster.deleteClusterPreference(context, {
          clusterId: input.clusterId,
          preferenceType: 'org_always_run',
          preferenceKey: input.organizationId
        });
      }
    }

    return {
      clusterId: input.clusterId,
      organizationId: input.organizationId,
      isAlwaysUse
    };
  }

  /**
   * Override the current default with the new one or create a new
   * for environment/organization/business unit.
   *
   * @param {Object} context The request context
   * @param {Object} args
   * @param {number} args.setAsDefaultForOrganization ID of organization
   * @param {boolean} args.setAsEnvironmentDefaultCluster
   * @param {string[]} args.setAsDefaultForBUs Array of business units
   */
  async function updateClusterPreferences(context, args) {
    const {
      setAsDefaultForOrganization,
      setAsEnvironmentDefaultCluster,
      setAsDefaultForBUs,
      id
    } = _.get(args, 'input', {});
    const preferencePromises = [];
    const businessUnitSet = new Set();

    if (!id) {
      throw new errors.InvalidInput({ message: 'clusterId is required.' });
    }

    if (!_.isEmpty(setAsDefaultForBUs)) {
      setAsDefaultForBUs.forEach((item) => businessUnitSet.add(item));
    }

    // only superadmin user can set or override defaut cluster for BU and Environment
    if (setAsEnvironmentDefaultCluster || businessUnitSet.size) {
      enforcePermissions(context);
    }

    // since there should be only 1 default cluster per environment,
    // so override the current default with the new one or create one.
    if (setAsEnvironmentDefaultCluster) {
      preferencePromises.push(
        serviceContext.dal.cluster.setClusterByPreference(context, {
          clusterId: id,
          preferenceType: 'default',
          preferenceKey: 'default'
        })
      );
    }

    // since there should be only 1 default cluster for a business unit,
    // set or override default cluster for business units
    if (businessUnitSet.size) {
      for (const bu of businessUnitSet) {
        preferencePromises.push(
          serviceContext.dal.cluster.setClusterByPreference(context, {
            clusterId: id,
            preferenceType: 'business_unit',
            preferenceKey: bu
          })
        );
      }
    }

    // set or override default cluster for an organization
    if (setAsDefaultForOrganization) {
      const newArgs = {
        ...args,
        input: {
          clusterId: id,
          organizationId: setAsDefaultForOrganization,
          action: 'setOverride'
        }
      };
      preferencePromises.push(updateOrganizationCluster(context, newArgs));
    }

    if (preferencePromises.length > 0) {
      await Promise.all(preferencePromises);
    }
  }

  return {
    updateOrganizationCluster,
    updateClusterPreferences
  };
};
