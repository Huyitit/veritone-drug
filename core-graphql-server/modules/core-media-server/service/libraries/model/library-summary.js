'use strict';

/**
 * @swagger
 * definitions:
 *   LibrarySummary:
 *     type: object
 *     properties:
 *       libraryId:
 *         type: string
 *       entityCount:
 *         type: integer
 *         format: int32
 *       unpublishedEntityCount:
 *         type: integer
 *         format: int32
 *       lastTrainedVersion:
 *         type: integer
 *         format: int32
 *       lastTrainedDateTime:
 *         type: string
 *         format: date-time
 *       ownershipType:
 *         type: string
 *         enum:
 *           - owner
 *           - collaborator
 *       permissions:
 *         $ref: '#/definitions/LibraryCollaborator/properties/permissions'
 */

const convert = require('./util/convert');

const LibrarySummary = require('@veritone/core-server-base/model/util/create-model')({
  libraryId: {
    type: 'string'
  },
  entityCount: {
    type: 'number'
  },
  unpublishedEntityCount: {
    type: 'number'
  },
  ownershipType: {
    type: 'string'
  },
  permissions: {
    type: 'json'
  },
  lastTrainedVersion: {
    type: 'number'
  },
  lastTrainedDateTime: {
    type: 'number',
    toJSON: convert.dateTimeToJSON
  }
});

const ownershipTypeEnum = {
  owner: 'owner',
  collaborator: 'collaborator'
};

module.exports = Object.assign(LibrarySummary, { ownershipTypeEnum });
