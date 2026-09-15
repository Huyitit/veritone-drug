'use strict';

const jwt = require('jsonwebtoken');
const https = require('https');

const JWT_SECRET = 'test-jwt-secret';
const VIRTUAL_ID = 'va-test-id-123';
const SIGNED_URL = 'https://s3.amazonaws.com/bucket/signed?token=abc';
const ASSET_URI = 'https://s3.amazonaws.com/bucket/asset.mp3';

let mockGetAssetUriFromVirtualId;
let mockResolveVirtualAssetUri;
let mockIsOurBucket;
let mockPresignUrl;

jest.mock('../resolvers/util.js', () => {
  return (serviceContext) => {
    return {
      getAssetUriFromVirtualId: (...args) => mockGetAssetUriFromVirtualId(...args),
      resolveVirtualAssetUri: (...args) => mockResolveVirtualAssetUri(...args),
      isOurBucket: (...args) => mockIsOurBucket(...args)
    };
  };
});

jest.mock('../util/presigner.s3.buckets.js', () => ({
  getInstance: () => ({
    presignUrl: (...args) => mockPresignUrl(...args)
  })
}));

const buildServiceContext = () => ({
  config: {
    jwt: { secret: JWT_SECRET },
    virtualAsset: { jwt: { secret: JWT_SECRET } },
    // Mirrors config/config.js → server.maxProxyContentSize (2 GiB default).
    server: { maxProxyContentSize: 2147483648 }
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
});

function signToken(payload, secret = JWT_SECRET) {
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// Default to a browser-like request (Mozilla UA) so the redirect path is
// exercised unless a test explicitly supplies non-browser headers.
const BROWSER_HEADERS = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };
const NON_BROWSER_HEADERS = { 'user-agent': 'curl/8.4.0' };

function mockRequest(method, virtualAssetId, { query = {}, headers } = {}) {
  return {
    method,
    params: { virtualAssetId },
    query,
    headers: headers || BROWSER_HEADERS
  };
}

function mockResponse() {
  const res = {};
  res.headersSent = false;
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.on = jest.fn().mockReturnValue(res);
  res.destroy = jest.fn().mockReturnValue(res);
  return res;
}

// Fake upstream object-store response/request pair for proxy-mode tests.
function fakeUpstreamRes({ statusCode = 200, headers = {} } = {}) {
  const handlers = {};
  return {
    statusCode,
    headers,
    pipe: jest.fn(),
    resume: jest.fn(),
    on: jest.fn(function (ev, cb) { handlers[ev] = cb; return this; }),
    emit: (ev, ...args) => handlers[ev] && handlers[ev](...args)
  };
}

function fakeUpstreamReq() {
  const handlers = {};
  return {
    on: jest.fn(function (ev, cb) { handlers[ev] = cb; return this; }),
    end: jest.fn(),
    destroy: jest.fn(),
    emit: (ev, ...args) => handlers[ev] && handlers[ev](...args)
  };
}

describe('virtualAsset route', () => {
  let router;
  let routeHandlers;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetAssetUriFromVirtualId = jest.fn();
    mockResolveVirtualAssetUri = jest.fn();
    mockIsOurBucket = jest.fn().mockReturnValue(true);
    mockPresignUrl = jest.fn();

    const serviceContext = buildServiceContext();
    router = require('./virtualAsset.js')(serviceContext);

    // Extract route handlers from the express router stack
    routeHandlers = {};
    router.stack.forEach((layer) => {
      if (layer.route) {
        const path = layer.route.path;
        layer.route.stack.forEach((s) => {
          const key = `${s.method.toUpperCase()} ${path}`;
          routeHandlers[key] = s.handle;
        });
      }
    });
  });

  describe('GET /asset/:virtualAssetId', () => {
    const getHandler = () => routeHandlers['GET /asset/:virtualAssetId'];

    afterEach(() => {
      if (https.request.mockRestore) https.request.mockRestore();
    });

    it('should return 400 when no virtualAssetId is provided', async () => {
      const req = mockRequest('GET', undefined);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Invalid or expired virtual asset ID');
    });

    it('should return 401 when JWT is invalid', async () => {
      const req = mockRequest('GET', 'not-a-valid-jwt');
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith('Invalid or expired virtual asset ID');
    });

    it('should return 401 when JWT is expired', async () => {
      const token = jwt.sign({ id: VIRTUAL_ID }, JWT_SECRET, { expiresIn: '-1s' });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 when JWT uses wrong secret', async () => {
      const token = signToken({ id: VIRTUAL_ID }, 'wrong-secret');
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 when JWT payload has no id', async () => {
      const token = signToken({ foo: 'bar' });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when getAssetUriFromVirtualId throws', async () => {
      mockGetAssetUriFromVirtualId.mockRejectedValue(new Error('Not found'));

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockGetAssetUriFromVirtualId).toHaveBeenCalledWith(VIRTUAL_ID);
    });

    it('should redirect to cached signedUrl when not expired', async () => {
      const futureExpiry = Date.now() + 60000;
      mockGetAssetUriFromVirtualId.mockResolvedValue({
        uri: ASSET_URI,
        signedUrl: SIGNED_URL,
        expiresAt: futureExpiry
      });

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
      expect(mockResolveVirtualAssetUri).not.toHaveBeenCalled();
    });

    it('should call resolveVirtualAssetUri when cached signedUrl is expired', async () => {
      const pastExpiry = Date.now() - 1000;
      const assetReq = {
        uri: ASSET_URI,
        signedUrl: 'https://old-expired-url.com',
        expiresAt: pastExpiry
      };
      mockGetAssetUriFromVirtualId.mockResolvedValue(assetReq);
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(mockResolveVirtualAssetUri).toHaveBeenCalledWith(VIRTUAL_ID, assetReq);
      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
    });

    it('should call resolveVirtualAssetUri when no cached signedUrl exists', async () => {
      const assetReq = { uri: ASSET_URI };
      mockGetAssetUriFromVirtualId.mockResolvedValue(assetReq);
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(mockResolveVirtualAssetUri).toHaveBeenCalledWith(VIRTUAL_ID, assetReq);
      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
    });

    it('should return 404 when resolveVirtualAssetUri returns null', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(null);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    // VE-24702: when signing fails but the raw (unsigned) uri is known, stream
    // the object through the proxy as a last resort rather than 500-ing.
    it('falls back to proxying the unsigned uri when resolveVirtualAssetUri throws', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '42' }
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockRejectedValue(new Error('Signing failed'));

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      // The unsigned uri is proxied — no 500 and no redirect.
      expect(requestSpy).toHaveBeenCalledWith(
        ASSET_URI,
        expect.objectContaining({ method: 'GET' }),
        expect.any(Function)
      );
      expect(upstreamRes.pipe).toHaveBeenCalledWith(res);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should return 500 when resolveVirtualAssetUri throws and no unsigned uri is available', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({});
      mockResolveVirtualAssetUri.mockRejectedValue(new Error('Signing failed'));

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token);
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // VE-26428: HEAD is answered with a server-side check against the storage
  // object. The method is baked into the presigned signature (OCI rejects an
  // upstream HEAD on a GET-signed URL), so the handler reuses the ordinary
  // GET-signed URL and issues a 1-byte ranged GET (Range: bytes=0-0), mapping
  // the 206 back to the 200 + full-object headers a direct HEAD would have
  // returned — never a 302, and no body reaches the caller.
  describe('HEAD /asset/:virtualAssetId', () => {
    const headHandler = () => routeHandlers['HEAD /asset/:virtualAssetId'];

    afterEach(() => {
      if (https.request.mockRestore) https.request.mockRestore();
    });

    it('should return 400 with no body when no token provided', async () => {
      const req = mockRequest('HEAD', undefined);
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.end).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });

    it('should return 401 with no body for invalid JWT', async () => {
      const req = mockRequest('HEAD', 'bad-token');
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.end).toHaveBeenCalled();
    });

    it('answers HEAD via a 1-byte ranged GET on the GET-signed URL (no 302) even for a browser', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 206,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': '1',
          'content-range': 'bytes 0-0/42',
          etag: '"abc"'
        }
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      const assetReq = { uri: ASSET_URI };
      mockGetAssetUriFromVirtualId.mockResolvedValue(assetReq);
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token, { headers: BROWSER_HEADERS });
      const res = mockResponse();

      await headHandler()(req, res);

      // Ordinary GET-signed URL, upstream GET with the injected 1-byte range.
      expect(mockResolveVirtualAssetUri).toHaveBeenCalledWith(VIRTUAL_ID, assetReq);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledWith(
        SIGNED_URL,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ range: 'bytes=0-0' })
        }),
        expect.any(Function)
      );
      // 206 translated to HEAD semantics: 200, total size, no content-range.
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith('content-type', 'audio/mpeg');
      expect(res.set).toHaveBeenCalledWith('content-length', '42');
      expect(res.set).toHaveBeenCalledWith('etag', '"abc"');
      expect(res.set).not.toHaveBeenCalledWith('content-range', expect.anything());
      expect(upstreamRes.pipe).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });

    it('serves HEAD from a valid cached GET-signed URL without re-signing', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 206,
        headers: { 'content-range': 'bytes 0-0/42', 'content-length': '1' }
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      const assetReq = {
        uri: ASSET_URI,
        signedUrl: SIGNED_URL,
        expiresAt: Date.now() + 60000
      };
      mockGetAssetUriFromVirtualId.mockResolvedValue(assetReq);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token);
      const res = mockResponse();

      await headHandler()(req, res);

      expect(mockResolveVirtualAssetUri).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledWith(
        SIGNED_URL,
        expect.objectContaining({ method: 'GET' }),
        expect.any(Function)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith('content-length', '42');
    });

    it('maps an upstream 416 to a 200 with content-length 0 (zero-byte object)', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 416,
        headers: { 'content-range': 'bytes */0' }
      });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token);
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith('content-length', '0');
      expect(res.set).not.toHaveBeenCalledWith('content-range', expect.anything());
      expect(res.end).toHaveBeenCalled();
    });

    it('forwards a caller-supplied Range and mirrors the 206 untouched', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 206,
        headers: { 'content-range': 'bytes 5-9/42', 'content-length': '5' }
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token, {
        headers: { ...BROWSER_HEADERS, range: 'bytes=5-9' }
      });
      const res = mockResponse();

      await headHandler()(req, res);

      expect(requestSpy).toHaveBeenCalledWith(
        SIGNED_URL,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ range: 'bytes=5-9' })
        }),
        expect.any(Function)
      );
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.set).toHaveBeenCalledWith('content-range', 'bytes 5-9/42');
      expect(res.end).toHaveBeenCalled();
    });

    it('still checks server-side when ?proxyContent=false asks for a redirect', async () => {
      const upstreamRes = fakeUpstreamRes({ statusCode: 200, headers: {} });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token, { query: { proxyContent: 'false' } });
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.redirect).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });

    it('mirrors an upstream error status (403) with no body', async () => {
      const upstreamRes = fakeUpstreamRes({ statusCode: 403, headers: {} });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token);
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(upstreamRes.pipe).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });

    it('returns 404 with no body when no signed URI can be resolved', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(null);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token);
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  // VE-26428: the stateless route gets the same HEAD semantics.
  describe('HEAD /asset-static/:token (stateless)', () => {
    const headHandler = () => routeHandlers['HEAD /asset-static/:token'];
    const OWNED_URI = 'https://s3.amazonaws.com/bucket/asset.mp3';

    afterEach(() => {
      if (https.request.mockRestore) https.request.mockRestore();
    });

    function staticHeadReq(token, { query = {}, headers } = {}) {
      return {
        method: 'HEAD',
        params: { token },
        query,
        headers: headers || BROWSER_HEADERS
      };
    }

    it('answers HEAD via a ranged GET on the ordinary GET-signed URL (no 302)', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 206,
        headers: { 'content-range': 'bytes 0-0/42', 'content-length': '1', etag: '"abc"' }
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      mockIsOurBucket.mockReturnValue(true);
      mockPresignUrl.mockResolvedValue(SIGNED_URL);

      const req = staticHeadReq(signToken({ uri: OWNED_URI }));
      const res = mockResponse();

      await headHandler()(req, res);

      // Ordinary presign — no method option.
      expect(mockPresignUrl).toHaveBeenCalledWith(
        OWNED_URI,
        expect.not.objectContaining({ method: expect.anything() })
      );
      expect(res.redirect).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledWith(
        SIGNED_URL,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ range: 'bytes=0-0' })
        }),
        expect.any(Function)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith('content-length', '42');
      expect(res.set).toHaveBeenCalledWith('etag', '"abc"');
      expect(upstreamRes.pipe).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });

    it('keeps the owned-bucket guard for HEAD (400, no presign, no fetch)', async () => {
      const requestSpy = jest.spyOn(https, 'request');
      mockIsOurBucket.mockReturnValue(false);

      const req = staticHeadReq(
        signToken({ uri: 'http://169.254.169.254/latest/meta-data/' })
      );
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.end).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
      expect(mockPresignUrl).not.toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('keeps the ?redirect=false JSON contract for HEAD (no method=HEAD presign)', async () => {
      const requestSpy = jest.spyOn(https, 'request');
      mockIsOurBucket.mockReturnValue(true);
      mockPresignUrl.mockResolvedValue(SIGNED_URL);

      const req = staticHeadReq(signToken({ uri: OWNED_URI }), {
        query: { redirect: 'false' }
      });
      const res = mockResponse();

      await headHandler()(req, res);

      expect(mockPresignUrl).toHaveBeenCalledWith(
        OWNED_URI,
        expect.not.objectContaining({ method: 'HEAD' })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith(
        'Content-Length',
        String(Buffer.byteLength(JSON.stringify({ sourceUri: SIGNED_URL })))
      );
      expect(res.end).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  describe('auto-detected proxy mode (non-browser clients)', () => {
    const getHandler = () => routeHandlers['GET /asset/:virtualAssetId'];

    afterEach(() => {
      if (https.request.mockRestore) https.request.mockRestore();
    });

    it('streams the object bytes instead of redirecting for a non-browser client', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '42' }
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);

      // No redirect — bytes are streamed through the server.
      expect(res.redirect).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledWith(
        SIGNED_URL,
        expect.objectContaining({ method: 'GET' }),
        expect.any(Function)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith('content-type', 'audio/mpeg');
      expect(res.set).toHaveBeenCalledWith('content-length', '42');
      expect(upstreamRes.pipe).toHaveBeenCalledWith(res);
      expect(upstreamReq.end).toHaveBeenCalled();
    });

    it('redirects (does not proxy) for a browser request', async () => {
      const requestSpy = jest.spyOn(https, 'request');

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    // VE-23156: a non-browser client that follows redirects (media-streamer)
    // can force the 302 with ?proxyContent=false to skip the proxy hop.
    it('redirects for a non-browser client when proxyContent=false', async () => {
      const requestSpy = jest.spyOn(https, 'request');

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, {
        headers: NON_BROWSER_HEADERS,
        query: { proxyContent: 'false' }
      });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('proxies for a browser client when proxyContent=true', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '42' }
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, {
        headers: BROWSER_HEADERS,
        query: { proxyContent: 'true' }
      });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.redirect).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalled();
      expect(upstreamRes.pipe).toHaveBeenCalledWith(res);
    });

    it('falls back to the browser heuristic when proxyContent is absent', async () => {
      const requestSpy = jest.spyOn(https, 'request');

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('treats Sec-Fetch-* requests as browsers (redirect)', async () => {
      const requestSpy = jest.spyOn(https, 'request');

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, {
        headers: { 'user-agent': 'curl/8.4.0', 'sec-fetch-mode': 'navigate' }
      });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('forwards Range and mirrors a 206 partial response', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 206,
        headers: { 'content-range': 'bytes 0-9/42', 'accept-ranges': 'bytes' }
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, {
        headers: { ...NON_BROWSER_HEADERS, range: 'bytes=0-9' }
      });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(requestSpy).toHaveBeenCalledWith(
        SIGNED_URL,
        expect.objectContaining({ headers: expect.objectContaining({ range: 'bytes=0-9' }) }),
        expect.any(Function)
      );
      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.set).toHaveBeenCalledWith('content-range', 'bytes 0-9/42');
    });

    it('does not pipe a body for HEAD requests', async () => {
      const upstreamRes = fakeUpstreamRes({ statusCode: 200, headers: {} });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await routeHandlers['HEAD /asset/:virtualAssetId'](req, res);

      expect(upstreamRes.resume).toHaveBeenCalled();
      expect(upstreamRes.pipe).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 413 with an instructional message when the object exceeds the proxy size cap', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(2 * 1024 * 1024 * 1024 + 1)
        }
      });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.send).toHaveBeenCalledWith(
        'The maximum download limit for a non-browser client is 2 GB.'
      );
      // Body is never streamed; upstream is drained so the socket can be reused.
      expect(upstreamRes.pipe).not.toHaveBeenCalled();
      expect(upstreamRes.resume).toHaveBeenCalled();
    });

    it('honors a config.maxProxyContentSize override', async () => {
      const sc = buildServiceContext();
      sc.config.server.maxProxyContentSize = 1024 * 1024; // 1 MB
      const customRouter = require('./virtualAsset.js')(sc);
      const handlers = {};
      customRouter.stack.forEach((layer) => {
        if (layer.route) {
          layer.route.stack.forEach((s) => {
            handlers[`${s.method.toUpperCase()} ${layer.route.path}`] = s.handle;
          });
        }
      });

      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-length': String(2 * 1024 * 1024) }
      });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await handlers['GET /asset/:virtualAssetId'](req, res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.send).toHaveBeenCalledWith(
        'The maximum download limit for a non-browser client is 1 MB.'
      );
      expect(upstreamRes.pipe).not.toHaveBeenCalled();
    });

    it('does not apply the size cap to HEAD (returns headers so clients can discover size)', async () => {
      const hugeLength = String(2 * 1024 * 1024 * 1024 + 1);
      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-length': hugeLength }
      });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await routeHandlers['HEAD /asset/:virtualAssetId'](req, res);

      expect(res.status).not.toHaveBeenCalledWith(413);
      expect(res.set).toHaveBeenCalledWith('content-length', hugeLength);
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 502 when the upstream fetch errors', async () => {
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation(() => upstreamReq);

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);
      upstreamReq.emit('error', new Error('ECONNRESET'));

      expect(res.status).toHaveBeenCalledWith(502);
    });

    // VE-23156: an unhandled 'error' on the upstream response stream (e.g. a
    // mid-body socket reset, or the idle-timeout destroy) would crash the
    // process. It must be handled and the client connection torn down.
    it('tears down the client when the upstream response errors mid-stream', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '42' }
      });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);
      // Bytes are already flowing, so the headers are flushed.
      res.headersSent = true;

      // Must not throw (no unhandled 'error') and must destroy the client conn.
      expect(() =>
        upstreamRes.emit('error', new Error('socket hang up'))
      ).not.toThrow();
      expect(res.destroy).toHaveBeenCalled();
    });

    it('only finalizes once when both upstream streams error', async () => {
      const upstreamRes = fakeUpstreamRes({ statusCode: 200, headers: {} });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);
      upstreamRes.emit('error', new Error('first'));
      upstreamReq.emit('error', new Error('second'));

      // Headers not sent in this mock → the first error finalizes with one 502;
      // the second is swallowed by the settled guard (no double finalize). The
      // success path's res.status(200) is separate, so assert on the 502 count.
      const errorStatusCalls = res.status.mock.calls.filter(
        ([code]) => code === 502
      );
      expect(errorStatusCalls).toHaveLength(1);
    });

    it('treats a request with no User-Agent header as a non-browser client (proxies, does not redirect)', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '100' },
      });
      const upstreamReq = fakeUpstreamReq();
      const requestSpy = jest
        .spyOn(https, 'request')
        .mockImplementation((url, opts, cb) => {
          cb(upstreamRes);
          return upstreamReq;
        });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: {} });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.redirect).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalled();
      expect(upstreamRes.pipe).toHaveBeenCalledWith(res);
    });

    it('reports 1 GB in the 413 message when the size cap is exactly 1 GiB', async () => {
      const sc = buildServiceContext();
      sc.config.server.maxProxyContentSize = 1073741824; // 1 GiB
      const customRouter = require('./virtualAsset.js')(sc);
      const handlers = {};
      customRouter.stack.forEach((layer) => {
        if (layer.route) {
          layer.route.stack.forEach((s) => {
            handlers[`${s.method.toUpperCase()} ${layer.route.path}`] = s.handle;
          });
        }
      });

      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-length': String(1073741825) },
      });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await handlers['GET /asset/:virtualAssetId'](req, res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.send).toHaveBeenCalledWith(
        'The maximum download limit for a non-browser client is 1 GB.',
      );
      expect(upstreamRes.pipe).not.toHaveBeenCalled();
      expect(upstreamRes.resume).toHaveBeenCalled();
    });
  });

  describe('GET /asset-static/:token (stateless)', () => {
    const getHandler = () => routeHandlers['GET /asset-static/:token'];
    const OWNED_URI = 'https://s3.amazonaws.com/bucket/asset.mp3';

    function staticReq(token, { headers } = {}) {
      return {
        method: 'GET',
        params: { token },
        query: {},
        headers: headers || BROWSER_HEADERS
      };
    }

    it('rejects a token whose uri is not an owned bucket (SSRF / open-redirect guard)', async () => {
      mockIsOurBucket.mockReturnValue(false);
      const evilUri = 'http://169.254.169.254/latest/meta-data/';
      const req = staticReq(signToken({ uri: evilUri }));
      const res = mockResponse();

      await getHandler()(req, res);

      expect(mockIsOurBucket).toHaveBeenCalledWith(evilUri);
      expect(res.status).toHaveBeenCalledWith(400);
      // Critical: no server-side fetch and no redirect for a foreign URI.
      expect(mockPresignUrl).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('presigns and 302-redirects an owned-bucket uri', async () => {
      mockIsOurBucket.mockReturnValue(true);
      mockPresignUrl.mockResolvedValue(SIGNED_URL);
      const req = staticReq(signToken({ uri: OWNED_URI }));
      const res = mockResponse();

      await getHandler()(req, res);

      expect(mockPresignUrl).toHaveBeenCalledWith(OWNED_URI, expect.any(Object));
      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
    });

    it('passes the JWT fileName claim to the presigner (VE-27981)', async () => {
      mockIsOurBucket.mockReturnValue(true);
      mockPresignUrl.mockResolvedValue(SIGNED_URL);
      const req = staticReq(
        signToken({ uri: OWNED_URI, fileName: 'clip one.mp4' })
      );
      const res = mockResponse();

      await getHandler()(req, res);

      expect(mockPresignUrl).toHaveBeenCalledWith(
        OWNED_URI,
        expect.objectContaining({ fileName: 'clip one.mp4' })
      );
      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
    });

    it('presigns without a filename when the claim is absent (VE-27981)', async () => {
      mockIsOurBucket.mockReturnValue(true);
      mockPresignUrl.mockResolvedValue(SIGNED_URL);
      const req = staticReq(signToken({ uri: OWNED_URI }));
      const res = mockResponse();

      await getHandler()(req, res);

      expect(mockPresignUrl.mock.calls[0][1].fileName).toBeUndefined();
    });

    it('returns 400 when the token carries no uri (before any bucket check)', async () => {
      const req = staticReq(signToken({ foo: 'bar' }));
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockIsOurBucket).not.toHaveBeenCalled();
      expect(mockPresignUrl).not.toHaveBeenCalled();
    });

    it('returns 401 for an invalid token', async () => {
      const req = staticReq('not-a-jwt');
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockPresignUrl).not.toHaveBeenCalled();
    });
  });

  // VE-26188: ?redirect=false returns the presigned URL as a 200 JSON body
  // ({ "sourceUri": "<url>" }) instead of a 302, so browser apps can fetch
  // storage directly (the redirect-follow fetch can drop the Origin header
  // and fail CORS: VE-26093).
  describe('redirect parameter (?redirect=false)', () => {
    const getHandler = () => routeHandlers['GET /asset/:virtualAssetId'];
    const headHandler = () => routeHandlers['HEAD /asset/:virtualAssetId'];
    const staticHandler = () => routeHandlers['GET /asset-static/:token'];

    afterEach(() => {
      if (https.request.mockRestore) https.request.mockRestore();
    });

    function expectSourceUriResponse(res, expectedUrl) {
      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(JSON.stringify({ sourceUri: expectedUrl }));
      // The URL must survive JSON round-tripping verbatim (no re-encoding).
      expect(JSON.parse(res.send.mock.calls[0][0]).sourceUri).toBe(expectedUrl);
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
      expect(res.set).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }

    it('returns 200 with the cached signed URL as the body', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({
        uri: ASSET_URI,
        signedUrl: SIGNED_URL,
        expiresAt: Date.now() + 60000
      });

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { query: { redirect: 'false' } });
      const res = mockResponse();

      await getHandler()(req, res);

      expectSourceUriResponse(res, SIGNED_URL);
      expect(mockResolveVirtualAssetUri).not.toHaveBeenCalled();
    });

    it('returns 200 with the freshly presigned URL as the body', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { query: { redirect: 'false' } });
      const res = mockResponse();

      await getHandler()(req, res);

      expectSourceUriResponse(res, SIGNED_URL);
    });

    it('accepts redirect=0 as false', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { query: { redirect: '0' } });
      const res = mockResponse();

      await getHandler()(req, res);

      expectSourceUriResponse(res, SIGNED_URL);
    });

    // Both cannot be honored at once; redirect=false wins in either query
    // order and no error is raised (VE-26188 AC).
    it('overrides proxyContent=true (no proxy fetch, no error)', async () => {
      const requestSpy = jest.spyOn(https, 'request');
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, {
        query: { redirect: 'false', proxyContent: 'true' }
      });
      const res = mockResponse();

      await getHandler()(req, res);

      expectSourceUriResponse(res, SIGNED_URL);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('overrides proxyContent=false regardless of parameter order', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, {
        query: { proxyContent: 'false', redirect: 'false' }
      });
      const res = mockResponse();

      await getHandler()(req, res);

      expectSourceUriResponse(res, SIGNED_URL);
    });

    it('overrides the browser heuristic (no 302 for a browser request)', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, {
        headers: { 'user-agent': 'Mozilla/5.0', 'sec-fetch-mode': 'navigate' },
        query: { redirect: 'false' }
      });
      const res = mockResponse();

      await getHandler()(req, res);

      expectSourceUriResponse(res, SIGNED_URL);
    });

    it.each(['true', '1', 'garbage'])(
      'redirect=%s leaves the existing redirect behavior unchanged',
      async (value) => {
        mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
        mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

        const token = signToken({ id: VIRTUAL_ID });
        const req = mockRequest('GET', token, { query: { redirect: value } });
        const res = mockResponse();

        await getHandler()(req, res);

        expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
        expect(res.send).not.toHaveBeenCalled();
      }
    );

    it('HEAD returns 200 with source-uri headers and Content-Length but no body', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token, { query: { redirect: 'false' } });
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
      expect(res.set).toHaveBeenCalledWith(
        'Content-Length',
        String(Buffer.byteLength(JSON.stringify({ sourceUri: SIGNED_URL })))
      );
      expect(res.end).toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('does not change auth failures (401 for an invalid JWT)', async () => {
      const req = mockRequest('GET', 'not-a-jwt', { query: { redirect: 'false' } });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    // When signing throws late, the unsigned-fallback proxy would hand a
    // redirect=false caller object bytes where they expect a URL body — the
    // route fails with 502 instead (the fallback still applies to other
    // delivery modes).
    it('returns 502 instead of the unsigned-fallback proxy when signing fails', async () => {
      const requestSpy = jest.spyOn(https, 'request');
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockRejectedValue(new Error('signer down'));

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { query: { redirect: 'false' } });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(requestSpy).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('returns 200 with the presigned URL on the stateless endpoint', async () => {
      mockIsOurBucket.mockReturnValue(true);
      mockPresignUrl.mockResolvedValue(SIGNED_URL);

      const req = {
        method: 'GET',
        params: { token: signToken({ uri: ASSET_URI }) },
        query: { redirect: 'false' },
        headers: BROWSER_HEADERS
      };
      const res = mockResponse();

      await staticHandler()(req, res);

      expectSourceUriResponse(res, SIGNED_URL);
    });

    it('stateless endpoint still enforces the owned-bucket guard with redirect=false', async () => {
      mockIsOurBucket.mockReturnValue(false);

      const req = {
        method: 'GET',
        params: { token: signToken({ uri: 'http://169.254.169.254/latest/meta-data/' }) },
        query: { redirect: 'false' },
        headers: BROWSER_HEADERS
      };
      const res = mockResponse();

      await staticHandler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPresignUrl).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalledWith(expect.stringContaining('http'));
    });
  });

  // VE-26428: every GET/HEAD response from the stateful /asset endpoint is
  // stamped Veritone-Virtual-Asset: true — across redirect, proxy, sourceUri,
  // and error paths — so callers can tell it was served by the virtual-asset
  // route rather than a raw presigned URL.
  describe('Veritone-Virtual-Asset response header', () => {
    const getHandler = () => routeHandlers['GET /asset/:virtualAssetId'];
    const headHandler = () => routeHandlers['HEAD /asset/:virtualAssetId'];

    afterEach(() => {
      if (https.request.mockRestore) https.request.mockRestore();
    });

    it('is set on a GET 302 redirect', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.set).toHaveBeenCalledWith('Veritone-Virtual-Asset', 'true');
      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
    });

    it('is set on a proxied GET', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 200,
        headers: { 'content-type': 'audio/mpeg', 'content-length': '42' }
      });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { headers: NON_BROWSER_HEADERS });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.set).toHaveBeenCalledWith('Veritone-Virtual-Asset', 'true');
      expect(upstreamRes.pipe).toHaveBeenCalledWith(res);
    });

    it('is set on the HEAD server-side check', async () => {
      const upstreamRes = fakeUpstreamRes({
        statusCode: 206,
        headers: { 'content-range': 'bytes 0-0/42', 'content-length': '1' }
      });
      const upstreamReq = fakeUpstreamReq();
      jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
        cb(upstreamRes);
        return upstreamReq;
      });

      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('HEAD', token);
      const res = mockResponse();

      await headHandler()(req, res);

      expect(res.set).toHaveBeenCalledWith('Veritone-Virtual-Asset', 'true');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('is set on a GET ?redirect=false sourceUri response', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({ uri: ASSET_URI });
      mockResolveVirtualAssetUri.mockResolvedValue(SIGNED_URL);

      const token = signToken({ id: VIRTUAL_ID });
      const req = mockRequest('GET', token, { query: { redirect: 'false' } });
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.set).toHaveBeenCalledWith('Veritone-Virtual-Asset', 'true');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('is set even on an auth failure (401)', async () => {
      const req = mockRequest('GET', 'not-a-jwt');
      const res = mockResponse();

      await getHandler()(req, res);

      expect(res.set).toHaveBeenCalledWith('Veritone-Virtual-Asset', 'true');
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('OPTIONS /asset/:virtualAssetId', () => {
    it('should return 204 with Allow header', async () => {
      const handler = routeHandlers['OPTIONS /asset/:virtualAssetId'];
      const req = mockRequest('OPTIONS', 'anything');
      const res = mockResponse();

      await handler(req, res);

      expect(res.set).toHaveBeenCalledWith('Allow', 'GET, HEAD, OPTIONS');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });
  });

  // VE-26469: filename-suffixed route forms and the virtual-asset marker
  // header consumed by media-streamer's HEAD probe.
  describe('filename-suffixed routes and marker header (VE-26469)', () => {
    const MARKER = 'Veritone-Virtual-Asset';

    it('registers GET/HEAD/OPTIONS for the /:filename form of both endpoints', () => {
      for (const key of [
        'GET /asset/:virtualAssetId/:filename',
        'HEAD /asset/:virtualAssetId/:filename',
        'OPTIONS /asset/:virtualAssetId/:filename',
        'GET /asset-static/:token/:filename',
        'HEAD /asset-static/:token/:filename',
        'OPTIONS /asset-static/:token/:filename'
      ]) {
        expect(routeHandlers[key]).toBeDefined();
      }
    });

    it('resolves a new-form URL identically to the old form (filename ignored)', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({
        signedUrl: SIGNED_URL,
        expiresAt: Date.now() + 60000
      });
      const handler = routeHandlers['GET /asset/:virtualAssetId/:filename'];
      const req = mockRequest('GET', signToken({ id: VIRTUAL_ID }));
      req.params.filename = 'clip01.ts';
      const res = mockResponse();

      await handler(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
    });

    it('sets the marker header on a successful response', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({
        signedUrl: SIGNED_URL,
        expiresAt: Date.now() + 60000
      });
      const handler = routeHandlers['GET /asset/:virtualAssetId'];
      const req = mockRequest('GET', signToken({ id: VIRTUAL_ID }));
      const res = mockResponse();

      await handler(req, res);

      expect(res.set).toHaveBeenCalledWith(MARKER, 'true');
    });

    it('sets the marker header even on an invalid token (probe needs no auth)', async () => {
      const handler = routeHandlers['GET /asset/:virtualAssetId'];
      const req = mockRequest('GET', 'not-a-valid.jwt.token');
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.set).toHaveBeenCalledWith(MARKER, 'true');
    });

    it('sets the marker header on the stateless endpoint too', async () => {
      const handler = routeHandlers['GET /asset-static/:token'];
      const req = {
        method: 'GET',
        params: { token: 'garbage' },
        query: {},
        headers: BROWSER_HEADERS
      };
      const res = mockResponse();

      await handler(req, res);

      expect(res.set).toHaveBeenCalledWith(MARKER, 'true');
    });

    it('short-circuits a probe HEAD to a no-store 204 with no resolution work or metrics', async () => {
      const handler = routeHandlers['HEAD /asset/:virtualAssetId'];
      const req = mockRequest('HEAD', signToken({ id: VIRTUAL_ID }), {
        headers: { 'veritone-virtual-asset-probe': 'true' }
      });
      const res = mockResponse();

      await handler(req, res);

      expect(res.set).toHaveBeenCalledWith(MARKER, 'true');
      // The bodyless 204 must never be cacheable against the media URL.
      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
      // No token resolution, no Redis lookup, no redirect/proxy path.
      expect(mockGetAssetUriFromVirtualId).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('does NOT short-circuit a GET carrying the probe header (media must flow)', async () => {
      mockGetAssetUriFromVirtualId.mockResolvedValue({
        signedUrl: SIGNED_URL,
        expiresAt: Date.now() + 60000
      });
      const handler = routeHandlers['GET /asset/:virtualAssetId'];
      const req = mockRequest('GET', signToken({ id: VIRTUAL_ID }), {
        headers: {
          ...BROWSER_HEADERS,
          'veritone-virtual-asset-probe': 'true'
        }
      });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).not.toHaveBeenCalledWith(204);
      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
    });

    it('short-circuits probe HEADs on the stateless endpoint too', async () => {
      const handler = routeHandlers['HEAD /asset-static/:token'];
      const req = {
        method: 'HEAD',
        params: { token: signToken({ uri: ASSET_URI }) },
        query: {},
        headers: { 'veritone-virtual-asset-probe': 'true' }
      };
      const res = mockResponse();

      await handler(req, res);

      expect(res.set).toHaveBeenCalledWith(MARKER, 'true');
      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(mockPresignUrl).not.toHaveBeenCalled();
    });

    it('OPTIONS on the filename route responds 204 with Allow and the marker', async () => {
      const handler = routeHandlers['OPTIONS /asset/:virtualAssetId/:filename'];
      const req = mockRequest('OPTIONS', 'anything');
      req.params.filename = 'x.mp4';
      const res = mockResponse();

      await handler(req, res);

      expect(res.set).toHaveBeenCalledWith(MARKER, 'true');
      expect(res.set).toHaveBeenCalledWith('Allow', 'GET, HEAD, OPTIONS');
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });
});
