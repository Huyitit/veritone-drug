'use strict';

jest.mock('fs', () => ({
  createReadStream: jest.fn().mockReturnValue({ isStream: true })
}));

jest.mock('./middlewareAuth', () => {
  return jest.fn(() => ({
    splitAuthentication: jest.fn(() => jest.fn())
  }));
});

describe('launch route', () => {
  let enginePostHandler;
  let mockCreateTDOWithAsset;
  let mockLaunchSingleEngineJob;
  let mockLogger;
  let serviceContext;

  beforeEach(() => {
    mockCreateTDOWithAsset = jest.fn();
    mockLaunchSingleEngineJob = jest.fn();
    mockLogger = { error: jest.fn() };

    const mockMiddleware = jest.fn();
    serviceContext = {
      app: {
        use: jest.fn(),
        post: jest.fn((path, handler) => {
          if (path.includes('engine')) {
            enginePostHandler = handler;
          }
        }),
        middleware: {
          authenticationOption: jest.fn().mockReturnValue(mockMiddleware),
          loadAuthDataByToken: mockMiddleware,
          hasAccessTo: jest.fn().mockReturnValue(mockMiddleware),
          requireRights: jest.fn().mockReturnValue(mockMiddleware)
        },
        permissions: {
          cms: { job: { create: 'job:create' } }
        }
      },
      config: {},
      logger: mockLogger,
      dal: {
        tdo: { createTDOWithAsset: mockCreateTDOWithAsset },
        v3Job: { launchSingleEngineJob: mockLaunchSingleEngineJob }
      }
    };

    require('./launch.js')(serviceContext);
  });

  function mockRes() {
    const res = { send: jest.fn() };
    res.status = jest.fn().mockReturnValue(res);
    return res;
  }

  it('returns 400 when engineId is missing', async () => {
    const req = {
      params: {},
      body: {},
      headers: {},
      file: { mimetype: 'video/mp4', originalname: 'test.mp4', size: 1000, encoding: '7bit', path: '/tmp/upload' },
      context: { tokenInfo: { organizationId: '123' } }
    };
    const res = mockRes();
    await enginePostHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith({ message: 'Missing engineId' });
  });

  it('returns 400 when uploaded file is missing', async () => {
    const req = {
      params: { engineId: 'engine-1' },
      body: {},
      headers: {},
      file: undefined,
      context: { tokenInfo: { organizationId: '123' } }
    };
    const res = mockRes();
    await enginePostHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith({ message: 'invalid file upload.' });
  });

  it('returns 500 when createTDOWithAsset returns null', async () => {
    mockCreateTDOWithAsset.mockResolvedValue(null);
    const req = {
      params: { engineId: 'engine-1' },
      body: {},
      headers: {},
      file: { mimetype: 'video/mp4', originalname: 'test.mp4', size: 1000, encoding: '7bit', path: '/tmp/upload' },
      context: { tokenInfo: { organization: { organizationId: '42' } } }
    };
    const res = mockRes();
    await enginePostHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({ message: 'Fail to create TDO' });
  });
});
