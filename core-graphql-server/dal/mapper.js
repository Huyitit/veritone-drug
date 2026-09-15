const humps = require('humps');
const validator = require('validator');
const _ = require('lodash');
const sanitize = require('sanitize-html');
const { eventNamesChange } = require('@veritone/core-server-base/events-map');
const mainUtil = require('../util.js')();

const TREE_OBJECT_TYPE = {
  FOLDER: 1,        // Tree Folder
  WATCHLIST: 2,     // Watchlist
  COLLECTION: 3,    // Collection
  ROOT_FOLDER: 4,   // Root
  TDO: 5,           // TDO
  APPLICATION: 6    // Application
};

function camelizeRootKeys(input) {
  if (!input) {
    return input;
  }
  if (typeof input !== 'object') {
    throw new Error('Missing input!' + typeof input);
  }
  const jsonValues =
    typeof input.toJSON === 'function' ? input.toJSON() : input;
  let output = {};
  Object.keys(jsonValues).forEach(function forEachKey(key) {
    output[humps.camelize(key)] = jsonValues[key];
  });

  return output;
}

function decamelizeRootKeys(input) {
  if (typeof input !== 'object') {
    throw new Error('Missing input!');
  }

  var output = {};
  Object.keys(input).forEach(function forEachKey(key) {
    output[humps.decamelize(key)] = input[key];
  });

  return output;
}

function removePrefixFromKeys(input, prefix) {
  if (_.isObject('input')) {
    throw new Error('Missing input!');
  }
  const jsonValues =
    typeof input.toJSON === 'function' ? input.toJSON() : input;

  const re = new RegExp(`^${prefix}`);

  const output = {};
  Object.keys(jsonValues).forEach(function forEachKey(key) {
    output[key.replace(re, '')] = jsonValues[key];
  });
  return output;
}

const deploymentModelNumMap = {
  0: 'FullyNetworkIsolated',
  1: 'MostlyNetworkIsolated',
  2: 'NonNetworkIsolated',
  3: 'HumanReview'
};

const deploymentModelStringMap = {
  FullyNetworkIsolated: 0,
  MostlyNetworkIsolated: 1,
  NonNetworkIsolated: 2,
  HumanReview: 3
};

function mapDeploymentModelOut(num) {
  return deploymentModelNumMap[num];
}

function mapDeploymentModelIn(str) {
  return deploymentModelStringMap[str];
}

function mapContextMenuExtensionsIn(contextMenuExtensions, InvalidInput) {
  if (!contextMenuExtensions) {
    return [];
  }

  const extensions = {
    mentions: [],
    tdos: [],
    watchlists: [],
    collections: [],
    ...contextMenuExtensions
  };

  const validationErrors = [];

  const contextMenuExtensionsList = [];

  Object.keys(extensions).map((collection) => {
    const type = collection.slice(0, collection.length - 1);
    const templateString = '${' + type + 'Id}';

    if (!_.isEmpty(extensions[collection])) {
      contextMenuExtensionsList.push(
        ...extensions[collection].map((item, index) => {
          if (item.url && !item.url.includes(templateString)) {
            validationErrors.push({
              fieldName: `contextMenuExtensions.${collection}[${index}].url`,
              fieldValue: item.url,
              message: `${templateString} is required`
            });
          }

          return {
            ...item,
            type
          };
        })
      );
    }
  });

  if (!_.isEmpty(validationErrors)) {
    throw new InvalidInput({
      message:
        'The request input did not pass validation checks. See the data section for detail on validation errors.',
      data: {
        validationErrors
      }
    });
  }

  return contextMenuExtensionsList;
}

function mapCloneAssetIds(cloneData) {
  var idMap = cloneData.newAssetIdsToOldAssetIds || {};
  var result = [];
  Object.keys(idMap).forEach(function (newId) {
    var oldId = idMap[newId];
    result.push({
      newAssetId: newId,
      oldAssetId: oldId
    });
  });
  return result;
}

function mapWidgetObject(row) {
  const dataset = JSON.parse(row);
  const result = dataset[0];
  result.id = result.widgetId;
  return camelizeRootKeys(result);
}

/**
 * Takes raw database row and returns an object in final format.
 */
function mapRecording(row) {
  const source = row.json || row;

  // make sure we map the isPublic boolean correctly. beware js "truthy"!
  let isPublic = row.is_public;
  if (_.isNil(isPublic)) isPublic = row.isPublic;
  if (_.isNil(isPublic)) isPublic = source.isPublic;
  if (_.isNil(isPublic))
    isPublic = _.get(row, 'json.security.global', false) === true;

  // add veritone permissions if missing
  if (!_.get(row, 'json.veritonePermissions') && row.veritonepermissions) {
    _.set(row, 'json.veritonePermissions', row.veritonepermissions);
  }

  const result = {
    id: row.id || row.recording_id || row.recordingId,
    createdDateTime:
      row.created_date_time ||
      row.createdDateTime ||
      dateTimeFromSec(source.createdDateTime || source.created_date_time),
    modifiedDateTime:
      row.modified_date_time ||
      row.modifiedDateTime ||
      dateTimeFromSec(source.modifiedDateTime || source.modified_date_time),
    security: source.security,
    mediaId: source.mediaId,
    status: source.status,
    applicationId: row.application_id || row.applicationId,
    startDateTime:
      row.start_date_time ||
      row.startDateTime ||
      dateTimeFromSec(source.startDateTime || source.start_date_time),
    stopDateTime:
      row.stop_date_time ||
      row.stopDateTime ||
      dateTimeFromSec(source.stopDateTime || source.stop_date_time),
    jsondata: row.json,
    description: source.description,
    source: source.source,
    sourceId: row.sourceId || row.source_id || source.sourceId,
    isPublic,
    orgId: row.organization_id || row.organizationId,
    createdBy: row.created_by || row.createdBy,
    modifiedBy: row.modified_by || row.modifiedBy
  };
  return result;
}

function dateTimeFromSec(dt) {
  if (!dt) return dt;
  if (dt < 10000000000) return dt * 1000;
  return dt;
}

/** Inverse of dateTimeFromSec: values for recording.recording_clone *_date_time (DB integer, unix seconds). */
function dateTimeToSec(dt) {
  if (dt == null || dt === '') return dt;
  const n = Number(dt);
  if (Number.isNaN(n)) return dt;
  if (n >= 10000000000) return Math.floor(n / 1000);
  return Math.floor(n);
}

function mapRecordingMetadata(row, key = null) {
  /*
  this model is pretty funky.
  if we were given a single database row representing a single piece of
  metadata, then key is null and row has "type" and "content" fields.
  if we were given the aggregated json object, then key is set by caller
  and represents a single field or row.
  */

  const _key = key || row.type;
  const obj = key ? row : row.content;
  if (!obj) {
    return {
      name: _key,
      data: {},
      __typename: 'JSONObject'
    };
  }
  var result;
  if (_key === 'veritone-program' || _key === 'veritoneProgram') {
    result = {
      id: obj.programId,
      programName: obj.programName,
      image: obj.programImage,
      liveImage: obj.programLiveImage,
      previewUrl: obj.previewAssetUrl,
      __typename: 'Program',
      name: 'Program'
    };
  } else if (_key === 'veritone-clone' || _key === 'veritoneClone') {
    result = {
      date: obj.date,
      originalId: obj.original,
      cloneBlobs: obj.cloneBlobs,
      assetIdMap: mapCloneAssetIds(obj),
      __typename: 'CloneData',
      name: 'CloneData'
    };
  } else if (_key === 'veritone-file' || _key === 'veritoneFile') {
    // TODO do we need this? it's really an asset.
    result = {
      size: obj.size,
      fileName: obj.filename,
      mimeType: obj.mimetype,
      __typename: 'FileData',
      name: 'FileData'
    };
  } else {
    result = {
      name: _key,
      data: obj,

      __typename: 'JSONObject'
    };
  }
  return result;
}

function mapNewAsset(row) {
  return {
    id: row.assetId,
    containerId: row.recordingId,
    assetType: row.assetType,
    contentType: row.contentType,
    uri: row._uri,
    jsondata: row.metadata
  };
}

function mapAsset(asset) {
  var res = camelizeRootKeys(asset);
  // we need to map the new ID now, instead of just in the
  // Asset.js resolvers file, so that it's available for messaging.
  if (!res.id) res.id = res.assetId;
  // recording.recording_asset stores created_date_time as seconds!
  // convert it here.
  const maxTimeSec = 32510030736; // in year 3000
  // do not convert dates that were incorrectly written to db as ms
  if (res.createdDateTime && res.createdDateTime < maxTimeSec)
    res.createdDateTime *= 1000;
  if (res.modifiedDateTime && res.modifiedDateTime < maxTimeSec)
    res.modifiedDateTime *= 1000;
  return res;
}

function mapApplicationDetails(item) {
  return _.set({}, item.type, item.content.data);
}

function mapPackage(packageItem) {
  var res = camelizeRootKeys(packageItem);
  const newResult = {
    id: res.packageId,
    name: res.packageName,
    description: res.packageDescription,
    icon: res.packageIcon,
    version: res.packageVersion,
    sourceOriginId: res.sourceOriginId,
    aiwareVersion: res.aiwareVersion,
    deleted: res.deleted,
    deprecated: res.deprecated,
    createdAt: res.packageCreatedDate || res.dateCreated,
    modifiedAt: res.dateModified,
    grantType: res.contextGrantType || null
  };
  return {
    ...res,
    ...newResult
  };
}

function mapNestedPackage(packageItem) {
  var res = camelizeRootKeys(packageItem);
  const newResult = {
    id: res.packageId,
    name: res.packageName,
    description: res.packageDescription,
    icon: res.packageIcon,
    version: res.packageVersion,
    sourceOriginId: res.sourceOriginId,
    aiwareVersion: res.aiwareVersion,
    deleted: res.deleted,
    deprecated: res.deprecated,
    createdAt: res.packageCreatedDate || res.dateCreated,
    modifiedAt: res.dateModified,
    visitedResources: res.visitedResources,
    visitedPackages: res.visitedPackages,
    visitedPackageNames: res.visitedPackageNames,
    hasCycle: res.hasCycle
  };
  return {
    ...res,
    ...newResult
  };
}

function mapNestedResources(packageItem) {
  var res = camelizeRootKeys(packageItem);
  const newResult = {
    createdAt: res.dateCreated,
    modifiedAt: res.dateModified,
    visitedResources: res.visitedResources,
    visitedPackageNames: res.visitedPackageNames,
    hasCycle: res.hasCycle
  };
  return {
    ...res,
    ...newResult
  };
}

function mapPackageResources(packageItem) {
  var res = camelizeRootKeys(packageItem);
  const newResult = {
    createdAt: res.dateCreated,
    modifiedAt: res.dateModified
  };
  return {
    ...res,
    ...newResult
  };
}

function mapPlatformProperties(packageItem) {
  var res = camelizeRootKeys(packageItem);
  const newResult = {
    properties: {
      ...res.jsonProperties,
      modifiedBy: res.modifiedBy,
      modifiedAt: res.modifiedAt
    }
  };
  return newResult;
}

function mapPlatformVersionHistory(version) {
  var res = camelizeRootKeys(version);
  const newResult = {
    platformVersion: {
      ...res
    },
    id: res.historyId,
    createdAt: res.historyCreatedAt
  };

  return newResult;
}

const cloneRequestModel = {
  clone_id: null,
  status: null,
  source_application_id: null,
  destination_application_id: null,
  created_date_time: null,
  modified_date_time: null,
  number_of_completed_recordings: null,
  number_of_recordings: null,
  request: null,
  response: null
};

function mapCloneToDb(clone) {
  const columnData = decamelizeRootKeys(clone);
  // Only keep keys from columnData that exist in cloneRequestModel
  Object.keys(columnData).forEach((key) => {
    if (!(key in cloneRequestModel)) {
      delete columnData[key];
    }
  });
  if (!_.isNil(columnData.created_date_time)) {
    columnData.created_date_time = dateTimeToSec(columnData.created_date_time);
  }
  if (!_.isNil(columnData.modified_date_time)) {
    columnData.modified_date_time = dateTimeToSec(columnData.modified_date_time);
  }
  return columnData;
}

function mapCloneJob(row) {
  /** GraphQL `percentage` is Int; DB counts can race so completed > total is possible. */
  const computeClonePercentage = (row) => {
    const n1 = Number(row.number_of_completed_recordings) || 0;
    const n2 = Number(row.number_of_recordings) || 0;
    if (n2 <= 0) return 0;
    const pct = Math.round((n1 / n2) * 100);
    return Math.min(100, Math.max(0, pct));
  };

  return {
    ...camelizeRootKeys(row.request),
    ...camelizeRootKeys(row),
    id: row.clone_id,
    createdDateTime: dateTimeFromSec(row.created_date_time),
    modifiedDateTime: dateTimeFromSec(row.modified_date_time),
    percentage: computeClonePercentage(row),
  }
}

function mapEngineCategory(row) {
  var result = camelizeRootKeys(row);
  // note that the engines query can return [null] in engineIds
  var nonnull = function (item) {
    return !!item;
  };
  var engineIds = result.engineIds.filter(nonnull);
  var aliasIds = result.engineAliasIds.filter(nonnull);
  for (var i = 0; i < engineIds.length; i++) {
    var engineId = engineIds[i];
    // both engine IDs and alias IDs are returned in engine order.
    // we'll iterate over engine IDs in order and, for each non-UUID,
    // shift the first alias off the list.
    if (!validator.isUUID(engineIds[i])) {
      engineIds[i] = aliasIds.shift();
    }
  }
  // it's possible that we had a non-UUID engine ID without a corresponding
  // alias ID. this will screw up our order, but it's an invalid engine config
  // and should never be encountered.
  // order wrong is not too bad. we mainly want to avoid skipping engine IDs.
  if (aliasIds.length) {
    engineIds = engineIds.concat(aliasIds);
  }
  result.engineIds = engineIds;
  result.type = {
    name: result.typeName,
    description: result.typeDescription
  };
  result.class = result.classId
    ? {
        id: result.classId,
        name: result.className,
        description: result.classDescription,
        iconClass: result.engineClassIcon
      }
    : null;

  return result;
}

function mapEngine(row) {
  var result = camelizeRootKeys(row);
  result.deploymentModelNum = result.deploymentModel;
  result.deploymentModel = mapDeploymentModelOut(result.deploymentModel);
  if (!row.id) result.id = result.engineId;
  if (!row.name) result.name = result.engineName;
  if (!row.state) result.state = result.engineState;
  if (!row.description) result.description = row.engineDescription;
  if (!row.currency) result.currency = row.engineCurrency;
  if (!row.category_id) result.categoryId = row.engineCategoryId;
  if (!row.engine_id) result.engineId = result.id;
  result.createdDateTime = result.createdDate;
  result.modifiedDateTime = result.updatedDate;
  result.internalId = result.id;
  // if we have an engine ID alias, override ID here.
  // never expose the internal ID.
  if (result.aliasId) {
    result.id = result.aliasId;
  }
  // mapped in Engine resolver to avoid failing entire query on errors.
  //result.fields = mapEngineFields(row.fields, row.engineId);
  if (_.isNil(result.manifest)) result.manifest = result.engineManifest;
  result.supportedInputFormats = result.inputTypes;
  result.preferredInputFormat = !_.isEmpty(result.inputTypes)
    ? _.head(result.inputTypes)
    : null;

  return result;
}

function mapEngineCertification(row) {
  const result = camelizeRootKeys(row);
  return result;
}

function mapEngineSchemas(row) {
  const result = camelizeRootKeys(row);
  return result;
}

function mapEntityTags(row) {
  const result = camelizeRootKeys(row);
  return result;
}

function mapPackageGrant(row) {
  const result = camelizeRootKeys(row);
  result.createdAt = result.dateCreated;
  result.modifiedAt = result.dateModified;

  return result;
}

function mapBlacklist(row) {
  return camelizeRootKeys(row);
}

function mapToken(row) {
  var res = camelizeRootKeys(row);
  res.id = res.tokenId;
  return res;
}

function mapTokens(rows) {
  if (rows.length > 0) {
    return rows.map(mapToken);
  } else {
    return [];
  }
}

function mapTask(row) {
  // workaround for rows in database that have non-standard string
  if (row.status === 'completed') row.status = 'complete';
  var res = camelizeRootKeys(row);
  if (row.payload) res.taskPayload = row.payload;
  if (row.output) res.taskOutput = row.output;
  if (!res.id) res.id = res.taskId;
  if (!res.status) res.status = res.taskStatus;
  if (!res.targetId) res.targetId = res.recordingId;
  if (!res.payload) res.payload = res.taskPayload;
  if (!res.output) res.output = res.taskOutput;
  if (!res.recordingId) res.recordingId = res.targetId;

  if (res.payload && res.payload.ioFolders)
    res.ioFolders = res.payload.ioFolders;
  if (res.payload && res.payload.executionPreferences)
    res.executionPreferences = res.payload.executionPreferences;

  res.mediaStorageBytes = res.mediaStorageBytesNew ?? res.mediaStorageBytes;

  return res;
}

function mapBuild(row) {
  const res = camelizeRootKeys(row);
  if (!res.id) res.id = res.buildId;
  res.state = res.buildState || res.state;
  res.size = res.buildSize;
  res.status = res.status || res.state;
  res.runtime = res.runtime || res.taskRuntime;
  res.runtime = _.isEmpty(res.runtime) ? { edge: {} } : res.runtime;
  return res;
}

function mapJob(row) {
  const res = camelizeRootKeys(row);
  if (!res.id) res.id = res.jobId;
  if (!res.targetId) res.targetId = res.recordingId;
  if (!res.templateId) res.templateId = res.jobTemplateId;
  if (res.jobConfig && res.jobConfig.routes) res.routes = res.jobConfig.routes;
  if (res.skipDecider !== false) res.skipDecider = true;
  if (!res.status) res.status = res.jobStatus;
  return res;
}

function mapLibraryType(row) {
  var res = camelizeRootKeys(row);
  res.id = res.libraryTypeId;
  res.entityTypeName = res.entityType.name;
  res.entityTypeNamePlural = res.entityType.namePlural;
  return res;
}

function mapLibrary(row) {
  var res = camelizeRootKeys(row);
  res.id = row.libraryId;
  if (res.libraryType) {
    res.libraryType = mapLibraryType(res.libraryType);
    res.libraryTypeId = res.libraryType.libraryTypeId;
  }
  res.organizationId = res.ownerOrgId;
  return res;
}

function mapEntityIdentifierType(row) {
  if (!row) return row;
  var res = camelizeRootKeys(row);
  res.id = row.entityIdentifierTypeId;
  return res;
}

function mapOrganization(row) {
  var res = camelizeRootKeys(row);

  res.name = res.organizationName;
  res.id = res.organizationId;
  res.createdDateTime = res.dateCreated;
  res.modifiedDateTime = res.dateModified;
  res.type = res.organizationType;
  // do not allow [null] for empty types
  if (res.type && res.type.length === 1 && !res.type[0]) {
    res.type = [];
  }
  res.jsondata = res.kvp;
  res.dataRetentionPolicies = [
    {
      action: 'PURGE',
      days: res.retentionDays
    }
  ];
  delete res.retentionDays;
  return res;
}

function mapLoginConfiguration(row) {
  let res = camelizeRootKeys(row);

  if (!_.isNil(res.organizationId)) {
    res.organizationInfo = {
      name: res.organizationName,
      id: res.organizationId,
      guid: res.organizationGuid
    };
  }

  res.buttonColor = _.get(res, 'loginButtonStyle.buttonColor');
  res.buttonTextColor = _.get(res, 'loginButtonStyle.buttonTextColor');

  return {
    enabled: res.enabled,
    organizationInfo: res.organizationInfo,
    name: res.name,
    slug: res.slug,
    logo: res.logo,
    buttonColor: res.buttonColor,
    buttonTextColor: res.buttonTextColor,
    hideVeritoneBranding: res.hideVeritoneBranding
  };
}

function mapApplication(row) {
  var res = camelizeRootKeys(row);
  res.id = res.applicationId;
  res.name = res.applicationName;
  res.status = res.applicationStatus;
  res.description = res.applicationDescription;
  res.url = res.applicationUrl;
  res.iconUrl = res.applicationIconUrl;
  res.iconSvg = res.applicationIconSvg;
  res.createdDateTime = res.createdDate;
  res.modifiedDateTime = res.updatedDate;
  res.sharedWithOrganizationId = res.organizationId;
  res.organizationId = res.ownerOrganizationId;
  res.key = res.applicationKey;
  res.deploymentModel = mapDeploymentModelOut(res.deploymentModel);
  res.isPublic = res.public;
  const _oauth2RedirectUrls = res.oauth2RedirectUrls;
  res.oauth2RedirectUrls = [];
  if (_oauth2RedirectUrls && _.isString(_oauth2RedirectUrls)) {
    res.oauth2RedirectUrls = _oauth2RedirectUrls.split(',');
  }
  /*
  id: ID!
  name: String!
  category: String
  description: String
  iconUrl: String
  iconSvg: String
  url: String
  deploymentModel: String
  createdDateTime: String
  modifiedDateTime: String
  # OAuth2 client secret. This field is server-generated and is only
  # returned on application creation.
  clientSecret: String
  organization: Organization
  organizationId: ID!
  status: String
  permissionsRequired: [String]
  isPublic: Boolean
  headerbarEnabled: Boolean
  */

  return res;
}

function mapApplicationConfig(row) {
  const res = camelizeRootKeys(row);

  res.valueJSON = _.get(res, 'configJson');
  res.defaultValueJSON = _.get(res, 'defaultValueJson');

  const configType = _.get(res, 'configType');
  if (configType) {
    res.configType =
      configType === 'json'
        ? _.toUpper(_.get(res, 'configType'))
        : _.capitalize(_.get(res, 'configType'));
  }
  const configLevel = _.get(res, 'configLevel');
  res.configLevel = configLevel ? _.capitalize(configLevel) : undefined;
  res.required = _.get(res, 'isRequired');
  res.secured = _.get(res, 'isSecured');
  res.description = _.get(res, 'configDescription');
  res.createdAt = _.get(res, 'dateCreated');
  res.modifiedAt = _.get(res, 'dateModified');
  res.value = _.get(res, 'configValue');
  res.packageId = _.get(res, 'packageId');

  const { organizationGuid, packageId, applicationId, configKey, userId } = res;
  if (!organizationGuid) {
    if (!packageId) {
      res.id = `${applicationId}#${configKey}`;
    } else {
      res.id = `${applicationId}#p:${packageId}#${configKey}`;
    }
  } else {
    res.id = `${applicationId}#o:${organizationGuid}#${configKey}`;
  }

  if (organizationGuid && userId && organizationGuid === userId) {
    res.userId = undefined;
  }

  return res;
}

function mapApplicationConfigFromId(options) {
  if (options.id) {
    const id = options.id.split('#');
    if (id.length < 2 || id.length > 3) {
      return;
    }
    options.appId = id[0];
    if (id.length == 2) {
      options.configKey = id[1];
    } else {
      options.configKey = id[2];
      const aux = id[1].split(':');
      if (aux[0] === 'p') {
        options.packageId = aux[1];
      } else {
        options.organizationId = aux[1];
      }
    }
  }
}

function mapApplicationHeaderbar(row) {
  const res = camelizeRootKeys(row);

  return {
    name: res.headerbarName,
    elementId: res.elementId,
    config: {
      title: res.title,
      backgroundColor: res.backgroundColor,
      help: res.helpEnabled,
      zIndex: res.zIndex,
      notification: res.notificationEnabled,
      displaySupportChat: res.displaySupportChat,
      logoSrc: res.logoSrc,
      hidePasswordReset: res.hidePasswordReset
    },
    createdAt: res.dateCreated,
    modifiedAt: res.dateModified,
    createdBy: res.createdBy,
    modifiedBy: res.modifiedBy
  };
}

function mapUser(user) {
  const res = camelizeRootKeys(user);
  res.id = res.userId;
  res.name = res.userName;
  res.jsondata = {};
  if (res.kvp) {
    res.jsondata = res.kvp;
    res.jsondata.firstName = sanitizeField(res.jsondata.firstName);
    res.jsondata.lastName = sanitizeField(res.jsondata.lastName);
  }

  if (res.lastLoggedIn && !res.lastLoginDateTime) {
    res.lastLoginDateTime = res.lastLoggedIn;
  }

  return res;
}

function mapGroup(user) {
  var res = camelizeRootKeys(user);
  res.id = res.groupId;
  res.name = res.groupName;
  res.createdDateTime = res.dateCreated;
  res.modifiedDateTime = res.dateModified;
  res.metadata = res.kvp || {};

  // TODO ability to get fully hydrated org object.
  // this will require checks to make sure we don't
  // infinitely recurse if org is requested on the users
  // field in a org query
  res.organization = {
    id: res.metadata.organizationId,
    name: res.metadata.organizationName
  };
  res.organizationId = res.metadata.organizationId;

  return res;
}

function mapRole(row) {
  var res = camelizeRootKeys(row);
  if (!res.id) {
    res.id = res.roleId;
  }
  if (!res.name) {
    res.name = res.roleName;
  }
  if (!res.description) {
    res.description = res.roleDescription;
  }
  if (!res.isApplicationEventRole) {
    res.isApplicationEventRole = res.isAppEventRole ?? false;
  }

  res.isPrivate = res.isPrivate ?? false;

  return res;
}

function mapPermission(row) {
  var res = camelizeRootKeys(row);
  res.name = res.permissionName;
  res.id = res.permissionId;
  res.description = res.permissionDescription;
  return res;
}

function mapMentionSearchResults(row) {
  return row;
}

function mapCollection(row) {
  var res = camelizeRootKeys(row);
  res.imageUrl = res.image;
  return res;
}

function mapWatchlist(row) {
  let res = removePrefixFromKeys(row, 'tracking_unit_');
  res = camelizeRootKeys(res);
  res.isDisabled = res.stateLookupId === 4;
  res.isUpdating = res.stateLookupId === 2;
  return res;
}

function mapLibraryCollaborator(row) {
  var res = camelizeRootKeys(row);
  res.libraryId = res.library.libraryId;
  res.organizationId = res.collaboratorOrgId;

  return res;
}

function mapFolder(row) {
  const res = camelizeRootKeys(row);
  res.ownerId = res.userId;
  if (res.treeObjectStatus) {
    res.status = res.treeObjectStatus === 1 ? 'active' : 'inactive';
  }
  res.parentTreeObjectId = res.realParentTreeObjectId || res.parentTreeObjectId;
  if (!res.id) {
    res.id = res.objectId || res.rootFolderId;
  }
  return res;
}

function mapFolderV2(row) {
  const res = camelizeRootKeys(row);
  res.ownerId = res.userId || res.rootFolderUserId;
  if (res.treeObjectStatus) {
    res.status = res.treeObjectStatus === 1 ? 'active' : 'inactive';
  } else {
    res.status = 'active';
  }
  if (!res.treeObjectId) {
    res.treeObjectId = res.id;
    res.objectId = res.id;
  }
  if (!res.parentFolderId && !res.rootFolderTypeId) {
    res.rootFolderTypeId = res.folderTypeId;
  }

  


  if (res.rootFolderTypeId || !res.parentFolderId) {
    // covert to legacy ids
    res.rootFolderTypeId =
      {
        2: 1, // watchlist
        3: 2, // collection
        5: 3, // tdo-cms
        6: 4 // application
      }[res.rootFolderTypeId] || res.rootFolderTypeId;
  }
  if (Array.isArray(res.sharedOrgRead) && !_.get(res, 'sharedWith.read')) {
    _.set(
      res,
      'sharedWith.read',
      res.sharedOrgRead.filter((x) => !!x)
    );
  }
  if (Array.isArray(res.sharedOrgWrite) && !_.get(res, 'sharedWith.write')) {
    _.set(
      res,
      'sharedWith.write',
      res.sharedOrgWrite.filter((x) => !!x)
    );
  }

  res.typeId = res.parentFolderId ? TREE_OBJECT_TYPE.FOLDER : TREE_OBJECT_TYPE.ROOT_FOLDER;
  res.orderIndex = 0;
  return res;
}

function mapRootFolderV2(row) {
  const res = mapFolderV2(row);
  res.typeId = TREE_OBJECT_TYPE.ROOT_FOLDER;
  return res;
}

function mapFolderContentTemplate(row) {
  var res = {
    id: row.tree_object_content_template_id,
    folderId: row.tree_object_id,
    sdoId: row.sdo_id,
    schemaId: row.data_registry_id,
    createdDateTime: row.creation_date,
    modifiedDateTime: row.last_updated_date
  };

  return res;
}

function mapLibraryEngineModel(asset) {
  var res = camelizeRootKeys(asset);

  res.id = res.libraryEngineModelId;
  if (!res.libraryId) res.libraryId = res.library ? res.library.libraryId : '';
  res.jsondata = res.metadata;
  return res;
}

function mapEntity(entity) {
  var res = camelizeRootKeys(entity);

  res.id = res.entityId;
  res.jsondata = res.metadata;
  if (!res.libraryId && res.library) {
    res.libraryId = res.library.libraryId;
  }

  return res;
}

function mapEntityIdentifier(entityIdentifier) {
  var res = camelizeRootKeys(entityIdentifier);

  res.identifierType = mapEntityIdentifierType(res.entityIdentifierType);
  res.identifierTypeId = res.entityIdentifierTypeId || res.identifierType.id;
  res.id = res.entityIdentifierId;
  res.isPriority = res.priority;
  res.entityId = res.entity ? res.entity.entityId : res.entityId;
  res.jsondata = res.metadata;
  res.url = res.dataUrl;
  res.contentType = res.metadata ? res.metadata.contentType : null;
  return res;
}

function mapIngestion(data) {
  var res = camelizeRootKeys(data);

  res.id = res.ingestionId;
  res.name = res.ingestionName;
  res.type = res.ingestionType;

  if (_.get(res, 'configuration.emailAddress')) {
    res.emailAddress = res.configuration.emailAddress;
  }
  res.jsondata = res.metadata;
  return res;
}

const fieldTypeMap = {
  number: 'Number',
  picklist: 'Picklist',
  'multi-picklist': 'MultiPicklist',
  text: 'Text',
  'schema-selection': 'SchemaSelection'
};

const fieldTypeMapIn = {
  Number: 'number',
  Picklist: 'picklist',
  MultiPicklist: 'multi-picklist',
  Text: 'text',
  SchemaSelection: 'schema-selection'
};

function mapEngineFieldType(type, field, engineId) {
  // throw out an error here. this means that someone created values in the
  // database without using the graphql API and used an unknown type.
  // this will break the UI.
  let res = fieldTypeMap[type];
  if (Object.keys(fieldTypeMapIn).includes(type)) {
    res = type;
  }
  if (!res) {
    throw new Error(
      'An engine field with type "' +
        type +
        '" was found in the ' +
        'engine database on engine ' +
        engineId +
        '. It is not a recognized type. The valid field types are ' +
        Object.keys(fieldTypeMapIn) +
        '. ' +
        'This error can indicate ' +
        'corrupted data in the engine database, a client application defect, ' +
        'or a server error. The entire field config was ' +
        JSON.stringify(field)
    );
  }
  return res;
}

function mapEngineField(field, engineId) {
  const result = JSON.parse(JSON.stringify(field));
  // tolerate both old and new db json schemes here.
  // https://steel-ventures.atlassian.net/wiki/spaces/VT/pages/102295928/Default+Values+in+Field#DefaultValuesinField-Currently.3
  result.defaultValue = field.value || result.defaultValue;
  result.type = mapEngineFieldType(field.type, field, engineId);
  // some seem to use info, some description. normalize it here.
  result.info = field.info || field.description;
  return result;
}

/**
 * Maps db-format fields to graphql format.
 */
function mapEngineFields(fields, engineId) {
  if (fields) {
    return fields.map(mapEngineField);
  }
  return [];
}

function mapEngineFieldIn(field) {
  const result = JSON.parse(JSON.stringify(field));
  // if field is type number, then we'll need to parse the string default value.
  if (field.type === 'Number' && field.defaultValue) {
    result.value = Number.parseFloat(field.defaultValue);
  } else {
    result.value = field.defaultValue;
  }
  result.type = fieldTypeMapIn[field.type];
  return result;
}

function mapEngineStandaloneJobTemplateIn(templates) {
  const enumToFieldMap = {
    Reprocess: 'reprocessJobDAG',
    Upload: 'uploadJobDAG'
  };
  return templates
    .map((t) => {
      return _.set({}, enumToFieldMap[t.type], {
        templateLanguage: t.templateLanguage || 'Handlebars',
        template: t.template,
        supportedInputTypes:
          t.supportedInputTypes || t.template.supportedInputTypes || []
      });
    })
    .filter(_.identity);
}

function mapEngineStandaloneJobTemplate(obj, args) {
  function mapTemplateJson(storedTemplate) {
    if (storedTemplate.templateLanguage) {
      return storedTemplate;
    } else {
      return {
        templateLanguage: 'Handlebars',
        template: JSON.stringify(storedTemplate),
        supportedInputTypes: storedTemplate.supportedInputTypes || []
      };
    }
  }

  var objCanonical = camelizeRootKeys(obj);
  const filter = _.get(args, 'type');
  const mapper = {
    singleEngineTdoJobJson: 'Reprocess',
    singleEngineUploadJobJson: 'Upload'
  };
  const res = [];
  for (const key in objCanonical) {
    if (
      Object.prototype.hasOwnProperty.call(objCanonical, key) &&
      Object.prototype.hasOwnProperty.call(mapper, key) &&
      objCanonical[key] &&
      (!filter || filter === mapper[key])
    ) {
      res.push({
        type: mapper[key],
        template: mapTemplateJson(objCanonical[key]),
        supportedInputTypes: objCanonical[key].supportedInputTypes || []
      });
    }
  }
  return res;
}

/**
 * Maps graphql-format field input to native/db JSON.
 */
function mapEngineFieldsIn(fields) {
  if (fields) {
    return fields.map(mapEngineFieldIn);
  }
  return [];
}

function mapSubscription(sub) {
  const res = camelizeRootKeys(sub);
  res.webHookUri = res.webHookUrl;
  delete res.webHookUrl;
  return res;
}

// VTN-22763. some default top-level keys were leaking into the recording_metadata
// table and showing up in details. we should not be adding these as rows in
// the table. so we apply this blacklist before writing or reading
// from recording_metadata.
// not a real fix, but fixing the logic in createTDO and updateTDO that maps
// incoming properties into recording_metadata needs some more involved testing
// to make sure we don't break anything.
const detailKeyBlacklist = [
  'application_id',
  'recording_id',
  'security',
  'created_date_time',
  'modified_date_time',
  'status',
  'start_date_time',
  'stop_date_time',
  'program_id',
  'media_source_id',
  'is_public',
  'source_id',
  'scheduled_job_id'
];
function mapTDODetailKeysFromDb(obj) {
  const res = {};
  Object.keys(obj).forEach((key) => {
    const newKey = key.replace(/-/g, '_');
    if (detailKeyBlacklist.includes(newKey)) return;
    res[newKey] = obj[key];
  });
  return camelizeRootKeys(res);
}

function mapTDODetailKeysToDb(obj) {
  const res = {};
  const temp = decamelizeRootKeys(obj);
  Object.keys(temp).forEach((key) => {
    if (detailKeyBlacklist.includes(key)) return;
    const newKey = key.replace(/_/g, '-');
    res[newKey] = temp[key];
  });
  return res;
}

function mapUserMfaInfo(obj) {
  let res = {};
  const temp = camelizeRootKeys(obj);
  res.phoneNumber = temp.mfaPhoneNumber;
  res.smsVoiceVerifiedDateTime = temp.mfaVerifiedDate;
  res.gaVerifiedDateTime = temp.mfaGaVerifiedDate;
  res.defaultOption = temp.mfaDefaultOption;

  return res;
}

function mapListUserSetting(lstObj) {
  let res = [];
  lstObj.forEach((obj) => {
    res.push(_.omit(obj, 'userId'));
  });
  return res;
}

function mapEngineJWTToken(obj, token) {
  return {
    engineId: _.get(obj, 'engineId'),
    token: token,
    resource: {
      applicationId: _.get(obj, 'applicationId'),
      tdoId: _.get(obj, 'recordingId'),
      jobId: _.get(obj, 'jobId'),
      taskId: _.get(obj, 'taskId'),
      userId: _.get(obj, 'userId')
    }
  };
}

function mapContextMenuExtension(obj) {
  return {
    id: obj.application_context_menu_id,
    applicationId: obj.application_id,
    label: obj.label,
    url: obj.url,
    type: obj.type
  };
}

function mapSavedSearch(row) {
  var res = camelizeRootKeys(row);
  res.organizationId = res.orgId;
  res.ownerId = res.userId;
  res.sharedWithOrganization = res.sharedWithOrg;
  res.createdDateTime = res.createdAt;
  res.modifiedDateTime = res.updatedAt;

  return res;
}

function mapCreateMention(row) {
  var res = camelizeRootKeys(row);
  res.endDateTime = res.mentionEndDate;
  res.watchlistId = res.trackingUnitId;
  res.scheduleId = res.programId;
  res.statusId = res.mentionStatusId;
  res.hitStartDateTime = res.hitStartDate;
  res.hitEndDateTime = res.hitEndDate;
  delete res.hitStartDate;
  delete res.hitEndDate;
  delete res.trackingUnitId;
  delete res.programId;

  return res;
}

function mapFlow(flow) {
  var res = flow;
  res.organizationId = flow.organizationid;
  return res;
}

function mapFlowRevision(rows) {
  var res = [];
  if (!Array.isArray(rows)) {
    return camelizeRootKeys(rows);
  }
  rows.forEach(function (row) {
    res.push(camelizeRootKeys(row));
  });
  return res;
}

const statusMap = {
  'deploy-failed': 'deployFailed'
};

const statusMapToDb = {};

Object.keys(statusMap).forEach((key) => {
  statusMapToDb[statusMap[key]] = key;
});

function mapBuildStatus(status) {
  return _.has(statusMap, status) ? statusMap[status] : status;
}

function mapBuildStatusToDb(status) {
  return _.has(statusMapToDb, status) ? statusMapToDb[status] : status;
}

function mapCreateMentionInBulk(listMentions) {
  var res = [];
  listMentions.forEach(function (mention) {
    res.push(camelizeRootKeys(mention));
  });

  return res;
}

function mapProcessTemplate(data) {
  var res = camelizeRootKeys(data);

  res.id = res.processTemplateId;
  res.name = res.processTemplateName;
  delete res.processTemplateId;
  delete res.processTemplateName;

  return res;
}

function sanitizeField(content) {
  return sanitize(content, {
    allowedTags: [],
    allowedAttributes: {}
  });
}

function mapBundle(data) {
  let res = camelizeRootKeys(data);

  res.id = res.bundleId;
  res.name = res.displayName;
  delete res.bundleId;
  delete res.displayName;

  return res;
}

function mapEngineJwtRights(data, blacklist = []) {
  let res = null;

  if (data && !_.isEmpty(data.roles)) {
    res = {
      roles: _.map(data.roles, (role) => {
        return {
          roleName: role.roleName,
          taskRights: _.uniq(mainUtil.filterRestrictedPermissions(role.taskRights, blacklist)),
          assetRights: _.uniq(mainUtil.filterRestrictedPermissions(role.assetRights, blacklist))
        };
      }),
      version: data.version
    };
  }

  return res;
}

function mapDataSet(data) {
  var res = camelizeRootKeys(data);

  return res;
}

function mapDataSetData(data) {
  var res = camelizeRootKeys(data);
  return res;
}

function mapNotification(row) {
  let result = camelizeRootKeys(row);

  if (!row.id) result.id = row._id;
  if (_.isArray(result.flags))
    result.flags = _.without(result.flags, null, undefined);

  return result;
}

function mapApplicationJWTToken(application, jwtContext, token) {
  return {
    applicationId: application.id,
    organizationId: jwtContext.organizationId,
    token: token
  };
}

function mapV2FolderSdo(row) {
  var res = camelizeRootKeys(row);
  res.contentTemplateId = getContentTemplateIdForV2Folder(
    res.folderId,
    res.sdoId
  );
  res.id = res.contentTemplateId;
  res.schemaId = res.contentTemplateSchemaId;
  return res;
}

function getContentTemplateIdForV2Folder(folderId, sdoId) {
  return folderId + '::' + sdoId;
}

function mapEventSubscription(row) {
  let result = camelizeRootKeys(row);

  result.id = row.event_subscription_id;
  result.createdDateTime = result.createdAtUtc;

  return result;
}

function mapBatch(row) {
  let res = camelizeRootKeys(row);
  return {
    id: res.batchId,
    status: res.status,
    selectionCriteria: res.batchSelector,
    orgId: res.organizationId,
    createdBy: res.createdBy,
    modifiedBy: res.modifiedBy,
    createdDate: res.createdDate,
    modifiedDate: res.modifiedDate,
    isMutable: res.status === 'creating'
  };
}

function mapBatchProcess(row) {
  let res = camelizeRootKeys(row);
  return {
    id: res.batchProcessId,
    batchId: res.batchId,
    status: res.status,
    concurrency: res.concurrency,
    itemsCompleted: res.completedCount,
    itemsFailed: res.failedCount,
    itemsTotal: res.totalCount,
    itemsRunning: res.runningCount,
    itemsPending: res.pendingCount,
    organizationId: res.organizationId,
    details: {
      batchId: res.batchId
    }
  };
}

function mapBatchProcessItem(row) {
  let res = camelizeRootKeys(row);
  return {
    batchProcessId: res.batchProcessId,
    itemId: res.itemId,
    actionId: res.actionId,
    status: res.status
  };
}

function mapBatchItem(row) {
  let res = camelizeRootKeys(row);
  return {
    batchId: res.batchId,
    itemId: res.itemId
  };
}

function mapCountBatchItem(row) {
  let res = camelizeRootKeys(row);
  return {
    total: res.total
  };
}

function mapApplicationViewer(viewerItem) {
  var res = camelizeRootKeys(viewerItem);
  const newResult = {
    id: res.viewerId,
    ownerOrganizationId: res.ownerOrganizationId,
    name: res.name,
    description: res.description,
    icon: res.icon,
    mimeType: res.mimetype,
    viewerType: res.viewerType,
    createdDateTime: res.dateCreated,
    modifiedDateTime: res.dateModified,
    createdBy: res.createdBy,
    modifiedBy: res.modifiedBy,
    isPublic: res.isPublic
  };
  return {
    ...res,
    ...newResult
  };
}

function mapApplicationViewerBuild(viewerBuildItem) {
  var res = camelizeRootKeys(viewerBuildItem);
  const newResult = {
    id: res.viewerBuildId,
    viewerId: res.viewerId,
    sourceUrl: res.sourceUrl.replace(
      '@@EXTERNAL_DNS_ZONE@@',
      mainUtil.getDnsZoneName()
    ),
    accessUrl: res.accessUrl.replace(
      '@@EXTERNAL_DNS_ZONE@@',
      mainUtil.getDnsZoneName()
    ),
    version: res.version,
    status: res.status
  };
  return {
    ...res,
    ...newResult
  };
}

function mapInstanceAuditLogEntry(rows) {
  return _.map(rows, (row) => {
    const res = camelizeRootKeys(row);
    const crud = {
      create: 'create',
      read: 'read',
      update: 'update',
      delete: 'delete'
    };

    // map event names to new names if they have changed
    if (res.eventName && eventNamesChange[res.eventName]) {
      res.eventName = eventNamesChange[res.eventName];
    }

    return {
      id: res.id,
      eventId: res.eventId,
      organizationId: res.organizationId,
      organizationGuid: res.organizationGuid,
      organizationName: res.organizationName,
      userId: res.userId,
      userName: res.userName,
      clientIpAddress: res.requestIP,
      clientUserAgent: res.userAgent,
      description: res.actionDetails,
      createdDateTime: res.timestamp,
      eventType: res.eventType,
      eventName: res.eventName,
      targetType: res.targetType,
      objectId: res.targetId,
      actionResult: res.actionResult,
      actionName: crud[res.actionName] || 'unknown',
      originatorApplication: res.originatorApplication,
      originatorService: res.originatorService,
      impersonatorUserId: res.impersonatorUserId,
      impersonatorUserName: res.impersonatorUserName,
      correlationId: res.correlationId
    };
  });
}

function mapEmailTemplate(emailTemplateItem) {
  const res = camelizeRootKeys(emailTemplateItem);
  return {
    ...res,
    id: res.emailTemplateId,
    organizationGuid: res.organizationGuid,
    code: res.code,
    lang: res.lang,
    default_args: res.defaultArgs,
    default_from_name: res.defaultFromName,
    default_subject: res.defaultSubject,
    createdDateTime: res.createdDate,
    updatedDateTime: res.updatedDate
  };
}

function mapProcessingProject(row) {
  const res = camelizeRootKeys(row);
  return {
    id: res.id || res.processingProjectId,
    applicationId: res.applicationId,
    name: res.name,
    createdAt: res.createdAt != null ? res.createdAt : null,
    updatedAt: res.updatedAt != null ? res.updatedAt : null,
    // Summary fields are included in the query
    _totalIncomplete: res.totalIncomplete || 0,
    _totalFailed: res.totalFailed || 0,
    _totalComplete: res.totalComplete || 0,
    _totalCanceled: res.totalCanceled || 0,
    _total: res.total || 0
  };
}

function mapProcessingDeliverable(row) {
  const res = camelizeRootKeys(row);
  return {
    id: res.id || res.processingDeliverableId,
    projectId: res.processingProjectId || res.projectId || null,
    tdoId: res.recordingId ? String(res.recordingId) : null,
    jobId: res.jobId || null,
    assetType: res.assetType || null,
    engineId: res.engineId || null,
    schemaId: res.schemaId || null,
    engineCategoryId: res.engineCategoryId || null,
    status: res.status || 'incomplete',
    statusMessage: res.statusMessage || null,
    createdAt: res.createdAt != null ? res.createdAt : null,
    updatedAt: res.updatedAt != null ? res.updatedAt : null
  };
}

function mapProcessingProjectSummary(row) {
  const res = camelizeRootKeys(row);
  return {
    total: Number.parseInt(res.total || 0, 10),
    totalIncomplete: Number.parseInt(res.totalIncomplete || 0, 10),
    totalComplete: Number.parseInt(res.totalComplete || 0, 10),
    totalCanceled: Number.parseInt(res.totalCanceled || 0, 10)
  };
}

module.exports = {
  mapApplicationDetails,
  camelizeRootKeys,
  decamelizeRootKeys,
  mapApplication,
  mapPackage,
  mapNestedPackage,
  mapNestedResources,
  mapPackageResources,
  mapApplicationConfig,
  mapAsset,
  mapBlacklist,
  mapBuild,
  mapBuildStatus,
  mapBuildStatusToDb,
  cloneRequestModel,
  mapCloneToDb,
  mapCloneJob,
  mapCollection,
  mapContextMenuExtension,
  mapContextMenuExtensionsIn,
  mapCreateMention,
  mapDeploymentModelIn,
  mapEngine,
  mapEngineCategory,
  mapEngineFieldType,
  mapEngineFields,
  mapEngineFieldsIn,
  mapEngineJWTToken,
  mapEngineCertification,
  mapEngineStandaloneJobTemplate,
  mapEngineStandaloneJobTemplateIn,
  mapEntity,
  mapEntityIdentifier,
  mapEntityIdentifierType,
  mapFolder,
  mapFolderContentTemplate,
  mapFolderV2,
  mapRootFolderV2,
  mapGroup,
  mapIngestion,
  mapJob,
  mapLibrary,
  mapLibraryCollaborator,
  mapLibraryEngineModel,
  mapLibraryType,
  mapListUserSetting,
  mapLoginConfiguration,
  mapMentionSearchResults,
  mapNewAsset,
  mapOrganization,
  mapPermission,
  mapRecording,
  mapRecordingMetadata,
  mapRole,
  mapSavedSearch,
  mapSubscription,
  mapTDODetailKeysFromDb,
  mapTDODetailKeysToDb,
  mapTask,
  mapToken,
  mapTokens,
  mapUser,
  mapUserMfaInfo,
  mapWatchlist,
  mapWidgetObject,
  mapCreateMentionInBulk,
  mapProcessTemplate,
  mapBundle,
  mapEngineJwtRights,
  mapDataSet,
  mapDataSetData,
  mapFlow,
  mapFlowRevision,
  mapNotification,
  mapApplicationJWTToken,
  mapEngineSchemas,
  mapEntityTags,
  mapPackageGrant,
  mapApplicationHeaderbar,
  mapV2FolderSdo,
  getContentTemplateIdForV2Folder,
  mapPlatformProperties,
  mapPlatformVersionHistory,
  mapApplicationConfigFromId,
  mapEventSubscription,
  mapBatch,
  mapBatchProcess,
  mapBatchProcessItem,
  mapBatchItem,
  mapCountBatchItem,
  mapApplicationViewer,
  mapApplicationViewerBuild,
  mapInstanceAuditLogEntry,
  mapEmailTemplate,
  mapProcessingProject,
  mapProcessingDeliverable,
  mapProcessingProjectSummary
};
