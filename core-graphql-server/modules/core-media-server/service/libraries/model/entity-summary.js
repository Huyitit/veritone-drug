'use strict';

/**
 * @swagger
 * definitions:
 *   EntitySummary:
 *     type: object
 *     properties:
 *       entityId:
 *         type: string
 *       identifierCountsByType:
 *         type: object
 */

const EntitySummary = require('@veritone/core-server-base/model/util/create-model')({
  entityId: {
    type: 'string'
  },
  identifierCountsByType: {
    type: 'json'
  }
});

module.exports = EntitySummary;
