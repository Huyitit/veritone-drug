const _ = require('lodash');

// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();
serviceContext.config.s3 = {
  region: 'us-east-1',
  bucket: 'dev.inspirent',
  path: 'assets',
  maxRetry: 3,
  timeout: 30000,
  enableUrlSigning: true,
  buckets: [
    {
      key: 'api',
      name: 'dev-api.veritone.com',
      path: 'signedUrl',
      signedUrlExpires: 86400
    },
    {
      key: 'library',
      name: 'dev-veritone-library',
      path: 'library',
      signedUrlExpires: 10800
    }
  ]
};

describe('#s3Util.js', function () {
  describe('#require', function () {
    it('should load module with credentials', async function () {
      _.set(serviceContext, 'config.s3.fileId', '1234567890');
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '3be132c28cbeaa16017a35288aec24cc63ba01b989e36ecfdaf78c121249a959f5ae46946f3b4e45ca7a7dcac8913628152b9cafbbdd3de3e06be908c3d1b00cb2caf1ce02e28fbc40de1982da9c8b03'
        }
      ]);
      const { storage, s3Buckets } = await require('./s3Util.js')(
        serviceContext
      );
      expect(s3Buckets).toBeDefined();
      expect(storage).toBeDefined();
      expect(s3Buckets.api).toBeDefined();
      expect(s3Buckets['dev-api.veritone.com']).toBeDefined();
      expect(s3Buckets.api.s3).toBeDefined();
      expect(s3Buckets.api.s3.secretKey).toEqual('secretKeyPlaintext');
      expect(s3Buckets.api.s3.accessKey).toEqual('accessKeyPlaintext');
      expect(storage.accessKey).toBeUndefined();
      expect(storage.secretKey).toBeUndefined();
    });

    it('should load module with credentials, key in env var', async function () {
      process.env.CORE_GRAPHQL_DECRYPT_KEY = '1234567890';
      _.set(serviceContext, 'config.s3.fileId', null);
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '3be132c28cbeaa16017a35288aec24cc63ba01b989e36ecfdaf78c121249a959f5ae46946f3b4e45ca7a7dcac8913628152b9cafbbdd3de3e06be908c3d1b00cb2caf1ce02e28fbc40de1982da9c8b03'
        }
      ]);
      const { storage, s3Buckets } = await require('./s3Util.js')(
        serviceContext
      );
      expect(s3Buckets).toBeDefined();
      expect(storage).toBeDefined();
      expect(s3Buckets.api).toBeDefined();
      expect(s3Buckets['dev-api.veritone.com']).toBeDefined();
      expect(s3Buckets.api.s3).toBeDefined();
      expect(s3Buckets.api.s3.secretKey).toEqual('secretKeyPlaintext');
      expect(s3Buckets.api.s3.accessKey).toEqual('accessKeyPlaintext');
      expect(storage.accessKey).toBeUndefined();
      expect(storage.secretKey).toBeUndefined();
    });

    it('should load module with no credentials', async function () {
      serviceContext.dbConnections['sso'].read._push([]);
      const { storage, s3Buckets } = await require('./s3Util.js')(
        serviceContext
      );
      expect(s3Buckets).toBeDefined();
      expect(storage).toBeDefined();
      expect(s3Buckets.api).toBeDefined();
      expect(s3Buckets['dev-api.veritone.com']).toBeDefined();
      expect(s3Buckets.api.s3).toBeDefined();
      expect(s3Buckets.api.s3.secretKey).toEqual(null);
      expect(s3Buckets.api.s3.accessKey).toEqual(null);
    });

    it('should load module with credentials db error', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [],
        false,
        [],
        (sql, vars) => false
      );
      const { storage, s3Buckets } = await require('./s3Util.js')(
        serviceContext
      );
      expect(s3Buckets).toBeDefined();
      expect(storage).toBeDefined();
      expect(s3Buckets.api).toBeDefined();
      expect(s3Buckets['dev-api.veritone.com']).toBeDefined();
      expect(s3Buckets.api.s3).toBeDefined();
      expect(s3Buckets.api.s3.secretKey).toEqual(null);
      expect(s3Buckets.api.s3.accessKey).toEqual(null);
    });

    it('should resolve top-level s3.accessCredentialId from external_credential', async function () {
      // Row is written by dal/externalCredential.createExternalCredential:
      // JSON.stringify({ input }) encrypted with decryptKeyDefault + aes-256-cbc.
      const { encryptObject } = require('@veritone/core-server-base/util.js')();
      const decryptKeyDefault = 'unit-test-decrypt-key';
      _.set(serviceContext, 'config.decryptKeyDefault', decryptKeyDefault);
      const cipher = encryptObject(
        JSON.stringify({
          input: { accessKey: 'ociAccessPlain', secretKey: 'ociSecretPlain' }
        }),
        decryptKeyDefault,
        'aes-256-cbc'
      );
      _.set(serviceContext, 'config.s3.accessCredentialId', 'oci-cred-123');
      serviceContext.dbConnections['sso'].read._push([
        { credentials_ciphertext: cipher }
      ]);
      const { storage, s3Buckets } = await require('./s3Util.js')(
        serviceContext
      );
      expect(s3Buckets).toBeDefined();
      expect(storage).toBeDefined();
      expect(s3Buckets.api.s3.accessKey).toEqual('ociAccessPlain');
      expect(s3Buckets.api.s3.secretKey).toEqual('ociSecretPlain');
      // avoid leaking config state into subsequent tests
      _.set(serviceContext, 'config.s3.accessCredentialId', null);
    });

    it('should resolve oci.accessCredentialId and override top-level when oci.enabled', async function () {
      const { encryptObject } = require('@veritone/core-server-base/util.js')();
      const decryptKeyDefault = 'unit-test-decrypt-key';
      _.set(serviceContext, 'config.decryptKeyDefault', decryptKeyDefault);
      // isolate to the OCI path: skip the legacy dbS3Config query in getAWSSecret
      _.set(serviceContext, 'config.featureFlags.dbS3Config', false);
      _.set(serviceContext, 'config.oci', {
        enabled: true,
        accessCredentialId: 'oci-cred-xyz',
        namespace: 'mytenancy',
        region: 'us-ashburn-1',
        bucket: 'aiware',
        path: 'assets'
      });
      serviceContext.config.s3.buckets.push({
        key: 'ocibucket',
        name: 'oci-veritone',
        cloudProvider: 'oci',
        path: 'assets'
      });
      const cipher = encryptObject(
        JSON.stringify({
          input: { accessKey: 'ociKeyPlain', secretKey: 'ociSecretPlain' }
        }),
        decryptKeyDefault,
        'aes-256-cbc'
      );
      serviceContext.dbConnections['sso'].read._push([
        { credentials_ciphertext: cipher }
      ]);
      const { s3Buckets } = await require('./s3Util.js')(serviceContext);
      expect(s3Buckets.ocibucket.oci).toBeDefined();
      expect(s3Buckets.ocibucket.oci.accessKey).toEqual('ociKeyPlain');
      expect(s3Buckets.ocibucket.oci.secretKey).toEqual('ociSecretPlain');
      // avoid leaking config state into subsequent tests
      serviceContext.config.s3.buckets.pop();
      _.set(serviceContext, 'config.featureFlags.dbS3Config', true);
      delete serviceContext.config.oci;
    });

    it('should log an error and keep the previously-resolved credentials when oci.enabled and getOciSecret() throws (VE-27835 #19)', async function () {
      // logger.error is a plain arrow function in the mock, not a jest.fn(), so it needs a spy.
      const errorSpy = jest
        .spyOn(serviceContext.logger, 'error')
        .mockImplementation();
      // Isolate to the OCI path: inline s3 credentials so getAWSSecret() never
      // touches the 'sso' mock, and skip the legacy dbS3Config query.
      _.set(serviceContext, 'config.featureFlags.dbS3Config', false);
      _.set(serviceContext, 'config.s3.accessKey', 's3AccessPlain');
      _.set(serviceContext, 'config.s3.secretKey', 's3SecretPlain');
      _.set(serviceContext, 'config.oci', {
        enabled: true,
        accessCredentialId: 'oci-cred-fail'
      });
      serviceContext.dbConnections['sso'].read._push(
        new Error('sso db unavailable')
      );
      const { s3Buckets } = await require('./s3Util.js')(serviceContext);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed to resolve OCI credentials')
      );
      // credentials must remain whatever getAWSSecret() already resolved, not be
      // nulled out or left half-applied by the failed OCI resolution.
      expect(s3Buckets.api.s3.accessKey).toEqual('s3AccessPlain');
      expect(s3Buckets.api.s3.secretKey).toEqual('s3SecretPlain');
      errorSpy.mockRestore();
      // avoid leaking config state into subsequent tests
      _.set(serviceContext, 'config.featureFlags.dbS3Config', true);
      delete serviceContext.config.s3.accessKey;
      delete serviceContext.config.s3.secretKey;
      delete serviceContext.config.oci;
    });

    it('should warn and keep the previously-resolved credentials when oci.enabled but no usable OCI credentials resolve (VE-27835 #20)', async function () {
      serviceContext.logger.warn.mockClear();
      // Isolate to the OCI path: inline s3 credentials so getAWSSecret() never
      // touches the 'sso' mock, and skip the legacy dbS3Config query.
      _.set(serviceContext, 'config.featureFlags.dbS3Config', false);
      _.set(serviceContext, 'config.s3.accessKey', 's3AccessPlain');
      _.set(serviceContext, 'config.s3.secretKey', 's3SecretPlain');
      // oci.enabled with no inline oci.accessKey/secretKey and no accessCredentialId
      // configured -> resolveExternalCredential short-circuits to null via its
      // isEmpty(accessCredentialId) guard, without any 'sso' query.
      _.set(serviceContext, 'config.oci', { enabled: true });
      const { s3Buckets } = await require('./s3Util.js')(serviceContext);
      expect(serviceContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no usable credentials were resolved')
      );
      expect(s3Buckets.api.s3.accessKey).toEqual('s3AccessPlain');
      expect(s3Buckets.api.s3.secretKey).toEqual('s3SecretPlain');
      // avoid leaking config state into subsequent tests
      _.set(serviceContext, 'config.featureFlags.dbS3Config', true);
      delete serviceContext.config.s3.accessKey;
      delete serviceContext.config.s3.secretKey;
      delete serviceContext.config.oci;
    });

    it('should load module with credentials encrypt error', async function () {
      _.set(serviceContext, 'config.s3.fileId', '1234567890111');
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext: 'bad data'
        }
      ]);
      const { storage, s3Buckets } = await require('./s3Util.js')(
        serviceContext
      );
      expect(s3Buckets).toBeDefined();
      expect(storage).toBeDefined();
      expect(s3Buckets.api).toBeDefined();
      expect(s3Buckets['dev-api.veritone.com']).toBeDefined();
      expect(s3Buckets.api.s3).toBeDefined();
      expect(s3Buckets.api.s3.secretKey).toEqual(null);
      expect(s3Buckets.api.s3.accessKey).toEqual(null);
    });
  });
});
