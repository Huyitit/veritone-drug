const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.DEFAULT, {
  mockHttp: false
});

serviceContext.config.decryptKeyDefault =
  'e4a9d73f79c940be82a2cdaeb8d1c0273c0f927da91fb4d47f660bce92a2e35a';

const dalExternalCredential = require('./externalCredential.js')(
  serviceContext
);

describe('externalCredential.js', function () {
  describe('#createExternalCredential', function () {
    it('should create a new external_credential', async function () {
      serviceContext.dbConnections['sso'].write._push([
        {
          serviceType: 'test',
          credentialName: 'test-credential',
          key: 'test-key',
          externalCredentialId: 'test-external-credential',
          organizationId: 'test-organization',
          connectionString: 'test-connectionString'
        }
      ]);
      const externalCredential = {
        serviceType: 'test',
        credentialName: 'test-credential',
        key: 'test-key',
        externalCredentialId: 'test-external-credential',
        organizationId: 'test-organization',
        connectionString: 'test-connectionString'
      };

      const res = await dalExternalCredential.createExternalCredential(
        mockUtil.makeContext(),
        externalCredential,
        '7e6f01d3d8a64495aa2fb6e014f0c3e5486dc5e2cb126f9f3a1cbd808db14a3e'
      );
      expect(res).toBeTruthy();
      expect(res.length).toEqual(1);
      expect(res[0].externalCredentialId).toEqual('test-external-credential');
    });
    it('should create a new external_credential with default key', async function () {
      serviceContext.dbConnections['sso'].write._push([
        {
          serviceType: 'test',
          credentialName: 'test-credential',
          key: 'test-key',
          externalCredentialId: 'test-external-credential',
          organizationId: 'test-organization',
          connectionString: 'test-connectionString'
        }
      ]);
      const externalCredential = {
        serviceType: 'test',
        credentialName: 'test-credential',
        key: 'test-key',
        externalCredentialId: 'test-external-credential',
        organizationId: 'test-organization',
        connectionString: 'test-connectionString'
      };

      const res = await dalExternalCredential.createExternalCredential(
        mockUtil.makeContext(),
        externalCredential
      );
      expect(res).toBeTruthy();
      expect(res.length).toEqual(1);
      expect(res[0].externalCredentialId).toEqual('test-external-credential');
    });
  });

  describe('#getExternalCredential', function () {
    it('should retrieve all by service type', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          external_credential_id: 'test',
          credential_name: 'test-credential',
          organization_id: 'test-organization',
          created_by: 'test-created_by',
          service_type: 'test',
          credentials_ciphertext: 'test-credential',
          encryption_key_id: 'test-encryption_key_id'
        },
        {
          external_credential_id: 'test-1',
          credential_name: 'test-credential',
          organization_id: 'test-organization',
          created_by: 'test-created_by',
          service_type: 'test',
          credentials_ciphertext: 'test-credential',
          encryption_key_id: 'test-encryption_key_id'
        }
      ]);
      const res = await dalExternalCredential.getExternalCredential(
        mockUtil.makeContext(),
        {
          serviceType: 'test'
        }
      );

      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
      expect(res[0].externalCredentialId).toEqual('test');
    });
    it('should retrieve one by external_credential_id', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          external_credential_id: 'test',
          credential_name: 'test-credential',
          organization_id: 'test-organization',
          created_by: 'test-created_by',
          service_type: 'test',
          credentials_ciphertext: 'test-credential',
          encryption_key_id: 'test-encryption_key_id'
        }
      ]);
      const res = await dalExternalCredential.getExternalCredential(
        mockUtil.makeContext(),
        {
          externalCredentialId: 'test'
        }
      );

      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(res[0].externalCredentialId).toEqual('test');
    });
    it('should retrieve one by external_credential_id and service type', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          external_credential_id: 'test',
          credential_name: 'test-credential',
          organization_id: 'test-organization',
          created_by: 'test-created_by',
          service_type: 'test',
          credentials_ciphertext: 'test-credential',
          encryption_key_id: 'test-encryption_key_id'
        }
      ]);
      const res = await dalExternalCredential.getExternalCredential(
        mockUtil.makeContext(),
        {
          externalCredentialId: 'test',
          serviceType: 'test'
        }
      );

      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(res[0].externalCredentialId).toEqual('test');
    });

    it('should throw an not_found error', async function () {
      serviceContext.dbConnections['sso'].read._push([]);
      try {
        const res = await dalExternalCredential.getExternalCredential(
          mockUtil.makeContext(),
          {
            externalCredentialId: 'test-5'
          }
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
