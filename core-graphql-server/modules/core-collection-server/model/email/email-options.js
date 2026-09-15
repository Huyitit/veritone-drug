'use strict';

var converters = require('../util/converters'),
  validators = require('../util/validators'),
  _ = require('lodash');

function validateTemplateId(value, attributes, key) {
  if (!_.has(attributes, 'toEmail')) {
    return null;
  }

  // template is not required if there are no email addresses
  var toEmail = attributes['toEmail'];

  if (_.isArray(toEmail) && toEmail.length === 0) {
    return null;
  }

  if (_.isString(toEmail) && toEmail.trim() === '') {
    return null;
  }

  if (!_.isString(value) || value.trim() === '') {
    var err = {};
    err[key] = { message: 'should be a String' };
    return err;
  }

  return null;
}

module.exports = require('../util/create-model')({
  toEmail: {
    type: '*',
    convert: converters.convertOneOrManyCommaDelimitedString,
    validate: validators.validateOptionalEmailConstraint
  },
  fromEmail: { type: 'string' },
  fromName: { type: 'string' },
  subject: { type: 'string' },
  globalMergeVars: { type: '*' },
  trackOpens: { type: 'boolean' },
  trackClicks: { type: 'boolean' },
  tags: { type: 'string' },
  templateId: {
    type: 'string',
    validate: validateTemplateId
  },
  async: { type: 'boolean' },
  mergeLanguage: { type: 'string' }
});
