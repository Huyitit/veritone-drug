'use strict';

module.exports = function newS3Helper(app) {
  const config = app.config;

  if (!config.s3) {
    throw new Error('Missing s3 config!');
  }
  if (!config.s3.region) {
    throw new Error('Missing from s3 config region!');
  }
  if (typeof config.s3.maxRetry !== 'number') {
    throw new Error('Missing from s3 config maxRetry!');
  }
  if (config.s3.maxRetry < 1) {
    throw new Error('Invalid s3 config. maxRetry must be greater than 0');
  }

  var aws = require('aws-sdk'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),
    util = require('util');

  aws.config = new aws.Config({
    region: config.s3.region,
    sslEnabled: true,
    maxRetries: config.s3.maxRetry
  });

  // use keys if provided, otherwise rely on aws instance profile
  if (config.s3.accessKey && config.s3.secretKey) {
    aws.config.accessKeyId = config.s3.accessKey;
    aws.config.secretAccessKey = config.s3.secretKey;
  }

  var s3 = new aws.S3();

  function getBucketFromUrl(s3Url, callback) {
    if (!s3Url) {
      throw new Error('s3Url is required!');
    }
    if (!callback) {
      throw new Error('callback is required!');
    }

    var parsedUrl = url.parse(s3Url);

    if (parsedUrl.host !== 's3.amazonaws.com') {
      return callback('unknown s3 url: ' + util.inspect(s3Url));
    }

    var bucketPath = path.dirname(parsedUrl.path);

    if (bucketPath === '/') {
      return callback('unknown s3 bucket: ' + util.inspect(s3Url));
    }

    callback(null, bucketPath);
  }

  function getFile(options, callback) {
    if (!options) {
      throw new Error('options is required!');
    }
    if (!options.localFile) {
      throw new Error('You must specify a localFile!');
    }
    if (!options.bucket) {
      throw new Error('You must specify a bucket!');
    }
    if (!options.fileKey) {
      throw new Error('You must specify a file key!');
    }
    if (!callback) {
      throw new Error('callback is required!');
    }

    var writeStream = fs
      .createWriteStream(options.localFile)
      .on('close', function onClose() {
        callback();
      })
      .on('error', function onErr(err) {
        callback(err);
      });

    var params = {
      Bucket: options.bucket,
      Key: options.fileKey
    };

    s3
      .getObject(params)
      .createReadStream()
      .pipe(writeStream);
  }

  function uploadFile(options, callback) {
    if (!options) {
      throw new Error('options is required!');
    }
    if (!options.localFile) {
      throw new Error('You must specify a localFile!');
    }
    if (!options.bucket) {
      throw new Error('You must specify a bucket!');
    }
    if (!options.fileKey) {
      throw new Error('You must specify a fileKey!');
    }
    if (!options.contentType) {
      throw new Error('You must specify a contentType!');
    }
    if (!callback) {
      throw new Error('callback is required!');
    }

    var file = fs
      .createReadStream(options.localFile)
      .on('error', function onErr(err) {
        callback(err);
      })
      .on('open', function onOpen() {
        var params = {
          Body: file,
          Key: options.fileKey,
          ACL: 'private',
          ContentType: options.contentType,
          Bucket: options.bucket
        };

        if (options.metadata) {
          params.Metadata = options.metadata;
        }

        s3
          .upload(params)
          // on('httpUploadProgress', function httpUploadProgressCallback(evt) {
          //	 console.log('s3 upload:', evt);
          // }).
          .send(function uploadObjectCallback(err, result) {
            if (err) {
              return callback(err);
            }

            callback(null, decodeURIComponent(result.Location));
          });
      });
  }

  function deleteFile(options, callback) {
    if (!options) {
      throw new Error('options is required!');
    }
    if (!options.fileKey) {
      throw new Error('You must specify a fileKey!');
    }
    if (!options.bucket) {
      throw new Error('You must specify a bucket!');
    }
    if (!callback) {
      throw new Error('callback is required!');
    }

    var params = {
      Key: options.fileKey,
      Bucket: options.bucket
    };

    s3.deleteObject(params, function deleteObjectCallback(err, result) {
      if (err) {
        return callback(err);
      }

      callback(null, result);
    });
  }

  return {
    getBucketFromUrl: getBucketFromUrl,
    getFile: getFile,
    uploadFile: uploadFile,
    deleteFile: deleteFile
  };
};
