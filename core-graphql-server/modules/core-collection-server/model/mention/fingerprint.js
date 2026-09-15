'use strict';

module.exports = require('../util/create-model')({
  fingerprintId: { type: 'string', required: true },
  spotTypeId: { type: 'string' },
  advertiserId: { type: 'string' },
  brandId: { type: 'string' },
  filename: { type: 'string' },
  mimetype: { type: 'string' },
  fileType: { type: 'string' },
  fileLocation: { type: 'string' },
  transcriptUrl: { type: 'string' },
  size: { type: 'number' }
});
