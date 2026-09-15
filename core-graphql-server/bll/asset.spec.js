const _ = require('lodash');
const serviceContext = require('../test/serviceContext.mock.js')();
const _minimalBll = require('./asset')(serviceContext);
const _retryOnNotFound = _minimalBll._retryOnNotFound;
const _isNotFoundError = _minimalBll._isNotFoundError;


describe('isNotFoundError', () => {
  it.each([
    ['S3 NoSuchKey', { code: 'NoSuchKey', message: 'not found' }],
    ['S3 NotFound', { code: 'NotFound', message: 'not found' }],
    ['Azure BlobNotFound', { code: 'BlobNotFound', message: 'not found' }],
    [
      'Azure ContainerNotFound',
      { code: 'ContainerNotFound', message: 'not found' }
    ],
    ['HTTP 404 statusCode', { statusCode: 404, message: '404' }]
  ])('returns true for %s', (_label, err) => {
    expect(_isNotFoundError(err)).toBe(true);
  });

  it.each([
    ['null', null],
    ['generic Error', new Error('boom')],
    ['403 Forbidden', { statusCode: 403, message: 'forbidden' }],
    ['500 Internal', { statusCode: 500, code: 'InternalError' }],
    ['ECONNREFUSED', { code: 'ECONNREFUSED', message: 'connect' }]
  ])('returns false for %s', (_label, err) => {
    expect(_isNotFoundError(err)).toBe(false);
  });
});

describe('retryOnNotFound', () => {
  const noopSleep = () => Promise.resolve();

  it('returns result on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue({ contentLength: 42 });
    const result = await _retryOnNotFound(fn, {
      maxAttempts: 3,
      sleep: noopSleep
    });
    expect(result).toEqual({ contentLength: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on not-found error and succeeds on Nth attempt', async () => {
    const notFoundErr = new Error('NoSuchKey');
    notFoundErr.code = 'NoSuchKey';
    const fn = jest
      .fn()
      .mockRejectedValueOnce(notFoundErr)
      .mockRejectedValueOnce(notFoundErr)
      .mockResolvedValue({ contentLength: 100 });
    const onRetry = jest.fn();

    const result = await _retryOnNotFound(fn, {
      maxAttempts: 5,
      initialDelayMs: 100,
      sleep: noopSleep,
      onRetry
    });

    expect(result).toEqual({ contentLength: 100 });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(notFoundErr, 1, expect.any(Number));
    expect(onRetry).toHaveBeenCalledWith(notFoundErr, 2, expect.any(Number));
  });

  it('throws after exhausting all retries', async () => {
    const notFoundErr = new Error('NoSuchKey');
    notFoundErr.code = 'NoSuchKey';
    const fn = jest.fn().mockRejectedValue(notFoundErr);

    await expect(
      _retryOnNotFound(fn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        sleep: noopSleep
      })
    ).rejects.toThrow('NoSuchKey');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-retryable errors', async () => {
    const authErr = new Error('Access Denied');
    authErr.statusCode = 403;
    const fn = jest.fn().mockRejectedValue(authErr);

    await expect(
      _retryOnNotFound(fn, {
        maxAttempts: 5,
        initialDelayMs: 100,
        sleep: noopSleep
      })
    ).rejects.toThrow('Access Denied');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('applies exponential back-off delays', async () => {
    const notFoundErr = new Error('NotFound');
    notFoundErr.code = 'NotFound';
    const fn = jest
      .fn()
      .mockRejectedValueOnce(notFoundErr)
      .mockRejectedValueOnce(notFoundErr)
      .mockResolvedValue('ok');
    const delays = [];
    const fakeSleep = (ms) => {
      delays.push(ms);
      return Promise.resolve();
    };

    await _retryOnNotFound(fn, {
      maxAttempts: 5,
      initialDelayMs: 100,
      multiplier: 2,
      maxDelayMs: 10000,
      jitter: 0, // disable jitter for deterministic test
      sleep: fakeSleep
    });

    expect(delays).toHaveLength(2);
    expect(delays[0]).toBe(100);
    expect(delays[1]).toBe(200);
  });
});

describe('getAssetSize', () => {
  let bll;
  let mockGetBlobInfo;
  let mockGetHeaders;

  beforeEach(() => {
    // serviceContext.mock.js installs fake timers globally; the retry sleep
    // uses real setTimeout so we switch to real timers for this describe.
    jest.useRealTimers();

    mockGetBlobInfo = jest.fn();
    mockGetHeaders = jest.fn();

    serviceContext._clearAll();
    _.set(serviceContext, 'config.assetSize.retryMaxAttempts', 5);
    _.set(serviceContext, 'config.assetSize.retryInitialDelayMs', 1);
    serviceContext.dal.dalStorage.getBlobInfo = mockGetBlobInfo;
    serviceContext.dal.asset.updateAssetSize = jest.fn().mockResolvedValue(null);
    serviceContext.dal.asset.updateAssetSizeExternal = jest.fn().mockResolvedValue(null);
    serviceContext.dal.asset.updateAssetSizeError = jest.fn().mockResolvedValue(null);
    serviceContext.logger.error = jest.fn();
    serviceContext.logger.warn = jest.fn();

    // Mock httpUtil and mainUtil via module-level requires
    jest.resetModules();
    jest.doMock('../util/httpUtil.js', () => () => ({
      getBucket: (uri) => (uri.includes('s3.amazonaws.com') ? 'api' : null),
      getHeaders: mockGetHeaders
    }));
    jest.doMock('../util.js', () => () => ({
      isFakeMediaAssetId: (id) => id === 'fake-media-id'
    }));

    const createBll = require('./asset');
    bll = createBll(serviceContext);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useFakeTimers();
  });

  it('returns metadata.size immediately when available', async () => {
    const asset = {
      id: 'a1',
      metadata: { size: 999 },
      uri: 'https://s3.amazonaws.com/bucket/key'
    };
    const result = await bll.getAssetSize(asset);
    expect(result).toBe(999);
    expect(mockGetBlobInfo).not.toHaveBeenCalled();
  });

  it('resolves size from getBlobInfo on first attempt', async () => {
    mockGetBlobInfo.mockResolvedValue({ contentLength: 1024 });
    const asset = {
      id: 'a2',
      uri: 'https://s3.amazonaws.com/bucket/key',
      assetType: 'media',
      contentType: 'video/mp4'
    };
    const result = await bll.getAssetSize(asset);
    expect(result).toBe(1024);
    expect(mockGetBlobInfo).toHaveBeenCalledTimes(1);
    expect(
      serviceContext.dal.asset.updateAssetSize
    ).toHaveBeenCalledWith('a2', 1024);
  });

  it('retries getBlobInfo on NoSuchKey then succeeds', async () => {
    const notFoundErr = new Error('NoSuchKey');
    notFoundErr.code = 'NoSuchKey';
    mockGetBlobInfo
      .mockRejectedValueOnce(notFoundErr)
      .mockResolvedValue({ contentLength: 2048 });

    const asset = {
      id: 'a3',
      uri: 'https://s3.amazonaws.com/bucket/key',
      assetType: 'media',
      contentType: 'video/mp4'
    };
    const result = await bll.getAssetSize(asset);
    expect(result).toBe(2048);
    expect(mockGetBlobInfo).toHaveBeenCalledTimes(2);
    expect(serviceContext.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not retry getBlobInfo on non-retryable 403 error', async () => {
    const authErr = new Error('Access Denied');
    authErr.statusCode = 403;
    mockGetBlobInfo.mockRejectedValue(authErr);

    const asset = {
      id: 'a4',
      uri: 'https://s3.amazonaws.com/bucket/key',
      assetType: 'media',
      contentType: 'video/mp4'
    };
    const result = await bll.getAssetSize(asset);
    // Falls into catch block → returns 0
    expect(result).toBe(0);
    expect(mockGetBlobInfo).toHaveBeenCalledTimes(1);
    expect(serviceContext.logger.error).toHaveBeenCalled();
  });

  it('retries external HEAD 404 then succeeds', async () => {
    const notFoundErr = new Error('HEAD returned 404');
    notFoundErr.statusCode = 404;
    mockGetHeaders
      .mockRejectedValueOnce(notFoundErr)
      .mockResolvedValue({ 'content-length': '512' });

    const asset = {
      id: 'a5',
      uri: 'https://cdn.example.com/file.mp4',
      assetType: 'media',
      contentType: 'video/mp4'
    };
    const result = await bll.getAssetSize(asset);
    expect(result).toBe(512);
    expect(mockGetHeaders).toHaveBeenCalledTimes(2);
    expect(
      serviceContext.dal.asset.updateAssetSizeExternal
    ).toHaveBeenCalledWith('a5', true);
  });

  it('returns 0 after exhausting all retries', async () => {
    const notFoundErr = new Error('NoSuchKey');
    notFoundErr.code = 'NoSuchKey';
    mockGetBlobInfo.mockRejectedValue(notFoundErr);

    const asset = {
      id: 'a6',
      uri: 'https://s3.amazonaws.com/bucket/key',
      assetType: 'media',
      contentType: 'video/mp4'
    };
    const result = await bll.getAssetSize(asset);
    expect(result).toBe(0);
    expect(mockGetBlobInfo).toHaveBeenCalledTimes(5); // default maxAttempts
    expect(
      serviceContext.dal.asset.updateAssetSizeError
    ).toHaveBeenCalledWith('a6', 'NoSuchKey');
  });

  it('returns null for media-mdp asset types', async () => {
    const asset = {
      id: 'a7',
      uri: 'https://s3.amazonaws.com/bucket/key',
      assetType: 'media-mdp'
    };
    const result = await bll.getAssetSize(asset);
    expect(result).toBeNull();
  });

  it('returns 0 for fake media asset IDs', async () => {
    const asset = {
      id: 'fake-media-id',
      uri: 'https://s3.amazonaws.com/bucket/key'
    };
    const result = await bll.getAssetSize(asset);
    expect(result).toBe(0);
  });
});
