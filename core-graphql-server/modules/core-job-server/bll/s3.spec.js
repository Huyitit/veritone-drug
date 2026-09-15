'use strict';

const util = require('../../../test/mockUtil')();

describe('bll s3', () => {
  let testContext = {};
  testContext.mod = require('./s3');

  util.mockCommon(testContext);

  let callbackHasBeenCalled;

  beforeEach(() => {
    testContext.app.config.s3 = {
      buildTestReportBucket: 'bucket of kfc',
      buildManifestBucket: 'bucket of kfc'
    };
    testContext.storage = util.createSpyObj('storage', ['getAsset']);
    testContext.bll = testContext.mod(testContext.app, testContext.storage);
  });

  it('should be a configurable package', () => {
    expect(testContext.mod).toEqual(expect.any(Function));
  });

  it('should export an object containing s3 bll functions', () => {
    expect(testContext.mod(testContext.app, testContext.storage)).toEqual(
      expect.objectContaining({
        readAssetStream: expect.any(Function),
        getEngineBuildReport: expect.any(Function),
        getEngineBuildManifest: expect.any(Function),
        getTaskLog: expect.any(Function)
      })
    );
  });

  it('should throw error if app is missing', () => {
    expect(testContext.mod.bind(null, null)).toThrowError(/missing app/);
  });

  it('should throw error if storage is missing', () => {
    expect(testContext.mod.bind(null, testContext.app, null)).toThrowError(
      /missing storage/
    );
  });

  describe('when accessing readAssetStream', () => {
    beforeEach(() => {
      callbackHasBeenCalled = false;
    });

    it('should throw error missing callback', () => {
      expect(testContext.bll.readAssetStream).toThrowError(/callback/);
    });

    it('should return error on get asset with error', () => {
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(new Error('some error'), null, null);
        });

      testContext.bll.readAssetStream({}, function readAssetStream(err) {
        expect(err).toEqual(expect.any(Object));
        callbackHasBeenCalled = true;
      });

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return error on json error', () => {
      const mockStream = {
        on: function on(event, callback) {
          if (event === 'data') {
            return callback('{"inspect":{}'); // eslint-disable-line
          } else {
            return callback();
          }
        }
      };
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(null, mockStream, 13);
        });

      testContext.bll.readAssetStream({}, function readAssetStream(err) {
        expect(err).toEqual(expect.any(Object));
        callbackHasBeenCalled = true;
      });

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return asset data', () => {
      const mockStream = {
        on: function on(event, callback) {
          if (event === 'data') {
            return callback('{"inspect":{}}'); // eslint-disable-line
          } else {
            return callback();
          }
        }
      };
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(null, mockStream, 14);
        });

      testContext.bll.readAssetStream(
        {},
        function readAssetStream(err, assetData) {
          expect(err).toEqual(null);
          expect(assetData).toEqual(expect.any(String));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });
  });

  describe('when accessing getEngineBuildReport', () => {
    beforeEach(() => {
      callbackHasBeenCalled = false;
    });

    it('should throw error missing callback', () => {
      expect(testContext.bll.getEngineBuildReport).toThrowError(/callback/);
    });

    it('should throw error missing engine id', () => {
      testContext.bll.getEngineBuildReport(
        null,
        null,
        function getEngineBuildReportCallback(err) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should throw error missing build id', () => {
      testContext.bll.getEngineBuildReport(
        'engine-id',
        null,
        function getEngineBuildReportCallback(err, manifest) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return error on get asset with error', () => {
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(new Error('some error'), null, null);
        });

      testContext.bll.getEngineBuildReport(
        'engine-id',
        'build-id',
        function getEngineBuildReportCallback(err, manifest) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return error on json error', () => {
      const mockStream = {
        on: function on(event, callback) {
          if (event === 'data') {
            return callback('{"inspect":{}'); // eslint-disable-line
          } else {
            return callback();
          }
        }
      };
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(null, mockStream, 13);
        });

      testContext.bll.getEngineBuildReport(
        'engine-id',
        'build-id',
        function getEngineBuildReportCallback(err, manifest) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return manifest', () => {
      const mockStream = {
        on: function on(event, callback) {
          if (event === 'data') {
            return callback('{"inspect":{}}'); // eslint-disable-line
          } else {
            return callback();
          }
        }
      };
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(null, mockStream, 14);
        });

      testContext.bll.getEngineBuildReport(
        'engine-id',
        'build-id',
        function getEngineBuildReportCallback(err, manifest) {
          expect(err).toEqual(null);
          expect(manifest).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });
  });

  describe('when accessing getEngineBuildManifest', () => {
    beforeEach(() => {
      callbackHasBeenCalled = false;
    });

    it('should throw error missing callback', () => {
      expect(testContext.bll.getEngineBuildManifest).toThrowError(/callback/);
    });

    it('should throw error missing engine id', () => {
      testContext.bll.getEngineBuildManifest(
        null,
        null,
        function getEngineBuildManifestCallback(err) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should throw error missing build id', () => {
      testContext.bll.getEngineBuildManifest(
        'engine-id',
        null,
        function getEngineBuildManifestCallback(err, manifest) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return error on get asset with error', () => {
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(new Error('some error'), null, null);
        });

      testContext.bll.getEngineBuildManifest(
        'engine-id',
        'build-id',
        function getEngineBuildManifestCallback(err, manifest) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return error on json error', () => {
      const mockStream = {
        on: function on(event, callback) {
          if (event === 'data') {
            return callback('{"inspect":{}'); // eslint-disable-line
          } else {
            return callback();
          }
        }
      };
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(null, mockStream, 13);
        });

      testContext.bll.getEngineBuildManifest(
        'engine-id',
        'build-id',
        function getEngineBuildManifestCallback(err, manifest) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return manifest', () => {
      const mockStream = {
        on: function on(event, callback) {
          if (event === 'data') {
            return callback('{"inspect":{}}'); // eslint-disable-line
          } else {
            return callback();
          }
        }
      };
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(null, mockStream, 14);
        });

      testContext.bll.getEngineBuildReport(
        'engine-id',
        'build-id',
        function getEngineBuildManifestCallback(err, manifest) {
          expect(err).toEqual(null);
          expect(manifest).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });
  });

  describe('when accessing getTaskLog', () => {
    beforeEach(() => {
      callbackHasBeenCalled = false;
    });

    it('should throw error missing callback', () => {
      expect(testContext.bll.getTaskLog).toThrowError(/callback/);
    });

    it('should return error on get asset with error', () => {
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(new Error('some error'), null, null);
        });

      testContext.bll.getTaskLog(
        { taskLog: '' },
        function getTaskLogCallback(err, data) {
          expect(err).toEqual(expect.any(Object));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });

    it('should return task log', () => {
      const mockStream = {
        on: function on(event, callback) {
          if (event === 'data') {
            return callback('{"inspect":{}}'); // eslint-disable-line
          } else {
            return callback();
          }
        }
      };
      testContext.storage.getAsset = jest
        .fn()
        .mockImplementation(function getAsset(asset, callback) {
          callback(null, mockStream, 14);
        });

      testContext.bll.getTaskLog(
        { taskLog: '' },
        function getTaskLogCallback(err, data) {
          expect(err).toEqual(null);
          expect(data).toEqual(expect.any(String));
          callbackHasBeenCalled = true;
        }
      );

      expect(testContext.storage.getAsset).toHaveBeenCalled();
      expect(callbackHasBeenCalled).toBe(true);
    });
  });
});
