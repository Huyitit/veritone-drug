'use strict';

const Readable = require('stream').Readable;
const mime = require('mime-types');
const _ = require('lodash');

module.exports = {
  parseQueryParam,
  bufferStreamContents,
  getOrganizationId
};

/**
 * Parses a query parameter
 * @param {String} param - the query param value
 * @param {String} [delimiter=,] - the value delimiter character
 * @returns {String[]} an array of values parsed from the query param
 */
function parseQueryParam(param, delimiter = ',') {
  let parts = [];

  if (Array.isArray(param)) {
    parts = param;
  } else if (_.isString(param)) {
    const delimRegex = new RegExp('s*' + delimiter + 's*');
    parts = param.trim().split(delimRegex);
  } else {
    parts.push(param);
  }

  parts = parts.map(function mapToString(part) {
    if (!_.isString(part)) {
      part = '' + part;
    }

    return part.trim();
  });

  return parts.filter(part => part.length);
}

/**
 * Reads data from a readable stream into a buffer
 * @param {Readable} readStream - the readable stream
 * @param {String} contentType - the mime-type of stream content
 * @returns {Promise} a promise that resolves with the stream contents or rejects with an error
 */
function bufferStreamContents(readStream, contentType) {
  if (!(readStream instanceof Readable)) {
    return Promise.reject(
      new Error('expected readStream to be an instance of Readable')
    );
  }

  return new Promise(function resolver(resolve, reject) {
    if (contentType == 'application/json') {
      return resolve(readStream.body);
    }

    const charset = mime.charsets.lookup(contentType);
    let content = Buffer.from('', charset);

    readStream.on('error', function onStreamError(err) {
      reject(err);
    });

    readStream.on('data', function onStreamData(chunk) {
      content = Buffer.concat([content, chunk]);
    });

    readStream.on('end', function onStreamEnd() {
      resolve(content);
    });
  });
}

function getOrganizationId(context) {
  if (!context) {
    return null;
  }

  const { tokenInfo } = context;

  if (tokenInfo) {
    // assume that org-less SSO tokens have global access
    if (!tokenInfo.organization) {
      return true;
    }

    return _.get(tokenInfo, 'organization.organizationId');
  }

  return _.get(context, 'userInfo.organization.organizationId');
}
