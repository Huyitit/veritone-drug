'use strict';

/**
 * @swagger
 * definitions:
 *   Library:
 *     type: object
 *     properties:
 *       libraryId:
 *         description: Unique id of the library.
 *         type: string
 *       name:
 *         description: The name of the library.
 *         type: string
 *       version:
 *         description: The current version number of the library. This value will always be set to zero on creation and can only be incremented by publishing the library via a dedicated api route.
 *         type: integer
 *         format: int32
 *       ownerOrgId:
 *         description: The id of the organization that owns this library. The value will always be determined by the authenticated user and cannot be changed.
 *         type: integer
 *         format: int32
 *       coverImageUrl:
 *         description: The URL of the cover image, or null if the library does not have one.
 *         type: string
 *       description:
 *         description: A brief description of the library.
 *         type: string
 *       createdDateTime:
 *         type: string
 *         format: date-time
 *       modifiedDateTime:
 *         type: string
 *         format: date-time
 *       libraryType:
 *         $ref: '#/definitions/LibraryType'
 *       summary:
 *         $ref: '#/definitions/LibrarySummary'
 *   LibraryPayload:
 *     type: object
 *     required:
 *       - libraryTypeId
 *       - name
 *     properties:
 *       libraryTypeId:
 *         type: string
 *       name:
 *         $ref: '#/definitions/Library/properties/name'
 *       coverImageUrl:
 *         $ref: '#/definitions/Library/properties/coverImageUrl'
 *       description:
 *         $ref: '#/definitions/Library/properties/description'
 */

const _ = require('lodash');
const uuid = require('uuid');
const convert = require('./util/convert');
const validators = require('./util/validate');
const LibraryCollaborator = require('./library-collaborator');

const Library = require('@veritone/core-server-base/model/util/create-model')({
  libraryId: {
    type: 'string',
    required: true,
    validate: validators.validateUUID
  },
  name: {
    type: 'string',
    required: true,
    validate: validators.validateNonEmptyString
  },
  version: {
    type: 'number'
  },
  ownerOrgId: {
    type: 'number',
    required: true
  },
  libraryTypeId: {
    type: 'string',
    required: true
  },
  coverImageUrl: {
    type: 'string',
    convert: toURL,
    validate: validators.validateURL,
    toJSON(value) {
      return convert.toSignedURL(value, Library.signURL);
    }
  },
  description: {
    type: 'string'
  },
  createdDateTime: {
    type: 'number',
    toJSON: convert.dateTimeToJSON
  },
  modifiedDateTime: {
    type: 'number',
    toJSON: convert.dateTimeToJSON
  }
});

Object.assign(Library.prototype, {
  generateId() {
    this.libraryId = uuid.v4();
    return this.libraryId;
  },

  isOwner(orgId) {
    return this.ownerOrgId == orgId;
  },

  /**
   * Checks an organization's access to this library
   * @param {Number} organizationId - the organization id to check access for
   * @param {String} permission - the collaborator permission type needed
   * @return {Boolean} returns true if the org has access to the library, false otherwise
   */
  checkOrgAccess(organizationId, permission) {
    if (this.isOwner(organizationId)) {
      return true;
    }

    if (this.collaborator instanceof LibraryCollaborator) {
      return this.collaborator.hasPermission(permission);
    }

    return false;
  }
});

module.exports = Object.assign(Library, {
  /**
   * Normalizes data and constructs an Library model instance from it
   * @param {Object} data - an object containing the Library data
   * @return {Library} a normalized model instance
   */
  normalize(data) {
    const libraryTypeId =
      data.libraryTypeId || _.get(data, 'libraryType.libraryTypeId');
    const normalizedData = Object.assign(_.omit(data, ['libraryType']), {
      libraryTypeId
    });

    return new Library(normalizedData);
  }
});

function toURL(val, src, self, key) {
  if (!val) {
    self[key] = null;
    return;
  }

  self[key] = convert.toURLObject(val) || null;
}
