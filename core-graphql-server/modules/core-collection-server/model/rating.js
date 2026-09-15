'use strict';

module.exports = require('./util/create-model')({
  mentionId: { type: 'string' },
  userId: {
    type: 'string',
    validate: { length: { minimum: 1 }, presence: true }
  },
  ratingId: { type: 'string' },
  ratingValue: { type: 'number', userEditable: true },
  dateCreated: { type: 'date' },
  dateModified: { type: 'date' }
});
