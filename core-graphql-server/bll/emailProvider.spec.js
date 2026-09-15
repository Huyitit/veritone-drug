const _ = require('lodash');

const platformProviderBll = require('./emailProvider.js');
describe('PlatformEmailProvider', () => {
  const mockCreate = jest.fn();
  const mockGet = jest.fn();
  const defaultKey =
    '7e6f01d3d8a64495aa2fb6e014f0c3e5486dc5e2cb126f9f3a1cbd808db14a3e';

  const mockContext = {
    _authInfo: {
      organization: {
        organizationId: 7682
      }
    }
  };

  const mockServiceContext = {
    dal: {
      externalCredential: {
        createExternalCredential: mockCreate,
        getExternalCredential: mockGet
      }
    },
    config: {
      defaultEmailProvider: {
        emailFrom: 'fallback@veritone.com'
      },
      decryptKeyDefault:
        'e4a9d73f79c940be82a2cdaeb8d1c0273c0f927da91fb4d47f660bce92a2e35a'
    }
  };

  const {
    encryptObject,
    decryptObject
  } = require('@veritone/core-server-base/util.js')();

  const platformProvider = platformProviderBll(mockServiceContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('addPlatformEmailProvider calls createExternalCredential with correct input', async () => {
    const input = {
      fromAddress: 'admin@mycompany.com',
      provider: 'SES',
      apiKey: 'secret-api-key',
      connectionString: 'smtp://conn',
      encryptionKey:
        '7e6f01d3d8a64495aa2fb6e014f0c3e5486dc5e2cb126f9f3a1cbd808db14a3e'
    };

    await platformProvider.addPlatformEmailProvider(mockContext, input);

    expect(mockCreate).toHaveBeenCalledWith(
      mockContext,
      expect.objectContaining({
        serviceType: 'email-provider',
        credentialName: input.fromAddress,
        key: input.apiKey,
        externalCredentialId: input.fromAddress,
        organizationId: 7682,
        connectionString: input.connectionString,
        provider: input.provider
      }),
      defaultKey
    );
  });

  it('addPlatformEmailProvider calls createExternalCredential with correct input with default encryption key', async () => {
    const input = {
      fromAddress: 'admin@mycompany.com',
      provider: 'SES',
      apiKey: 'secret-api-key',
      connectionString: 'smtp://conn'
    };

    await platformProvider.addPlatformEmailProvider(mockContext, input);

    expect(mockCreate).toHaveBeenCalledWith(
      mockContext,
      expect.objectContaining({
        serviceType: 'email-provider',
        credentialName: input.fromAddress,
        key: input.apiKey,
        externalCredentialId: input.fromAddress,
        organizationId: 7682,
        connectionString: input.connectionString,
        provider: input.provider
      }),
      'e4a9d73f79c940be82a2cdaeb8d1c0273c0f927da91fb4d47f660bce92a2e35a'
    );
  });

  it('getPlatformEmailProvider decrypts and returns expected values', async () => {
    // Encrypt mock
    const mockData = JSON.stringify({
      input: {
        serviceType: 'email-provider',
        credentialName: 'SES',
        key: 'secret-api-key',
        externalCredentialId: 'test@test.com',
        provider: 'SES'
      }
    });
    const encrypted = encryptObject(
      mockData,
      '7e6f01d3d8a64495aa2fb6e014f0c3e5486dc5e2cb126f9f3a1cbd808db14a3e',
      'aes-256-cbc'
    );

    mockGet.mockResolvedValue([{ credentialsCiphertext: encrypted }]);

    const result = await platformProvider.getPlatformEmailProvider(
      mockContext,
      {
        fromAddress: 'test@test.com',
        encryptionKey:
          '7e6f01d3d8a64495aa2fb6e014f0c3e5486dc5e2cb126f9f3a1cbd808db14a3e'
      }
    );

    expect(result).toEqual({
      fromAddress: 'test@test.com',
      provider: 'SES'
    });
  });

  it('getPlatformEmailProvider falls back to config if no fromAddress', async () => {
    mockGet.mockResolvedValue([
      {
        credentialsCiphertext: (() => {
          const data = JSON.stringify({
            input: {
              externalCredentialId: 'fallback@veritone.com',
              provider: 'Mandrill'
            }
          });
          return encryptObject(data, defaultKey, 'aes-256-cbc');
        })()
      }
    ]);

    const result = await platformProvider.getPlatformEmailProvider(
      mockContext,
      {
        encryptionKey:
          '7e6f01d3d8a64495aa2fb6e014f0c3e5486dc5e2cb126f9f3a1cbd808db14a3e'
      }
    );
    expect(result).toEqual({
      fromAddress: 'fallback@veritone.com',
      provider: 'Mandrill'
    });
  });

  it('getPlatformEmailProvider falls back to config if no fromAddress with default encryption key', async () => {
    mockGet.mockResolvedValue([
      {
        credentialsCiphertext: (() => {
          const data = JSON.stringify({
            input: {
              externalCredentialId: 'fallback@veritone.com',
              provider: 'Mandrill'
            }
          });
          return encryptObject(
            data,
            'e4a9d73f79c940be82a2cdaeb8d1c0273c0f927da91fb4d47f660bce92a2e35a',
            'aes-256-cbc'
          );
        })()
      }
    ]);

    const result = await platformProvider.getPlatformEmailProvider(
      mockContext,
      {}
    );
    expect(result).toEqual({
      fromAddress: 'fallback@veritone.com',
      provider: 'Mandrill'
    });
  });
});
