'use strict';

const _ = require('lodash');

module.exports = function init(app, storage) {
  if (!_.isObject(app) || !_.isObject(app.config)) {
    throw new Error('missing app');
  }
  if (!_.isObject(storage)) {
    throw new Error('missing storage');
  }

  const s3EngineBuildTestReportBucket = app.config.s3.buildTestReportBucket;
  const s3EngineBuildManifestBucket = app.config.s3.buildManifestBucket;

  return {
    getEngineBuildReport,
    getEngineBuildManifest,
    getTaskLog,
    readAssetStream
  };

  function readAssetStream(asset, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }
    app.logger.debug('getting s3 asset', asset);
    storage.getAsset(
      asset,
      function getAssetCallback(err, stream, contentLength) {
        if (err) {
          callback(err);
          return;
        }
        if (!stream || !contentLength) {
          app.logger.error('asset not found', asset);
          return callback(null, null);
        }

        const assetData = Buffer.alloc(contentLength);
        let contentSizeCurrent = 0;
        stream.on('error', function onError(err) {
          if (err) {
            app.logger.error(err);
            callback(err);
          }
        });
        stream.on('data', function data(data) {
          assetData.write(
            data.toString(),
            contentSizeCurrent,
            data.length,
            'utf-8'
          );
          contentSizeCurrent = contentSizeCurrent + data.length;
        });
        stream.on('end', function end() {
          callback(null, assetData.toString());
        });
      }
    );
  }

  /**
   * Retrieves the engine build report from s3.
   */
  function getEngineBuildReport(engineId, buildId, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }
    if (!_.isString(engineId)) {
      app.logger.error('missing engineId');
      return callback({ statusCode: 400, message: 'missing engineId' });
    }
    if (!_.isString(buildId)) {
      app.logger.error('missing buildId');
      return callback({ statusCode: 400, message: 'missing buildId' });
    }

    const asset = {
      _uri: `${getStorageEndpoint()}${s3EngineBuildTestReportBucket}/report-${engineId}-${buildId}.json`
    };

    readAssetStream(asset, function getAssetCallback(err, assetData) {
      if (err) {
        callback(err);
        return;
      }

      let report;
      try {
        if (assetData) {
          report = JSON.parse(assetData.toString());
        }
      } catch (e) {
        app.logger.error('error parsing report string buffer to json', e);
        callback(err);
        return;
      }

      // remove blacklisted fields
      _.unset(report, 'manifest');
      _.unset(report, 'inspect.RepoTags');
      _.unset(report, 'inspect.RepoDigest');
      _.unset(report, 'inspect.GraphDriver');
      _.unset(report, 'inspect.RootFS');

      callback(null, report);
    });
  }

  /**
   * Retrieves the engine build manifest from s3.
   */
  function getEngineBuildManifest(engineId, buildId, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }
    if (!_.isString(engineId)) {
      app.logger.error('missing engineId');
      return callback({ statusCode: 400, message: 'missing engineId' });
    }
    if (!_.isString(buildId)) {
      app.logger.error('missing buildId');
      return callback({ statusCode: 400, message: 'missing buildId' });
    }

    const asset = {
      _uri: `${getStorageEndpoint()}${s3EngineBuildManifestBucket}/manifest-${engineId}-${buildId}.json`
    };

    readAssetStream(asset, function getAssetCallback(err, assetData) {
      if (err) {
        callback(err);
        return;
      }

      let report;
      try {
        if (assetData) {
          report = JSON.parse(assetData.toString());
        }
      } catch (e) {
        app.logger.error('error parsing manifest string buffer to json', e);
        callback(err);
        return;
      }

      callback(null, report);
    });
  }

  /**
   * Retrieves the task log from s3.
   */
  function getTaskLog(task, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }
    if (!_.isString(task.taskLog)) {
      callback(new Error('missing taskLog'));
      return;
    }

    const taskLogUri = task.taskLog.substring(5); // parse out s3://
    const asset = {
      _uri: `${getStorageEndpoint}${taskLogUri}`
    };
    readAssetStream(asset, function getAssetCallback(err, assetData) {
      if (err) {
        callback(err);
        return;
      }
      callback(null, assetData);
    });
  }

  function getStorageEndpoint() {
    if (
      _.get(app, 'config.minio.enabled') === true &&
      _.has(app, 'config.minio.endPoint')
    ) {
      const host = _.get(app, 'config.minio.endPoint');
      const port = _.get(app, 'config.minio.port');
      const protocol = _.get(app, 'config.minio.secure', false)
        ? 'https'
        : 'http';
      const url = new URL(`http://minio/`);
      url.protocol = protocol;
      url.host = host;
      url.port = port;
      return url.toString();
    }

    return _.get(app, 'config.s3.endPoint', 'https://s3.amazonaws.com/');
  }
};
