'use strict';

describe('putObjectTagging', () => {
  let postHandler;
  let mockPutObjectTaggingPromise;
  let serviceContext;

  beforeEach(() => {
    mockPutObjectTaggingPromise = jest.fn();

    const mockMiddleware = jest.fn();
    serviceContext = {
      app: {
        use: jest.fn(),
        post: jest.fn((path, handler) => {
          postHandler = handler;
        }),
        middleware: {
          authenticationOption: jest.fn().mockReturnValue(mockMiddleware),
          loadToken: mockMiddleware,
          requireRights: jest.fn().mockReturnValue(mockMiddleware)
        }
      },
      config: {},
      dal: {
        dalStorage: {
          putObjectTaggingPromise: mockPutObjectTaggingPromise
        }
      }
    };

    require('./putObjectTagging.js')(serviceContext);
  });

  function mockRes() {
    return { send: jest.fn() };
  }

  it('returns 400 when uri is not a string (e.g. object)', async () => {
    const req = { body: { uri: { invalid: true }, tags: [{ key: 'env', value: 'prod' }] } };
    const res = mockRes();
    await postHandler(req, res);
    expect(res.send).toHaveBeenCalledWith(400, 'Missing URI');
  });

  it('returns 400 when tags array is empty', async () => {
    const req = { body: { uri: 's3://bucket/key', tags: [] } };
    const res = mockRes();
    await postHandler(req, res);
    expect(res.send).toHaveBeenCalledWith(400, 'Missing tags');
  });

  it('returns success response on valid request', async () => {
    mockPutObjectTaggingPromise.mockResolvedValue(undefined);
    const req = {
      body: { uri: 's3://bucket/key', tags: [{ Key: 'env', Value: 'prod' }] }
    };
    const res = mockRes();
    await postHandler(req, res);
    expect(mockPutObjectTaggingPromise).toHaveBeenCalledWith(
      's3://bucket/key', [{ Key: 'env', Value: 'prod' }]
    );
    expect(res.send).toHaveBeenCalledWith({ success: true, msg: 'The tags are set.' });
  });

  it('returns failure response when dalStorage throws', async () => {
    mockPutObjectTaggingPromise.mockRejectedValue(new Error('S3 error'));
    const req = {
      body: { uri: 's3://bucket/key', tags: [{ Key: 'env', Value: 'prod' }] }
    };
    const res = mockRes();
    await postHandler(req, res);
    expect(res.send).toHaveBeenCalledWith({ success: false, msg: 'S3 error' });
  });
});
