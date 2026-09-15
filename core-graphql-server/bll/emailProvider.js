const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const decryptKeyDefault = serviceContext.config.decryptKeyDefault;
  const { decryptObject } = require('@veritone/core-server-base/util.js')();
  const errors = require('../error')(serviceContext.config);

  async function addPlatformEmailProvider(context, input) {
    const {
      fromAddress,
      provider,
      connectionString,
      apiKey,
      encryptionKey
    } = input;

    try {
      const externalCredential = {
        serviceType: 'email-provider',
        credentialName: fromAddress,
        key: apiKey,
        externalCredentialId: fromAddress,
        organizationId: _.get(context, '_authInfo.organization.organizationId'),
        connectionString: connectionString,
        provider: provider
      };

      await serviceContext.dal.externalCredential.createExternalCredential(
        context,
        externalCredential,
        encryptionKey || decryptKeyDefault
      );

      return {
        fromAddress,
        provider
      };
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError({
        message: 'Failed to store email provider credentials',
        data: {
          fromAddress
        }
      });
    }
  }

  async function getPlatformEmailProvider(context, input) {
    if (!input.fromAddress) {
      // fallback
      input.fromAddress = _.get(
        serviceContext.config,
        'defaultEmailProvider.emailFrom'
      );
    }

    const externalCredential = {
      externalCredentialId: input.fromAddress
    };

    try {
      const res = await serviceContext.dal.externalCredential.getExternalCredential(
        context,
        externalCredential
      );

      const externalCredentialDecrypted = JSON.parse(
        decryptObject(
          res[0].credentialsCiphertext,
          input.encryptionKey || decryptKeyDefault,
          'aes-256-cbc'
        )
      );

      return {
        fromAddress: externalCredentialDecrypted.input.externalCredentialId,
        provider: externalCredentialDecrypted.input.provider
      };
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError({
        message: 'Failed to retrieve email provider',
        data: {
          fromAddress: input.fromAddress
        }
      });
    }
  }

  return {
    addPlatformEmailProvider,
    getPlatformEmailProvider
  };
};
