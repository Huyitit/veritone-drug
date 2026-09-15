const rp = require('request-promise');
const _ = require('lodash');
const url = require('url');
const AmazonS3URI = require('amazon-s3-uri');

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);

  // sometimes task log URIs are stored using the s3:// URL format.
  // here we'll convert to an https:// URL to sign and return.
  function toHttpsUrl(uri) {
    let res = uri;
    if (uri && url.parse(uri).protocol === 's3:') {
      const { region, bucket, key } = AmazonS3URI(uri);
      const rstr = region ? 's3-' + region : 's3';
      res = `https://${rstr}.amazonaws.com/${bucket}/${key}`;
    }
    return res;
  }

  async function signAndDownload(uri, context) {
    const signedUri = await sign(uri);
    const data = await util.download(signedUri, context);
    return data;
  }

  async function sign(uri) {
    return util.getSignedUrl(toHttpsUrl(uri), 'tasklog');
  }

  return {
    uri: (object) => sign(object.uri),
    // TODO we will load the entire log file into memory
    text: (object, args, context) =>
      object.uri ? signAndDownload(object.uri, context) : null,
    jsondata: (object, args, context) => {
      return object.uri
        ? signAndDownload(object.uri, context).then((data) => {
            try {
              return JSON.parse(data);
            } catch (err) {
              return { text: data };
            }
          })
        : null;
    }
  };
};
