'use strict';

describe('signedWritableUrl', () => {
  let putHandler;
  let mockPutRawBytes;
  let mockPutRawChunkBytes;
  let mockLogger;
  let serviceContext;

  beforeEach(() => {
    mockPutRawBytes = jest.fn();
    mockPutRawChunkBytes = jest.fn();
    mockLogger = { error: jest.fn() };

    serviceContext = {
      app: {
        put: jest.fn((path, handler) => {
          putHandler = handler;
        })
      },
      config: {},
      logger: mockLogger,
      dal: {
        dalStorage: {
          putRawBytes: mockPutRawBytes,
          putRawChunkBytes: mockPutRawChunkBytes
        }
      }
    };

    require('./signedWritableUrl.js')(serviceContext);
  });

  function mockRes() {
    const res = {
      send: jest.fn(),
      sendStatus: jest.fn()
    };
    res.status = jest.fn().mockReturnValue(res);
    return res;
  }

  describe('single-file PUT (no chunkNumber)', () => {
    it('returns 400 when key param is missing', async () => {
      const req = {
        params: {},
        headers: { 'content-type': 'application/octet-stream', 'content-length': '100' }
      };
      const res = mockRes();
      await putHandler(req, res);
      expect(res.send).toHaveBeenCalledWith(400, 'Missing key');
    });

    it('returns 400 when Content-Type header is missing', async () => {
      const req = {
        params: { key: 'mykey' },
        headers: { 'content-length': '100' }
      };
      const res = mockRes();
      await putHandler(req, res);
      expect(res.send).toHaveBeenCalledWith(400, 'Missing header: Content-Type');
    });

    it('returns 400 when Content-Length header is missing', async () => {
      const req = {
        params: { key: 'mykey' },
        headers: { 'content-type': 'application/octet-stream' }
      };
      const res = mockRes();
      await putHandler(req, res);
      expect(res.send).toHaveBeenCalledWith(400, 'Missing header: Content-Length');
    });

    it('calls dalStorage.putRawBytes on valid single-file PUT and returns url', async () => {
      mockPutRawBytes.mockResolvedValue('https://s3.example.com/signed');
      const req = {
        params: { key: 'mykey' },
        headers: { 'content-type': 'application/octet-stream', 'content-length': '100' }
      };
      const res = mockRes();
      await putHandler(req, res);
      expect(mockPutRawBytes).toHaveBeenCalledWith(
        'mykey', 'application/octet-stream', '100', req
      );
      expect(res.send).toHaveBeenCalledWith({ url: 'https://s3.example.com/signed' });
    });
  });

  describe('chunked PUT (chunkNumber present)', () => {
    it('returns 400 when chunkNumber is not a finite positive number', async () => {
      const req = {
        params: { key: 'mykey', chunkNumber: 'notanumber' },
        headers: { 'content-type': 'application/octet-stream', 'content-length': '100' }
      };
      const res = mockRes();
      await putHandler(req, res);
      expect(res.send).toHaveBeenCalledWith(400, 'The chunk number must be a postive, finite number.');
    });

    it('calls dalStorage.putRawChunkBytes on valid chunk PUT', async () => {
      mockPutRawChunkBytes.mockResolvedValue({ chunkNumber: 0, chunks: { 0: 'done' } });
      const req = {
        params: { key: 'mykey', chunkNumber: '0' },
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': '512'
        }
      };
      const res = mockRes();
      await putHandler(req, res);
      expect(mockPutRawChunkBytes).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalled();
    });
  });
});
