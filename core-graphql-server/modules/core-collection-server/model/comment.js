'use strict';

module.exports = require('./util/create-model')({
  commentId: { type: 'string' },
  mentionId: { type: 'string' },
  userId: {
    type: 'string',
    validate: { length: { minimum: 1 }, presence: true }
  },
  commentText: {
    type: 'string',
    userEditable: true,
    validate: { length: { minimum: 1 } }
  },
  dateCreated: { type: 'date' },
  dateModified: { type: 'date' }
});
