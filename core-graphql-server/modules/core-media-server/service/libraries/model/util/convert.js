'use strict';

const querystring = require('querystring');
const url = require('url');
const _ = require('lodash');
const mimeTypeRegExp = /^([a-z]+\/[a-z0-9]+([+|.|-]?[a-z0-9]+)*)/i;

module.exports = {
  toURLObject,
  dateTimeToJSON,
  toSignedURL,
  extractMimeType
};

function toURLObject(urlString) {
  try {
    const u = url.parse(urlString, true);
    const { query } = u;

    if (typeof query == 'object') {
      // strip amazon signature params from the query string
      const stripFields = Object.keys(query).filter(k =>
        _.startsWith(k, 'X-Amz-')
      );
      const qsObj = _.omit(query, stripFields);

      u.query = qsObj;
      u.search = Object.keys(qsObj).length
        ? '?' + querystring.stringify(qsObj)
        : null;
    }

    u.toString = () => url.format(u);

    return u;
  } catch (err) {
    return false;
  }
}

function dateTimeToJSON(value) {
  if (!value) {
    return;
  }

  const date = new Date(value * 1000);
  return date.toISOString();
}

function toSignedURL(val, signer) {
  if (!val) {
    return val;
  }

  if (val instanceof url.Url) {
    val = val.href;
  }

  return _.isFunction(signer) ? signer(val) : val;
}

function extractMimeType(contentType) {
  if (!contentType) {
    return null;
  }

  const matches = contentType.match(mimeTypeRegExp);
  if (!matches || matches.length < 2) {
    return null;
  }

  let mimeType = matches[1];
  if (mimeType == 'audio/mpeg' || mimeType == 'audio/mpeg3') {
    mimeType = 'audio/mp3';
  }

  return mimeType;
}
