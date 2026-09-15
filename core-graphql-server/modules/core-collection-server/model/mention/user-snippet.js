'use strict';

var createModel = require('../util/create-model');
var embeddedModelArray = require('../util/embedded-model-array');
var MentionUserSnippets = require('./user-snippets');

module.exports = createModel({
  startTime: { type: 'number', required: true },
  endTime: { type: 'number', required: true },
  text: { type: 'string', required: true },
  transcriptStartDate: { type: 'date', required: true },
  transcriptEndDate: { type: 'date', required: true },
  snippets: embeddedModelArray({
    model: MentionUserSnippets,
    modelName: 'MentionUserSnippets',
    userEditable: true
  })
});
