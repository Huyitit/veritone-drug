'use strict';

const _ = require('lodash');
const util = require('./util')();

module.exports = function init() {
  var engineCategoryModel = require('@veritone/core-server-base/model/util/create-model')(
    {
      engineCategoryId: { type: 'string', required: true },
      engineCategoryName: { type: 'string' },
      engineCategoryDescription: { type: 'string' },
      engineIds: { type: 'json' },
      search: { type: 'json' },
      elastic: { type: 'json' },
      dataField: { type: 'string' },
      iconClass: { type: 'string' },
      editable: { type: 'boolean' },
      videoOnly: { type: 'boolean' },
      libraryIdentifierTypes: { type: 'json' },
      dependencies: { type: 'json' },
      createdDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      updatedDate: {
        type: 'string',
        format: 'date-time',
        toJSON: util.dateTimeToJson
      },
      // permissions
      blacklistOrgIds: { type: 'json' },
      engineTypeId: { type: 'string' },
      engineTypeName: { type: 'string' }
    }
  );

  const internalFields = ['elastic'];

  engineCategoryModel.prototype.generateFilteredTaskTypeCategory = function generateFilteredTaskTypeCategory() {
    return _.omit(this, internalFields);
  };

  return engineCategoryModel;
};
