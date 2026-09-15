const _ = require('lodash');

module.exports = async function (serviceContext) {
  const config = serviceContext.config;
  const app = serviceContext.app;
  const { decryptObject } = require('@veritone/core-server-base/util.js')();
  if (!serviceContext.dbConnections) {
    throw new Error('dbConnections not in context');
  }

  // Resolve an external credential id to { accessKey, secretKey } by querying the
  // sso pool directly. getAWSSecret / OCI resolution run at startup, before
  // serviceContext.dal is populated, so we cannot use dal.externalCredential.
  // Rows are written by dal/externalCredential.createExternalCredential:
  // JSON.stringify({ input }) encrypted with decryptKeyDefault + aes-256-cbc.
  // @sminkov — VE-24702 (OCI storage / virtual assets)
  async function resolveExternalCredential(accessCredentialId) {
    if (_.isEmpty(accessCredentialId)) {
      return null;
    }
    const decryptKeyDefault = _.get(config, 'decryptKeyDefault');

    const sql = `
      SELECT
        credentials_ciphertext
      FROM
        external_credential
      WHERE
        external_credential_id = $1
      ORDER BY created_date DESC
      LIMIT 1
    `;

    const dbrs = await serviceContext.dbConnections['sso'].read.map(
      sql,
      [accessCredentialId],
      (row) => row.credentials_ciphertext
    );

    if (!dbrs.length) {
      return null;
    }

    const decrypted = JSON.parse(
      decryptObject(dbrs[0], decryptKeyDefault, 'aes-256-cbc')
    );
    const credData = decrypted.input || decrypted;
    // Trim stored keys: a trailing newline/space (common with copy-pasted OCI
    // Customer Secret Keys) is not part of the credential and makes every SigV4
    // signature fail with SignatureDoesNotMatch. Keys never contain whitespace.
    // @sminkov — VE-24702 (OCI storage / virtual assets)
    const trim = (v) => (typeof v === 'string' ? v.trim() : v);
    return {
      accessKey: trim(credData.accessKey || credData.accessKeyId),
      secretKey: trim(credData.secretKey || credData.secretAccessKey)
    };
  }

  async function getAWSSecret() {
    // get from config
    // 1. env / inline s3.accessKey + s3.secretKey
    // 2. s3.accessCredentialId -> external_credential table
    // 3. legacy dbS3Config credential lookup
    // 4. return null will let s3 to pick up IAM Profile
    if (
      !_.isEmpty(_.get(config, 's3.accessKey')) &&
      !_.isEmpty(_.get(config, 's3.secretKey'))
    ) {
      return {
        accessKey: _.get(config, 's3.accessKey'),
        secretKey: _.get(config, 's3.secretKey')
      };
    }

    // 2. resolve top-level external credential (parity with the per-bucket
    // accessCredentialId path in presigner.s3.buckets.js).
    const s3Creds = await resolveExternalCredential(
      _.get(config, 's3.accessCredentialId')
    );
    if (s3Creds) {
      return s3Creds;
    }

    // 3. get from database
    if (_.get(serviceContext, 'config.featureFlags.dbS3Config', true)) {
      const credentialName = _.get(
        serviceContext,
        'config.s3.dbCredentialName',
        'core-graphql-server'
      );
      const decryptKey =
        process.env.CORE_GRAPHQL_DECRYPT_KEY ||
        _.get(
          serviceContext,
          'config.s3.fileId',
          'MIIEpAIBAAKCAQEAqCrrzfGp1gwgFk4raJeTaOt8SIkYuaEYctBpmldlgonbGySf/5QA5v1Vajnt9D+8+TBK3lz6hBC49LiBa+q9fJsWP9pkPEk6irT8T6UXZZk6bJacI'
        );

      const sql = `
        SELECT
          credentials_ciphertext
        FROM
          external_credential
        WHERE
          service_type = $1 AND
          credential_name = $2
        ORDER BY created_date DESC
        LIMIT 1
      `;

      const dbrs = await serviceContext.dbConnections['sso'].read.map(
        sql,
        ['s3', credentialName],
        (row) => row.credentials_ciphertext
      );

      if (dbrs.length) {
        const cipherText = dbrs[0];
        return decryptObject(cipherText, decryptKey);
      }
    }

    return null;
  }

  // Resolve OCI credentials from the oci config section:
  //   1. inline oci.accessKey + oci.secretKey
  //   2. oci.accessCredentialId -> external_credential table
  // Returns null when neither is configured (caller keeps the s3 credentials).
  // @sminkov — VE-24702 (OCI storage / virtual assets)
  async function getOciSecret() {
    if (
      !_.isEmpty(_.get(config, 'oci.accessKey')) &&
      !_.isEmpty(_.get(config, 'oci.secretKey'))
    ) {
      return {
        accessKey: _.get(config, 'oci.accessKey'),
        secretKey: _.get(config, 'oci.secretKey')
      };
    }
    return resolveExternalCredential(_.get(config, 'oci.accessCredentialId'));
  }

  // sets up a map of bucket configuration that can be passed
  // to core-server-base/storage.shim to create a S3 helper instance per bucket.
  // Provider-agnostic w.r.t. credentials: it consumes the already-resolved
  // top-level `credentials` (the caller decides whether those are the s3 or oci
  // credentials); it only reads config.oci for non-credential structural fields
  // (namespace, region, path, timeouts).
  function createBucketMap(config, credentials) {
    const s3 = _.get(config, 's3');
    const s3buckets = _.get(config, 's3.buckets', []);
    const result = {};
    const accessKey = _.isNil(credentials) ? null : credentials.accessKey;
    const secretKey = _.isNil(credentials) ? null : credentials.secretKey;

    for (const bucket of s3buckets) {
      const bucketConf = {
        s3: {
          // these are used to sign URLs and should use the static
          // encrypted credentials from the DB, if present.
          accessKey: bucket.accessKey || accessKey,
          secretKey: bucket.secretKey || secretKey,
          bucket: bucket.name,
          path: bucket.path,
          region: bucket.region || s3.region,
          enableUrlSigning: true,
          timeout: bucket.timeout || 30000,
          maxRetry: 3,
          signedUrlExpires: bucket.signedUrlExpires || s3.signedUrlExpires,
          preventS3SignerReuse: bucket.preventS3SignerReuse
        }
      };
      if (_.get(config, 'minio.enabled') === true) {
        bucketConf.minio = {
          enabled: true,
          accessKey: bucket.accessKey || config.minio.accessKey,
          secretKey: bucket.secretKey || config.minio.secretKey,
          bucket: bucket.name,
          path: bucket.path,
          enableUrlSigning: _.isNil(bucket.enableUrlSigning)
            ? config.minio.enableUrlSigning
            : bucket.enableUrlSigning,
          endPoint: bucket.endPoint || config.minio.endPoint,
          port: bucket.port || config.minio.port,
          secure: _.isNil(bucket.secure) ? config.minio.secure : bucket.secure,
          timeout: bucket.timeout || config.minio.timeout,
          maxRetry: 3
        };
      }
      if (_.get(config, 'azure_blob.enabled') === true) {
        bucketConf.azure_blob = {
          enabled: true,
          account: bucket.account || config.azure_blob.account,
          key: config.azure_blob.key,
          container: bucket.name || bucket.key,
          path: bucket.path,
          enableUrlSigning: _.isNil(bucket.enableUrlSigning)
            ? config.azure_blob.enableUrlSigning
            : bucket.enableUrlSigning,
          timeout: bucket.timeout || config.azure_blob.timeout,
          maxRetry: 3,
          endpointSuffix: bucket.endpointSuffix || config.azure_blob.endpointSuffix,
          signedUrlExpires:
            bucket.signedUrlExpires || config.azure_blob.signedUrlExpires
        };
      }
      // OCI Object Storage — per-bucket or top-level
      if (bucket.cloudProvider === 'oci' || _.get(config, 'oci.enabled') === true) {
        const ociConf = _.get(config, 'oci', {});
        bucketConf.oci = {
          enabled: true,
          namespace: bucket.namespace || ociConf.namespace,
          region: bucket.region || ociConf.region || s3.region,
          bucket: bucket.name,
          path: bucket.path || ociConf.path || 'assets',
          // Credentials come from the resolved top-level `credentials` (already
          // overridden with OCI creds by the caller when oci.enabled); a per-bucket
          // inline key still wins.
          accessKey: bucket.accessKey || accessKey,
          secretKey: bucket.secretKey || secretKey,
          enableUrlSigning: _.isNil(bucket.enableUrlSigning)
            ? (ociConf.enableUrlSigning !== false)
            : bucket.enableUrlSigning,
          signedUrlExpires: bucket.signedUrlExpires || ociConf.signedUrlExpires || s3.signedUrlExpires,
          timeout: ociConf.timeout || 30000,
          maxRetry: ociConf.maxRetry || 3,
          authType: ociConf.authType || undefined,
          configFilePath: ociConf.configFilePath || undefined,
          configProfile: ociConf.configProfile || undefined
        };
      }
      result[bucket.key] = bucketConf;
    }
    return result;
  }

  let credentials;
  try {
    credentials = await getAWSSecret();
  } catch (err) {
    serviceContext.logger.info(
      'unable to get encrypted AWS credentials from database:  ' +
        err +
        '. Falling back on IAM instance profile. Server functionality is unaffected but ' +
        'signed URLs may expire too early.'
    );
  }

  // When OCI is the active backend, its credentials overwrite the top-level
  // s3 credentials so createBucketMap stays provider-agnostic. Resolved from
  // oci.accessKey/secretKey or oci.accessCredentialId. The OCI storage backend
  // (storage/oci.js) cannot resolve credential ids itself, so we also reflect
  // resolved keys into config.oci for the top-level storage.shim(app.config).
  //
  // This runs in its own try/catch, independent of getAWSSecret above: a failure
  // to find (nonexistent) S3 credentials must not skip OCI resolution, which is
  // what left the S3 client with null accessKeyId/secretAccessKey. We also require
  // both keys to be present before applying them, so a credential that decrypts to
  // an unexpected shape fails loudly here instead of silently signing with nulls.
  // @sminkov — VE-24702 (OCI storage / virtual assets)
  if (_.get(config, 'oci.enabled') === true) {
    const accessCredentialId = _.get(config, 'oci.accessCredentialId');
    try {
      const ociCredentials = await getOciSecret();
      if (ociCredentials && ociCredentials.accessKey && ociCredentials.secretKey) {
        credentials = ociCredentials;
        if (_.isEmpty(_.get(config, 'oci.accessKey'))) {
          _.set(app.config, 'oci.accessKey', ociCredentials.accessKey);
          _.set(app.config, 'oci.secretKey', ociCredentials.secretKey);
        }
      } else {
        // Do not leave `credentials` pointing at half-resolved OCI keys; keeping
        // whatever getAWSSecret returned is a better fallback than null-signing.
        serviceContext.logger.warn(
          'OCI storage is enabled but no usable credentials were resolved from ' +
            'oci.accessKey/secretKey or oci.accessCredentialId (' +
            (accessCredentialId || 'not set') +
            '). OCI signed URLs will be generated with the IAM/default credential ' +
            'chain and will likely fail. Verify the external_credential row exists ' +
            'and was encrypted with decryptKeyDefault.'
        );
      }
    } catch (err) {
      serviceContext.logger.error(
        'failed to resolve OCI credentials from accessCredentialId (' +
          (accessCredentialId || 'not set') +
          '): ' +
          err
      );
    }
  }

  const accessKey = _.isNil(credentials) ? null : credentials.accessKey;
  const secretKey = _.isNil(credentials) ? null : credentials.secretKey;

  const s3Buckets = createBucketMap(config, credentials);

  // this global object is used by older code for direct S3 uploads
  // and should NOT use the static encrypted credentials from the db.
  // UNLESS we are configured to do so. this is done only for local and CI test.
  if (_.get(app.config, 's3.useDbCredentialForAll', false) === true) {
    _.set(app.config, 's3.accessKey', accessKey);
    _.set(app.config, 's3.secretKey', secretKey);
  }
  const storage = require('@veritone/core-server-base/storage.shim')(
    app.config
  );

  // adds the actual storage instance to each bucket config object
  Object.keys(s3Buckets).forEach((key) => {
    s3Buckets[key].storage = require('@veritone/core-server-base/storage.shim')(
      s3Buckets[key]
    );
    // map bucket's "name" field, which is the actual name of the bucket
    // if different than the key, to the bucket config and storage
    // same thing with the "bucket" field, which is used instead in some configs
    // (for no good reason...)
    const name = s3Buckets[key].s3.bucket || s3Buckets[key].s3.name;
    if (name) {
      s3Buckets[name] = s3Buckets[key];
    }
  });

  return {
    storage,
    s3Buckets,
    createBucketMap
  };
};
