'use strict';

/**
 * @swagger
 * definitions:
 *   LibraryTypeEntityIdentifierTypeLink:
 *     type: object
 *     properties:
 *       libraryTypeId:
 *         type: string
 *       entityIdentifierTypeId:
 *         type: string
 *       minItems:
 *         type: number
 *       maxItems:
 *         type: number
 */

const LibraryTypeEntityIdentifierTypeLink = require('@veritone/core-server-base/model/util/create-model')(
  {
    libraryTypeId: {
      type: 'string'
    },
    entityIdentifierTypeId: {
      type: 'string',
      required: true
    },
    minItems: {
      type: 'number'
    },
    maxItems: {
      type: 'number'
    }
  }
);

module.exports = LibraryTypeEntityIdentifierTypeLink;
