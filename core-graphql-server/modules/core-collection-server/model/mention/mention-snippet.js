'use strict';

var createModel = require('../util/create-model');
var embeddedModelArray = require('../util/embedded-model-array');
var MentionSnippetHit = require('./mention-snippet-hit');

module.exports = createModel({
  startTime: { type: 'number', required: true },
  endTime: { type: 'number', required: true },
  text: { type: 'string', required: true },
  hits: embeddedModelArray({
    model: MentionSnippetHit,
    modelName: 'MentionSnippetHit'
  })
});
