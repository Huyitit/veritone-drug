'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { Stream, PassThrough } = require('stream');
const async = require('async');

module.exports = function init(app, storage) {
  const config = app.config;

  const tmpUploadDir = config.tmpdir || path.join(global.__base, 'tmp');

  return {
    uploadContent,
    readFromURL,
    createWriteStream
  };

  function uploadContent(content, contentType, destFilePath) {
    if (
      !(
        isReadableStream(content) ||
        content instanceof Buffer ||
        content instanceof Uint8Array ||
        typeof content == 'string'
      )
    ) {
      throw new Error(
        'expected content to be either a readable stream, string, Buffer, or Uint8Array instance'
      );
    }

    if (!destFilePath) {
      throw new Error('destFilePath is required');
    }

    const filename = path.basename(destFilePath);
    const localFile = path.join(tmpUploadDir, filename);

    return new Promise(function resolver(resolve, reject) {
      async.waterfall(
        [
          function mkTempDir(callback) {
            // attempt to create the temp dir. if it exists, it will fail, but proceed anyway
            fs.mkdir(tmpUploadDir, () => callback());
          },
          function createLocalFile(callback) {
            if (isReadableStream(content)) {
              const writeStream = fs.createWriteStream(localFile);
              content.on('error', function onReadError(err) {
                writeStream.removeListener('finish', callback).end();
                callback(err);
              });

              writeStream
                .on('error', function onWriteError(err) {
                  // consume response data to free up memory
                  content.resume();
                  callback(err);
                })
                .on('finish', callback);

              content.pipe(writeStream);
            } else {
              fs.writeFile(localFile, content, 'binary', callback);
            }
          },
          function uploadToStorage(callback) {
            const fileStats = fs.statSync(localFile);
            const fileContent = fs.createReadStream(localFile);
            fileContent.on('error', err => {
              callback(err);
            });
            fileContent.on('open', () => {
              storage.putObject(
                destFilePath,
                contentType,
                fileStats.size,
                fileContent,
                callback
              );
            });
          },
          function deleteLocalFile(location, callback) {
            fs.unlink(localFile, err => callback(err, location));
          }
        ],
        function waterfallCb(err, location) {
          err ? reject(err) : resolve(location);
        }
      );
    });
  }

  function readFromURL(url) {
    const client = url.substring(0, 5) === 'https' ? https : http;

    return new Promise(function resolver(resolve, reject) {
      client
        .get(url, function getCb(res) {
          const { statusCode, headers } = res;
          const contentType = headers['content-type'];

          if (statusCode !== 200) {
            // consume response data to free up memory
            res.resume();
            return reject(
              new Error(
                'Failed to download file. Received Status: ' + statusCode
              )
            );
          }

          resolve({
            content: res,
            contentType
          });
        })
        .on('error', reject);
    });
  }

  function createWriteStream(destFilePath, contentType) {
    const stream = new PassThrough();

    uploadContent(stream, contentType, destFilePath).then(
      function resolve(location) {
        stream.emit('uploaded', location);
      },
      function reject(err) {
        stream.emit('error', err);
      }
    );

    return stream;
  }

  function isReadableStream(obj) {
    return obj instanceof Stream && typeof obj.pipe == 'function';
  }
};
