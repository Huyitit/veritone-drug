'use strict';

/**
 * @swagger
 * definitions:
 *   LibraryCollaborator:
 *     type: object
 *     properties:
 *       library:
 *         $ref: '#/definitions/Library'
 *       collaboratorOrgId:
 *         type: integer
 *         format: int32
 *       status:
 *         type: string
 *         enum:
 *           - active
 *           - rejected
 *           - revoked
 *       permissions:
 *         type: array
 *         items:
 *           type: string
 *           enum:
 *             - view
 *             - edit
 *             - share
 *       createdDateTime:
 *         type: string
 *         format: date-time
 *       modifiedDateTime:
 *         type: string
 *         format: date-time
 *
 *   LibraryCollaboratorPayload:
 *     type: object
 *     required:
 *       - libraryId
 *       - collaboratorOrgId
 *       - permissions
 *     properties:
 *       libraryId:
 *         type: string
 *       collaboratorOrgId:
 *         $ref: '#/definitions/LibraryCollaborator/properties/collaboratorOrgId'
 *       status:
 *         $ref: '#/definitions/LibraryCollaborator/properties/status'
 *       permissions:
 *         $ref: '#/definitions/LibraryCollaborator/properties/permissions'
 */

const _ = require('lodash');
const convert = require('./util/convert');
const validate = require('./util/validate');

const statusEnum = {
  active: 'active',
  rejected: 'rejected',
  revoked: 'revoked'
};

const permissionTypeEnum = {
  view: 'view',
  edit: 'edit',
  share: 'share'
};

const LibraryCollaborator = require('@veritone/core-server-base/model/util/create-model')(
  {
    libraryId: {
      type: 'string',
      required: true,
      validate: validate.validateUUID
    },
    collaboratorOrgId: {
      type: 'number',
      required: true
    },
    permissions: {
      type: 'json',
      required: true,
      validate: validatePermissions
    },
    status: {
      type: 'string',
      required: true,
      validate: validateStatus
    },
    createdDateTime: {
      type: 'number',
      toJSON: convert.dateTimeToJSON
    },
    modifiedDateTime: {
      type: 'number',
      toJSON: convert.dateTimeToJSON
    }
  }
);

Object.assign(LibraryCollaborator.prototype, {
  /**
   * Determines if the LibraryCollaborator instance has the specified permission
   * @param {String} permission - the permission type name
   * @return {Boolean} true, if it has the permission, false otherwise
   */
  hasPermission(permission) {
    return (
      Array.isArray(this.permissions) && this.permissions.includes(permission)
    );
  }
});

module.exports = Object.assign(LibraryCollaborator, {
  statusEnum,
  permissionTypeEnum,

  /**
   * Normalizes data and constructs an LibraryCollaborator model instance from it
   * @param {Object} data - an object containing the LibraryCollaborator data
   * @return {LibraryCollaborator} a normalized model instance
   */
  normalize(data) {
    const libraryId = data.libraryId || _.get(data, 'library.libraryId');
    const normalizedData = Object.assign(_.omit(data, ['library']), {
      libraryId
    });

    return new LibraryCollaborator(normalizedData);
  }
});

function validatePermissions(value, attributes, key) {
  if (!Array.isArray(value)) {
    return {
      [key]: { message: 'should be an array' }
    };
  }

  let diff = _.difference(value, Object.keys(permissionTypeEnum));

  if (diff.length) {
    return {
      [key]: { message: 'invalid permission types: ' + diff.join(', ') }
    };
  }

  return null;
}

function validateStatus(value, attributes, key) {
  if (value && typeof value != 'string') {
    return {
      [key]: { message: 'should be a string' }
    };
  }

  if (!statusEnum[value]) {
    return {
      [key]: {
        message:
          'invalid value. Supported statuses: ' +
          Object.keys(statusEnum).join(', ')
      }
    };
  }

  return null;
}
