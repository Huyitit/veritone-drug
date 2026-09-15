const _ = require('lodash');
const crypto = require('crypto');
const mapper = require('./mapper');

module.exports = function createFunction(
  serviceContext // contains all DAL modules
) {
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const { encryptObject } = require('@veritone/core-server-base/util.js')();
  const decryptKeyDefault = serviceContext.config.decryptKeyDefault;

  async function createExternalCredential(context, input, encryptionKey) {
    // get "created by" user or token ID
    const createdBy = resUtil.getClientInfo(context).id;
    const str = JSON.stringify({ input });

    const encrypted = encryptObject(
      str,
      encryptionKey || decryptKeyDefault,
      'aes-256-cbc'
    );

    // save the encrypted credentials in the db using upsert
    const sql = `
INSERT INTO public.external_credential (
  service_type,
  credential_name,
  credentials_ciphertext,
  external_credential_id,
  organization_id,
  created_by
) VALUES (
  $1,
  $2,
  $3,
  $4,
  $5,
  $6
)
ON CONFLICT (external_credential_id) DO
UPDATE SET credentials_ciphertext = $3
WHERE external_credential.service_type = $1 AND external_credential.credential_name = $2
    `;
    return await serviceContext.dbConnections['sso'].write.query(sql, [
      input.serviceType,
      input.credentialName,
      encrypted,
      input.externalCredentialId,
      input.organizationId.toString(),
      createdBy
    ]);
  }

  async function getExternalCredential(context, input) {
    try {
      const sqlArgs = [];
      const sqlWhere = [];

      let sql = `
  SELECT
      external_credential_id,
      credential_name,
      organization_id,
      created_by,
      service_type,
      credentials_ciphertext,
      encryption_key_id
  FROM
      external_credential
 `;
      if (!_.isEmpty(input.externalCredentialId)) {
        sqlArgs.push(input.externalCredentialId);
        sqlWhere.push(`external_credential_id = \$${sqlArgs.length}`);
      }
      if (!_.isEmpty(input.credentialName)) {
        sqlArgs.push(input.credentialName);
        sqlWhere.push(`credential_name = \$${sqlArgs.length}`);
      }
      if (!_.isEmpty(input.organizationId)) {
        sqlArgs.push(input.organizationId);
        sqlWhere.push(`organization_id = \$${sqlArgs.length}`);
      }
      if (!_.isEmpty(input.createdBy)) {
        sqlArgs.push(input.createdBy);
        sqlWhere.push(`created_by = \$${sqlArgs.length}`);
      }
      if (!_.isEmpty(input.serviceType)) {
        sqlArgs.push(input.serviceType);
        sqlWhere.push(`service_type = \$${sqlArgs.length}`);
      }
      if (!_.isEmpty(input.encryptionKeyId)) {
        sqlArgs.push(input.encryptionKeyId);
        sqlWhere.push(`encryption_key_id = \$${sqlArgs.length}`);
      }

      if (sqlWhere.length) {
        sql += ' WHERE ' + sqlWhere.join(' AND ');
      }
      const data = await serviceContext.dbConnections['sso'].read.map(
        sql,
        sqlArgs,
        mapper.camelizeRootKeys
      );

      // if external_credential not found by fromAddress, throw out
      if (!data.length) {
        throw new errors.NotFound({
          data: { input }
        });
      }

      return data;
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError({
        message: 'Failed to retrieve stored credentials'
      });
    }
  }

  return {
    createExternalCredential,
    getExternalCredential
  };
};
