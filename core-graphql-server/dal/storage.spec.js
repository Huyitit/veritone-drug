const mockContext = {
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  },
  config: {
    recordingIdParser: {
      prefix: 'mri-',
      baseUri: 'https://api.aws-dev.veritone.com/media-streamer'
    },
    server: {
      responseSizeLimit: '100'
    },
    s3: {
      region: 'us-east-1',
      buckets: [
        {
          key: 'api',
          name: 'dev-api.veritone.com',
          path: 'signedUrl',
          signedUrlExpires: 10800
        }
      ]
    },
    nodeEnv: 'local',
    auth: {
      domain: '.test.com',
      userTokenCookieName: 'ima cookie',
      adminTokenCookieName: 'admin_cookie'
    }
  },
  s3Buckets: {
    api: {
      storage: {
        getUploadStatus: jest.fn()
      }
    }
  },
  redisCache: {
    get: jest.fn()
  }
};

const storage = require('./storage')(mockContext);

describe('getBlobUploadStatus', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('It should return "not_found" it the key is not in Redis', async () => {
    mockContext.redisCache.get.mockResolvedValue(null);

    const result = await storage.getBlobUploadStatus('test-key');

    expect(result).toEqual({
      status: 'not_found',
      message:
        'The upload status was not found. This may indicate that the upload window has expired.'
    });
  });

  it('It should return "completed" if all the chunks are present', async () => {
    mockContext.redisCache.get.mockResolvedValue({
      status: 'completed',
      message: 'Upload completed successfully.',
      computedSize: 1000,
      chunks: {
        1: { chunkNumber: 1, status: 'ok' },
        2: { chunkNumber: 2, status: 'ok' },
        3: { chunkNumber: 3, status: 'ok' }
      }
    });

    const result = await storage.getBlobUploadStatus('test-key');

    expect(result).toEqual({
      status: 'completed',
      message: 'Upload completed successfully.',
      totalBytesReceived: 1000,
      missingChunkNumbers: [],
      failures: []
    });
  });

  it('It should detect missing chunks properly', async () => {
    mockContext.redisCache.get.mockResolvedValue({
      status: 'pending',
      message: 'Some chunks are missing.',
      computedSize: 500,
      chunks: {
        1: { chunkNumber: 1, status: 'ok' },
        3: { chunkNumber: 3, status: 'ok' },
        5: { chunkNumber: 5, status: 'ok' }
      }
    });

    const result = await storage.getBlobUploadStatus('test-key');

    expect(result).toEqual({
      status: 'pending',
      message: 'Some chunks are missing.',
      totalBytesReceived: 500,
      missingChunkNumbers: [2, 4],
      failures: []
    });
  });

  it('It should detect failed chunks', async () => {
    mockContext.redisCache.get.mockResolvedValue({
      status: 'error',
      message: 'Some chunks failed to upload.',
      computedSize: 800,
      chunks: {
        1: { chunkNumber: 1, status: 'ok' },
        2: {
          chunkNumber: 2,
          status: 'fail',
          error: { message: 'Network issue' }
        },
        3: { chunkNumber: 3, status: 'ok' },
        4: { chunkNumber: 4, status: 'fail', error: { message: 'Timeout' } }
      }
    });

    const result = await storage.getBlobUploadStatus('test-key');

    expect(result).toEqual({
      status: 'error',
      message: 'Some chunks failed to upload.',
      totalBytesReceived: 800,
      missingChunkNumbers: [],
      failures: [
        { chunkNumber: 2, status: 'fail', message: 'Network issue' },
        { chunkNumber: 4, status: 'fail', message: 'Timeout' }
      ]
    });
  });

  it('Debería manejar el caso donde Redis devuelve un objeto vacío', async () => {
    mockContext.redisCache.get.mockResolvedValue({
      status: 'in_progress',
      message: 'Upload is still in progress.',
      computedSize: 0,
      chunks: {}
    });

    const result = await storage.getBlobUploadStatus('test-key');

    expect(result).toEqual({
      status: 'in_progress',
      message: 'Upload is still in progress.',
      totalBytesReceived: 0,
      missingChunkNumbers: [],
      failures: []
    });
  });
});
