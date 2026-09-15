const _ = require('lodash');
const validator = require('validator');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const util = require('../util.js')(serviceContext);

  async function createRegistrationConfiguration(context, args) {
    const { input } = args;

    input.organizationGuid =
      input.organizationGuid ||
      _.get(context, '_authInfo.organization.organizationGuid');

    await validateCreateInput(context, input);
    await validateInputAndAccess(context, input);

    try {
      return await serviceContext.dal.organizationRegistration.createRegistrationConfiguration(
        context,
        input
      );
    } catch (error) {
      serviceContext.logger.error(
        'Error when creating registration configuration',
        error
      );

      if (error.name === 'resource_conflict') {
        throw new errors.ResourceConflict({
          message: error.message,
          data: error.data
        });
      }
      throw new errors.InternalServerError({
        message: 'Failed to create registration configuration',
        data: {
          error: error.message
        }
      });
    }
  }

  async function updateRegistrationConfiguration(context, args) {
    const { input } = args;

    input.id = args.id;

    await validateExistingRegistrationConfig(context, input);
    await validateInputAndAccess(context, input);

    try {
      return await serviceContext.dal.organizationRegistration.updateRegistrationConfiguration(
        context,
        input
      );
    } catch (error) {
      serviceContext.logger.error(
        'Error when updating registration configuration',
        error
      );

      if (error.name === 'resource_conflict') {
        throw new errors.ResourceConflict({
          message: error.message,
          data: error.data
        });
      }
      throw new errors.InternalServerError({
        message: 'Failed to update registration configuration',
        data: {
          error: error.message
        }
      });
    }
  }

  async function deleteRegistrationConfiguration(context, args) {
    const { id } = args;

    await validateExistingRegistrationConfig(context, { id });

    try {
      return await serviceContext.dal.organizationRegistration.deleteRegistrationConfiguration(
        context,
        args
      );
    } catch (error) {
      serviceContext.logger.error(
        'Error when deleting registration configuration',
        error
      );

      throw new errors.InternalServerError({
        message: 'Failed to delete registration configuration',
        data: {
          error: error.message
        }
      });
    }
  }

  async function validateExistingRegistrationConfig(context, input) {
    util.checkId(input.id, false);

    const configOrgId = await serviceContext.dal.organizationRegistration._registrationConfigurationPrefetch(
      context,
      input.id
    );

    if (!configOrgId) {
      throw new Error(
        `Failed to retrieve registration configuration with ${input.id}.`
      );
    }

    const orgAccess = await serviceContext.dal.admin.allowedToUpdateOrganization(
      context,
      configOrgId
    );

    if (!orgAccess) {
      throw new errors.NotAllowed({
        message: 'Access denied',
        data: {
          objectType: 'Organization',
          objectId: configOrgId
        }
      });
    }
  }

  async function validateCreateInput(context, input) {
    if (!input.organizationGuid || !validator.isUUID(input.organizationGuid)) {
      throw new errors.InvalidInput({
        message: `organizationGuid must be a valid UUID: ${input.organizationGuid}`
      });
    }

    if (!input.name) {
      throw new errors.InvalidInput({
        message: 'Name is required'
      });
    }
  }

  async function validateInputAndAccess(context, input) {
    if (Object.prototype.hasOwnProperty.call(input, 'name') && !input.name) {
      throw new errors.InvalidInput({
        message: 'Name is required'
      });
    }

    // validate domain settings
    if (input.openRegistrationStatus === 'restricted') {
      // validate domains
      input.domainSettings.forEach((domain) => {
        if (!validator.isFQDN(domain.domainName)) {
          throw new errors.InvalidInput({
            message: 'Invalid domain',
            data: {
              domainName: domain.domainName
            }
          });
        }
      });
    }

    const orgAccess = await serviceContext.dal.admin.allowedToUpdateOrganization(
      context,
      input.organizationGuid
    );

    if (!orgAccess) {
      throw new errors.NotAllowed({
        message: 'Access denied',
        data: {
          objectType: 'Organization',
          objectId: input.organizationGuid
        }
      });
    }

    // validate application role ids
    const roleIds = [
      ...new Set(
        input.domainSettings.flatMap((domain) => domain.applicationRoleIds)
      )
    ];

    const roleRes = await serviceContext.dal.role
      .getRoles(context, {
        id: roleIds
      })
      .catch((_) => []);

    if (
      _.isEmpty(roleRes.records) ||
      roleRes.records.length !== roleIds.length
    ) {
      throw new errors.InvalidInput({
        message: 'Invalid input applicationRoleIds',
        data: {
          objectType: 'roleIds',
          objectId: roleIds
        }
      });
    }

    // validate file urls and strip owned storage url signature
    if (input.files) {
      input.files.forEach((file) => {
        if (!file.name) {
          throw new errors.InvalidInput({
            message: 'File name is required'
          });
        }
        if (!validator.isURL(file.url)) {
          throw new errors.InvalidInput({
            message: 'Invalid URL',
            data: {
              url: file.url
            }
          });
        }
        file.url = resUtil.stripOwnedStorageUrlSignature(file.url);
      });

      const typeCount = {};
      // Validate that there is only one active file per type
      input.files
        .filter((file) => file.status === 'active')
        .forEach((file) => {
          if (typeCount[file.type]) {
            throw new errors.InvalidInput({
              message: `Multiple active files with type ${file.type} are not allowed`,
              data: {
                type: file.type
              }
            });
          }
          typeCount[file.type] = true;
        });
    }
  }

  return {
    createRegistrationConfiguration,
    updateRegistrationConfiguration,
    deleteRegistrationConfiguration
  };
};
