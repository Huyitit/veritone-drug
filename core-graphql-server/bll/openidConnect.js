const _ = require('lodash');
const crypto = require('crypto');

module.exports = function createFunction(serviceContext) {
  const errors = require('../error')(serviceContext.config);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const keyCredential =
    process.env.OPENID_KEY_CREDENTIAL ||
    _.get(serviceContext, 'config.openid.keyCredential');
  const oidcAllowedRedirectTargets = _.get(
    serviceContext,
    'config.openid.allowedRedirectTargets',
    ['*.aiware.run', '*.veritone.com']
  );
  const redisOpenidAllowedRedirectTargetsTtl = _.get(
    serviceContext,
    'config.openid.redisOpenidAllowedRedirectTargetsTtl',
    86400
  ); // default 1 day
  const middleware = require('@veritone/core-server-base/middlewareAuth.js')(
    serviceContext.config
  );
  const {
    encryptObject,
    decryptObject
  } = require('@veritone/core-server-base/util.js')();
  const redisOpenidExternalCredentialTtl = _.get(
    serviceContext,
    'config.openid.redisOpenidExternalCredentialTtl',
    86400
  ); // default 1 day
  const allowedOriginHosts = _.get(serviceContext, 'config.allowedOriginHosts', []);

  async function updateOpenidConnect(context, args) {
    const input = args.input;

    if (!input.id) {
      throw new errors.InvalidInput({
        message: 'OpenId Connect ID is required.'
      });
    }

    const oldOpenIdConnect = await serviceContext.dal.openidConnect.getOpenIdConnect(
      context,
      { id: input.id }
    );

    // Org admin cannot update Global OpenId Provider or Provider of other organizations.
    validateOrgAdminPermissions(context, args, oldOpenIdConnect);

    const updateArgs = {
      id: input.id,
      name: input.name,
      description: input.description,
      websiteUrl: input.websiteUrl,
      redirectBaseUrl: input.redirectBaseUrl
    };

    if (!_.isNil(input.allowedRedirectTargets)) {
      const invalidHostsToRedirect = checkIfExistsInvalidRedirectTargets(
        input.allowedRedirectTargets
      );
      if (invalidHostsToRedirect.length > 0) {
        throw new errors.InvalidInput({
          message: `The next redirect URLs are not allowed: ${invalidHostsToRedirect.join(
            ', '
          )}`
        });
      }
      updateArgs.allowedRedirectTargets = input.allowedRedirectTargets;
    }

    if (_.isNil(updateArgs.redirectBaseUrl)) {
      updateArgs.redirectBaseUrl = oldOpenIdConnect.redirectBaseUrl;
    } else {
      // wildcards are not allowed since this will be used as passport redirect URL
      if (updateArgs.redirectBaseUrl.startsWith('*')) {
        throw new errors.InvalidInput('Wildcard redirect URLs are not allowed.');
      }

      const invalidRedirectBaseUrls = checkIfExistsInvalidRedirectTargets([updateArgs.redirectBaseUrl], allowedOriginHosts);
      if (invalidRedirectBaseUrls.length > 0) {
        throw new errors.InvalidInput({
          message: `The redirect URL is not allowed: ${invalidRedirectBaseUrls.join(', ')}`
        });
      }
    }

    if (
      !_.isEmpty(input.btnText) ||
      !_.isEmpty(input.btnLogo) ||
      !_.isEmpty(input.btnLogo) ||
      !_.isEmpty(input.btnTextColor)
    ) {
      updateArgs.loginButtonStyle = Object.assign(
        {},
        oldOpenIdConnect.loginButtonStyle,
        _.omitBy(
          {
            btnText: input.btnText,
            btnLogo: input.btnLogo,
            btnColor: input.btnColor,
            btnTextColor: input.btnTextColor
          },
          _.isNil
        )
      );
    }

    if (!_.isEmpty(input.clientSecret) || !_.isEmpty(input.issuerUrl)) {
      // check if credentialsCiphertext from external_credential exists in redis
      let externalCredentialEncryptionKey = await getExternalCredentialKeyForOIDCInCache(
        oldOpenIdConnect.id,
        oldOpenIdConnect.externalCredentialId
      );
      if (_.isNil(externalCredentialEncryptionKey)) {
        // when credentialsCiphertext from external_credential not exists in redis
        externalCredentialEncryptionKey = await setExternalCredentialKeyForOIDCInCache(
          oldOpenIdConnect.id,
          oldOpenIdConnect.externalCredentialId
        );
      }

      // Decrypting the key used to encrypt/decrypt the OIDC credentials
      const oidcEncryptionKey = getKeyToEncryptOIDCCredentials(
        externalCredentialEncryptionKey
      );

      const oldOpenIdConfig = decryptOpenIdCredentials(
        oldOpenIdConnect.credentialsCiphertext,
        oidcEncryptionKey
      );

      updateArgs.credentialsCiphertext = encryptOpenIdCredentials(
        Object.assign(
          {},
          oldOpenIdConfig,
          _.omitBy(
            { clientSecret: input.clientSecret, issuerUrl: input.issuerUrl },
            _.isNil
          )
        ),
        oidcEncryptionKey
      );
    }

    // update OpenId Provider
    const openIdProviderUpdated = await serviceContext.dal.openidConnect.updateOpenidConnect(
      context,
      updateArgs
    );
    //set redis cache for allowedRedirectTargets to be used in admin-server
    setAllowedRedirectTargetsCache(
      openIdProviderUpdated.id,
      openIdProviderUpdated.allowedRedirectTargets
    );
    await serviceContext.redisClient.del(`openid_${openIdProviderUpdated.id}`);
    return openIdProviderUpdated;
  }

  // Helper function to validate org admin permissions
  function validateOrgAdminPermissions(context, args, oldOpenIdConnect) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const requestorOrgGuid = _.get(
      context,
      '_authInfo.organization.organizationGuid',
      _.first(_.get(context, '_authInfo.applications'))
    );

    if (!isSuperAdmin) {
      if (oldOpenIdConnect.isGlobal) {
        throw new errors.NotAllowed({
          message: 'Org admin is not allowed to update Global OpenId Provider',
          data: { connectId: args.input.id, isGlobal: oldOpenIdConnect.isGlobal }
        });
      } else if (requestorOrgGuid != oldOpenIdConnect.ownerOrganizationGuid) {
        throw new errors.NotAllowed({
          message: 'Org admin cannot update OpenId Provider of other organizations',
          data: {
            requestorOrgGuid,
            ownerOrganizationGuid: oldOpenIdConnect.ownerOrganizationGuid
          }
        });
      }
    }
  }

  function getOIDCAllowedRedirectTargetsCacheKey(connectId) {
    return `OIDC_ALLOWED_REDIRECTS:${connectId}`;
  }

  async function setAllowedRedirectTargetsCache(
    connectId,
    allowedRedirectTargets
  ) {
    const allowedRedirectTargetsKey = getOIDCAllowedRedirectTargetsCacheKey(
      connectId
    );
    await serviceContext.redisClient.set(
      allowedRedirectTargetsKey,
      JSON.stringify(allowedRedirectTargets),
      'EX',
      redisOpenidAllowedRedirectTargetsTtl
    );
  }

  function encryptOpenIdCredentials(openIdConfig, encryptionKey) {
    if (_.isNil(encryptionKey)) {
      throw new Error('Missing oidc encryption key');
    }

    if (
      _.isNil(openIdConfig) ||
      _.isNil(openIdConfig.clientId) ||
      _.isNil(openIdConfig.clientSecret)
    ) {
      return null;
    }

    return encryptObject(openIdConfig, encryptionKey);
  }

  function decryptOpenIdCredentials(cipherText, oidcEncryptionKey) {
    if (_.isNil(oidcEncryptionKey)) {
      throw new Error('Missing oidc decryption key.');
    }

    if (_.isEmpty(cipherText)) {
      return null;
    }

    // getting the oidc credentials
    return decryptObject(cipherText, oidcEncryptionKey);
  }

  function checkIfExistsInvalidRedirectTargets(allowedRedirectTargets, redirectTargetsInConfig = oidcAllowedRedirectTargets) {
    try {
      return allowedRedirectTargets.filter((redirectTarget) => {
        const isAllowed = redirectTargetsInConfig.some((allowedHost) => {
          if (redirectTarget[0] === '*') {
            return redirectTarget.endsWith(allowedHost.substr(1));
          } else {
            const newRedirectUrl = new URL(redirectTarget);
            return middleware.allowedOriginEquals(newRedirectUrl, allowedHost);
          }
        });
        return !isAllowed;
      });
    } catch (error) {
      if (error.code === 'ERR_INVALID_URL' || error instanceof TypeError) {
        throw new errors.InvalidInput({
          message: 'The redirect URL is invalid. Please check the format.'
        });
      }
      throw error;
    }
  }

  function getExternalCredentialKeyForOIDCCacheKey(
    connectId,
    externalCredentialId
  ) {
    return `OIDC_EXTERNAL_CREDENTIAL_KEY:${connectId}:${externalCredentialId}`;
  }

  async function getExternalCredentialKeyForOIDCInCache(
    connectId,
    externalCredentialId
  ) {
    const cacheKey = getExternalCredentialKeyForOIDCCacheKey(
      connectId,
      externalCredentialId
    );

    return new Promise((resolve, reject) => {
      serviceContext.redisClient.get(cacheKey, (err, value) => {
        if (err) return reject(err);
        resolve(value);
      });
    });
  }

  async function setExternalCredentialKeyForOIDCInCache(
    connectId,
    externalCredentialId
  ) {
    const externalCredential = await serviceContext.dal.openidConnect.getExternalCredentialForOpenIdConnect(
      {
        externalCredentialId,
        serviceType: 'oidc'
      }
    );

    if (
      _.isNil(externalCredential) ||
      _.isNil(externalCredential.credentialsCiphertext)
    ) {
      throw new Error(
        'Missing value for externalCredential.credentialsCiphertext'
      );
    }

    const cacheKey = getExternalCredentialKeyForOIDCCacheKey(
      connectId,
      externalCredentialId
    );
    await serviceContext.redisClient.set(
      cacheKey,
      externalCredential.credentialsCiphertext,
      'EX',
      redisOpenidExternalCredentialTtl
    );

    return externalCredential.credentialsCiphertext;
  }

  function getKeyToEncryptOIDCCredentials(decryptionKeyEncrypted) {
    if (_.isNil(keyCredential)) {
      throw new Error('Missing openid key credentials config.');
    }

    // Decrypting the key used to decrypt the OIDC credentials
    const plaintextKey = decryptObject(decryptionKeyEncrypted, keyCredential);
    return plaintextKey.oidcEncryptionKey;
  }

  return { updateOpenidConnect };
};
