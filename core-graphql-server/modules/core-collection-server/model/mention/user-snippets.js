'use strict';

module.exports = require('../util/create-model')({
  startTime: { type: 'number', required: true },
  endTime: { type: 'number', required: true },
  text: { type: 'string', required: true }
});
