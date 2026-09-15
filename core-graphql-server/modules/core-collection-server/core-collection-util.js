/* istanbul ignore file */
var slugid = require('slugid'),
  _ = require('lodash');

module.exports = function configure(config, logger) {
  if (!_.isObject(config)) {
    throw new Error('Missing config object');
  }
  if (!_.isObject(logger)) {
    throw new Error('Missing logger object');
  }

  var MEDIA_SOURCE_TYPE_RADIO = '1',
    MEDIA_SOURCE_TYPE_TV = '2',
    MEDIA_SOURCE_TYPE_YOUTUBE = '3',
    MEDIA_SOURCE_TYPE_PODCAST = '4';

  function generateShareId() {
    return slugid.nice();
  }

  function generateWidgetId() {
    return slugid.nice();
  }

  function getMentionSnippetText(mention) {
    var snippetText = null;

    if (!_.isObject(mention)) {
      return snippetText;
    }

    var snippets = null;
    if (mention.userSnippets && mention.userSnippets.length) {
      snippets = mention.userSnippets;
    } else {
      snippets = mention.mentionSnippets;
    }

    if (Array.isArray(snippets)) {
      for (var i = 0, size = snippets.length; i < size; i++) {
        if (snippets[i]) {
          if (snippetText == null) {
            snippetText = '';
          }

          if (i !== 0) {
            snippetText += '...';
          }

          snippetText += snippets[i].text.replace(/[@,-]/g, '');
        }
      }
    }

    return snippetText;
  }

  // Share email link text
  function getShareButtonText(mention) {
    var text = '';
    var type = null;

    if (!_.isObject(mention)) {
      return text;
    }

    if (_.isString(mention.fileType) && mention.fileType) {
      if (mention.fileType.indexOf('audio') !== -1) {
        type = 'audio';
      } else if (mention.fileType.indexOf('video') !== -1) {
        type = 'video';
      }
    } else if (
      _.isString(mention.mediaSourceTypeId) &&
      mention.mediaSourceTypeId
    ) {
      switch (mention.mediaSourceTypeId) {
        case MEDIA_SOURCE_TYPE_RADIO:
        case MEDIA_SOURCE_TYPE_PODCAST:
          type = 'audio';
          break;

        case MEDIA_SOURCE_TYPE_TV:
        case MEDIA_SOURCE_TYPE_YOUTUBE:
          type = 'video';
          break;
      }
    }

    if (type === 'audio') {
      text = 'Listen to';
    } else if (type === 'video') {
      text = 'Watch';
    }

    return text;
  }

  function errorToJSON(err) {
    var jsonErr = null;

    if (err === null || typeof err === 'undefined') {
      return null;
    }

    switch (typeof err) {
      case 'object':
        jsonErr = { message: err.toString() };
        break;
      case 'string':
        jsonErr = { message: err };
        break;
      default:
        jsonErr = { message: 'Unknown reason' };
    }

    return jsonErr;
  }

  function errorToFolderErrorObject(err) {
    var jsonErr = null;

    if (err === null || typeof err === 'undefined') {
      return null;
    }

    switch (typeof err) {
      case 'object':
        jsonErr = { message: err.message };
        break;
      case 'string':
        jsonErr = { message: err };
        break;
      default:
        jsonErr = { message: 'Unknown reason' };
    }

    jsonErr.httpStatus = 500;
    if (err.errorType) {
      jsonErr.errorType = err.errorType;
      jsonErr.message = err.message ? err.message : err.errorType;
      switch (err.errorType) {
        case 'invalid_tree_object_type':
          jsonErr.httpStatus = 422;
          break;
        case 'exceed_max_depth':
          jsonErr.httpStatus = 422;
          break;
        case 'tree_object_state_altered':
          jsonErr.httpStatus = 409;
          break;
        case 'read_access_only':
          jsonErr.httpStatus = 403;
          break;
        default:
          //errorToFolderErrorObject with errorType is initiated in the final callback of a db waterfall
          //there for the default http status code is 500
          jsonErr.httpStatus = 500;
      }
    }

    return jsonErr;
  }

  function waterFallStatus(lastDbCall, databaseUpdate) {
    if (!lastDbCall && !databaseUpdate) {
      return null;
    }

    if (!databaseUpdate) {
      databaseUpdate = false;
    }

    return { lastDbCall: lastDbCall, databaseUpdated: databaseUpdate };
  }
  /**
   * Deeply convert an object (object or array) to plain form. Specially used for unit tests
   * @param {*} castObject
   * @param {Array} skipInstances
   */
  function convertToPlainObject(castObject, skipInstances = [Date]) {
    let isSkipInstances = false;
    skipInstances.forEach((instance) => {
      if (castObject instanceof instance) {
        isSkipInstances = true;
      }
    });
    if (
      !castObject ||
      isSkipInstances ||
      (typeof castObject != 'object' && !_.isArray(castObject))
    ) {
      return castObject;
    } else if (typeof castObject == 'object' && _.isArray(castObject)) {
      return castObject.map((element) => {
        return convertToPlainObject(element, skipInstances);
      });
    }
    const newObject = {};
    Object.entries(castObject).forEach((obj) => {
      const [key, value] = obj;
      if (typeof value == 'object') {
        // recursively clone nested object
        const recursiveObject = convertToPlainObject(value);
        newObject[key] = recursiveObject;
      } else {
        newObject[key] = value;
      }
    });
    return _.cloneDeep(newObject);
  }

  return {
    generateShareId: generateShareId,
    generateWidgetId: generateWidgetId,
    getMentionSnippetText: getMentionSnippetText,
    getShareButtonText: getShareButtonText,
    errorToJSON: errorToJSON,
    errorToFolderErrorObject: errorToFolderErrorObject,
    waterFallStatus: waterFallStatus,
    convertToPlainObject: convertToPlainObject
  };
};
