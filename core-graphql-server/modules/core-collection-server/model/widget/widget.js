'user strict';

var createModel = require('../util/create-model');
var _ = require('lodash');
var HEX_COLOR_REGEX = /^([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

var Widget = createModel({
  _postgresConfig: {
    tableName: 'widget',
    fields: {
      widget_id: 'widgetId'  
    },
    primaryKey: 'widget_id'
  },
  widgetId: {
    type: 'string',
    validate: {
      length: {
        minimum: 1
      },
      presence: true
    }
  },
  name: {
    type: 'string'
  },
  organizationId: {
    type: 'string',
    validate: {
      length: {
        minimum: 1
      },
      presence: true
    }
  },
  collectionId: {
    type: 'string',
    dbKey: 'folder_id',
    validate: {
      length: {
        minimum: 1
      },
      presence: true
    }
  },
  displayCollectionName: {
    type: 'boolean',
    required: true
  },
  displayCollectionDescription: {
    type: 'boolean',
    required: true
  },
  displayLogo: {
    type: 'boolean',
    required: true
  },
  displayMentionIntro: {
    type: 'boolean',
    required: true
  },
  displayTranscription: {
    type: 'boolean',
    required: true
  },
  displayMentionDescription: {
    type: 'boolean',
    required: true
  },
  width: {
    type: 'number',
    required: true
  },
  numberOfMentionsToShow: {
    type: 'number',
    required: true
  },
  adScript: {
    type: 'string'
  },
  seoTags: {
    type: '*', // array[string]
    validate: validateStringArray
  },
  backgroundColor: {
    type: 'string',
    validate: validateHexColor
  },
  borderColor: {
    type: 'string',
    validate: validateHexColor
  },
  textColor: {
    type: 'string',
    validate: validateHexColor
  },
  nextButtonColor: {
    type: 'string',
    validate: validateHexColor
  },
  dateCreated: {
    type: 'date'
  }
});

function validateHexColor(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  var error = {};

  if (!HEX_COLOR_REGEX.test(value)) {
    error[key] = {
      message: 'should be HEX color code'
    };
    return error;
  }

  return null;
}

function validateStringArray(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  var error = {};

  if (!_.isArray(value)) {
    error[key] = {
      message: 'should be Array of Strings'
    };
    return error;
  }

  var errors = [];
  value.forEach(function validateId(v, index) {
    if (!_.isString(v) || v === '') {
      errors.push({
        message: 'value at index ' + index + ' should be a String'
      });
    }
  });
  if (errors.length) {
    error[key] = errors;
    return error;
  }

  return null;
}

module.exports = Widget;
