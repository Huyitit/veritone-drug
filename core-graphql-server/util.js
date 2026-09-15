/*eslint no-undef: "error"*/
/*eslint no-const-assign: "error"*/
const fpl = require('@veritone/functional-permissions-lib');
const _ = require('lodash');
const errors = require('./error')({});
const validator = require('validator');
const humps = require('humps');
const moment = require('moment');
const { v3: uuidv3 } = require('uuid');
const base64 = require('base-64');
const urlParse = require('url-parse');
const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
const LocalTime = require('js-joda').LocalTime;
const tz = require('moment-timezone');
const uuidHash = require('uuid-by-string');

module.exports = function createModule(_serviceContext) {
  const serviceContext = _serviceContext || {};
  const config = serviceContext.config || {};
  const zoneData = getUnpackedTimezoneData();
  const redisCache = serviceContext.redisCache;
  const {
    encryptObject,
    decryptObject
  } = require('@veritone/core-server-base/util.js')();

  const decryptKeyDefault =
    'MIIEpAIBAAKCAQEAqCrrzfGp1gwgFk4raJeTaOt8SIkYuaEYctBpmldlgonbGySf/5QA5v1Vajnt9D+8+TBK3lz6hBC49LiBa+q9fJsWP9pkPEk6irT8T6UXZZk6bJacI';
  const decryptKeyConfig = 'config.s3.fileId';

  const zoneAbbrevToNameMap = {};
  const zoneNameList = zoneData.zones.map((obj) => obj.name);

  zoneData.zones.forEach((zone) => {
    zone.abbrs.forEach((abbr) => (zoneAbbrevToNameMap[abbr] = zone.name));
  });

  const permissionIdToKeyMap = {};
  const permissionEnumMap = {};
  const permissionIdToKeyAliasMap = {};

  const forbiddenContentRules = getForbiddenContentRules(
    _.get(config, 'security.dataContentRules', [])
  );

  function getUnpackedTimezoneData() {
    // we used to be able to just do a
    //   require('moment-timezone/data/unpacked/latest.json');
    // this broke at some point and I haven't been able to trace
    // it to a specific moment-timezone version.
    // trying this code, which may be more robust.
    const data = require('moment-timezone/data/packed/latest.json');
    const unpackedZones = data.zones.map((zone) => {
      return _.isObject(zone) ? zone : moment.tz.unpack(zone);
    });

    return Object.assign(data, { zones: unpackedZones });
  }

  function getAllTimeZones() {
    return zoneData.zones.map((zone) => {
      const processed = [];
      const abbrs = [];
      for (let i = 0; i < zone.abbrs.length; i++) {
        const abbr = zone.abbrs[i];
        if (!processed.includes(abbr)) {
          if (!_.isInteger(zone.offsets[i])) {
            continue;
          }
          processed.push(abbr);
          // why:  https://momentjs.com/timezone/docs/#/zone-object/offset/
          const offset = 0 - zone.offsets[i];
          abbrs.push({
            name: abbr,
            offsetMinutes: offset,
            offset: offsetToString(offset)
          });
        }
      }
      return {
        name: zone.name,
        abbreviations: abbrs
      };
    });
  }

  function setPermissionIdToKeyMap(root = fpl.permissions, keyRoot = '') {
    Object.keys(root).forEach((key) => {
      const newKey = join(keyRoot, key);
      if (_.isObject(root[key])) {
        setPermissionIdToKeyMap(root[key], newKey);
      } else {
        const bitId = root[key];
        const existingKey = permissionIdToKeyMap[bitId];
        if (!existingKey) {
          permissionIdToKeyMap[bitId] = newKey;
        } else {
          const aliasedArr = permissionIdToKeyAliasMap[bitId] || [];
          if (_.startsWith(newKey, 'aiware.')) {
            aliasedArr.push(newKey);
          } else {
            permissionIdToKeyMap[bitId] = newKey;
            aliasedArr.push(existingKey);
          }
          permissionIdToKeyAliasMap[bitId] = aliasedArr;
        }
        permissionEnumMap[newKey] = _.replace(newKey, /\./g, '_').toUpperCase();
      }
    });
  }
  function join(str1, str2) {
    return (str1 ? str1 + '.' : '') + str2;
  }

  function hasPerm(perm, authInfo) {
    // extract the fpl constant for the required permission
    const fplPerm = parseInt(_.get(fpl.permissions, perm));
    // user tokens have a permission mask. use this preferably.
    const hasMaskPerm =
      authInfo && fpl.util.hasAccessTo(fplPerm, authInfo.permissionMasks);
    const rights = getTokenRights(authInfo);
    if (!rights) return hasMaskPerm || false;

    let hasRightsPerm;
    if (!_.isNaN(fplPerm)) {
      // bit-based: handles all alias forms (job.create, aiware.job.create, cms.job.create)
      const tokenBitIds = new Set(
        rights
        .map(r => parseInt(_.get(fpl.permissions, r.replace(/:/g, '.'))))
        .filter(id => !_.isNaN(id))
      );
      hasRightsPerm = tokenBitIds.has(fplPerm);
    } else {
      // fallback: direct string match with normalized separators
      const permNormalized = perm.replace(/:/g, '.');
      const tokenRightsNormalized = new Set(rights.map(r => r.replace(/:/g, '.')));
      hasRightsPerm = tokenRightsNormalized.has(permNormalized);
    }

    return hasMaskPerm || hasRightsPerm;
  }

  function getTokenRights(authInfo) {
    if (_.isEmpty(authInfo)) {
      return false;
    }

    const json = authInfo.tokenInfo
      ? authInfo.tokenInfo.json
      : authInfo.json || authInfo;
    // note that some token JSON does not have rights attached, only accessMask
    // tokens that were manually configured in the db do not always have
    // consistent format so we'll normalize to : here to match the logic in
    // hasPerm above.
    return (json ? json.rights || [] : []).map((perm) =>
      perm.replace(/\./g, ':')
    );
  }

  function isSystemOrgAPIKey(authInfo) {
    const json = authInfo.tokenInfo
      ? authInfo.tokenInfo.json
      : authInfo.json || authInfo;
    const rights = getTokenRights(authInfo);
    const hasRight = rights.includes('task_type:org_system');

    return hasRight === true;
  }

  function isInternalAPIKey(authInfo) {
    if (_.isEmpty(authInfo)) {
      return false;
    }

    const json = authInfo.tokenInfo
      ? authInfo.tokenInfo.json
      : authInfo.json || authInfo;
    const isInternalKey = json ? json.internal === true : false;
    // VTN-6903 TODO authTokenType is not always set? so must exclude it.
    // || authInfo.authTokenType === 'apikey';
    const rights = getTokenRights(authInfo);
    const hasRight = rights.includes('task_type:internal');

    return isInternalKey === true || hasRight === true;
  }

  function requirePerm(perm, context, fieldName, typeName, doThrow = true) {
    const _hasPerm = hasPerm(perm, context._authInfo);

    if (!_hasPerm && doThrow) {
      const rights = listRights(context._authInfo);
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token is not authorized to perform the requested action. ' +
          'Most queries and mutations and some fields require that the client have ' +
          'specific functional permissions. For example, to invoke "createJob" ' +
          'the client must have the "create job" functional permission.' +
          'For user accounts, these permissions are ' +
          'derived from roles ' +
          'such as "Developer Editor". For API tokens, they are provisioned directly ' +
          'on the token information. For engine tokens, they are set by the ' +
          "platform orchestration components based on the engine's configuration. " +
          'Details on the operation that triggered this error are provided in ' +
          'the data section below. See https://docs.veritone.com/#/apis/tutorials/tokens ' +
          'for troubleshooting information and resolution steps.',
        data: {
          rightsGranted: rights,
          field: fieldName,
          type: typeName,
          rightsRequired: [perm]
        }
      });
    }
    return _hasPerm;
  }

  function requirePerms(
    perms = [],
    context,
    isRequireAll = true,
    doThrow = true
  ) {
    let hasOne = false;
    perms.forEach((perm) => {
      if (requirePerm(perm, context, undefined, undefined, isRequireAll)) {
        hasOne = true;
      }
    });

    if (!hasOne && doThrow) {
      const rights = listRights(context._authInfo);
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token is not authorized to perform the requested action. ' +
          'Most queries and mutations and some fields require that the client have ' +
          'specific functional permissions. For example, to invoke "createJob" ' +
          'the client must have the "create job" functional permission.' +
          'For user accounts, these permissions are ' +
          'derived from roles ' +
          'such as "Developer Editor". For API tokens, they are provisioned directly ' +
          'on the token information. For engine tokens, they are set by the ' +
          "platform orchestration components based on the engine's configuration. " +
          'Details on the operation that triggered this error are provided in ' +
          'the data section below. See https://docs.veritone.com/#/apis/tutorials/tokens ' +
          'for troubleshooting information and resolution steps.',
        data: {
          rightsGranted: rights,
          rightsRequired: perms
        }
      });
    }
    return hasOne;
  }

  const permissionAliasMap = fpl.rbacUtil.getPermissionIdToKeyAliasMap();

  function listRights(authInfo) {
    const masks = (authInfo || {}).permissionMasks || [];
    // string rights ['job.create']
    const rights = getTokenRights(authInfo);
    const rightsFromMask = fpl.util
      .getPermissionIdsFromMask(masks) // array of permission ids [1, 2, 3]
      .map((id) => permissionIdToKeyMap[id]); // array of permission keys ['job.create', 'job.update', 'job.delete']
    // remove duplicates and compact
    const combinedRights = _.compact(_.uniq(rights.concat(rightsFromMask)));

    let allRights = [];
    for (const right of combinedRights) {
      const mappedBit = _.get(fpl.permissions, right.replace(/:/g, '.'));
      if (mappedBit) {
        allRights = allRights.concat(
          // retrieves alias permissions for the bit like `6: ['aiware.user.create', 'admin.user.create']`
          permissionAliasMap[mappedBit] || []
        );
      }
      // preserve the original permission key
      allRights.push(right);
    }
    return allRights;
  }

  function getPermissionIdToKeyMap() {
    return permissionIdToKeyMap;
  }

  function getPermissionEnumMap() {
    return permissionEnumMap;
  }

  function getPermissionIdToKeyAliasMap() {
    return permissionIdToKeyAliasMap;
  }

  const keyMap = {
    recordingIds: 'TemporalDataObject',
    taskIds: 'Task',
    jobIds: 'Job',
    sourceIds: 'Source'
  };

  function listResources(authInfo) {
    const scopes = _.get(authInfo, 'jwtToken.scope');
    const resources = {};
    if (scopes) {
      scopes.forEach((scope) => {
        if (scope.resources) {
          Object.keys(scope.resources).forEach((key) => {
            const name = keyMap[key];
            const values = scope.resources[key];
            if (!resources[name]) resources[name] = [];
            resources[name] = resources[name].concat(values);
          });
        }
      });
    }

    return resources;
  }

  function getResourceIdsForType(type, authInfo) {
    const scopes = _.get(authInfo, 'jwtToken.scope');
    const keyMap = {
      TemporalDataObject: 'recordingIds',
      Task: 'taskIds',
      Job: 'jobIds',
      Source: 'sourceIds'
    };
    const idKey = keyMap[type];
    // this error should never happen due to validation of @auth directive
    if (!idKey) {
      _serviceContext.logger.warn('unknown resource type ' + type);
      return [];
    }
    let ids = [];
    if (scopes) {
      scopes.forEach((scope) => {
        if (scope.resources) {
          if (scope.resources[idKey]) {
            ids = ids.concat(scope.resources[idKey]);
          }
        }
      });
    }

    return ids;
  }

  setPermissionIdToKeyMap();

  function getGraphQLFieldParamValue(args, paramName) {
    const paramNameParts = paramName.split('.');

    let val = args;
    paramNameParts.forEach((paramLevel) => {
      val = val[paramLevel];
    });

    return val;
  }

  function graphQLTypeHasField(schema, typeName, fieldName) {
    let res = false;
    const typeMap = schema.getTypeMap();
    const type = typeMap[typeName];
    if (type && type.getFields) {
      const fields = type.getFields();
      Object.keys(fields).forEach((fn) => {
        if (fieldName === fn) {
          res = true;
        }
      });
    }
    return res;
  }

  // TODO this function does not work yet with nested fields, where
  // an input type contains another input type, like
  // input.targetTask.id. We do not have any such parameters in the
  // current schema so it's ok.
  function graphQLFieldHasParam(schema, field, paramName) {
    const paramNameParts = paramName.split('.');
    const typeMap = schema.getTypeMap();
    let curField = field;
    let curParam = paramNameParts[0];
    const arg = getArg(curField, curParam);
    if (!arg) {
      return false;
    }
    // now we know we have the parameter on this field.

    // if necessary we'll unpack the type to see if
    // a nested parameter field, such as task.id, is present.
    for (let i = 1; i < paramNameParts.length; i++) {
      const curParam = paramNameParts[i]; // say, input

      // if it's a match, we need to drill into the field.
      // get its type.
      let argTypeName = arg.type.toString(); // will be UpdateTaskInput
      // account for ! modifier and adjust type key accordingly
      if (argTypeName && argTypeName.endsWith('!')) {
        argTypeName = argTypeName.substring(0, argTypeName.length - 1);
      }
      if (!graphQLTypeHasField(schema, argTypeName, curParam)) {
        return false;
      }
    }
    return true;
  }

  function getArg(field, argName) {
    let res;
    const args = field.args || [];
    args.forEach((arg) => {
      if (arg.name === argName) {
        res = arg;
      }
    });
    return res;
  }

  function getTimeZoneName(zone) {
    if (!zone) return null;
    if (zoneNameList.includes(zone)) return zone;
    const res = zoneAbbrevToNameMap[zone];
    return res || null;
  }

  function makeSelectClause(selectData, aliasTable) {
    const selectValues = [];
    Object.keys(selectData).forEach((columnName) => {
      const alias = selectData[columnName];
      const newColumnName = aliasTable
        ? `${aliasTable}.${columnName}`
        : columnName;
      selectValues.push(
        alias ? `${newColumnName} AS ${alias}` : `${newColumnName}`
      );
    });
    return selectValues.join(',\n  ');
  }

  function _makeInsertSqlOneRow(
    tableName,
    columnData,
    selectData,
    valIndex = 0
  ) {
    const columnNames = [];
    const columnValues = [];
    const columnIndices = [];

    Object.keys(columnData).forEach((columnName) => {
      if (!_.isNil(columnData[columnName])) {
        columnNames.push(columnName);
        columnIndices.push(`\$${columnNames.length + valIndex}`);
        columnValues.push(columnData[columnName]);
      }
    });
    const columnNameClause = columnNames.join(',\n  ');
    const columnIndexClause = columnIndices.join(',\n  ');
    const selectClause = makeSelectClause(selectData);
    const sql = `
      INSERT INTO ${tableName}
      (
        ${columnNameClause}
      )
      VALUES (
        ${columnIndexClause}
      )
      RETURNING
        ${selectClause}
      ;
    `;
    return {
      sql: sql,
      values: columnValues
    };
  }

  function _getAllColumnsForInsertSql(columnData) {
    const _columnNames = [];
    const allData = _.isArray(columnData) ? columnData : [columnData];
    for (let i = 0; i < allData.length; i++) {
      const cd = allData[i];

      Object.keys(cd).forEach((columnName) => {
        if (!_.isNil(cd[columnName])) {
          _columnNames.push(columnName);
        }
      });
    }

    const columnNames = new Set(_columnNames);
    return Array.from(columnNames);
  }

  function makeInsertSql(tableName, columnData, selectData, valIndex = 0) {
    const rowValues = [];
    const columnValues = [];

    if (!_.isArray(columnData)) {
      return _makeInsertSqlOneRow(tableName, columnData, selectData, valIndex);
    }

    // Get all available columns
    const columnNames = _getAllColumnsForInsertSql(columnData);

    for (let i = 0; i < columnData.length; i++) {
      const cd = columnData[i];
      const _columnIndices = [];

      columnNames.forEach((columnName) => {
        columnValues.push(cd[columnName]);
        _columnIndices.push(`\$${columnValues.length + valIndex}`);
      });

      // Build sql clause for each row
      rowValues.push(`(${_columnIndices.join(', ')})`);
    }

    const selectClause = makeSelectClause(selectData);
    const columnNameClause = columnNames.join(', ');
    const rowValuesClause = rowValues.join(',\n');
    const sql = `
      INSERT INTO ${tableName}
      (
        ${columnNameClause}
      )
      VALUES
        ${rowValuesClause}

      RETURNING
        ${selectClause}
      ;
    `;
    return {
      sql: sql,
      values: columnValues
    };
  }

  function makeUpdateSql(
    tableName,
    columnData,
    selectData,
    whereClause,
    valIndex = 0,
    includeNulls = false,
    includeNullsMap = {},
    casts = {},
    conditionals = {}
  ) {
    const columnValueSet = [];
    const selectValues = [];
    const columnValues = [];

    Object.keys(columnData).forEach((columnName) => {
      const data = columnData[columnName];
      const cast = casts[columnName] || '';
      let condition = conditionals[columnName];
      if (
        condition &&
        !condition.greatest &&
        !condition.least &&
        !_.isFunction(condition.transform)
      ) {
        condition = null;
      }
      if (
        !_.isNil(data) ||
        (includeNulls && !_.isUndefined(data)) ||
        (includeNullsMap[columnName] && !_.isUndefined(data))
      ) {
        columnValues.push(data);
        const columnValue = `\$${columnValues.length + valIndex}${cast}`;
        if (condition) {
          if (condition.greatest) {
            columnValueSet.push(
              `${columnName} = GREATEST("${columnName}", ${columnValue})`
            );
          } else if (condition.least) {
            columnValueSet.push(
              `${columnName} = LEAST("${columnName}", ${columnValue})`
            );
          } else if (_.isFunction(condition.transform)) {
            columnValueSet.push(condition.transform(columnName, columnValue));
          }
        } else {
          columnValueSet.push(`${columnName} = ${columnValue}`);
        }
      }
    });
    Object.keys(selectData).forEach((columnName) => {
      const alias = selectData[columnName];
      selectValues.push(alias ? `${columnName} AS ${alias}` : `${columnName}`);
    });
    const columnSetClause = columnValueSet.join(`,\n  `);
    const selectClause = selectValues.join(',\n  ');
    const sql = `
UPDATE ${tableName}
SET
  ${columnSetClause}
WHERE
  ${whereClause}
RETURNING
  ${selectClause}
;
    `;
    return {
      sql: sql,
      values: columnValues
    };
  }

  function addSqlWhere(
    column,
    value,
    whereConditions,
    values,
    operator = null
  ) {
    if (!_.isNil(value)) {
      if (_.isArray(value)) {
        const op = operator || 'IN';
        const items = [];
        value.forEach((v) => {
          values.push(v);
          items.push(`\$${values.length}`);
        });
        const res = `${column} ${op} (${items.join(', ')})`;
        whereConditions.push(res);
      } else {
        const op = operator || '=';
        values.push(value);
        whereConditions.push(`${column} ${op} \$${values.length}`);
      }
    }
  }

  function toPage(args, rows) {
    if (!args || !rows) {
      throw new Error('args and result rows are required on toPage');
    }
    if (!_.isArray(rows)) {
      throw new Error(
        'rows on toPage should be an array of database result rows'
      );
    }
    return {
      offset: args.offset,
      limit: args.limit,
      records: rows,
      count: rows.length
    };
  }

  function expandJsonVariables(template, values) {
    const copy = JSON.parse(JSON.stringify(template));
    Object.keys(copy).forEach((key) => {
      const val = copy[key];
      if (_.isObject(val)) {
        // it's an object. we need to recurse down into it.
        const formatted = expandJsonVariables(val, values);
        copy[key] = formatted;
      } else if (_.isString(val)) {
        // it's a string that might have placeholders. format it.
        const formatted = format(val, values);
        copy[key] = formatted;
      } // else (number, boolean, etc.) do nothing
    });
    return copy;
  }

  // this function adapted from https://github.com/Matt-Esch/string-template
  function format(string, args) {
    const nargs = /\##([0-9a-zA-Z_]+)\##/g;
    return string.replace(nargs, function replaceArg(match, i, index) {
      var result;
      if (
        string[index - 1] === '#' &&
        string[index - 2] === '#' &&
        string[index + match.length] === '#' &&
        string[index + match.length + 1] === '#'
      ) {
        return i;
      } else {
        result = _.has(args, i) ? args[i] : null;
        if (result === null || result === undefined) {
          return '';
        }

        return result;
      }
    });
  }

  function checkId(
    id,
    optional,
    allowInt = false,
    allowUuid = true,
    maxValue,
    minValue
  ) {
    if (!(optional || id)) {
      throw new errors.InvalidInput({
        message: 'Missing or empty id field. A non-empty value is required.',
        data: { objectId: id }
      });
    }
    const isUuid = id && _.isString(id) ? validator.isUUID(id) : false;
    const isNumString = id && _.isString(id) ? validator.isInt(id) : false;
    const isNum = id ? _.isNumber(id) || isNumString : false;
    let formatOk = (isUuid && allowUuid) || (allowInt && isNum);
    if (isNum && maxValue && id > maxValue) formatOk = false;
    if (isNum && minValue && id < minValue) formatOk = false;
    if (id && !formatOk) {
      const fstring = allowInt ? 'or numerical value ' : '';
      throw new errors.NotFound({
        message: 'Invalid ID format. A UUID ' + fstring + 'is required.',
        data: { objectId: id }
      });
    }
  }

  function checkDateId(id, optional, allowUuid = false) {
    if (!(optional || id)) {
      throw new errors.InvalidInput({
        message: 'Missing or empty id field. A non-empty value is required.',
        data: { objectId: id }
      });
    }
    const ok = dateIdUtil.isValidDateId(id);
    if (id && !ok) {
      if (allowUuid) {
        checkId(id, optional, false, true);
      } else {
        throw new errors.NotFound({
          message: 'Invalid Date ID format.',
          data: { objectId: id }
        });
      }
    }
  }

  function sqlEscapeForLIKE(sql) {
    return sql.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/'/g, "\\'");
  }

  function addDateTimeFilters(
    tableName,
    options,
    sqlWhere,
    dateFormatter,
    divisor = 1,
    columnMap = {}
  ) {
    if (options.dateTimeFilter) {
      const filters = _.isArray(options.dateTimeFilter)
        ? options.dateTimeFilter
        : [options.dateTimeFilter];
      filters.forEach((filter) => {
        if (!(filter.toDateTime || filter.fromDateTime)) {
          throw new errors.InvalidInput({
            message:
              'At least one of toDateTime or fromDateTime must ' +
              'be specified on a job date-time filter.',
            data: {
              filter: filter
            }
          });
        }

        const column =
          columnMap[filter.field] || humps.decamelize(filter.field);
        const fallbackColumn =
          columnMap[filter.fallbackField] ||
          humps.decamelize(filter.fallbackField || '');
        const innerWhere = [];
        // note that we might receive a string in RTC format or an
        // integer in ms. in either case we need to convert
        let inequality = null;
        let formatedDate = null;
        if (filter.toDateTime) {
          inequality = filter.toDateTimeExclusive ? '<' : '<=';
          formatedDate = formatDate(filter.toDateTime);
        }
        if (inequality && formatDate) {
          let sql = `${tableName}.${column} ${inequality} ${formatedDate}`;
          if (fallbackColumn) {
            sql += ` OR (${tableName}.${column} IS null AND ${tableName}.${fallbackColumn} ${inequality} ${formatedDate})`;
          }
          innerWhere.push(sql);
        }
        inequality = formatedDate = null;
        if (filter.fromDateTime) {
          inequality = filter.fromDateTimeExclusive ? '>' : '>=';
          formatedDate = formatDate(filter.fromDateTime);
        }
        if (inequality && formatDate) {
          let sql = `${tableName}.${column} ${inequality} ${formatedDate}`;
          if (fallbackColumn) {
            sql += ` OR (${tableName}.${column} IS null AND ${tableName}.${fallbackColumn} ${inequality} ${formatedDate})`;
          }
          innerWhere.push(sql);
        }

        if (innerWhere.length > 0) {
          if (filter.includeEmpty && !fallbackColumn) {
            sqlWhere.push(
              `(${innerWhere.join(' AND ')} OR ${tableName}.${column} IS null)`
            );
          } else {
            sqlWhere.push(`(${innerWhere.join(' AND ')})`);
          }
        }
      });
    }

    function formatDate(date) {
      if (_.isFunction(dateFormatter)) {
        return dateFormatter(date);
      } else if (_.isString(dateFormatter) && dateFormatter === 'pg_ts') {
        return `'${moment(date).toISOString()}'`;
      } else if (_.isString(date)) {
        return Math.floor(Date.parse(date) / divisor);
      } else if (_.isNumber(date)) {
        return Math.floor(date / divisor);
      } else return date;
    }
  }

  function addTextMatchFilters(
    column,
    names,
    matchOperator,
    sqlWhere,
    sqlArguments
  ) {
    if (!Array.isArray(names) || !column) {
      return;
    }

    const textMatchConditions = [];
    const matchType = matchOperator || 'exact';
    const pre = matchType === 'endsWith' || matchType === 'contains' ? '%' : '';
    const post =
      matchType === 'startsWith' || matchType === 'contains' ? '%' : '';

    for (const name of names) {
      sqlArguments.push(`${pre}${sqlEscapeForLIKE(name)}${post}`);
      textMatchConditions.push(`${column} ILIKE $${sqlArguments.length}`);
    }
    if (textMatchConditions.length) {
      sqlWhere.push(`(${textMatchConditions.join(' OR ')})`);
    }
  }

  function addPartTimeFilters(tableName, options, sqlWhere, columnMap = {}) {
    if (options.partTimeFilter) {
      let whereFilter = false;
      const filters = _.isArray(options.partTimeFilter)
        ? options.partTimeFilter
        : [options.partTimeFilter];

      filters.forEach((filter) => {
        if (!(filter.toTime || filter.fromTime)) {
          throw new errors.InvalidInput({
            message:
              'At least one of toTime or fromTime must ' +
              'be specified on a job part time filter.',
            data: {
              filter: filter
            }
          });
        }

        const column =
          columnMap[filter.field] || humps.decamelize(filter.field);
        const innerWhere = [];
        if (filter.toTime) {
          innerWhere.push(
            `${tableName}.${column} <=
            '${timeOnlyToString(filter.toTime)}'`
          );
        }
        if (filter.fromTime) {
          innerWhere.push(
            `${tableName}.${column} >=
            '${timeOnlyToString(filter.fromTime)}'`
          );
        }
        if (innerWhere.length > 0) {
          whereFilter = true;
          sqlWhere.push(`(${innerWhere.join(' AND ')})`);
        }
      });
      if (whereFilter) {
        return true;
      }
    }
    return false;
  }

  async function isOrgSettingEnabled(context, settingKey, specificOrgId = null) {
    let setting;
    const organizationId = specificOrgId || _.get(
      context,
      '_authInfo.organization.organizationId',
      null
    );

    if (organizationId && (!_.isEmpty(specificOrgId) || !_.get(context, '_authInfo.organization.kvp', null))) {
      // if we have a specific org id, or if the context does not already have kvp, fetch from db
      const organization = await serviceContext.dal.organization.getOrganization(
        {},
        { id: organizationId }
      );
      setting = _.get(organization, `kvp.features.${settingKey}`, false);
    } else {
      setting = _.get(
        context,
        `_authInfo.organization.kvp.features.${settingKey}`,
        false
      );
    }

    return setting === true || setting === 'enabled';
  }

  function getFakeMediaAssetId(tdo, assetType = 'media') {
    return base64.encode('VTA:' + assetType + ':' + _.toString(tdo.id));
  }

  function isFakeMediaAssetId(assetId) {
    let decoded;
    try {
      decoded = base64.decode(assetId);
    } catch (err) {
      return false;
    }

    return decoded.startsWith('VTA:');
  }

  function parseFakeAssetId(assetId) {
    if (!isFakeMediaAssetId(assetId)) throw new Error('not a virtual asset id');
    const idStr = base64.decode(assetId);
    const parts = idStr.split(':');
    if (parts.length < 3) throw new Error('invalid virtual asset id ' + idStr);
    return {
      assetType: parts[1],
      tdoId: parts[2]
    };
  }

  function stripSectionFromString(startToken, endToken, text) {
    let res = text;
    const start = text.indexOf(startToken);
    if (start >= 0) {
      const end = text.indexOf(endToken, start);
      if (end >= 0) {
        res = text.substring(0, start) + text.substring(end + 1);
      }
    }
    return res;
  }

  function hasEngineJwt(context) {
    return _.get(context, 'requestContext.jwtToken.sub') === 'engine-run';
  }

  const ENGINE_JWT_ID_NS = 'f9a6f3bd-c25b-4908-9195-77c7286215ce';

  function getEngineJwtId(token) {
    return 'ejt:' + uuidv3(token, ENGINE_JWT_ID_NS);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function promiseTimeout(promise, ms) {
    let timeout = new Promise((resolve, reject) => {
      let id = setTimeout(() => {
        clearTimeout(id);
        reject('Timed out in ' + ms + 'ms.');
      }, ms);
    });

    return Promise.race([promise, timeout]);
  }

  /**
   * @param column the SQL column, including table alias if needed
   * @param value the value to search on. can be null/undefined (no where
   *   clause generated in this case)
   * @param where List of where clauses to add this one to. Optional; the
   *   clause will be returned.
   * @param values List of values. required for proper SQL parameterization.
   * @param matchType endsWith, startsWith, contains, exact. Optional;
   *    default is exact.
   * @param caseSensitive true or false. default false.
   */
  function makeLikeClause(
    column,
    value,
    where,
    values,
    matchType,
    caseSensitive
  ) {
    let res = '';
    if (value) {
      const mt = matchType || 'exact';
      const operator = caseSensitive === true ? 'LIKE' : 'ILIKE';
      const pre = mt === 'endsWith' || mt === 'contains' ? `'%'||` : '';
      const post = mt === 'startsWith' || mt === 'contains' ? `||'%'` : '';
      res = `${column} ${operator} ${pre}\$${values.push(value)}${post}`;
      if (where) where.push(res);
    }
    return res;
  }

  function isTimeInSeconds(val) {
    // if the value is a number below a certain threshold
    // (1970-04-26T17:46:40.000Z in ms) we assume that it actually
    // represents seconds, not ms.
    // since realistically we will not have any dates in our system
    // before that value.
    return _.isNumber(val) ? val < 10000000000 : false;
  }

  // used to adjust a numerical time in seconds to milliseconds so that
  // it can be correctly formatted as an ISO date string.
  // needed for some types where the database stores time in seconds
  // (TDO/recording, engine, etc.)
  function fixDateTime(dateTime) {
    if (!dateTime) return dateTime;

    // raw number - convert
    if (_.isString(dateTime) && validator.isNumeric(dateTime)) {
      dateTime = parseInt(dateTime);
    }

    if (_.isNumber(dateTime)) {
      return isTimeInSeconds(dateTime) ? dateTime * 1000 : dateTime;
    }
    return dateTime;
  }

  function stripUrlQuery(url) {
    const parsed = urlParse(url);
    parsed.set('query', null);
    return parsed.href;
  }

  function parseBuild(build) {
    // sample:  https://jenkins.aws-prod.veritone.com/job/Veritone/job/core-graphql-server/job/hotfix%252FVTN-8242-2/14/display/redirect
    const parsed = urlParse(build);
    const parts = parsed.pathname.split('/');
    const res = {
      env: parsed.hostname.replace('jenkins.', ''),
      number: parts.length >= 8 ? parts[7] : 'unknown'
    };

    return res;
  }

  function emptyPage(args) {
    return {
      records: [],
      count: 0,
      offset: args.offset || 0,
      limit: args.limit || 30
    };
  }

  // time LocalTime
  //
  function timeOnlyToString(timeOnly, noOffset = false) {
    if (_.isNil(timeOnly)) return timeOnly;
    return (
      timeOnly.time +
      (timeOnly.noOffsetPresent === true || noOffset === true
        ? ''
        : offsetToString(timeOnly.offsetMinutes || 0))
    );
  }

  function timeOnlyToUTCString(timeOnly) {
    if (_.isNil(timeOnly)) return timeOnly;
    if (_.isString(timeOnly)) timeOnly = parseTimeOnly(timeOnly);
    return timeOnly.timeUTC + '+0:00';
  }

  function adjustTimeToZone(timeOnly, zone) {
    if (_.isNil(timeOnly)) return timeOnly;
    if (_.isString(timeOnly)) timeOnly = parseTimeOnly(timeOnly);
    if (timeOnly.noOffsetPresent || _.isNil(zone)) return timeOnly;
    const offset = tz.tz.zone(zone).utcOffset(moment.utc());
    timeOnly.offsetMinutes = offset;
    timeOnly.time = timeOnly.timeUTC.minusMinutes(offset);
    return timeOnly;
  }

  function offsetToString(offset) {
    const symbol = offset >= 0 ? '+' : '-';
    if (offset < 0) offset = 0 - offset;
    const hourOffset = _.toString(Math.floor(offset / 60)).padStart(2, '0');
    const minOffset = _.toString(offset % 60).padStart(2, '0');
    return symbol + hourOffset + ':' + minOffset;
  }

  /**
   * parses the given time-only, which can be in any of the following forms:
   * 13:00 (1 PM, no time zone specified)
   * 13:00:30 (with seconds)
   * 13:00-08:00 (with time zone offset)
   * 13:00:00-08:00 (with seconds and time zone offset)
   *
   * If time zone is not provided on the string, a default may be applied
   * depending on the featureFlag.defaultTimezoneOffset and
   * defaultTimezoneOffsetMinutes settings.
   *
   * Returns an object of form
   *     time:  string
   *     timeUTC:  string
   *     offsetMinutes:  number (time zone offset in minutes)
   */
  function parseTimeOnly(timeStr) {
    let time = timeStr;
    let offset;
    let negOffset = false;
    if (timeStr.includes('-')) {
      const parts = timeStr.split('-');
      time = parts[0];
      offset = parts[1];
      negOffset = true;
    } else if (timeStr.includes('+')) {
      const parts = timeStr.split('+');
      time = parts[0];
      offset = parts[1];
      negOffset = false;
    }

    let localTime;
    try {
      localTime = LocalTime.parse(time);
    } catch (err) {
      throw new errors.InvalidInput({
        message:
          'Invalid format for Time field. Time must be in the ' +
          'format HH:MM:SS or HH:MM, using military time and leading zeros.',
        data: {
          value: timeStr
        }
      });
    }

    let offsetTotalMin = 0;
    let noTz = _.isNil(offset);
    const applyDefaultTZ = _.get(
      config,
      'featureFlags.defaultTimezoneOffset',
      false
    );

    if (!_.isNil(offset)) {
      let offsetTime;
      try {
        offsetTime = LocalTime.parse(offset);
      } catch (err) {
        throw new errors.InvalidInput({
          message:
            'Invalid format for Time field. Time must be in the ' +
            'format HH:MM:SS or HH:MM, using military time and leading zeros. ' +
            'Provided value was ' +
            offset,
          data: {
            value: offset
          }
        });
      }

      offsetTotalMin = offsetTime.hour() * 60 + offsetTime.minute();
      if (!negOffset) offsetTotalMin = 0 - offsetTotalMin;
    } else if (applyDefaultTZ === true) {
      noTz = false;
      // TODO we can make this more generic later -- different uses might need
      // different default offsets. for scheduled jobs it's always 0 as the
      // database does not store timezone at all; we have to assume it's
      // supposed to be UTC.
      offsetTotalMin = _.get(config, 'defaultTimezoneOffsetMinutes', 0); // PST
    }
    const utcTime = localTime.plusMinutes(offsetTotalMin);

    return {
      time: localTime,
      timeUTC: utcTime,
      noOffsetPresent: noTz, // used only internally to know if tz should be added to string
      offsetMinutes: offsetTotalMin
    };
  }

  function addPartitionRangeToArgs(dateId, rowName, whereAnd, args) {
    const range = dateIdUtil.getEpochRange(dateId);
    if (range.start && range.end) {
      whereAnd.push(
        `${rowName} BETWEEN $${args.length + 1} AND $${args.length + 2}`
      );
      args.push(range.start, range.end);
    }
  }

  function getTimeWindowKey(intervalSec, now /* optional, defaults to now */) {
    const nowSec = (now || Date.now()) / 1000;
    const mod = nowSec % intervalSec;
    const startSec = nowSec - mod;
    const start = startSec * 1000;
    return moment(start).toISOString();
  }

  function stringReplace(str, target, replacement) {
    if (!str) return str;
    return str.replace(new RegExp(target, 'g'), replacement);
  }

  const WEEK_IN_SECONDS = 604800;

  function addPartitionRangeWithTDO(tdo, rowName, whereAnd, args) {
    const range = dateIdUtil.getRecordingIdRange(tdo.id);
    if (range.start && range.end) {
      // since tdo can be created before or after the task and job
      // we need to get the week of tdo and then +/- one week to
      // account for week boundary cases
      range.start = range.start - WEEK_IN_SECONDS;
      range.end = range.end + WEEK_IN_SECONDS;
      whereAnd.push(
        `${rowName} BETWEEN $${args.length + 1} AND $${args.length + 2}`
      );
      args.push(range.start, range.end);
    }
  }

  function getAuthDataForJob(context) {
    const authData = {};
    const tokenType = _.get(context, 'requestContext.authTokenType');
    if (tokenType === 'jwt') {
      authData.organizationId = _.get(
        context,
        'requestContext.jwtToken.contentOrganizationId'
      );
    } else {
      authData.organizationId =
        _.get(context, 'requestContext.userInfo.organization.organizationId') ||
        _.get(context, 'requestContext.tokenInfo.organization.organizationId');
    }

    authData.applicationId = _.get(context, 'requestContext.appId');
    authData.contentApplicationId = authData.applicationId;
    authData.organizationGuid = getOrganizationGuid(context);
    authData.userId = getAuthUserId(context);

    // additonal auth fields for debugging.
    authData.debug = {};
    if (tokenType === 'jwt') {
      authData.debug.jwt = {};
      authData.debug.jwt.contentApplicationId = _.get(
        context,
        'requestContext.jwtToken.contentApplicationId'
      );
    }
    authData.debug.tokenType = _.isNil(tokenType) ? 'unknown' : tokenType;
    authData.debug.userName =
      _.get(context, 'requestContext.userInfo.userName') ||
      _.get(context, 'requestContext.tokenInfo.userName');
    authData.debug._applicationId = _.get(
      context,
      'requestContext.tokenInfo.applicationId'
    );
    authData.debug.organizationName =
      _.get(context, 'requestContext.userInfo.organization.organizationName') ||
      _.get(context, 'requestContext.tokenInfo.organization.organizationName');
    authData.debug.application =
      _.get(context, 'requestContext.userInfo.application') ||
      _.get(context, 'requestContext.tokenInfo.application');
    return authData;
  }

  function getAuthUserId(context) {
    let userId = _.get(context, 'requestContext.userInfo.userId');
    if (_.isNil(userId)) {
      userId = _.get(context, 'requestContext.tokenInfo.userId');
    }
    if (_.isNil(userId)) {
      const userToken = _.get(context, 'requestContext.userInfo.tokenId');
      if (!_.isNil(userToken)) {
        userId = obscureToken(userToken);
      }
    }

    return userId;
  }

  // generates a shortened and obscured version of a token.
  // returns empty string or entire token for super-short tokens.
  function obscureToken(token) {
    const fragmentLength = _.get(config, 'tokenFragmentLength', 3);
    if (!token) return '';
    // we always include the tag
    const tag = getTokenTag(token);
    // slice token part accounting for presence or absence of tag
    const first = tag.length
      ? tag.length + (fragmentLength + 1)
      : fragmentLength;
    // slice last segment off token part
    const last = token.length - fragmentLength;
    // super-short tokens are just returned as is. a token that short is so
    // crappy there's no point trying to obscure it.
    if (
      first > token.length ||
      last < 0 ||
      token.length - tag.length < fragmentLength * 2
    )
      return token;

    return token.substring(0, first) + '...' + token.substring(last);
  }

  // extracts and returns the "tag" (first, label part before the :)
  // of a token. if there is no tag, returns empty string.
  function getTokenTag(token) {
    if (!token) return '';

    const tagEnd = token.indexOf(':');

    return tagEnd > 0 ? token.substring(0, tagEnd) : '';
  }

  async function stringReplaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
      const promise = asyncFn(match, ...args);
      promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    const v = _.toString(str);
    return v.length < maxLen ? v : v.substring(0, maxLen);
  }

  function getForbiddenContentRules(ruleArray) {
    const forbiddenRules = new Map();
    for (const r of ruleArray) {
      if (!Array.isArray(r.patterns)) {
        continue;
      }
      const forbiddenPatterns = [];
      for (const p of r.patterns) {
        if (p.action === 'disallow') {
          forbiddenPatterns.push({
            regex: new RegExp(p.regex, p.flags),
            securityNote: p.securityNote
          });
        }
      }
      if (forbiddenPatterns.length) {
        forbiddenRules.set(r.objectKey, forbiddenPatterns);
      }
    }
    return forbiddenRules;
  }

  function checkForForbiddenContent(objectKey, data, doThrow = true) {
    const rules = forbiddenContentRules.get(objectKey);
    if (!rules || !data) {
      return true;
    }
    const strData = JSON.stringify(data);
    for (const r of rules) {
      if (r.regex.test(strData)) {
        if (doThrow) {
          throw new errors.NotAllowed({
            message: 'Data payload failed security validations.',
            data: {
              field: objectKey,
              details: r.securityNote || ''
            }
          });
        }
        return false;
      }
    }
    return true;
  }

  function get(source, keys, defaultValue = undefined) {
    if (!source || !keys || !_.isArray(keys) || keys.length == 0)
      return defaultValue;

    let res = source;
    for (const key of keys) {
      res = res[key];
      if (_.isNil(res)) return defaultValue;
    }

    return res;
  }

  function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
  }

  async function getOrgSettingByKey(context, settingKey, defaulValue = null) {
    const organizationId =
      _.get(context, '_authInfo.organization.organizationId') ||
      _.get(context, '_authInfo.organizationId') ||
      _.get(context, '_authInfo.contentOrganizationId');
    const kvp =
      _.get(context, '_authInfo.organization.kvp') ||
      _.get(context, '_authInfo.organization.jsondata');

    if (organizationId && !kvp) {
      const organization = await serviceContext.dal.organization.getOrganization(
        context,
        { id: organizationId }
      );

      return _.get(organization, `kvp.${settingKey}`, defaulValue);
    }

    return _.get(kvp, settingKey, defaulValue);
  }

  // when the service is running into a k8s pod, the DnsZoneName value will come from the env variable PUBLIC_DNS_ZONE_NAME
  function getDnsZoneName() {
    return (
      process.env.PUBLIC_DNS_ZONE_NAME ||
      _.get(
        config,
        'publicDnsZoneName',
        _.get(config, 'publicDnsZoneName2', 'dev.us-1.veritone.com')
      )
    );
  }

  /**
   * Verify that a feature flag is enabled both in the organization's KVP and the configuration.
   * Return false and ignore the organization's KVP check if this flag is disabled in the configuration.
   *
   * If the organization parameter is undefined, the organization will be retrieved using the organizationId parameter.
   *
   * @param {Object} context
   * @param {Object} organization
   * @param {number|string} organizationId - organizationId param can be id or guid
   * @param {string|string[]} featureName - featureName or [configFeatureName, orgFeatureName]
   * @param {boolean} allowNoConfigFeatureFlag - ignore the configuration check if a flag only exists in the organization's KVP
   * @returns {boolean}
   */
  async function isEnableFeatureInOrganization(
    context,
    organization,
    organizationId,
    featureName,
    allowNoConfigFeatureFlag,
    skipCache = true
  ) {
    let configFeatureName = featureName;
    let orgFeatureName = featureName;

    if (Array.isArray(featureName) && featureName.length === 2) {
      [configFeatureName, orgFeatureName] = featureName;
    }

    const configVal = _.get(config, `featureFlags.${configFeatureName}`, false);
    let org = organization;

    if (configVal != true && !allowNoConfigFeatureFlag) {
      return false;
    }

    // organizationId param can be id or guid
    if (_.isNil(organization) && !_.isNil(organizationId)) {
      org = await serviceContext.dal.organization.getOrganization(
        context,
        {
          id: organizationId
        },
        skipCache
      );
    }

    const featureFlag = _.get(
      org,
      `kvp.features.${orgFeatureName}`,
      'disabled'
    );
    if (featureFlag !== 'enabled') {
      return false;
    }

    return true;
  }

  function isJSON(input) {
    const fnName = 'isJSON';
    let inputString = input;

    // make sure it can be stringified
    if (typeof input !== 'string') {
      try {
        inputString = JSON.stringify(input);
      } catch (err) {
        throw new Error(`${fnName}, cannot convert input to JSON`);
      }
    }

    // make sure not a number
    if (!isNaN(parseInt(inputString))) {
      return false;
    }

    // validate json
    try {
      JSON.parse(inputString);
      return true;
    } catch (err) {
      return false;
    }
  }

  async function validateCacheKey(markedKey, type, cacheKey, options = {}) {
    const {
      useL1Cache = false,
      ttlMinL2Override,
    } = options;

    const timestampKey = `${type}:${cacheKey}`;
    const timestampType = 'timestamp';
    const timestampFromCache = await redisCache.get(timestampType, timestampKey);
    const markedKeys = []

    if (Array.isArray(markedKey)) {
      markedKeys.push(...markedKey);
    } else {
      markedKeys.push(markedKey);
    }

    const dirtyChecks = await Promise.all(
      markedKeys.map((key) => redisCache.isCacheDirty(key, timestampFromCache))
    );
    const isCacheDirty = dirtyChecks.includes(true);

    if (isCacheDirty) {
      await Promise.all([
        redisCache.asyncClear(type, cacheKey),
        redisCache.asyncClear(timestampType, timestampKey),
        // clear L1 cache if enabled
        useL1Cache ? serviceContext.localCache?.clear(type, cacheKey) : Promise.resolve()
      ]);
    }

    const asyncGetCacheValue = async (defaultValue) => {
      // try L1 cache first if enabled
      if (useL1Cache && serviceContext.localCache) {
        const l1Value = serviceContext.localCache.get(type, cacheKey);
        const l1Timestamp = serviceContext.localCache.get(timestampType, timestampKey);

        if (timestampFromCache && l1Timestamp && l1Timestamp < timestampFromCache) {
          // L1 cache is stale, continue to L2
          serviceContext.localCache.clear(type, cacheKey);
          serviceContext.localCache.clear(timestampType, timestampKey);
        } else if (!_.isNil(l1Value)) {
          return l1Value;
        }
      }

      // fall back to L2 Redis cache
      const l2Value = await redisCache.get(type, cacheKey);

      // store in L1 cache if enabled and value exists
      if (useL1Cache && serviceContext.localCache && !_.isNil(l2Value)) {
        serviceContext.localCache.set(type, cacheKey, l2Value);
        serviceContext.localCache.set(timestampType, timestampKey, Date.now());
      }

      return l2Value || defaultValue;
    };

    const asyncRefreshCacheValue = async (newValue, ttlMinOverride) => {
      // update both L1 and L2 caches
      const effectiveTtlMin = ttlMinOverride ?? ttlMinL2Override;
      const promises = [
        effectiveTtlMin
          ? redisCache.asyncSet(type, cacheKey, newValue, null, effectiveTtlMin)
          : redisCache.asyncSet(type, cacheKey, newValue),
        // The timestamp key MUST share the value key's TTL. If it outlives the value
        // (e.g. by falling back to the global default), isCacheDirty()'s self-heal path
        // never fires within a short override window, and a same-process L1 entry can
        // outlive the L2 value it was sourced from. See T28 in vpe-specs.
        effectiveTtlMin
          ? redisCache.asyncSet(timestampType, timestampKey, Date.now(), null, effectiveTtlMin)
          : redisCache.asyncSet(timestampType, timestampKey, Date.now()),
      ];

      if (useL1Cache && serviceContext.localCache) {
        serviceContext.localCache.set(type, cacheKey, newValue);
        serviceContext.localCache.set(timestampType, timestampKey, Date.now());
      }

      await Promise.all(promises);
    };

    return {
      asyncGetCacheValue,
      asyncRefreshCacheValue
    };
  }

  const buildFilterOptionKey = (options) => {
    return uuidHash(JSON.stringify(options), 5);
  };

  function getFormattedPackageName({ primaryResourceId, primaryResourceName }) {
    if (!_.isEmpty(primaryResourceName)) {
      return primaryResourceName;
    }
    if (!_.isNil(primaryResourceId)) {
      return `${primaryResourceId}`;
    }
    throw new TypeError(
      `Expected either primaryResourceName or primaryResourceId to exist but recieved nither`
    );
  }

  function getOrganizationId(context) {
    if (_.isNil(context)) {
      return null;
    }

    return (
      _.get(context, 'requestContext.userInfo.organization.organizationId') ||
      _.get(context, 'requestContext.tokenInfo.organization.organizationId')
    );
  }

  function getOrganizationGuid(context) {
    if (_.isNil(context)) {
      return null;
    }

    return (
      _.get(context, 'requestContext.userInfo.organization.organizationGuid') ||
      _.get(context, 'requestContext.tokenInfo.organization.organizationGuid')
    );
  }

  /**
   * Gets token from the conext
   * @param {object} context
   * @returns token
   */
  function getToken(context) {
    if (_.isNil(context)) {
      return null;
    }

    return (
      _.get(context, '_authInfo.token') ||
      _.get(context, '_authInfo.tokenId') ||
      _.get(context, 'requestContext.authToken')
    );
  }

  async function runPromiseAll(promiseArray) {
    if (!_.isArray(promiseArray) || _.isEmpty(promiseArray)) {
      return [];
    }

    return await Promise.all(
      promiseArray.map((item) => {
        if (typeof item === 'function') {
          return item();
        }

        return item;
      })
    ).catch((err) => {
      throw err;
    });
  }

  function encryptText(text, key) {
    const cipherKey =
      key ||
      process.env.CORE_GRAPHQL_DECRYPT_KEY ||
      _.get(serviceContext, decryptKeyConfig, decryptKeyDefault);

    return encryptObject(text, cipherKey, 'aes-256-cbc');
  }

  function decryptText(encryptedText, key) {
    const cipherKey =
      key ||
      process.env.CORE_GRAPHQL_DECRYPT_KEY ||
      _.get(serviceContext, decryptKeyConfig, decryptKeyDefault);

    return decryptObject(encryptedText, cipherKey, 'aes-256-cbc');
  }

  function redactFields(query, variables, maskedFields) {
    const masked = [
      ..._.get(config, 'schemas.public.maskedFields', []),
      ...(maskedFields || [])
    ];

    let redactedOperation = query;
    let redactedVariables = variables;
    for (let maskedField of masked) {
      if (query.includes(maskedField.operation)) {
        const escapedFieldName = maskedField.field.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        );
        const fieldRegex = new RegExp(
          `"?${escapedFieldName}"?\\s*:\\s*("[^"]*"|'[^']*'|\S+)`,
          'g'
        );
        if (
          query.includes(maskedField.field) &&
          // variables are not getting logged, keep parametrized queries unredacted
          !query.includes(`$${maskedField.field}`)
        ) {
          redactedOperation = redactedOperation.replace(
            fieldRegex,
            `${maskedField.field}: "<redacted>"`
          );
        }

        if (variables && variables.includes(maskedField.field)) {
          redactedVariables = redactedVariables.replace(
            fieldRegex,
            `"${maskedField.field}": "<redacted>"`
          );
        }
      }
    }
    return {
      query: redactedOperation,
      variables: redactedVariables
    };
  }

  /**
   * This compares two values of organization Ids
   * @param {*} orgId_1 the first orgId. It must be a string or integer
   * @param {*} orgId_2 the second orgId. It must be a string or integer
   * @returns true if they are matched
   */
  function compareOrganizationIds(orgId_1, orgId_2) {
    if (_.isNil(orgId_1) || _.isNil(orgId_2)) {
      return false;
    }
    const orgId1 = _.isString(orgId_1) ? orgId_1 : _.toString(orgId_1);
    const orgId2 = _.isString(orgId_2) ? orgId_2 : _.toString(orgId_2);

    return orgId1 === orgId2;
  }

  function replaceBuffer(input, needle, replacement) {
    if (!Buffer.isBuffer(input)) {
      throw new Error(`Expected a Buffer, go ${typeof input}`);
    }

    if (
      !(typeof needle === 'string' && needle.length > 0) ||
      !(typeof replacement === 'string')
    ) {
      return input;
    }

    const opts = { fromIndex: 0 };

    let matchCount = 0;

    const fn = (buf) => {
      const fromIndex = matchCount === 0 ? opts.fromIndex : 0;
      const index = buf.indexOf(needle, fromIndex);

      if (index === -1) {
        return buf;
      }

      matchCount++;

      const replacementBuf = Buffer.from(replacement);
      const needleBuf = Buffer.from(needle);
      const start = buf.slice(0, index);
      const end = fn(buf.slice(index + needleBuf.length));
      const len = index + replacementBuf.length + end.length;

      return Buffer.concat([start, replacementBuf, end], len);
    };

    return fn(input);
  }

  function normalizePermission(permission) {
    if (_.isNil(permission)) {
      return '';
    }
    return permission.toString().toLowerCase();
  }

  function filterRestrictedPermissions(rights = [], blacklist = []) {
    const normalizedRights = (_.isArray(rights) ? rights : []).filter(
      (right) => !_.isNil(right)
    );
    const normalizedBlacklistInput = (_.isArray(blacklist) ? blacklist : []).filter(
      (permission) => !_.isNil(permission)
    );

    if (_.isEmpty(normalizedBlacklistInput)) {
      return normalizedRights;
    }
    // Resolve enums to keys first.
    const resolvedBlacklist = fpl.rbacUtil.mapPermissionKeyByEnums(
      normalizedBlacklistInput
    );
    // Generate a bitmask for the blacklist.
    const blacklistMask = fpl.rbacUtil.getPermissionMask(resolvedBlacklist);
    // Normalized blacklist for text fallbacks.
    const normalizedBlacklist = resolvedBlacklist.map((p) =>
      normalizePermission(p).replace(/:/g, '.')
    );

    return normalizedRights.filter((right) => {
      const normalizedRight = normalizePermission(right).replace(/:/g, '.');
      // 1. Robust bitmask check (handles aliases and enums correctly).
      if (fpl.rbacUtil.hasPermissions(blacklistMask, [right], false)) {
        return false;
      }
      // 2. Text-based fallback (for non-functional permissions or custom permissions).
      return !normalizedBlacklist.includes(normalizedRight);
    });
  }

  return {
    get,
    sleep,
    promiseTimeout,
    hasPerm,
    requirePerm,
    requirePerms,
    listRights,
    getPermissionIdToKeyMap,
    listResources,
    getResourceIdsForType,
    graphQLFieldHasParam,
    getGraphQLFieldParamValue,
    getTimeZoneName,
    getAllTimeZones,
    parseTimeOnly,
    timeOnlyToString,
    timeOnlyToUTCString,
    makeLikeClause,
    makeInsertSql,
    makeUpdateSql,
    makeSelectClause,
    addSqlWhere,
    toPage,
    emptyPage,
    checkId,
    checkDateId,
    sqlEscapeForLIKE,
    expandJsonVariables,
    formatString: format,
    stripSectionFromString,
    addDateTimeFilters,
    addPartTimeFilters,
    addTextMatchFilters,
    isOrgSettingEnabled,
    isInternalAPIKey,
    isSystemOrgAPIKey,
    hasEngineJwt,
    getEngineJwtId,
    fixDateTime,
    isTimeInSeconds,
    stripUrlQuery,
    getFakeMediaAssetId,
    isFakeMediaAssetId,
    parseFakeAssetId,
    parseBuild,
    addPartitionRangeToArgs,
    addPartitionRangeWithTDO,
    getTimeWindowKey,
    stringReplace,
    adjustTimeToZone,
    getTokenTag,
    obscureToken,
    getAuthDataForJob,
    stringReplaceAsync,
    truncate,
    checkForForbiddenContent,
    round,
    getOrgSettingByKey,
    getDnsZoneName,
    getPermissionEnumMap,
    getPermissionIdToKeyAliasMap,
    isEnableFeatureInOrganization,
    isJSON,
    validateCacheKey,
    buildFilterOptionKey,
    getFormattedPackageName,
    getOrganizationId,
    getOrganizationGuid,
    getToken,
    runPromiseAll,
    encryptText,
    decryptText,
    getAuthUserId,
    redactFields,
    compareOrganizationIds,
    replaceBuffer,
    filterRestrictedPermissions
  };
};
